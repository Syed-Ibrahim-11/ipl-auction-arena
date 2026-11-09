package app.iplarena.game;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int MIC_REQUEST = 71;
    private static final String OFFLINE_PAGE = "file:///android_asset/offline.html";

    private WebView web;
    private String startUrl;
    private String appHost;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startUrl = getString(R.string.start_url);
        appHost = Uri.parse(startUrl).getHost();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#070B12"));

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptCookie(true);

        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new AppChrome());
        web.addJavascriptInterface(new OfflineBridge(), "Arena");
        // Android 15 forces edge-to-edge for targetSdk 35, so the page must be
        // inset below the status bar and above the navigation bar and keyboard.
        web.setOnApplyWindowInsetsListener(
                (view, windowInsets) -> {
                    int left;
                    int top;
                    int right;
                    int bottom;
                    if (Build.VERSION.SDK_INT >= 30) {
                        Insets bars = windowInsets.getInsets(WindowInsets.Type.systemBars());
                        Insets ime = windowInsets.getInsets(WindowInsets.Type.ime());
                        left = bars.left;
                        top = bars.top;
                        right = bars.right;
                        bottom = Math.max(bars.bottom, ime.bottom);
                    } else {
                        left = windowInsets.getSystemWindowInsetLeft();
                        top = windowInsets.getSystemWindowInsetTop();
                        right = windowInsets.getSystemWindowInsetRight();
                        bottom = windowInsets.getSystemWindowInsetBottom();
                    }
                    view.setPadding(left, top, right, bottom);
                    return windowInsets;
                });

        setContentView(web);
        web.loadUrl(startUrl);
    }

    private final class AppClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String host = uri.getHost();
            if (host != null && host.equals(appHost)) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                // No browser installed; stay in the app.
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOffline();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (url == null || !url.startsWith("http")) return;
            // Relays answer 200 with a short plain-text notice when the host is
            // offline, so status codes alone cannot detect it. The Next app renders
            // <main> and the standalone build renders #root.
            view.evaluateJavascript(
                    "(function(){var m=!!document.querySelector('main, #root');"
                            + "var t=(document.body&&document.body.innerText||'').trim();"
                            + "return (!m&&t.length<1200)?'1':'0';})()",
                    value -> {
                        if ("\"1\"".equals(value)) showOffline();
                    });
        }
    }

    private final class AppChrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                boolean wantsAudio = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) wantsAudio = true;
                }
                if (wantsAudio
                        && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    request.deny();
                    if (wantsAudio) {
                        requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, MIC_REQUEST);
                    }
                }
            });
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(
                String origin, GeolocationPermissions.Callback callback) {
            callback.invoke(origin, false, false);
        }
    }

    private final class OfflineBridge {
        @JavascriptInterface
        public void retry() {
            runOnUiThread(() -> {
                if (web != null) web.loadUrl(startUrl);
            });
        }
    }

    private void showOffline() {
        if (web == null) return;
        String current = web.getUrl();
        if (current != null && current.startsWith("file://")) return;
        web.loadUrl(OFFLINE_PAGE);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
