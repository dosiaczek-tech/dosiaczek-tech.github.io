package io.github.dosiaczek.supy;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.AtomicFile;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Copy this app's localStorage without needing the former home server.
 * Only packaged HTML/JS runs in this temporary WebView. Source data is retained.
 */
final class SiteMigration {
    private final Activity activity;
    private final SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView view;
    private Runnable timeout;
    private boolean closed;

    SiteMigration(Activity activity) {
        this.activity = activity;
        prefs = activity.getSharedPreferences("public-site-migration-v1", 0);
    }

    boolean completed() { return prefs.getBoolean("complete", false); }

    void start(Runnable success, Runnable failure) {
        if (completed()) { success.run(); return; }
        view = new WebView(activity);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        final String oldOrigin = "http://zuffie.test:8766/";
        final String newOrigin = "https://dosiaczek-tech.github.io/";
        final AtomicFile backup = new AtomicFile(new File(activity.getFilesDir(), "previous-site-storage.json"));
        timeout = () -> fail(failure);
        handler.postDelayed(timeout, 30000);
        view.setWebViewClient(new WebViewClient() {
            private boolean exporting;
            private boolean importing;
            @Override public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView w, WebResourceRequest r) {
                // Migration never fetches a document, script, iframe or other remote resource.
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView w, String url) {
                if (closed) return;
                try {
                    if (oldOrigin.equals(url) && !exporting) {
                        exporting = true;
                        String script = read(R.raw.migrate_export) + "(" + JSONObject.quote("sup:") + ")";
                        w.evaluateJavascript(script, result -> {
                            if (closed) return;
                            try {
                                Object decoded = new JSONTokener(result).nextValue();
                                if (!(decoded instanceof String)) throw new Exception("Storage export failed");
                                String snapshot = (String) decoded;
                                new JSONObject(snapshot);
                                FileOutputStream stream = backup.startWrite();
                                try {
                                    stream.write(snapshot.getBytes(StandardCharsets.UTF_8));
                                    backup.finishWrite(stream);
                                } catch (Exception e) { backup.failWrite(stream); throw e; }
                                load(newOrigin);
                            } catch (Exception e) { fail(failure); }
                        });
                    } else if (newOrigin.equals(url) && !importing) {
                        importing = true;
                        String snapshot = new String(backup.readFully(), StandardCharsets.UTF_8);
                        new JSONObject(snapshot);
                        String script = read(R.raw.migrate_import) + "(" + JSONObject.quote(snapshot) + "," + JSONObject.quote("sup:") + ")";
                        w.evaluateJavascript(script, result -> {
                            if (closed) return;
                            if ("true".equals(result) && prefs.edit().putBoolean("complete", true).commit()) {
                                close();
                                success.run();
                            } else { fail(failure); }
                        });
                    }
                } catch (Exception e) { fail(failure); }
            }
        });
        load(oldOrigin);
    }

    private String read(int id) throws Exception {
        try (InputStream in = activity.getResources().openRawResource(id);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] bytes = new byte[4096];
            int n;
            while ((n = in.read(bytes)) != -1) out.write(bytes, 0, n);
            return out.toString("UTF-8");
        }
    }

    private void load(String origin) {
        view.loadDataWithBaseURL(origin,
            "<!doctype html><meta charset=\"utf-8\"><title>Przenoszenie danych</title>",
            "text/html", "UTF-8", origin);
    }

    private void fail(Runnable failure) {
        if (closed) return;
        close();
        failure.run();
    }

    void close() {
        if (closed) return;
        closed = true;
        if (timeout != null) handler.removeCallbacks(timeout);
        if (view != null) { view.stopLoading(); view.destroy(); view = null; }
    }
}
