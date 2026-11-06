package io.github.dosiaczek.supy;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Insets;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.DisplayCutout;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

public final class MainActivity extends Activity {
    private static final int PICK_DOCUMENT = 100;
    private WebView webView;
    private WebView popup;
    private ProgressBar progress;
    private View errorPanel;
    private TextView errorMessage;
    private String homeUrl;
    private SiteMigration migration;
    private String siteHost;
    private String mainUrl;
    private String failedUrl;
    private String failureReason;
    private ValueCallback<Uri[]> fileCallback;
    private OnBackInvokedCallback backCallback;
    private JsonDownloads downloads;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        homeUrl = getString(R.string.home_url);
        siteHost = Uri.parse(homeUrl).getHost();
        mainUrl = homeUrl;
        configureWindow();
        setContentView(R.layout.main);
        configureInsets(findViewById(R.id.root));
        webView = findViewById(R.id.webview);
        progress = findViewById(R.id.progress);
        errorPanel = findViewById(R.id.error_panel);
        errorMessage = findViewById(R.id.error_message);
        downloads = new JsonDownloads(this);
        findViewById(R.id.reload_button).setOnClickListener(view -> refresh());
        findViewById(R.id.menu_button).setOnClickListener(this::showMenu);
        findViewById(R.id.retry_button).setOnClickListener(view -> retry());
        configureWebView();
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        Bundle webState = state == null ? null : state.getBundle("webview");
        migration = new SiteMigration(this);
        if (!migration.completed()) {
            migrateAndOpen();
        } else if (webState == null || webView.restoreState(webState) == null
                || !isSiteUrl(Uri.parse(currentAddress()))) {
            webView.loadUrl(homeUrl);
        } else {
            mainUrl = currentAddress();
        }
        if (migration.completed() && state != null && state.getString("failedUrl") != null
                && isSiteUrl(Uri.parse(state.getString("failedUrl")))) {
            showFailure(state.getString("failedUrl"), state.getString("failureReason"));
        }
    }

    private void migrateAndOpen() {
        progress.setVisibility(View.VISIBLE);
        migration.start(() -> webView.loadUrl(homeUrl), () -> {
            if (isFinishing() || isDestroyed()) return;
            progress.setVisibility(View.INVISIBLE);
            new AlertDialog.Builder(this)
                    .setTitle("Przenoszenie zapisanych danych")
                    .setMessage("Nie udało się przenieść danych do nowego adresu. Dotychczasowe dane zostały zachowane. Ponów próbę; nie odinstalowuj aplikacji.")
                    .setCancelable(false)
                    .setPositiveButton("Ponów", (dialog, which) -> {
                        migration = new SiteMigration(this);
                        migrateAndOpen();
                    }).show();
        });
    }

    @SuppressWarnings("deprecation")
    private void configureWindow() {
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }

    @SuppressWarnings("deprecation")
    private void configureInsets(View root) {
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                // Apply the maximum on each edge, without adding IME + navigation twice.
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            }
            // On API 26–29, adjustResize includes the keyboard in system-window insets.
            int left = insets.getSystemWindowInsetLeft();
            int top = insets.getSystemWindowInsetTop();
            int right = insets.getSystemWindowInsetRight();
            int bottom = insets.getSystemWindowInsetBottom();
            if (Build.VERSION.SDK_INT >= 28) {
                DisplayCutout cutout = insets.getDisplayCutout();
                if (cutout != null) {
                    left = Math.max(left, cutout.getSafeInsetLeft());
                    top = Math.max(top, cutout.getSafeInsetTop());
                    right = Math.max(right, cutout.getSafeInsetRight());
                    bottom = Math.max(bottom, cutout.getSafeInsetBottom());
                }
            }
            view.setPadding(left, top, right, bottom);
            WindowInsets consumed = insets.consumeSystemWindowInsets();
            return Build.VERSION.SDK_INT >= 28 ? consumed.consumeDisplayCutout() : consumed;
        });
        root.requestApplyInsets();
    }

    @SuppressWarnings("deprecation")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // Website releases are fetched from the server, not a stale HTTP cache.
        // This does not erase localStorage, IndexedDB or login cookies.
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
        webView.setWebViewClient(new SiteClient());
        webView.setWebChromeClient(new SiteChrome());
        webView.setDownloadListener((url, agent, disposition, mime, size) -> {
            if (url.startsWith("blob:") && isSiteUrl(Uri.parse(url.substring(5)))
                    && mime != null && mime.toLowerCase(Locale.ROOT).startsWith("application/json")) {
                downloads.start(webView, url);
            } else {
                openBrowser(Uri.parse(url));
            }
        });
        // No addJavascriptInterface: all document access uses Android pickers.
    }

    private boolean isWebUrl(Uri uri) {
        return "http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme());
    }

    private boolean isSiteUrl(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) && siteHost.equalsIgnoreCase(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }

    private void openBrowser(Uri uri) {
        if (!isWebUrl(uri)) {
            Toast.makeText(this, R.string.unsupported_link, Toast.LENGTH_SHORT).show();
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException exception) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_LONG).show();
        }
    }

    private final class SiteClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return !isWebUrl(request.getUrl());
            if (isSiteUrl(request.getUrl())) return false;
            openBrowser(request.getUrl());
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            mainUrl = url;
            clearFailure();
            progress.setProgress(0);
            progress.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progress.setVisibility(View.INVISIBLE);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                showFailure(request.getUrl().toString(), getString(R.string.error_network));
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame()) {
                showFailure(request.getUrl().toString(), getString(R.string.error_http, response.getStatusCode()));
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            String failed = Uri.parse(error.getUrl()).buildUpon().fragment(null).build().toString();
            String main = Uri.parse(mainUrl).buildUpon().fragment(null).build().toString();
            if (failed.equals(main)) showFailure(mainUrl, getString(R.string.error_ssl));
        }
    }

    private final class SiteChrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int value) {
            progress.setProgress(value);
            progress.setVisibility(failedUrl == null && value < 100 ? View.VISIBLE : View.INVISIBLE);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            finishFileSelection(null);
            fileCallback = callback;
            Set<String> types = new LinkedHashSet<>();
            for (String accept : params.getAcceptTypes()) {
                for (String part : accept.split(",")) {
                    String type = part.trim().toLowerCase(Locale.ROOT);
                    if (type.startsWith(".")) {
                        type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.substring(1));
                    }
                    if (type != null && type.contains("/")) types.add(type);
                }
            }
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(types.size() == 1 ? types.iterator().next() : "*/*");
            if (types.size() > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                startActivityForResult(Intent.createChooser(intent, getString(R.string.choose_file)), PICK_DOCUMENT);
            } catch (ActivityNotFoundException | SecurityException exception) {
                finishFileSelection(null);
                Toast.makeText(MainActivity.this, R.string.no_picker, Toast.LENGTH_LONG).show();
            }
            return true;
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message result) {
            if (!userGesture) return false;
            closePopup();
            WebView child = new WebView(MainActivity.this);
            popup = child;
            // Temporary, script-disabled view resolves user-initiated target=_blank links.
            child.setWebViewClient(new WebViewClient() {
                private boolean handled;

                private boolean route(String url) {
                    if ("about:blank".equals(url)) return false;
                    if (!handled) {
                        handled = true;
                        Uri uri = Uri.parse(url);
                        if (isSiteUrl(uri)) webView.loadUrl(url);
                        else openBrowser(uri);
                        webView.post(() -> { if (popup == child) closePopup(); });
                    }
                    return true;
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView target, WebResourceRequest request) {
                    return route(request.getUrl().toString());
                }

                @Override
                public void onPageStarted(WebView target, String url, Bitmap favicon) {
                    route(url);
                }
            });
            ((WebView.WebViewTransport) result.obj).setWebView(child);
            result.sendToTarget();
            webView.postDelayed(() -> { if (popup == child) closePopup(); }, 30000);
            return true;
        }
    }

    private void closePopup() {
        if (popup != null) {
            popup.stopLoading();
            popup.destroy();
            popup = null;
        }
    }

    private void finishFileSelection(Uri[] uris) {
        if (fileCallback != null) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            callback.onReceiveValue(uris);
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (downloads.onActivityResult(request, result, data) || request != PICK_DOCUMENT) return;
        if (fileCallback == null) {
            if (result == RESULT_OK) Toast.makeText(this, R.string.picker_recreated, Toast.LENGTH_LONG).show();
            return;
        }
        Uri[] selected = WebChromeClient.FileChooserParams.parseResult(result, data);
        ArrayList<Uri> documents = new ArrayList<>();
        if (selected != null) {
            for (Uri uri : selected) {
                if (uri != null && "content".equals(uri.getScheme())) documents.add(uri);
            }
        }
        finishFileSelection(documents.isEmpty() ? null : documents.toArray(new Uri[0]));
    }

    private String currentAddress() {
        String address = failedUrl != null ? failedUrl : webView.getUrl();
        return address != null && isSiteUrl(Uri.parse(address)) ? address : homeUrl;
    }

    private void clearFailure() {
        failedUrl = null;
        failureReason = null;
        errorPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
    }

    private void showFailure(String url, String reason) {
        failedUrl = url;
        failureReason = reason == null ? getString(R.string.error_network) : reason;
        errorMessage.setText(getString(R.string.error_detail, failureReason, url));
        progress.setVisibility(View.INVISIBLE);
        webView.setVisibility(View.INVISIBLE);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private void retry() {
        String url = currentAddress();
        clearFailure();
        webView.loadUrl(url);
    }

    private void refresh() {
        webView.stopLoading();
        webView.clearCache(true); // HTTP cache only; saved trips and cookies survive.
        if (failedUrl != null) retry();
        else webView.reload();
    }

    private void showMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.inflate(R.menu.main);
        menu.setOnMenuItemClickListener(item -> {
            switch (item.getItemId()) {
                case R.id.action_reload:
                    refresh();
                    return true;
                case R.id.action_home:
                    clearFailure();
                    webView.loadUrl(homeUrl);
                    return true;
                case R.id.action_address:
                    showAddress();
                    return true;
                case R.id.action_browser:
                    openBrowser(Uri.parse(currentAddress()));
                    return true;
                default:
                    return false;
            }
        });
        menu.show();
    }

    private void showAddress() {
        String address = currentAddress();
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(R.string.website_address)
                .setMessage(getString(R.string.address_detail, address, homeUrl))
                .setPositiveButton(android.R.string.ok, null)
                .setNeutralButton(R.string.copy_address, (window, button) -> {
                    ClipboardManager clipboard = getSystemService(ClipboardManager.class);
                    clipboard.setPrimaryClip(ClipData.newPlainText(getString(R.string.app_name), address));
                    Toast.makeText(this, R.string.copied, Toast.LENGTH_SHORT).show();
                }).create();
        dialog.show();
        TextView message = dialog.findViewById(android.R.id.message);
        if (message != null) message.setTextIsSelectable(true);
    }

    private void handleBack() {
        if (webView.canGoBack()) {
            clearFailure();
            webView.goBack();
        } else {
            finish();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        Bundle webState = new Bundle();
        webView.saveState(webState);
        state.putBundle("webview", webState);
        state.putString("failedUrl", failedUrl);
        state.putString("failureReason", failureReason);
        super.onSaveInstanceState(state);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            if (migration != null && migration.completed()) {
                if (failedUrl != null) retry();
                else if (webView.getUrl() != null && isSiteUrl(Uri.parse(webView.getUrl())))
                    webView.evaluateJavascript("window.dispatchEvent(new Event('app:resume'))", null);
            }
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (migration != null) migration.close();
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        finishFileSelection(null);
        closePopup();
        if (webView != null) {
            webView.stopLoading();
            ((ViewGroup) webView.getParent()).removeView(webView);
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
