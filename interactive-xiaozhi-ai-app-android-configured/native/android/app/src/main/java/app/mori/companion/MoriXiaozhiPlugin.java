package app.mori.companion;

import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.SSLException;

import org.json.JSONObject;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

@CapacitorPlugin(name = "MoriXiaozhi")
public class MoriXiaozhiPlugin extends Plugin {
    private static final int MAX_CREDENTIAL_LENGTH = 8192;
    private static final int MAX_TEXT_FRAME_LENGTH = 1024 * 1024;
    private static final long[] RECONNECT_DELAYS_MS = { 1000L, 2000L, 4000L, 8000L, 15000L, 30000L };

    private final Object socketLock = new Object();
    private final ScheduledExecutorService reconnectExecutor = Executors.newSingleThreadScheduledExecutor();
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        // WebSocket control pings keep NAT/proxy state alive. Xiaozhi may still
        // intentionally end an idle conversation, which is handled by reconnect.
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build();

    private WebSocket socket;
    private ScheduledFuture<?> reconnectTask;
    private long generation = 0;
    private boolean reconnectEnabled = false;
    private int reconnectAttempt = 0;
    private String savedUrl = "";
    private String savedDeviceId = "";
    private String savedClientId = "";
    private String savedToken = "";
    private String savedAsrMode = "server";
    private String savedAsrLanguages = "zh,en";
    private String savedHello = "";
    private String savedSessionId = "";
    private NativeOpusPlayer audioPlayer;
    private NativeOpusRecorder micRecorder;

    @Override
    public void load() {
        audioPlayer = new NativeOpusPlayer(message -> {
            JSObject event = new JSObject();
            event.put("message", message);
            notifyListeners("audioError", event);
        }, (state, sampleRate, channels, packetCount) -> {
            JSObject event = new JSObject();
            event.put("state", state);
            event.put("sampleRate", sampleRate);
            event.put("channels", channels);
            event.put("packetCount", packetCount);
            notifyListeners("audioState", event);
        });

        micRecorder = new NativeOpusRecorder(packet -> {
            WebSocket current;
            synchronized (socketLock) { current = socket; }
            return current != null && current.send(ByteString.of(packet));
        }, message -> {
            JSObject event = new JSObject();
            event.put("message", message);
            notifyListeners("inputError", event);
        }, state -> {
            JSObject event = new JSObject();
            event.put("state", state);
            notifyListeners("inputState", event);
        });
    }

    private void inspectServerMessage(String text) {
        try {
            JSONObject message = new JSONObject(text);
            String type = message.optString("type");
            if ("hello".equals(type)) {
                synchronized (socketLock) { savedSessionId = message.optString("session_id", ""); }
                JSONObject params = message.optJSONObject("audio_params");
                if (params != null) {
                    int sampleRate = params.optInt("sample_rate", 24000);
                    int channels = params.optInt("channels", 1);
                    int frameDuration = params.optInt("frame_duration", 60);
                    if (audioPlayer != null) audioPlayer.configure(sampleRate, channels, frameDuration);
                }
                return;
            }
            if ("tts".equals(type) && "start".equals(message.optString("state"))) {
                // Xiaozhi has accepted the user's utterance and is about to talk.
                // Stop the local microphone immediately so speaker audio is never
                // fed back into the upstream recognizer. The server already ended
                // this auto-listen turn, so do not send another listen/stop here.
                if (micRecorder != null) micRecorder.stop();
            } else if ("goodbye".equals(type)) {
                if (micRecorder != null) micRecorder.stop();
            }
        } catch (Exception ignored) {
            // Ordinary JSON messages need no native control handling.
        }
    }

    private boolean sendListenState(String state, String mode) {
        final WebSocket current;
        final String sessionId;
        synchronized (socketLock) {
            current = socket;
            sessionId = savedSessionId;
        }
        if (current == null || sessionId == null || sessionId.isEmpty()) return false;
        try {
            JSONObject message = new JSONObject();
            message.put("session_id", sessionId);
            message.put("type", "listen");
            message.put("state", state);
            if (mode != null && !mode.isEmpty()) message.put("mode", mode);
            return current.send(message.toString());
        } catch (Exception ignored) {
            return false;
        }
    }

