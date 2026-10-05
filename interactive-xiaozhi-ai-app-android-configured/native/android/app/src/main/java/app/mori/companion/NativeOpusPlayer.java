package app.mori.companion;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaCodec;
import android.media.MediaFormat;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Native playback for Xiaozhi protocol-v1 raw Opus packets.
 *
 * Xiaozhi sends one Opus packet per binary WebSocket message. Android's native
 * Opus decoder requires codec-specific OpusHead data even for a headerless live
 * packet stream. We provide csd-0/csd-1/csd-2 explicitly, feed raw packets to
 * MediaCodec and stream the decoded PCM to AudioTrack.
 *
 * This implementation deliberately has no third-party Opus dependency, making
 * the APK build deterministic in GitHub Actions and on local Android builds.
 */
final class NativeOpusPlayer {
    interface ErrorListener {
        void onError(String message);
    }

    interface StateListener {
        void onState(String state, int sampleRate, int channels, long packetCount);
    }

    private static final int DEFAULT_SOURCE_SAMPLE_RATE = 24000;
    private static final int DEFAULT_CHANNELS = 1;
    private static final int DEFAULT_FRAME_DURATION_MS = 60;
    private static final int OPUS_DECODE_SAMPLE_RATE = 48000;
    private static final int MAX_PACKET_BYTES = 64 * 1024;
    private static final long CODEC_TIMEOUT_US = 20_000L;
    private static final long OPUS_SEEK_PREROLL_NS = 80_000_000L;

    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "Mori-Xiaozhi-Audio");
        thread.setDaemon(true);
        return thread;
    });
    private final ErrorListener errorListener;
    private final StateListener stateListener;
    private final AtomicInteger playbackGeneration = new AtomicInteger(1);

    private MediaCodec decoder;
    private AudioTrack audioTrack;
    private int sourceSampleRate = DEFAULT_SOURCE_SAMPLE_RATE;
    private int outputSampleRate = OPUS_DECODE_SAMPLE_RATE;
    private int channels = DEFAULT_CHANNELS;
    private int frameDurationMs = DEFAULT_FRAME_DURATION_MS;
    private boolean enabled = true;
    private boolean released = false;
    private boolean reportedFailure = false;
    private boolean announcedPlaying = false;
    private long packetCount = 0;
    private long presentationTimeUs = 0L;

    NativeOpusPlayer(ErrorListener errorListener, StateListener stateListener) {
        this.errorListener = errorListener;
        this.stateListener = stateListener;
    }

    void configure(int requestedRate, int requestedChannels, int requestedFrameDurationMs) {
        final int safeRate = sanitizeRate(requestedRate);
        final int safeChannels = requestedChannels == 2 ? 2 : 1;
        final int safeFrameDuration = sanitizeFrameDuration(requestedFrameDurationMs);
        final int generation = playbackGeneration.incrementAndGet();
        execute(() -> {
            if (generation != playbackGeneration.get()) return;
            if (decoder != null
                && sourceSampleRate == safeRate
                && channels == safeChannels
                && frameDurationMs == safeFrameDuration) return;
            configureInternal(safeRate, safeChannels, safeFrameDuration);
        });
    }

    void enqueue(byte[] packet) {
        if (packet == null || packet.length == 0 || packet.length > MAX_PACKET_BYTES) return;
        final byte[] copy = Arrays.copyOf(packet, packet.length);
        final int generation = playbackGeneration.get();
        execute(() -> {
            if (!enabled || generation != playbackGeneration.get()) return;
            ensureDecoder();
            decodeAndPlay(copy, generation);
        });
    }

    void setEnabled(boolean next) {
        if (!next) playbackGeneration.incrementAndGet();
        execute(() -> {
            enabled = next;
            if (!next) stopInternal();
        });
    }

    void stop() {
        playbackGeneration.incrementAndGet();
        execute(this::stopInternal);
    }

    void release() {
        playbackGeneration.incrementAndGet();
        execute(() -> {
            released = true;
            releaseInternal();
        });
        executor.shutdown();
        try {
            executor.awaitTermination(800, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private void execute(Runnable runnable) {
        if (released || executor.isShutdown()) return;
        try {
            executor.execute(() -> {
                if (released && decoder == null && audioTrack == null) return;
                try {
                    runnable.run();
                } catch (Throwable throwable) {
                    reportError("Native Xiaozhi voice playback failed: " + cleanMessage(throwable));
                    releaseCodecOnly();
                    releaseTrackOnly();
                }
            });
        } catch (RuntimeException ignored) {
            // App/process is shutting down.
        }
    }

    private void configureInternal(int rate, int channelCount, int durationMs) {
        releaseCodecOnly();
        releaseTrackOnly();
        reportedFailure = false;
        announcedPlaying = false;
        packetCount = 0;
        presentationTimeUs = 0L;
        sourceSampleRate = rate;
        channels = channelCount;
        frameDurationMs = durationMs;
        outputSampleRate = OPUS_DECODE_SAMPLE_RATE;

        createDecoder(rate, channelCount);
        ensureTrack(outputSampleRate, channelCount);
        emitState("ready");
    }

    private void ensureDecoder() {
        if (decoder != null) return;
        createDecoder(sourceSampleRate, channels);
        if (audioTrack == null) ensureTrack(outputSampleRate, channels);
    }

    private void createDecoder(int sourceRate, int channelCount) {
        try {
            MediaFormat format = MediaFormat.createAudioFormat(
                MediaFormat.MIMETYPE_AUDIO_OPUS,
                OPUS_DECODE_SAMPLE_RATE,
                channelCount
            );
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, MAX_PACKET_BYTES);
            format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
            format.setByteBuffer("csd-0", ByteBuffer.wrap(buildOpusHead(sourceRate, channelCount)));
            format.setByteBuffer("csd-1", nativeLongBuffer(0L));
            format.setByteBuffer("csd-2", nativeLongBuffer(OPUS_SEEK_PREROLL_NS));

            MediaCodec codec = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS);
            codec.configure(format, null, null, 0);
            codec.start();
            decoder = codec;
        } catch (Throwable throwable) {
            releaseCodecOnly();
            throw new IllegalStateException("Android could not initialize its Opus decoder", throwable);
        }
    }

    private void decodeAndPlay(byte[] packet, int generation) {
        MediaCodec codec = decoder;
        if (codec == null || !enabled || generation != playbackGeneration.get()) return;

        int inputIndex = codec.dequeueInputBuffer(CODEC_TIMEOUT_US);
        if (inputIndex < 0) {
            // Drain any pending decoded data and try one more time before dropping
            // a packet. This handles short output back-pressure bursts.
            drainOutput(codec, generation);
            inputIndex = codec.dequeueInputBuffer(CODEC_TIMEOUT_US);
        }
        if (inputIndex < 0) return;

        ByteBuffer input = codec.getInputBuffer(inputIndex);
        if (input == null) throw new IllegalStateException("Android Opus decoder returned no input buffer");
        input.clear();
        if (packet.length > input.remaining()) {
            throw new IllegalStateException("Xiaozhi Opus packet exceeds Android decoder input capacity");
        }
        input.put(packet);
        codec.queueInputBuffer(inputIndex, 0, packet.length, presentationTimeUs, 0);
        presentationTimeUs += (long) frameDurationMs * 1000L;

        drainOutput(codec, generation);
        packetCount += 1;
        if (packetCount % 50 == 0 && announcedPlaying) emitState("playing");
    }

    private void drainOutput(MediaCodec codec, int generation) {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        while (enabled && generation == playbackGeneration.get()) {
            int outputIndex = codec.dequeueOutputBuffer(info, 0L);
            if (outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER) return;
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                MediaFormat output = codec.getOutputFormat();
                int nextRate = output.containsKey(MediaFormat.KEY_SAMPLE_RATE)
                    ? output.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    : OPUS_DECODE_SAMPLE_RATE;
                int nextChannels = output.containsKey(MediaFormat.KEY_CHANNEL_COUNT)
                    ? output.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    : channels;
                nextChannels = nextChannels == 2 ? 2 : 1;
                if (audioTrack == null || nextRate != outputSampleRate || nextChannels != channels) {
                    outputSampleRate = nextRate;
                    channels = nextChannels;
                    releaseTrackOnly();
                    ensureTrack(outputSampleRate, channels);
                }
                continue;
            }
            if (outputIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) continue;
            if (outputIndex < 0) return;

            ByteBuffer output = codec.getOutputBuffer(outputIndex);
            if (output != null && info.size > 0) {
                output.position(info.offset);
                output.limit(info.offset + info.size);
                byte[] pcm = new byte[info.size];
                output.get(pcm);
                writePcm(pcm, generation);
            }
            codec.releaseOutputBuffer(outputIndex, false);
        }
    }

    private void writePcm(byte[] pcm, int generation) {
        if (!enabled || generation != playbackGeneration.get() || pcm.length == 0) return;
        AudioTrack track = audioTrack;
        if (track == null) {
            ensureTrack(outputSampleRate, channels);
            track = audioTrack;
        }
        if (track == null) throw new IllegalStateException("Android speaker output is unavailable");
        if (track.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) track.play();

        int offset = 0;
        while (offset < pcm.length && enabled && generation == playbackGeneration.get()) {
            int written = track.write(pcm, offset, pcm.length - offset, AudioTrack.WRITE_BLOCKING);
            if (written < 0) throw new IllegalStateException("Android audio output rejected decoded PCM (" + written + ")");
            if (written == 0) break;
            offset += written;
        }

        if (!announcedPlaying && offset > 0) {
            announcedPlaying = true;
            emitState("playing");
        }
    }

    private void ensureTrack(int rate, int channelCount) {
        int safeRate = sanitizeOutputRate(rate);
        int safeChannels = channelCount == 2 ? 2 : 1;
        int channelMask = safeChannels == 2 ? AudioFormat.CHANNEL_OUT_STEREO : AudioFormat.CHANNEL_OUT_MONO;
        int min = AudioTrack.getMinBufferSize(safeRate, channelMask, AudioFormat.ENCODING_PCM_16BIT);
        int frameBytes = safeChannels * 2;
        int target = Math.max(min > 0 ? min : 0, Math.max(safeRate * frameBytes * 3 / 10, 4096));

        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
        AudioFormat format = new AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(safeRate)
            .setChannelMask(channelMask)
            .build();

        AudioTrack track = new AudioTrack(
            attributes,
            format,
            target,
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        );
        if (track.getState() != AudioTrack.STATE_INITIALIZED) {
            try { track.release(); } catch (Throwable ignored) { }
            throw new IllegalStateException("Android speaker output could not be initialized");
        }
        audioTrack = track;
        outputSampleRate = safeRate;
    }

    private void stopInternal() {
        announcedPlaying = false;
        packetCount = 0;
        presentationTimeUs = 0L;

        // Recreate MediaCodec on the next packet rather than flush it. Android's
        // documented Opus codec-specific data can be lost by a flush before the
        // codec has produced output, which can make subsequent live packets mute.
        releaseCodecOnly();
        if (audioTrack != null) {
            try { audioTrack.pause(); } catch (Throwable ignored) { }
            try { audioTrack.flush(); } catch (Throwable ignored) { }
        }
        emitState("stopped");
    }

    private void releaseInternal() {
        releaseCodecOnly();
        releaseTrackOnly();
        sourceSampleRate = DEFAULT_SOURCE_SAMPLE_RATE;
        outputSampleRate = OPUS_DECODE_SAMPLE_RATE;
        channels = DEFAULT_CHANNELS;
        frameDurationMs = DEFAULT_FRAME_DURATION_MS;
        announcedPlaying = false;
        packetCount = 0;
        presentationTimeUs = 0L;
    }

    private void releaseCodecOnly() {
        MediaCodec codec = decoder;
        decoder = null;
        if (codec != null) {
            try { codec.stop(); } catch (Throwable ignored) { }
            try { codec.release(); } catch (Throwable ignored) { }
        }
    }

    private void releaseTrackOnly() {
        AudioTrack track = audioTrack;
        audioTrack = null;
        if (track != null) {
            try { track.pause(); } catch (Throwable ignored) { }
            try { track.flush(); } catch (Throwable ignored) { }
            try { track.release(); } catch (Throwable ignored) { }
        }
    }

    private void emitState(String state) {
        if (stateListener != null) stateListener.onState(state, outputSampleRate, channels, packetCount);
    }

    private void reportError(String message) {
        if (reportedFailure) return;
        reportedFailure = true;
        if (errorListener != null) errorListener.onError(message);
    }

    private static byte[] buildOpusHead(int sourceRate, int channelCount) {
        byte[] head = new byte[19];
        byte[] magic = "OpusHead".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(magic, 0, head, 0, magic.length);
        head[8] = 1; // OpusHead version.
        head[9] = (byte) (channelCount == 2 ? 2 : 1);
        // bytes 10-11: pre-skip = 0 for a live packet stream.
        putLe32(head, 12, sourceRate);
        // bytes 16-17: output gain = 0.
        head[18] = 0; // channel mapping family 0 (mono/stereo).
        return head;
    }

    private static ByteBuffer nativeLongBuffer(long value) {
        ByteBuffer buffer = ByteBuffer.allocate(8).order(ByteOrder.nativeOrder());
        buffer.putLong(value);
        buffer.flip();
        return buffer;
    }

    private static void putLe32(byte[] bytes, int offset, int value) {
        bytes[offset] = (byte) (value & 0xff);
        bytes[offset + 1] = (byte) ((value >>> 8) & 0xff);
        bytes[offset + 2] = (byte) ((value >>> 16) & 0xff);
        bytes[offset + 3] = (byte) ((value >>> 24) & 0xff);
    }

    private static int sanitizeRate(int rate) {
        switch (rate) {
            case 8000:
            case 12000:
            case 16000:
            case 24000:
            case 48000:
                return rate;
            default:
                return DEFAULT_SOURCE_SAMPLE_RATE;
        }
    }

    private static int sanitizeOutputRate(int rate) {
        switch (rate) {
            case 8000:
            case 12000:
            case 16000:
            case 24000:
            case 32000:
            case 44100:
            case 48000:
                return rate;
            default:
                return OPUS_DECODE_SAMPLE_RATE;
        }
    }

    private static int sanitizeFrameDuration(int durationMs) {
        switch (durationMs) {
            case 3:   // 2.5 ms may be rounded by JSON producers.
            case 5:
            case 10:
            case 20:
            case 40:
            case 60:
            case 80:
            case 100:
            case 120:
                return durationMs;
            default:
                return DEFAULT_FRAME_DURATION_MS;
        }
    }

    private static String cleanMessage(Throwable throwable) {
        Throwable current = throwable;
        while (current.getCause() != null && current.getCause() != current) current = current.getCause();
        String message = current.getMessage();
        if (message == null || message.trim().isEmpty()) message = current.getClass().getSimpleName();
        message = message.replace('\r', ' ').replace('\n', ' ').trim();
        return message.length() > 180 ? message.substring(0, 180) + "…" : message;
    }
}
