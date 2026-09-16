package app.onway.personal;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 只访问用户在系统选择器中选定的文件，无需外部存储权限。 */
@CapacitorPlugin(name = "BackupFiles")
public class BackupFilesPlugin extends Plugin {
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile boolean pending = false;

    @PluginMethod
    public void pick(PluginCall call) { launch(call, false); }

    @PluginMethod
    public void save(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            call.reject("备份为空或超过 20 MB。"); return;
        }
        launch(call, true);
    }

    private void launch(PluginCall call, boolean saving) {
        getActivity().runOnUiThread(() -> {
            if (pending) { call.reject("已有文件操作正在进行。"); return; }
            Intent intent = new Intent(saving ? Intent.ACTION_CREATE_DOCUMENT : Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(saving ? "application/json" : "*/*");
            if (saving) intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "onway-backup.json"));
            try {
                pending = true;
                startActivityForResult(call, intent, saving ? "saved" : "picked");
            } catch (Exception error) { pending = false; call.reject("无法打开系统文件选择器。", error); }
        });
    }

    private Uri selected(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            pending = false;
            JSObject value = new JSObject(); value.put("cancelled", true); call.resolve(value); return null;
        }
        return result.getData().getData();
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) { pending = false; return; }
        Uri uri = selected(call, result); if (uri == null) return;
        io.execute(() -> {
            try (InputStream input = getContext().getContentResolver().openInputStream(uri);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                if (input == null) throw new java.io.IOException("文件不可读");
                byte[] buffer = new byte[8192]; int size;
                while ((size = input.read(buffer)) != -1) {
                    if (output.size() + size > MAX_BYTES) throw new java.io.IOException("文件超过 20 MB");
                    output.write(buffer, 0, size);
                }
                String name = "Onway 备份";
                try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
                }
                JSObject value = new JSObject(); value.put("cancelled", false); value.put("name", name);
                value.put("text", new String(output.toByteArray(), StandardCharsets.UTF_8)); call.resolve(value);
            } catch (Exception error) { call.reject("读取备份失败：" + error.getMessage(), error); }
            finally { pending = false; }
        });
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        if (call == null) { pending = false; return; }
        Uri uri = selected(call, result); if (uri == null) return;
        io.execute(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new java.io.IOException("文件不可写");
                String text = call.getString("text");
                if (text == null) throw new java.io.IOException("备份内容已失效，请重试");
                output.write(text.getBytes(StandardCharsets.UTF_8)); output.flush();
                JSObject value = new JSObject(); value.put("cancelled", false); call.resolve(value);
            } catch (Exception error) { call.reject("保存文件失败，请重新导出：" + error.getMessage(), error); }
            finally { pending = false; }
        });
    }

    @Override
    protected void handleOnDestroy() { io.shutdown(); }
}