    private void rememberHello(String text) {
        try {
            JSONObject message = new JSONObject(text);
            if ("hello".equals(message.optString("type")) && "websocket".equals(message.optString("transport"))) {
                synchronized (socketLock) {
                    savedHello = text;
                }
            }
        } catch (Exception ignored) {
            // Ordinary application messages are not hello packets.
        }
    }

    private boolean validCredential(String value, boolean allowEmpty) {
        if (value == null) return allowEmpty;
        if (!allowEmpty && value.trim().isEmpty()) return false;
        return value.length() <= MAX_CREDENTIAL_LENGTH && !value.contains("\r") && !value.contains("\n");
    }

    private boolean validUrl(String value) {
        if (value == null || value.length() > 4096) return false;
        try {
            Uri uri = Uri.parse(value);
            return "wss".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null && !uri.getHost().trim().isEmpty();
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isCurrent(long candidate) {
        synchronized (socketLock) {
            return candidate == generation;
        }
    }

    private void emit(String name, JSObject payload, long candidate) {
        if (isCurrent(candidate)) notifyListeners(name, payload);
    }

    private void emitState(String state, long candidate, boolean reconnected, int attempt, long delayMs) {
        JSObject event = new JSObject();
        event.put("state", state);
        event.put("reconnected", reconnected);
        if (attempt > 0) event.put("attempt", attempt);
        if (delayMs > 0) event.put("delayMs", delayMs);
        emit("state", event, candidate);
    }

    private String failureMessage(Throwable throwable, Response response) {
        if (response != null) {
            int code = response.code();
            if (code == 401 || code == 403) {
                return "Xiaozhi rejected the credentials (HTTP " + code + "). Check that the token, Device ID, and Client ID belong to the same paired device.";
            }
            return "Xiaozhi rejected the WebSocket handshake (HTTP " + code + ").";
        }
        if (throwable instanceof SSLException) {
            return "Could not verify the Xiaozhi server TLS certificate.";
        }
        String detail = throwable == null ? "" : throwable.getMessage();
        if (detail == null || detail.trim().isEmpty()) return "Could not connect to the Xiaozhi WebSocket server.";
        detail = detail.replace('\r', ' ').replace('\n', ' ').trim();
        if (detail.length() > 180) detail = detail.substring(0, 180) + "…";
        return "Could not connect to Xiaozhi: " + detail;
    }

    private boolean isFatalFailure(Throwable throwable, Response response) {
        if (throwable instanceof SSLException) return true;
        if (response == null) return false;
        int code = response.code();
        if (code == 408 || code == 429) return false;
        return code >= 400 && code < 500;
    }

    private String fatalCloseMessage(int code, String reason) {
        switch (code) {
            case 1002:
            case 1003:
            case 1007:
            case 1008:
            case 1009:
                String suffix = reason == null || reason.trim().isEmpty() ? "" : ": " + reason.trim();
                return "Xiaozhi closed the connection with a non-retryable WebSocket error (code " + code + ")" + suffix;
            default:
                return null;
        }
    }

    private void clearReconnectTaskLocked() {
        if (reconnectTask != null) {
            reconnectTask.cancel(false);
            reconnectTask = null;
        }
    }

    private void stopConnection(int code, String reason, boolean clearCredentials) {
        WebSocket current;
        synchronized (socketLock) {
            reconnectEnabled = false;
            clearReconnectTaskLocked();
            generation += 1;
            reconnectAttempt = 0;
            current = socket;
            socket = null;
            savedHello = "";
            savedSessionId = "";
            if (clearCredentials) {
                savedUrl = "";
                savedDeviceId = "";
                savedClientId = "";
                savedToken = "";
                savedAsrMode = "server";
                savedAsrLanguages = "zh,en";
            }
        }
        if (micRecorder != null) micRecorder.stop();
        if (current != null) current.close(code, reason);
    }

    private void emitFatalError(String message, long candidate) {
        synchronized (socketLock) {
            if (candidate != generation) return;
            reconnectEnabled = false;
            clearReconnectTaskLocked();
            socket = null;
            savedSessionId = "";
        }
        if (micRecorder != null) micRecorder.stop();
        JSObject event = new JSObject();
        event.put("message", message);
        emit("error", event, candidate);
    }

    private void scheduleReconnect(long candidate, PluginCall initialCall, AtomicBoolean settled, String cause) {
        if (micRecorder != null) micRecorder.stop();
        synchronized (socketLock) { if (candidate == generation) savedSessionId = ""; }
        final int attempt;
        final long delayMs;
        synchronized (socketLock) {
            if (candidate != generation || !reconnectEnabled) return;
            if (reconnectTask != null && !reconnectTask.isDone()) return;
            reconnectAttempt += 1;
            attempt = reconnectAttempt;
            delayMs = RECONNECT_DELAYS_MS[Math.min(attempt - 1, RECONNECT_DELAYS_MS.length - 1)];
            socket = null;
            reconnectTask = reconnectExecutor.schedule(() -> {
                synchronized (socketLock) {
                    if (candidate != generation || !reconnectEnabled) return;
                    reconnectTask = null;
                }
                emitState("connecting", candidate, true, attempt, 0);
                openSocket(candidate, initialCall, settled, true);
            }, delayMs, TimeUnit.MILLISECONDS);
        }

        JSObject event = new JSObject();
        event.put("state", "reconnecting");
        event.put("reconnected", false);
        event.put("attempt", attempt);
        event.put("delayMs", delayMs);
        if (cause != null && !cause.trim().isEmpty()) event.put("reason", cause);
        emit("state", event, candidate);
    }

    private void openSocket(long candidate, PluginCall initialCall, AtomicBoolean settled, boolean reconnecting) {
        final String url;
        final String deviceId;
        final String clientId;
        final String token;
        final String asrMode;
        final String asrLanguages;
        final String hello;
        synchronized (socketLock) {
            if (candidate != generation || !reconnectEnabled) return;
            url = savedUrl;
            deviceId = savedDeviceId;
            clientId = savedClientId;
            token = savedToken;
            asrMode = savedAsrMode;
            asrLanguages = savedAsrLanguages;
            hello = savedHello;
        }

        Request.Builder builder = new Request.Builder()
            .url(url)
            .header("Device-Id", deviceId)
            .header("Client-Id", clientId)
            .header("Protocol-Version", "1")
            .header("User-Agent", "Mori-Android/0.8");
        if (!token.trim().isEmpty()) builder.header("Authorization", "Bearer " + token);
        // These optional headers are intentionally non-standard. Public Xiaozhi
        // servers can ignore them; a self-hosted gateway may use them to choose
        // an automatic multilingual ASR such as SenseVoice/FunASR language:auto.
        if ("bilingual-auto".equals(asrMode)) {
            builder.header("X-Mori-ASR-Mode", "auto");
            builder.header("X-Mori-ASR-Languages", asrLanguages == null || asrLanguages.trim().isEmpty() ? "zh,en" : asrLanguages.trim());
        }

        WebSocket created = client.newWebSocket(builder.build(), new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                if (!isCurrent(candidate)) {
                    webSocket.close(1000, "Stale connection");
                    return;
                }
                final String helloToReplay;
                final boolean wasReconnect;
                synchronized (socketLock) {
                    if (candidate != generation || !reconnectEnabled) {
                        webSocket.close(1000, "Stale connection");
                        return;
                    }
                    socket = webSocket;
                    reconnectAttempt = 0;
                    clearReconnectTaskLocked();
                    helloToReplay = savedHello;
                    wasReconnect = reconnecting;
                }

                emitState("open", candidate, wasReconnect, 0, 0);

                // The JS side sends hello on the first connection. On subsequent
                // automatic reconnects, replay the same hello natively so the
                // server can issue a fresh session_id without user intervention.
                if (wasReconnect && helloToReplay != null && !helloToReplay.isEmpty()) {
                    if (!webSocket.send(helloToReplay)) {
                        scheduleReconnect(candidate, initialCall, settled, "Could not replay Xiaozhi hello after reconnect.");
                        return;
                    }
                }

                if (settled.compareAndSet(false, true)) {
                    JSObject result = new JSObject();
                    result.put("connected", true);
                    initialCall.resolve(result);
                }
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                if (!isCurrent(candidate)) return;
                inspectServerMessage(text);
                if (text.length() > MAX_TEXT_FRAME_LENGTH) {
                    webSocket.close(1009, "Message too large");
                    return;
                }
                JSObject event = new JSObject();
                event.put("kind", "text");
                event.put("data", text);
                emit("message", event, candidate);
            }

            @Override
            public void onMessage(WebSocket webSocket, ByteString bytes) {
                if (!isCurrent(candidate)) return;
                if (audioPlayer != null) audioPlayer.enqueue(bytes.toByteArray());
            }

            @Override
            public void onClosing(WebSocket webSocket, int code, String reason) {
                if (isCurrent(candidate)) webSocket.close(code, reason);
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                if (!isCurrent(candidate)) return;
                synchronized (socketLock) {
                    if (candidate == generation && socket == webSocket) socket = null;
                }

                String fatal = fatalCloseMessage(code, reason);
                if (fatal != null) {
                    emitFatalError(fatal, candidate);
                    if (settled.compareAndSet(false, true)) initialCall.reject(fatal);
                    return;
                }

                String detail = "WebSocket closed" + (code > 0 ? " (code " + code + ")" : "")
                    + (reason == null || reason.trim().isEmpty() ? "" : ": " + reason.trim());
                scheduleReconnect(candidate, initialCall, settled, detail);
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable throwable, Response response) {
                if (!isCurrent(candidate)) return;
                synchronized (socketLock) {
                    if (candidate == generation && socket == webSocket) socket = null;
                }

                String message = failureMessage(throwable, response);
                if (isFatalFailure(throwable, response)) {
                    emitFatalError(message, candidate);
                    if (settled.compareAndSet(false, true)) initialCall.reject(message);
                    return;
                }

                scheduleReconnect(candidate, initialCall, settled, message);
            }
        });

        synchronized (socketLock) {
            if (candidate == generation && reconnectEnabled) socket = created;
            else created.close(1000, "Stale connection");
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String url = call.getString("url", "").trim();
        String deviceId = call.getString("deviceId", "").trim();
        String clientId = call.getString("clientId", "").trim();
        String token = call.getString("token", "").trim();
        String asrMode = call.getString("asrMode", "server").trim();
        String asrLanguages = call.getString("asrLanguages", "zh,en").trim();

        if (!validUrl(url)) {
            call.reject("Use a secure wss:// Xiaozhi WebSocket URL.");
            return;
        }
        if (!validCredential(deviceId, false) || !validCredential(clientId, false) || !validCredential(token, true)) {
            call.reject("Invalid Xiaozhi connection credentials.");
            return;
        }
        if (!"server".equals(asrMode) && !"bilingual-auto".equals(asrMode)) asrMode = "server";
        if (!validCredential(asrLanguages, true) || asrLanguages.length() > 64 || !asrLanguages.matches("[A-Za-z,-]*")) asrLanguages = "zh,en";

        stopConnection(1000, "Replacing connection", true);

        final long currentGeneration;
        synchronized (socketLock) {
            currentGeneration = ++generation;
            reconnectEnabled = true;
            reconnectAttempt = 0;
            savedUrl = url;
            savedDeviceId = deviceId;
            savedClientId = clientId;
            savedToken = token;
            savedAsrMode = asrMode;
            savedAsrLanguages = asrLanguages.isEmpty() ? "zh,en" : asrLanguages;
            savedHello = "";
            savedSessionId = "";
        }

        AtomicBoolean settled = new AtomicBoolean(false);
        emitState("connecting", currentGeneration, false, 0, 0);
        openSocket(currentGeneration, call, settled, false);
    }

    @PluginMethod
    public void send(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.length() > MAX_TEXT_FRAME_LENGTH) {
            call.reject("Invalid Xiaozhi message.");
            return;
        }
        rememberHello(text);

        WebSocket current;
        synchronized (socketLock) {
            current = socket;
        }
        if (current == null) {
            call.reject("The Xiaozhi connection is temporarily reconnecting.");
            return;
        }
        if (!current.send(text)) {
            call.reject("The Xiaozhi connection could not accept this message.");
            return;
        }
        call.resolve();
    }


