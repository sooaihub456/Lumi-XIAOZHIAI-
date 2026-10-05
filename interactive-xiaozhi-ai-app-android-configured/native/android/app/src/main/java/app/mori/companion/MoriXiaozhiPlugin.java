package app.mori.companion;

import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.TimeUnit;

import org.json.JSONObject;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.SSLException;

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

    private final Object socketLock = new Object();
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .build();

    private WebSocket socket;
    private long generation = 0;
    private NativeOpusPlayer audioPlayer;

    @Override
    public void load() {
        audioPlayer = new NativeOpusPlayer(message -> {
            JSObject event = new JSObject();
            event.put("message", message);
            notifyListeners("audioError", event);
        });
    }

    private void inspectAudioSettings(String text) {
        try {
            JSONObject message = new JSONObject(text);
            if (!"hello".equals(message.optString("type"))) return;
            JSONObject params = message.optJSONObject("audio_params");
            if (params == null) return;
            int sampleRate = params.optInt("sample_rate", 24000);
            int channels = params.optInt("channels", 1);
            if (audioPlayer != null) audioPlayer.configure(sampleRate, channels);
        } catch (Exception ignored) {
            // Not every JSON message carries audio settings.
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

    private void closeCurrent(int code, String reason) {
        WebSocket current;
        synchronized (socketLock) {
            generation += 1;
            current = socket;
            socket = null;
        }
        if (current != null) current.close(code, reason);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String url = call.getString("url", "").trim();
        String deviceId = call.getString("deviceId", "").trim();
        String clientId = call.getString("clientId", "").trim();
        String token = call.getString("token", "").trim();

        if (!validUrl(url)) {
            call.reject("Use a secure wss:// Xiaozhi WebSocket URL.");
            return;
        }
        if (!validCredential(deviceId, false) || !validCredential(clientId, false) || !validCredential(token, true)) {
            call.reject("Invalid Xiaozhi connection credentials.");
            return;
        }

        closeCurrent(1000, "Replacing connection");

        final long currentGeneration;
        synchronized (socketLock) {
            currentGeneration = ++generation;
        }
        AtomicBoolean settled = new AtomicBoolean(false);

        Request.Builder builder = new Request.Builder()
            .url(url)
            .header("Device-Id", deviceId)
            .header("Client-Id", clientId)
            .header("Protocol-Version", "1")
            .header("User-Agent", "Mori-Android/0.6");
        if (!token.trim().isEmpty()) builder.header("Authorization", "Bearer " + token);

        WebSocket created = client.newWebSocket(builder.build(), new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                if (!isCurrent(currentGeneration)) {
                    webSocket.close(1000, "Stale connection");
                    return;
                }
                synchronized (socketLock) {
                    if (currentGeneration == generation) socket = webSocket;
                }
                JSObject state = new JSObject();
                state.put("state", "open");
                emit("state", state, currentGeneration);
                if (settled.compareAndSet(false, true)) {
                    JSObject result = new JSObject();
                    result.put("connected", true);
                    call.resolve(result);
                }
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                if (!isCurrent(currentGeneration)) return;
                inspectAudioSettings(text);
                if (text.length() > MAX_TEXT_FRAME_LENGTH) {
                    webSocket.close(1009, "Message too large");
                    return;
                }
                JSObject event = new JSObject();
                event.put("kind", "text");
                event.put("data", text);
                emit("message", event, currentGeneration);
            }

            @Override
            public void onMessage(WebSocket webSocket, ByteString bytes) {
                if (!isCurrent(currentGeneration)) return;
                if (audioPlayer != null) audioPlayer.enqueue(bytes.toByteArray());
            }

            @Override
            public void onClosing(WebSocket webSocket, int code, String reason) {
                if (isCurrent(currentGeneration)) webSocket.close(code, reason);
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                if (!isCurrent(currentGeneration)) return;
                synchronized (socketLock) {
                    if (currentGeneration == generation) socket = null;
                }
                JSObject event = new JSObject();
                event.put("code", code);
                event.put("reason", reason == null ? "" : reason);
                emit("closed", event, currentGeneration);
                if (settled.compareAndSet(false, true)) call.reject("Xiaozhi closed the connection before it was ready.");
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable throwable, Response response) {
                if (!isCurrent(currentGeneration)) return;
                synchronized (socketLock) {
                    if (currentGeneration == generation) socket = null;
                }
                String message = failureMessage(throwable, response);
                JSObject event = new JSObject();
                event.put("message", message);
                if (response != null) event.put("httpStatus", response.code());
                emit("error", event, currentGeneration);
                if (settled.compareAndSet(false, true)) call.reject(message);
            }
        });

        synchronized (socketLock) {
            if (currentGeneration == generation) socket = created;
            else created.close(1000, "Stale connection");
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.length() > MAX_TEXT_FRAME_LENGTH) {
            call.reject("Invalid Xiaozhi message.");
            return;
        }
        WebSocket current;
        synchronized (socketLock) {
            current = socket;
        }
        if (current == null) {
            call.reject("The Xiaozhi connection is not open.");
            return;
        }
        if (!current.send(text)) {
            call.reject("The Xiaozhi connection could not accept this message.");
            return;
        }
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
        closeCurrent(1000, "Leaving the conversation");
        if (audioPlayer != null) audioPlayer.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        closeCurrent(1000, "App closed");
        if (audioPlayer != null) {
            audioPlayer.release();
            audioPlayer = null;
        }
        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
        super.handleOnDestroy();
    }
}
