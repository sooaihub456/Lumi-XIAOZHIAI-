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

/**
 * Low-latency native Opus playback for Xiaozhi WebSocket audio frames.
 * Xiaozhi protocol v1 sends one raw Opus packet per binary WebSocket frame.
 */
final class NativeOpusPlayer {
    interface ErrorListener {
        void onError(String message);
    }

    private static final String OPUS_MIME = MediaFormat.MIMETYPE_AUDIO_OPUS;
    private static final int DEFAULT_SAMPLE_RATE = 24000;
    private static final int DEFAULT_CHANNELS = 1;
    private static final int MAX_PACKET_BYTES = 64 * 1024;
    private static final long SEEK_PRE_ROLL_NS = 80_000_000L;

    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "Mori-Xiaozhi-Audio");
        thread.setDaemon(true);
        return thread;
    });
    private final ErrorListener errorListener;

    private MediaCodec decoder;
    private AudioTrack audioTrack;
    private int configuredInputRate = 0;
    private int configuredChannels = 0;
    private int outputRate = 0;
    private int outputChannels = 0;
    private long presentationUs = 0;
    private boolean enabled = true;
    private boolean released = false;
    private boolean reportedFailure = false;

    NativeOpusPlayer(ErrorListener errorListener) {
        this.errorListener = errorListener;
    }

    void configure(int sampleRate, int channels) {
        final int safeRate = sanitizeRate(sampleRate);
        final int safeChannels = channels == 2 ? 2 : 1;
        execute(() -> {
            if (decoder != null && configuredInputRate == safeRate && configuredChannels == safeChannels) return;
            configureInternal(safeRate, safeChannels);
        });
    }

    void enqueue(byte[] packet) {
        if (packet == null || packet.length == 0 || packet.length > MAX_PACKET_BYTES) return;
        final byte[] copy = Arrays.copyOf(packet, packet.length);
        execute(() -> {
            if (!enabled) return;
            if (decoder == null) configureInternal(DEFAULT_SAMPLE_RATE, DEFAULT_CHANNELS);
            decodePacket(copy);
        });
    }

    void setEnabled(boolean next) {
        execute(() -> {
            enabled = next;
            if (!next) stopInternal();
        });
    }

    void stop() {
        execute(this::stopInternal);
    }

    void release() {
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
                    releaseInternal();
                }
            });
        } catch (RuntimeException ignored) {
            // App/process is shutting down.
        }
    }

    private void configureInternal(int sampleRate, int channels) {
        releaseDecoderOnly();
        presentationUs = 0;
        reportedFailure = false;
        try {
            MediaFormat format = MediaFormat.createAudioFormat(OPUS_MIME, sampleRate, channels);
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, MAX_PACKET_BYTES);
            format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
            format.setByteBuffer("csd-0", ByteBuffer.wrap(buildOpusHead(sampleRate, channels)));
            format.setByteBuffer("csd-1", nativeLong(0L));
            format.setByteBuffer("csd-2", nativeLong(SEEK_PRE_ROLL_NS));

            decoder = MediaCodec.createDecoderByType(OPUS_MIME);
            decoder.configure(format, null, null, 0);
            decoder.start();
            configuredInputRate = sampleRate;
            configuredChannels = channels;
        } catch (Throwable throwable) {
            releaseDecoderOnly();
            throw new IllegalStateException("Android could not initialize its Opus decoder", throwable);
        }
    }

    private void decodePacket(byte[] packet) {
        MediaCodec current = decoder;
        if (current == null) return;

        int inputIndex = -1;
        for (int attempt = 0; attempt < 4 && inputIndex < 0; attempt += 1) {
            inputIndex = current.dequeueInputBuffer(attempt == 0 ? 0 : 4_000);
            if (inputIndex < 0) drainOutput(current, false);
        }
        if (inputIndex < 0) {
            // Do not poison the whole conversation if the decoder is briefly back-pressured.
            drainOutput(current, true);
            inputIndex = current.dequeueInputBuffer(6_000);
        }
        if (inputIndex < 0) return;

        ByteBuffer input = current.getInputBuffer(inputIndex);
        if (input == null || packet.length > input.capacity()) {
            current.queueInputBuffer(inputIndex, 0, 0, presentationUs, 0);
            throw new IllegalStateException("Xiaozhi sent an Opus packet larger than the Android decoder input buffer");
        }
        input.clear();
        input.put(packet);
        current.queueInputBuffer(inputIndex, 0, packet.length, presentationUs, 0);
        presentationUs += 60_000L;
        drainOutput(current, true);
    }

    private void drainOutput(MediaCodec current, boolean allowWait) {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean first = true;
        while (true) {
            int outputIndex = current.dequeueOutputBuffer(info, allowWait && first ? 4_000 : 0);
            first = false;
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                ensureTrack(current.getOutputFormat());
                continue;
            }
            if (outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER) return;
            if (outputIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) continue;
            if (outputIndex < 0) return;

            try {
                if (info.size > 0 && enabled) {
                    ensureTrack(current.getOutputFormat(outputIndex));
                    ByteBuffer output = current.getOutputBuffer(outputIndex);
                    if (output != null) {
                        output.position(info.offset);
                        output.limit(info.offset + info.size);
                        byte[] pcm = new byte[info.size];
                        output.get(pcm);
                        AudioTrack track = audioTrack;
                        if (track != null) {
                            if (track.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) track.play();
                            int written = track.write(pcm, 0, pcm.length, AudioTrack.WRITE_BLOCKING);
                            if (written < 0) throw new IllegalStateException("Android audio output rejected decoded PCM (" + written + ")");
                        }
                    }
                }
            } finally {
                current.releaseOutputBuffer(outputIndex, false);
            }
        }
    }

    private void ensureTrack(MediaFormat format) {
        int rate = format.containsKey(MediaFormat.KEY_SAMPLE_RATE)
            ? format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            : (configuredInputRate > 0 ? configuredInputRate : 48000);
        int channels = format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)
            ? format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            : (configuredChannels > 0 ? configuredChannels : 1);
        channels = channels == 2 ? 2 : 1;

        if (audioTrack != null && outputRate == rate && outputChannels == channels) return;
        releaseTrackOnly();

        int channelMask = channels == 2 ? AudioFormat.CHANNEL_OUT_STEREO : AudioFormat.CHANNEL_OUT_MONO;
        int min = AudioTrack.getMinBufferSize(rate, channelMask, AudioFormat.ENCODING_PCM_16BIT);
        int frameBytes = channels * 2;
        int target = Math.max(min > 0 ? min : 0, Math.max(rate * frameBytes / 3, 4096));

        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
        AudioFormat audioFormat = new AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(rate)
            .setChannelMask(channelMask)
            .build();

        audioTrack = new AudioTrack(
            attributes,
            audioFormat,
            target,
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        );
        if (audioTrack.getState() != AudioTrack.STATE_INITIALIZED) {
            releaseTrackOnly();
            throw new IllegalStateException("Android speaker output could not be initialized");
        }
        outputRate = rate;
        outputChannels = channels;
    }

    private void stopInternal() {
        presentationUs = 0;
        if (decoder != null) {
            try { decoder.flush(); } catch (Throwable ignored) { }
        }
        if (audioTrack != null) {
            try { audioTrack.pause(); } catch (Throwable ignored) { }
            try { audioTrack.flush(); } catch (Throwable ignored) { }
        }
    }

    private void releaseInternal() {
        releaseDecoderOnly();
        releaseTrackOnly();
        configuredInputRate = 0;
        configuredChannels = 0;
        presentationUs = 0;
    }

    private void releaseDecoderOnly() {
        MediaCodec current = decoder;
        decoder = null;
        if (current != null) {
            try { current.stop(); } catch (Throwable ignored) { }
            try { current.release(); } catch (Throwable ignored) { }
        }
    }

    private void releaseTrackOnly() {
        AudioTrack track = audioTrack;
        audioTrack = null;
        outputRate = 0;
        outputChannels = 0;
        if (track != null) {
            try { track.pause(); } catch (Throwable ignored) { }
            try { track.flush(); } catch (Throwable ignored) { }
            try { track.release(); } catch (Throwable ignored) { }
        }
    }

    private void reportError(String message) {
        if (reportedFailure) return;
        reportedFailure = true;
        if (errorListener != null) errorListener.onError(message);
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
                return DEFAULT_SAMPLE_RATE;
        }
    }

    private static byte[] buildOpusHead(int sampleRate, int channels) {
        byte[] header = new byte[19];
        byte[] magic = "OpusHead".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(magic, 0, header, 0, magic.length);
        header[8] = 1; // OpusHead version.
        header[9] = (byte) channels;
        putLittleEndian16(header, 10, 0); // No pre-skip for packet-stream playback.
        putLittleEndian32(header, 12, sampleRate);
        putLittleEndian16(header, 16, 0); // Output gain.
        header[18] = 0; // Channel mapping family 0 (mono/stereo).
        return header;
    }

    private static ByteBuffer nativeLong(long value) {
        ByteBuffer buffer = ByteBuffer.allocate(8).order(ByteOrder.nativeOrder());
        buffer.putLong(value);
        buffer.flip();
        return buffer;
    }

    private static void putLittleEndian16(byte[] target, int offset, int value) {
        target[offset] = (byte) (value & 0xff);
        target[offset + 1] = (byte) ((value >>> 8) & 0xff);
    }

    private static void putLittleEndian32(byte[] target, int offset, int value) {
        target[offset] = (byte) (value & 0xff);
        target[offset + 1] = (byte) ((value >>> 8) & 0xff);
        target[offset + 2] = (byte) ((value >>> 16) & 0xff);
        target[offset + 3] = (byte) ((value >>> 24) & 0xff);
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
