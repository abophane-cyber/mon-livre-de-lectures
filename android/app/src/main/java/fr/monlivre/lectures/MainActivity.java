package fr.monlivre.lectures;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Ouvrir un fichier de sauvegarde (.json) avec l'appli : depuis « Mes fichiers », la notification
 * Quick Share ou le menu « Partager ». L'adresse du fichier est gardée ici, puis la page la demande
 * avec window.LecturesAndroid.takeFile() et le lit comme « Lire le fichier de l'autre appareil ».
 */
public class MainActivity extends BridgeActivity {

    private static final int MAX_SIZE = 200 * 1024 * 1024;
    private volatile Uri pendingFile;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new FileBridge(), "LecturesAndroid");
        keepFile(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (keepFile(intent)) {
            getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('fichier-recu'))", null));
        }
    }

    private boolean keepFile(Intent intent) {
        if (intent == null) return false;
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(intent.getAction())) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        if (uri == null) return false;
        pendingFile = uri;
        return true;
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        } catch (Exception ignored) {
            // nom inconnu : on garde celui par défaut
        }
        String last = uri.getLastPathSegment();
        return last != null ? last : "sauvegarde.json";
    }

    private class FileBridge {
        /** Renvoie {"name": …, "text": …} du fichier reçu (une seule fois), ou "" s'il n'y en a pas. */
        @JavascriptInterface
        public String takeFile() {
            Uri uri = pendingFile;
            pendingFile = null;
            if (uri == null) return "";
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) return "";
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    if (out.size() > MAX_SIZE) return "";
                }
                JSONObject o = new JSONObject();
                o.put("name", displayName(uri));
                o.put("text", new String(out.toByteArray(), StandardCharsets.UTF_8));
                return o.toString();
            } catch (Exception e) {
                return "";
            }
        }
    }
}
