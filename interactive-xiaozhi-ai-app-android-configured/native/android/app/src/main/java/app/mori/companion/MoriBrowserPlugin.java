package app.mori.companion;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/** Internet content lives in a separate WebView with no Capacitor or JavaScript bridge. */
@CapacitorPlugin(name = "MoriBrowser")
public class MoriBrowserPlugin extends Plugin {
    private WebView browser;
    private boolean loading = false;
    private String pageError = "";
    private int httpStatus = 0;
    private String errorCode = "";
    private String requestedUrl = "";
    private WebView diagnosticBrowser;
    private PluginCall diagnosticCall;
    private String lastClosedUrl = "";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private PluginCall pendingRead;
    private Runnable readTimeout;
    private String readerScript;
    private View fullScreenVideo;
    private WebChromeClient.CustomViewCallback fullScreenCallback;

    @Override
    public void load() {
        try (InputStream input = getContext().getAssets().open("public/browser-reader.js"); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            readerScript = output.toString("UTF-8");
        } catch (Exception ignored) { readerScript = null; }
    }

    private boolean safeUrl(String value) {
        if (value == null || value.length() > 8192) return false;
        Uri uri = Uri.parse(value);
        String host = uri.getHost();
        if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) || host == null || uri.getUserInfo() != null) return false;
        host = host.toLowerCase(Locale.ROOT);
        if (!host.contains(".") || host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
        if (host.matches("^(127|10|0|169\\.254|192\\.168)\\..*") || host.matches("^172\\.(1[6-9]|2[0-9]|3[01])\\..*")) return false;
        return !host.contains(":");
    }

    private void emitState() {
        if (browser == null) return;
        JSObject state = new JSObject();
        state.put("url", browser.getUrl() == null ? "" : browser.getUrl());
        state.put("title", browser.getTitle() == null ? "" : browser.getTitle());
        state.put("loading", loading);
        state.put("canGoBack", browser.canGoBack());
        state.put("canGoForward", browser.canGoForward());
        state.put("security", browser.getUrl() != null && browser.getUrl().startsWith("https://") && !errorCode.equals("TLS_ERROR") ? "secure" : browser.getUrl() != null && browser.getUrl().startsWith("http://") ? "insecure" : "unknown");
        if (httpStatus > 0) state.put("httpStatus", httpStatus);
        if (!errorCode.isEmpty()) state.put("errorCode", errorCode);
        state.put("externalRecommended", browser.getUrl() != null && browser.getUrl().startsWith("https://accounts.google.com/"));
        if (!pageError.isEmpty()) state.put("error", pageError);
        notifyListeners("state", state);
    }

    private void setBounds(PluginCall call) {
        if (browser == null) return;
        float density = getContext().getResources().getDisplayMetrics().density;
        FrameLayout root = getActivity().findViewById(android.R.id.content);
        int[] origin = new int[2];
        int[] appOrigin = new int[2];
        root.getLocationOnScreen(origin);
        getBridge().getWebView().getLocationOnScreen(appOrigin);
        int width = Math.max(1, Math.round(call.getFloat("width", 1f) * density));
        int height = Math.max(1, Math.round(call.getFloat("height", 1f) * density));
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(width, height);
        params.gravity = Gravity.TOP | Gravity.LEFT;
        params.leftMargin = Math.round(call.getFloat("x", 0f) * density) + appOrigin[0] - origin[0];
        params.topMargin = Math.round(call.getFloat("y", 0f) * density) + appOrigin[1] - origin[1];
        browser.setLayoutParams(params);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureBrowserSettings(WebView view, boolean interactive) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);
        settings.setBlockNetworkLoads(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(!interactive);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(interactive);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setDefaultTextEncodingName("UTF-8");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(view, interactive);
        view.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    }

    private void loadPage(String url) {
        pageError = "";
        errorCode = "";
        httpStatus = 0;
        requestedUrl = url;
        loading = true;
        browser.loadUrl(url);
        emitState();
    }

    private void rejectRead(String message) {
        if (readTimeout != null) handler.removeCallbacks(readTimeout);
        if (pendingRead != null) { pendingRead.reject(message); pendingRead = null; }
    }

    private void capturePage() {
        if (pendingRead == null || browser == null || loading) return;
        if (readerScript == null) { rejectRead("The page reader is missing. Rebuild the APK to include browser-reader.js."); return; }
        if (!pageError.isEmpty()) { rejectRead(pageError); return; }
        final PluginCall request = pendingRead;
        final String address = browser.getUrl();
        if (!safeUrl(address)) { rejectRead("No public HTTP/HTTPS page is loaded."); return; }
        browser.evaluateJavascript(readerScript, (result) -> {
            if (pendingRead != request) return;
            if (browser == null || !address.equals(browser.getUrl())) { rejectRead("The page changed before it could be read. Please try again."); return; }
            try {
                JSObject snapshot = new JSObject(result);
                if (readTimeout != null) handler.removeCallbacks(readTimeout);
                pendingRead = null;
                request.resolve(snapshot);
            } catch (Exception exception) { rejectRead("The website's visible text could not be read."); }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (!safeUrl(url)) { call.reject("Only public HTTP/HTTPS websites can be opened."); return; }
        getActivity().runOnUiThread(() -> {
            if (browser != null) {
                browser.onResume();
                browser.setVisibility(View.VISIBLE);
                setBounds(call);
                if (!url.equals(browser.getUrl()) && !url.equals(lastClosedUrl) && !(loading && url.equals(requestedUrl))) loadPage(url);
                emitState();
                call.resolve();
                return;
            }
            browser = new WebView(getActivity());
            browser.setBackgroundColor(Color.WHITE);
            configureBrowserSettings(browser, true);
            browser.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (!request.isForMainFrame()) return false;
                    if (safeUrl(request.getUrl().toString())) return false;
                    pageError = "This link is not a public HTTP/HTTPS website. File and app-control links cannot be opened here.";
                    errorCode = "UNSAFE_SCHEME";
                    loading = false;
                    emitState();
                    return true;
                }
                @Override
                public void onPageStarted(WebView view, String address, Bitmap favicon) { pageError = ""; errorCode = ""; httpStatus = 0; requestedUrl = address; loading = true; emitState(); }
                @Override
                public void onPageFinished(WebView view, String address) {
                    if (!address.equals(view.getUrl())) return;
                    loading = false;
                    CookieManager.getInstance().flush();
                    emitState();
                    handler.postDelayed(() -> capturePage(), 700);
                }
                @Override
                public void doUpdateVisitedHistory(WebView view, String address, boolean reload) { emitState(); }
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) { errorCode = String.valueOf(error.getErrorCode()); pageError = "Website load failed: " + error.getDescription(); loading = false; rejectRead(pageError); emitState(); }
                }
                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                    if (request.isForMainFrame() && response.getStatusCode() >= 400) { httpStatus = response.getStatusCode(); pageError = "Website returned HTTP " + httpStatus + ". The server may require consent or restrict this browser."; rejectRead(pageError); emitState(); }
                }
                @Override
                public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                    handler.cancel();
                    loading = false;
                    pageError = "The website's TLS certificate could not be verified. Connection blocked.";
                    errorCode = "TLS_ERROR";
                    rejectRead(pageError);
                    emitState();
                }
            });
            browser.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onProgressChanged(WebView view, int progress) { loading = progress < 100; emitState(); }
                @Override
                public void onReceivedTitle(WebView view, String title) { emitState(); }
                @Override
                public void onPermissionRequest(PermissionRequest request) { request.deny(); }
                @Override
                public void onShowCustomView(View view, CustomViewCallback callback) {
                    hideFullScreen();
                    fullScreenVideo = view;
                    fullScreenCallback = callback;
                    FrameLayout root = getActivity().findViewById(android.R.id.content);
                    root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                    view.setBackgroundColor(Color.BLACK);
                }
                @Override
                public void onHideCustomView() { hideFullScreen(); }
            });
            browser.setDownloadListener((address, userAgent, disposition, mimetype, length) -> {
                if (safeUrl(address)) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(address));
                        intent.addCategory(Intent.CATEGORY_BROWSABLE);
                        getActivity().startActivity(intent);
                        pageError = "Download handed to your Android browser for safer file handling.";
                    } catch (Exception exception) {
                        pageError = "Android could not open this download. Use Open in device browser.";
                    }
                } else {
                    pageError = "This download address was blocked because it is not a public HTTP/HTTPS URL.";
                }
                emitState();
            });
            FrameLayout root = getActivity().findViewById(android.R.id.content);
            root.addView(browser);
            setBounds(call);
            loadPage(url);
            call.resolve();
        });
    }

    @PluginMethod
    public void navigate(PluginCall call) {
        String url = call.getString("url");
        if (!safeUrl(url)) { call.reject("Only public HTTP/HTTPS websites can be opened."); return; }
        getActivity().runOnUiThread(() -> {
            if (browser == null) { call.reject("Open the browser first."); return; }
            if (url.equals(browser.getUrl()) || (loading && url.equals(requestedUrl))) { call.resolve(); return; }
            rejectRead("The user navigated away before the page was read.");
            loadPage(url);
            call.resolve();
        });
    }

    @PluginMethod
    public void bounds(PluginCall call) { getActivity().runOnUiThread(() -> { setBounds(call); call.resolve(); }); }

    @PluginMethod
    public void command(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (browser == null) { call.reject("Open the browser first."); return; }
            String action = call.getString("action", "");
            rejectRead("Browser navigation interrupted the page read. Try again after loading.");
            pageError = "";
            if (action.equals("back") && browser.canGoBack()) browser.goBack();
            else if (action.equals("forward") && browser.canGoForward()) browser.goForward();
            else if (action.equals("reload")) browser.reload();
            else if (action.equals("stop")) { browser.stopLoading(); loading = false; }
            emitState();
            call.resolve();
        });
    }

    @PluginMethod
    public void inspect(PluginCall call) {
        final String url = call.getString("url");
        if (url != null && !safeUrl(url)) { call.reject("Only public HTTP/HTTPS websites can be read."); return; }
        getActivity().runOnUiThread(() -> {
            if (browser == null) { call.reject("Open the browser first."); return; }
            rejectRead("A new page read replaced the previous request.");
            pendingRead = call;
            readTimeout = () -> rejectRead("The page did not load in time. Complete any website verification or open it in your device browser.");
            handler.postDelayed(readTimeout, 28000);
            if (url != null && !url.equals(browser.getUrl()) && !(loading && url.equals(requestedUrl))) loadPage(url);
            else if (!loading) capturePage();
        });
    }

    private void hideFullScreen() {
        if (fullScreenVideo != null && fullScreenVideo.getParent() instanceof ViewGroup) ((ViewGroup) fullScreenVideo.getParent()).removeView(fullScreenVideo);
        fullScreenVideo = null;
        WebChromeClient.CustomViewCallback callback = fullScreenCallback;
        fullScreenCallback = null;
        if (callback != null) callback.onCustomViewHidden();
    }

    private void destroyBrowser() {
        rejectRead("The browser closed. No page was returned.");
        hideFullScreen();
        if (browser == null) return;
        browser.stopLoading();
        if (browser.getParent() instanceof ViewGroup) ((ViewGroup) browser.getParent()).removeView(browser);
        browser.destroy();
        browser = null;
    }

    @PluginMethod
    public void close(PluginCall call) { getActivity().runOnUiThread(() -> {
        rejectRead("The browser was hidden. No page was shared.");
        hideFullScreen();
        if (browser != null) { lastClosedUrl = browser.getUrl() == null ? requestedUrl : browser.getUrl(); browser.evaluateJavascript("document.querySelectorAll('video,audio').forEach(function(media){ media.pause(); });", null); browser.setVisibility(View.GONE); browser.onPause(); }
        call.resolve();
    }); }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject info = new JSObject();
        info.put("engine", "Android System WebView");
        String version = "Installed system WebView";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) { PackageInfo installed = WebView.getCurrentWebViewPackage(); if (installed != null) version = installed.versionName; }
        info.put("version", version);
        info.put("supportsHttp", true);
        call.resolve(info);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    public void diagnose(PluginCall call) {
        final String target = call.getString("url");
        if (!safeUrl(target)) { call.reject("Enter a public HTTP/HTTPS address to check."); return; }
        getActivity().runOnUiThread(() -> {
            if (diagnosticBrowser != null) { call.reject("A browser check is already running."); return; }
            final long started = System.currentTimeMillis();
            final AtomicBoolean finished = new AtomicBoolean(false);
            final WebView check = new WebView(getActivity());
            diagnosticBrowser = check;
            diagnosticCall = call;
            configureBrowserSettings(check, false);
            class Completion {
                void finish(boolean success, int status, String code, String message) {
                    if (diagnosticBrowser != check) return;
                    if (!finished.compareAndSet(false, true)) return;
                    JSObject result = new JSObject();
                    result.put("engine", "Android System WebView"); result.put("target", target);
                    result.put("finalUrl", check.getUrl() == null ? target : check.getUrl()); result.put("title", check.getTitle() == null ? "" : check.getTitle());
                    result.put("status", success ? "passed" : "failed"); if (status > 0) result.put("httpStatus", status);
                    result.put("code", code); result.put("message", message); result.put("checkedAt", System.currentTimeMillis()); result.put("durationMs", System.currentTimeMillis() - started);
                    diagnosticCall = null;
                    handler.post(() -> { check.stopLoading(); check.destroy(); if (diagnosticBrowser == check) diagnosticBrowser = null; });
                    call.resolve(result);
                }
            }
            final Completion completion = new Completion();
            check.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return request.isForMainFrame() && !safeUrl(request.getUrl().toString()); }
                @Override public void onPageFinished(WebView view, String url) { completion.finish(true, 0, "", "The system WebView finished loading this live address. This is not a login, CAPTCHA, or media-playback test."); }
                @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { if (request.isForMainFrame()) completion.finish(false, 0, String.valueOf(error.getErrorCode()), error.getDescription().toString()); }
                @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) { if (request.isForMainFrame()) completion.finish(false, response.getStatusCode(), "HTTP_ERROR", "The server responded with HTTP " + response.getStatusCode()); }
                @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); completion.finish(false, 0, "TLS_ERROR", "TLS certificate verification failed. It was not bypassed."); }
            });
            check.setWebChromeClient(new WebChromeClient() { @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); } });
            handler.postDelayed(() -> completion.finish(false, 0, "TIMEOUT", "The website did not load within 20 seconds."), 20000);
            check.loadUrl(target);
        });
    }

    @Override
    protected void handleOnPause() { if (browser != null) browser.onPause(); }
    @Override
    protected void handleOnResume() { if (browser != null) browser.onResume(); }
    @Override
    protected void handleOnDestroy() { getActivity().runOnUiThread(() -> {
        destroyBrowser();
        handler.removeCallbacksAndMessages(null);
        WebView check = diagnosticBrowser;
        diagnosticBrowser = null;
        if (diagnosticCall != null) { diagnosticCall.reject("The app closed before the browser check finished."); diagnosticCall = null; }
        if (check != null) { check.stopLoading(); check.destroy(); }
    }); }
}