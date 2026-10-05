package app.mori.companion;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;

import org.concentus.OpusDecoder;

import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Reliable native playback for Xiaozhi protocol-v1 audio.
 *
 * Xiaozhi sends one raw Opus packet in each binary WebSocket frame.  Android's
 * MediaCodec Opus support varies by vendor/device when fed a headerless live
 * packet stream, so Mori decodes the raw packets with Concentus (pure Java
 * Opus) and sends the resulting PCM directly to AudioTrack.
 */
final class NativeOpusPlayer {
    interface ErrorListener {
        void onError(String message);
    }

    interface StateListener {
        void onState(String state, int sampleRate, int channels, long packetCount);
    }

    private static final int DEFAULT_SAMPLE_RATE = 24000;
    private static final int DEFAULT_CHANNELS = 1;
    private static final int DEFAULT_FRAME_DURATION_MS = 60;
    private static final int MAX_PACKET_BYTES = 64 * 1024;
    private static final int MAX_OPUS_FRAME_MS = 120;

    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "Mori-Xiaozhi-Audio");
        thread.setDaemon(true);
        return thread;
    });
    private final ErrorListener errorListener;
    private final StateListener stateListener;
    private final AtomicInteger playbackGeneration = new AtomicInteger(1);

    private OpusDecoder decoder;
    private AudioTrack audioTrack;
    private int sampleRate = 0;
    private int channels = 0;
    private int frameDurationMs = DEFAULT_FRAME_DURATION_MS;
    private boolean enabled = true;
    private boolean released = false;
    private boolean reportedFailure = false;
    private boolean announcedPlaying = false;
    private long packetCount = 0;

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
            if (decoder != null && sampleRate == safeRate && channels == safeChannels && frameDurationMs == safeFrameDuration) return;
            configureInternal(safeRate, safeChannels, safeFrameDuration);
        });
    }

    void enqueue(byte[] packet) {
        if (packet == null || packet.length == 0 || packet.length > MAX_PACKET_BYTES) return;
        final byte[] copy = Arrays.copyOf(packet, packet.length);
        final int generation = playbackGeneration.get();
        execute(() -> {
            if (!enabled || generation != playbackGeneration.get()) return;
            if (decoder == null) configureInternal(DEFAULT_SAMPLE_RATE, DEFAULT_CHANNELS, DEFAULT_FRAME_DURATION_MS);
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
                    releaseInternal();
                }
            });
        } catch (RuntimeException ignored) {
            // App/process is shutting down.
        }
    }

    private void configureInternal(int rate, int channelCount, int durationMs) {
        releaseDecoderOnly();
        releaseTrackOnly();
        reportedFailure = false;
        announcedPlaying = false;
        packetCount = 0;
        sampleRate = rate;
        channels = channelCount;
        frameDurationMs = durationMs;

        try {
            decoder = new OpusDecoder(rate, channelCount);
        } catch (Throwable throwable) {
            throw new IllegalStateException("Could not initialize the Opus decoder", throwable);
        }
        ensureTrack(rate, channelCount);
        emitState("ready");
    }

    private void decodeAndPlay(byte[] packet, int generation) {
        OpusDecoder currentDecoder = decoder;
        if (currentDecoder == null || !enabled || generation != playbackGeneration.get()) return;

        // Opus packets may legally contain up to 120 ms of audio.  Xiaozhi
        // normally uses 60 ms, but allocating the protocol maximum makes the
        // decoder robust to server-side packet aggregation.
        int maxSamplesPerChannel = Math.max(sampleRate * MAX_OPUS_FRAME_MS / 1000,
            sampleRate * frameDurationMs / 1000);
        short[] pcm = new short[maxSamplesPerChannel * channels];
        final int decodedSamplesPerChannel;
        try {
            decodedSamplesPerChannel = currentDecoder.decode(
                packet, 0, packet.length, pcm, 0, maxSamplesPerChannel, false
            );
        } catch (Throwable throwable) {
            throw new IllegalStateException("Xiaozhi sent an Opus packet that could not be decoded", throwable);
        }
        if (decodedSamplesPerChannel <= 0) return;
        if (!enabled || generation != playbackGeneration.get()) return;

        AudioTrack track = audioTrack;
        if (track == null) {
            ensureTrack(sampleRate, channels);
            track = audioTrack;
        }
        if (track == null) throw new IllegalStateException("Android speaker output is unavailable");

        if (track.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) track.play();
        int totalSamples = decodedSamplesPerChannel * channels;
        int offset = 0;
        while (offset < totalSamples && enabled && generation == playbackGeneration.get()) {
            int written = track.write(pcm, offset, totalSamples - offset, AudioTrack.WRITE_BLOCKING);
            if (written < 0) throw new IllegalStateException("Android audio output rejected decoded PCM (" + written + ")");
            if (written == 0) break;
            offset += written;
        }

        packetCount += 1;
        if (!announcedPlaying && offset > 0) {
            announcedPlaying = true;
            emitState("playing");
        } else if (packetCount % 50 == 0) {
            emitState("playing");
        }
    }

    private void ensureTrack(int rate, int channelCount) {
        int safeChannels = channelCount == 2 ? 2 : 1;
        int channelMask = safeChannels == 2 ? AudioFormat.CHANNEL_OUT_STEREO : AudioFormat.CHANNEL_OUT_MONO;
        int min = AudioTrack.getMinBufferSize(rate, channelMask, AudioFormat.ENCODING_PCM_16BIT);
        int frameBytes = safeChannels * 2;
        // Keep about 300 ms buffered: enough to absorb bursty WebSocket delivery
        // without adding a large conversational delay.
        int target = Math.max(min > 0 ? min : 0, Math.max(rate * frameBytes * 3 / 10, 4096));

        AudioAttributes attributes = new AudioAttributes.Builder()
            // USAGE_MEDIA follows the phone's normal media/speaker/Bluetooth
            // route. USAGE_ASSISTANT is inconsistently routed by some vendors.
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
        AudioFormat format = new AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(rate)
            .setChannelMask(channelMask)
            .build();

        audioTrack = new AudioTrack(
            attributes,
            format,
            target,
            AudioTrack.MODE_STREAM,
            AudioManager.AUDIO_SESSION_ID_GENERATE
        );
        if (audioTrack.getState() != AudioTrack.STATE_INITIALIZED) {
            releaseTrackOnly();
            throw new IllegalStateException("Android speaker output could not be initialized");
        }
        audioTrack.setVolume(1.0f);
    }

    private void stopInternal() {
        announcedPlaying = false;
        packetCount = 0;
        if (decoder != null) {
            try { decoder.resetState(); } catch (Throwable ignored) { }
        }
        if (audioTrack != null) {
            try { audioTrack.pause(); } catch (Throwable ignored) { }
            try { audioTrack.flush(); } catch (Throwable ignored) { }
        }
        emitState("stopped");
    }

    private void releaseInternal() {
        releaseDecoderOnly();
        releaseTrackOnly();
        sampleRate = 0;
        channels = 0;
        frameDurationMs = DEFAULT_FRAME_DURATION_MS;
        announcedPlaying = false;
        packetCount = 0;
    }

    private void releaseDecoderOnly() {
        decoder = null;
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
        if (stateListener != null) stateListener.onState(state, sampleRate, channels, packetCount);
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
