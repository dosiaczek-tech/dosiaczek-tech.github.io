package io.github.dosiaczek.supy;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Saves the website's JSON Blob exports through Android's document picker. */
final class JsonDownloads {
    private static final int SAVE_JSON = 101;
    private final Activity activity;
    private byte[] pending;

    JsonDownloads(Activity activity) {
        this.activity = activity;
    }

    void start(WebView view, String blobUrl) {
        try (InputStream input = activity.getResources().openRawResource(R.raw.read_blob);
             ByteArrayOutputStream script = new ByteArrayOutputStream()) {
            byte[] block = new byte[4096];
            int count;
            while ((count = input.read(block)) != -1) script.write(block, 0, count);
            String expression = new String(script.toByteArray(), StandardCharsets.UTF_8)
                    .replace("__BLOB_URL__", JSONObject.quote(blobUrl));
            view.evaluateJavascript(expression, result -> {
                if (activity.isDestroyed() || activity.isFinishing()) return;
                try {
                    Object value = new JSONTokener(result).nextValue();
                    if (!(value instanceof String)) throw new JSONException("Unreadable Blob");
                    pending = ((String) value).getBytes(StandardCharsets.UTF_8);
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    String date = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
                    intent.putExtra(Intent.EXTRA_TITLE, "sup-wyprawy-" + date + ".json");
                    intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    activity.startActivityForResult(intent, SAVE_JSON);
                } catch (JSONException | ActivityNotFoundException | SecurityException exception) {
                    pending = null;
                    message(R.string.export_failed);
                }
            });
        } catch (IOException exception) {
            message(R.string.export_failed);
        }
    }

    boolean onActivityResult(int request, int result, Intent data) {
        if (request != SAVE_JSON) return false;
        byte[] content = pending;
        pending = null;
        if (result != Activity.RESULT_OK) return true;
        Uri destination = data == null ? null : data.getData();
        if (content == null || destination == null || !"content".equals(destination.getScheme())) {
            message(R.string.export_failed);
            return true;
        }
        new Thread(() -> {
            int status = R.string.export_saved;
            try (OutputStream output = activity.getContentResolver().openOutputStream(destination, "wt")) {
                if (output == null) throw new IOException("No document stream");
                output.write(content);
            } catch (IOException | SecurityException exception) {
                status = R.string.export_failed;
            }
            final int messageId = status;
            activity.runOnUiThread(() -> message(messageId));
        }, "supy-json-export").start();
        return true;
    }

    private void message(int resource) {
        if (!activity.isDestroyed()) Toast.makeText(activity, resource, Toast.LENGTH_LONG).show();
    }
}
