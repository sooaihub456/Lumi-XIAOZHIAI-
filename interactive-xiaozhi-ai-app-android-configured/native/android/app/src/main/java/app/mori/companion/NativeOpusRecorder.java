package app.mori.companion;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaCodec;
import android.media.MediaFormat;
import android.media.MediaRecorder;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Captures Android microphone PCM, encodes it as raw Opus access units and
 * forwards one Opus packet at a time to Xiaozhi protocol-v1 WebSocket binary
 * frames. This is the proper Xiaozhi user-input path; listen/detect is reserved
 * for wake words and must not be used to inject full user transcripts.
 */
final class NativeOpusRecorder {
    interface PacketListener {
        boolean onPacket(byte[] packet);
    }

    interface ErrorListener {
        void onError(String message);
    }

    interface StateListener {
        void onState(String state);
    }

    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNELS = 1;
    private static final int FRAME_DURATION_MS = 60;
    private static final int FRAME_SAMPLES = SAMPLE_RATE * FRAME_DURATION_MS / 1000; // 960
    private static final int FRAME_BYTES = FRAME_SAMPLES * 2;
    private static final int BIT_RATE = 24000;
    private static final long CODEC_TIMEOUT_US = 20_000L;

    private final PacketListener packetListener;
    private final ErrorListener errorListener;
    private final StateListener stateListener;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final Object lock = new Object();

    private AudioRecord recorder;
    private MediaCodec encoder;
    private Thread worker;
    private long presentationTimeUs;

    NativeOpusRecorder(PacketListener packetListener, ErrorListener errorListener, StateListener stateListener) {
        this.packetListener = packetListener;
        this.errorListener = errorListener;
        this.stateListener = stateListener;
    }

    boolean isRunning() {
        return running.get();
    }