    @PluginMethod
    public void startListening(PluginCall call) {
        String mode = call.getString("mode", "auto");
        if (!"auto".equals(mode) && !"manual".equals(mode) && !"realtime".equals(mode)) mode = "auto";
        if (micRecorder == null) {
            call.reject("Android microphone streaming is unavailable.");
            return;
        }
        if (micRecorder.isRunning()) {
            call.resolve();
            return;
        }
        if (!sendListenState("start", mode)) {
            call.reject("Xiaozhi is not ready to listen yet. Wait for the connection to finish and try again.");
            return;
        }
        try {
            micRecorder.start();
            call.resolve();
        } catch (Throwable throwable) {
            sendListenState("stop", null);
            String detail = throwable.getMessage();
            if (detail == null || detail.trim().isEmpty()) detail = throwable.getClass().getSimpleName();
            call.reject("Could not start the Android microphone for Xiaozhi: " + detail);
        }
    }

    @PluginMethod
    public void triggerProactive(PluginCall call) {
        String wakeWord = call.getString("wakeWord", "你好小智");
        if (wakeWord == null) wakeWord = "你好小智";
        wakeWord = wakeWord.trim();
        // listen/state=detect is reserved for an actual wake-word event. Keep the
        // payload deliberately short and wake-word-like so hosted Xiaozhi accepts
        // it and generates the reply/TTS with the agent's configured Xiaozhi voice.
        if (wakeWord.isEmpty() || wakeWord.length() > 32 || wakeWord.contains("\n") || wakeWord.contains("\r")) {
            call.reject("Invalid proactive wake word.");
            return;
        }
        if (micRecorder != null) micRecorder.stop();

        final WebSocket current;
        final String sessionId;
        synchronized (socketLock) {
            current = socket;
            sessionId = savedSessionId;
        }
        if (current == null || sessionId == null || sessionId.isEmpty()) {
            call.reject("Xiaozhi is not ready for a proactive turn yet.");
            return;
        }
        try {
            JSONObject message = new JSONObject();
            message.put("session_id", sessionId);
            message.put("type", "listen");
            message.put("state", "detect");
            message.put("text", wakeWord);
            boolean sent = current.send(message.toString());
            if (!sent) {
                call.reject("Xiaozhi could not accept the proactive wake event.");
                return;
            }
            JSObject result = new JSObject();
            result.put("triggered", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not start a proactive Xiaozhi turn: " + error.getMessage());
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        if (micRecorder != null) micRecorder.stop();
        sendListenState("stop", null);
        call.resolve();
    }

    @PluginMethod
    public void stopAudio(PluginCall call) {
        if (audioPlayer != null) audioPlayer.stop();
        call.resolve();
    }

    @PluginMethod
    public void setAudioEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", true);
        if (audioPlayer != null) audioPlayer.setEnabled(enabled == null || enabled);
        call.resolve();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        stopConnection(1000, "Leaving the conversation", true);
        if (audioPlayer != null) audioPlayer.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopConnection(1000, "App closed", true);
        if (audioPlayer != null) {
            audioPlayer.release();
            audioPlayer = null;
        }
        if (micRecorder != null) {
            micRecorder.release();
            micRecorder = null;
        }
        reconnectExecutor.shutdownNow();
        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
        super.handleOnDestroy();
    }
}