    void start() throws Exception {
        synchronized (lock) {
            if (running.get()) return;
            cleanupLocked();

            MediaFormat format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, SAMPLE_RATE, CHANNELS);
            format.setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE);
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, FRAME_BYTES * 2);

            MediaCodec createdEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS);
            createdEncoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            createdEncoder.start();

            int minBuffer = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            );
            int bufferSize = Math.max(minBuffer > 0 ? minBuffer : 0, FRAME_BYTES * 6);
            AudioRecord createdRecorder = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize
            );
            if (createdRecorder.getState() != AudioRecord.STATE_INITIALIZED) {
                try { createdRecorder.release(); } catch (Throwable ignored) { }
                try { createdEncoder.stop(); } catch (Throwable ignored) { }
                try { createdEncoder.release(); } catch (Throwable ignored) { }
                throw new IllegalStateException("Android microphone could not be initialized");
            }

            encoder = createdEncoder;
            recorder = createdRecorder;
            presentationTimeUs = 0L;
            running.set(true);
            recorder.startRecording();
            if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                running.set(false);
                cleanupLocked();
                throw new IllegalStateException("Android microphone permission or recording service is unavailable");
            }

            worker = new Thread(this::recordLoop, "Mori-Xiaozhi-Microphone");
            worker.setDaemon(true);
            worker.start();
        }
        emitState("listening");
    }

    void stop() {
        Thread currentWorker;
        synchronized (lock) {
            if (!running.get() && recorder == null && encoder == null) return;
            running.set(false);
            currentWorker = worker;
            try {
                if (recorder != null && recorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) recorder.stop();
            } catch (Throwable ignored) { }
        }
        if (currentWorker != null && currentWorker != Thread.currentThread()) {
            try { currentWorker.join(350L); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
        }
        synchronized (lock) {
            worker = null;
            cleanupLocked();
        }
        emitState("idle");
    }

    void release() {
        stop();
    }

    private void recordLoop() {
        short[] pcm = new short[FRAME_SAMPLES];
        try {
            while (running.get()) {
                int filled = 0;
                while (filled < FRAME_SAMPLES && running.get()) {
                    AudioRecord current;
                    synchronized (lock) { current = recorder; }
                    if (current == null) return;
                    int read = current.read(pcm, filled, FRAME_SAMPLES - filled, AudioRecord.READ_BLOCKING);
                    if (read < 0) throw new IllegalStateException("Android microphone read failed (" + read + ")");
                    if (read == 0) continue;
                    filled += read;
                }
                if (!running.get() || filled <= 0) break;
                encodeFrame(pcm, filled);
            }
        } catch (Throwable throwable) {
            if (running.get()) emitError("Xiaozhi microphone streaming failed: " + cleanMessage(throwable));
        } finally {
            running.set(false);
            synchronized (lock) {
                if (Thread.currentThread() == worker) worker = null;
                cleanupLocked();
            }
            emitState("idle");
        }
    }

    private void encodeFrame(short[] pcm, int sampleCount) {
        MediaCodec current;
        synchronized (lock) { current = encoder; }
        if (current == null || !running.get()) return;

        int inputIndex = current.dequeueInputBuffer(CODEC_TIMEOUT_US);
        if (inputIndex < 0) {
            drainOutput(current);
            inputIndex = current.dequeueInputBuffer(CODEC_TIMEOUT_US);
        }
        if (inputIndex < 0) return;

        ByteBuffer input = current.getInputBuffer(inputIndex);
        if (input == null) throw new IllegalStateException("Android Opus encoder returned no input buffer");
        input.clear();
        input.order(ByteOrder.LITTLE_ENDIAN);
        int toWrite = Math.min(sampleCount, input.remaining() / 2);
        for (int i = 0; i < toWrite; i += 1) input.putShort(pcm[i]);
        int bytes = toWrite * 2;
        current.queueInputBuffer(inputIndex, 0, bytes, presentationTimeUs, 0);
        presentationTimeUs += (long) FRAME_DURATION_MS * 1000L;
        drainOutput(current);
    }

    private void drainOutput(MediaCodec current) {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        while (running.get()) {
            int outputIndex = current.dequeueOutputBuffer(info, 0L);
            if (outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER) return;
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED || outputIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) continue;
            if (outputIndex < 0) return;

            ByteBuffer output = current.getOutputBuffer(outputIndex);
            boolean codecConfig = (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0;
            if (!codecConfig && output != null && info.size > 0) {
                output.position(info.offset);
                output.limit(info.offset + info.size);
                byte[] packet = new byte[info.size];
                output.get(packet);
                if (!packetListener.onPacket(packet)) {
                    current.releaseOutputBuffer(outputIndex, false);
                    throw new IllegalStateException("The Xiaozhi WebSocket could not accept microphone audio");
                }
            }
            current.releaseOutputBuffer(outputIndex, false);
        }
    }

    private void cleanupLocked() {
        AudioRecord oldRecorder = recorder;
        recorder = null;
        if (oldRecorder != null) {
            try {
                if (oldRecorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) oldRecorder.stop();
            } catch (Throwable ignored) { }
            try { oldRecorder.release(); } catch (Throwable ignored) { }
        }

        MediaCodec oldEncoder = encoder;
        encoder = null;
        if (oldEncoder != null) {
            try { oldEncoder.stop(); } catch (Throwable ignored) { }
            try { oldEncoder.release(); } catch (Throwable ignored) { }
        }
        presentationTimeUs = 0L;
    }

    private void emitError(String message) {
        try { errorListener.onError(message); } catch (Throwable ignored) { }
    }

    private void emitState(String state) {
        try { stateListener.onState(state); } catch (Throwable ignored) { }
    }

    private static String cleanMessage(Throwable throwable) {
        if (throwable == null) return "unknown error";
        String message = throwable.getMessage();
        if (message == null || message.trim().isEmpty()) message = throwable.getClass().getSimpleName();
        message = message.replace('\r', ' ').replace('\n', ' ').trim();
        return message.length() > 180 ? message.substring(0, 180) + "…" : message;
    }
}
