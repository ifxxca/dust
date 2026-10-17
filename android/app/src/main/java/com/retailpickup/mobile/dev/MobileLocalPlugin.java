package com.retailpickup.mobile.dev;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import android.content.Intent;
import android.app.Activity;
import androidx.activity.result.ActivityResult;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import java.io.*;
import java.security.MessageDigest;

@CapacitorPlugin(name = "MobileLocal")
public class MobileLocalPlugin extends Plugin {
    private MobileLocalStore store;
    private final java.util.concurrent.ExecutorService previews = java.util.concurrent.Executors.newSingleThreadExecutor();
    @Override public void load() { store = new MobileLocalStore(getContext()); }
    static Instant sessionExpiry(String value) { return OffsetDateTime.parse(value).toInstant(); }
    private String scope(PluginCall call) throws Exception {
        JSONObject session = new SecureSessionStore(getContext()).read();
        if (session == null || session.getBoolean("locked") || !sessionExpiry(session.getString("expiresAt")).isAfter(Instant.now())) throw new SecurityException("LOCAL_SESSION_LOCKED");
        String account = String.valueOf(session.getJSONObject("user").getLong("id"));
        String environment = session.getString("environment");
        if (!account.equals(call.getString("account")) || !environment.equals(call.getString("environment"))) throw new SecurityException("LOCAL_SCOPE_DENIED");
        return environment + ":" + account;
    }
    @PluginMethod public void read(PluginCall call) {
        try { byte[] value = store.read(scope(call), call.getString("name", "")); call.resolve(new JSObject().put("value", value == null ? JSONObject.NULL : new String(value, StandardCharsets.UTF_8))); }
        catch (Exception error) { rejectLocal(call, error); }
    }
    @PluginMethod public void write(PluginCall call) {
        try { store.write(scope(call), call.getString("name", ""), call.getString("value", "").getBytes(StandardCharsets.UTF_8)); call.resolve(); }
        catch (Exception error) {
            if ("LOCAL_QUOTA_EXCEEDED".equals(error.getMessage())) call.reject("Penyimpanan lokal penuh (200 MiB). Data sebelumnya tetap tersimpan.", "LOCAL_QUOTA_EXCEEDED");
            else rejectLocal(call, error);
        }
    }
    @PluginMethod public void remove(PluginCall call) {
        try { store.remove(scope(call), call.getString("name", "")); call.resolve(); }
        catch (Exception error) { call.reject("Data lokal belum dapat dibersihkan.", "LOCAL_REMOVE_FAILED"); }
    }
    @PluginMethod public void list(PluginCall call) {
        try { call.resolve(new JSObject().put("names", new org.json.JSONArray(store.names(scope(call))))); }
        catch (Exception error) { rejectLocal(call, error); }
    }
    private void rejectLocal(PluginCall call, Exception error) {
        String code = "LOCAL_READ_FAILED";
        String message = "Penyimpanan lokal belum dapat dibaca. Coba baca ulang; data tidak dihapus.";
        if (error instanceof java.time.DateTimeException || error instanceof org.json.JSONException) {
            code = "LOCAL_SESSION_INVALID"; message = "Sesi perangkat tidak dapat diperiksa. Login ulang pada akun yang sama; draft tetap disimpan.";
        } else if ("LOCAL_SESSION_LOCKED".equals(error.getMessage()) || "LOCAL_SCOPE_DENIED".equals(error.getMessage())) {
            code = error.getMessage(); message = "Draft terkunci untuk sesi atau akun ini. Login kembali pada akun dan server asal; data tidak dihapus.";
        } else if (error instanceof java.security.GeneralSecurityException || "LOCAL_KEY_UNAVAILABLE".equals(error.getMessage()) || "Invalid local envelope".equals(error.getMessage())) {
            code = "LOCAL_DATA_UNREADABLE"; message = "Draft terenkripsi belum dapat dibuka. Coba baca ulang atau hubungi support. Jangan hapus data aplikasi; kunci dan draft tidak direset.";
        } else if (error instanceof IOException) {
            code = "LOCAL_STORAGE_UNAVAILABLE"; message = "Penyimpanan perangkat belum tersedia. Coba lagi dan periksa kapasitas; data sebelumnya tidak dihapus.";
        }
        call.reject(message, code);
    }
    private byte[] bounded(InputStream input, int limit) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] bytes = new byte[8192]; int count;
        while ((count = input.read(bytes)) != -1) { output.write(bytes, 0, count); if (output.size() > limit) throw new IOException("EVIDENCE_TOO_LARGE"); }
        return output.toByteArray();
    }
    private File allowedCameraFile(Uri uri) throws Exception {
        File source = new File(uri.getPath()).getCanonicalFile();
        File[] allowed = {getContext().getCacheDir(), getContext().getFilesDir(), getContext().getExternalCacheDir(), getContext().getExternalFilesDir(null)};
        for (File directory : allowed) if (directory != null && source.getPath().startsWith(directory.getCanonicalPath() + File.separator)) return source;
        throw new SecurityException("Invalid camera source");
    }
    private String checksum(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder(); for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hex.append(String.format("%02x", value)); return hex.toString();
    }
    private JSObject persistImage(PluginCall call, byte[] bytes, boolean signature) throws Exception {
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        String mime = options.outMimeType;
        if (options.outWidth <= 0 || !java.util.Arrays.asList("image/jpeg", "image/png", "image/webp").contains(mime)) throw new IOException("UNSUPPORTED_IMAGE");
        if (signature && (!"image/png".equals(mime) || bytes.length > 1024 * 1024 || options.outWidth > 2000 || options.outHeight > 1000)) throw new IOException("INVALID_SIGNATURE");
        String name = call.getString("name", ""); store.write(scope(call), name, bytes);
        return new JSObject().put("name", name).put("mime", mime).put("bytes", bytes.length).put("sha256", checksum(bytes)).put("kind", signature ? "signature" : "photo");
    }
    @PluginMethod public void importPhoto(PluginCall call) {
        try {
            String accountScope = scope(call); byte[] ticketBytes = store.read(accountScope, "capture-" + call.getString("operationId", ""));
            if (ticketBytes == null) throw new SecurityException("CAPTURE_CONTEXT_MISSING");
            JSONObject ticket = new JSONObject(new String(ticketBytes, StandardCharsets.UTF_8));
            if (!call.getString("operationId", "").equals(ticket.getString("operationId")) || !call.getString("name", "").equals(ticket.getString("evidenceName")) || !call.getString("uri", "").equals(ticket.optString("uri"))) throw new SecurityException("CAPTURE_CONTEXT_MISMATCH");
            Uri uri = Uri.parse(call.getString("uri", ""));
            InputStream input = ("file".equals(uri.getScheme()) || uri.getScheme() == null && uri.getPath().startsWith("/")) ? new FileInputStream(allowedCameraFile(uri)) : "content".equals(uri.getScheme()) ? getContext().getContentResolver().openInputStream(uri) : null;
            if (input == null) throw new IOException("INVALID_IMAGE_URI");
            try (InputStream source = input) { call.resolve(persistImage(call, bounded(source, 5120 * 1024), false)); }
        } catch (Exception error) {
            String code = "Invalid camera source".equals(error.getMessage()) ? "LOCAL_CAMERA_SOURCE_DENIED" : "INVALID_IMAGE_URI".equals(error.getMessage()) ? "LOCAL_IMAGE_URI_INVALID" : error instanceof FileNotFoundException ? "LOCAL_IMAGE_MISSING" : error instanceof SecurityException ? "LOCAL_CAPTURE_CONTEXT_DENIED" : "LOCAL_EVIDENCE_FAILED";
            call.reject("Foto belum tersimpan (" + code + "). Gunakan JPEG/PNG/WebP maksimal5 MiB dan periksa kapasitas200 MiB; draft sebelumnya tetap tersedia.", code);
        }
    }
    @PluginMethod public void chooseFromGallery(PluginCall call) {
        try {
            String accountScope=scope(call);byte[] bytes=store.read(accountScope,"capture-"+call.getString("operationId",""));
            if(bytes==null||!"chooseFromGallery".equals(new JSONObject(new String(bytes,StandardCharsets.UTF_8)).getString("method")))throw new SecurityException("CAPTURE_CONTEXT_MISSING");
            Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/jpeg","image/png","image/webp"});
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(call,intent,"galleryChosen");
        }catch(Exception error){call.reject("Galeri belum dapat dibuka. Draft tetap tersimpan.","LOCAL_GALLERY_FAILED");}
    }
    @ActivityCallback private void galleryChosen(PluginCall call,ActivityResult result){
        if(call==null)return;
        if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){call.reject("Pemilihan foto dibatalkan.","OS-PLUG-CAMR-0020");return;}
        try {
            Uri uri=result.getData().getData();getContext().getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);
            call.resolve(new JSObject().put("uri",uri.toString()).put("operationId",call.getString("operationId","")));
        }catch(Exception error){call.reject("Izin baca foto belum dapat disimpan; draft tetap tersedia.","LOCAL_GALLERY_FAILED");}
    }
    @PluginMethod public void beginCapture(PluginCall call) {
        try {
            String accountScope = scope(call);
            byte[] existing = store.read("capture-system-v1", "ticket");
            if (existing != null && "WAITING".equals(new JSONObject(new String(existing, StandardCharsets.UTF_8)).optString("phase"))) throw new SecurityException("CAPTURE_PENDING");
            JSONObject ticket = new JSONObject().put("schema", 1).put("scope", accountScope).put("phase", "WAITING")
                .put("taskId", call.getInt("taskId", 0)).put("draftId", call.getString("draftId", ""))
                .put("operationId", call.getString("operationId", "")).put("evidenceName", call.getString("name", ""))
                .put("method", call.getString("method", ""));
            if (!ticket.getString("operationId").matches("[a-f0-9-]{36}") || !java.util.Arrays.asList("getPhoto", "takePhoto", "chooseFromGallery").contains(ticket.getString("method"))) throw new SecurityException("INVALID_CAPTURE");
            byte[] bytes = ticket.toString().getBytes(StandardCharsets.UTF_8);
            store.write(accountScope, "capture-" + ticket.getString("operationId"), bytes);
            store.write(accountScope, "pending-camera", bytes); store.write("capture-system-v1", "ticket", bytes); call.resolve();
        } catch (Exception error) { call.reject("Capture sebelumnya belum selesai atau metadata belum tersimpan. Pulihkan/batalkan capture pada akun asal sebelum mengambil foto baru.", "CAPTURE_PENDING"); }
    }
    @PluginMethod public void captureResult(PluginCall call) {
        try {
            String uri = call.getString("uri", ""); String marker = "result-" + checksum(uri.getBytes(StandardCharsets.UTF_8));
            String explicitOperation = call.getString("operationId", "");
            if (explicitOperation.isEmpty() && store.read("capture-system-v1", marker) != null) { call.resolve(); return; }
            byte[] bytes = store.read("capture-system-v1", "ticket"); if (bytes == null) throw new SecurityException("CAPTURE_CONTEXT_MISSING");
            JSONObject ticket = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (!explicitOperation.isEmpty() && !explicitOperation.equals(ticket.getString("operationId"))) throw new SecurityException("CAPTURE_CONTEXT_MISMATCH");
            if (!"WAITING".equals(ticket.optString("phase")) || !call.getString("method", "").equals(ticket.getString("method")) || uri.isEmpty()) throw new SecurityException("CAPTURE_CONTEXT_MISMATCH");
            ticket.put("uri", uri).put("phase", "READY"); bytes = ticket.toString().getBytes(StandardCharsets.UTF_8);
            store.write(ticket.getString("scope"), "capture-" + ticket.getString("operationId"), bytes);
            byte[] pendingBytes = store.read(ticket.getString("scope"), "pending-camera");
            if (pendingBytes != null && ticket.getString("operationId").equals(new JSONObject(new String(pendingBytes, StandardCharsets.UTF_8)).optString("operationId"))) store.write(ticket.getString("scope"), "pending-camera", bytes);
            store.write("capture-system-v1", marker, ticket.getString("operationId").getBytes(StandardCharsets.UTF_8));
            store.write("capture-system-v1", "ticket", bytes); call.resolve();
        } catch (Exception error) { call.reject("Hasil kamera belum dapat dipasangkan ke capture asal; tidak ditempelkan ke akun lain.", "CAPTURE_CONTEXT_FAILED"); }
    }
    @PluginMethod public void finishCapture(PluginCall call) {
        try {
            String accountScope = scope(call); String operation = call.getString("operationId", "");
            if (!operation.matches("[a-f0-9-]{36}")) throw new SecurityException("INVALID_CAPTURE");
            byte[] global = store.read("capture-system-v1", "ticket");
            if (global != null) { JSONObject ticket = new JSONObject(new String(global, StandardCharsets.UTF_8)); if (accountScope.equals(ticket.getString("scope")) && operation.equals(ticket.getString("operationId"))) store.remove("capture-system-v1", "ticket"); }
            byte[] pending = store.read(accountScope, "pending-camera");
            if (pending != null && operation.equals(new JSONObject(new String(pending, StandardCharsets.UTF_8)).optString("operationId"))) store.remove(accountScope, "pending-camera");
            store.remove(accountScope, "capture-" + operation);
            call.resolve();
        } catch (Exception error) { call.reject("Capture belum dapat ditutup; context lama dipertahankan.", "CAPTURE_CONTEXT_FAILED"); }
    }
    @PluginMethod public void captureFailure(PluginCall call) {
        try {
            byte[] bytes=store.read("capture-system-v1","ticket");if(bytes==null){call.resolve();return;}
            JSONObject ticket=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
            if(!"WAITING".equals(ticket.optString("phase"))||!call.getString("method","").equals(ticket.getString("method"))){call.resolve();return;}
            ticket.put("phase","FAILED");bytes=ticket.toString().getBytes(StandardCharsets.UTF_8);
            store.write(ticket.getString("scope"),"capture-"+ticket.getString("operationId"),bytes);
            byte[] pending=store.read(ticket.getString("scope"),"pending-camera");
            if(pending!=null&&ticket.getString("operationId").equals(new JSONObject(new String(pending,StandardCharsets.UTF_8)).optString("operationId")))store.write(ticket.getString("scope"),"pending-camera",bytes);
            store.write("capture-system-v1","ticket",bytes);call.resolve();
        }catch(Exception error){call.reject("Capture gagal belum dapat dicatat; konteks draft dipertahankan.","CAPTURE_CONTEXT_FAILED");}
    }
    @PluginMethod public void signature(PluginCall call) {
        try { scope(call); String value = call.getString("base64", ""); if (value.length() > 1500000) throw new IOException("INVALID_SIGNATURE"); call.resolve(persistImage(call, Base64.decode(value, Base64.DEFAULT), true)); }
        catch (Exception error) { call.reject("Tanda tangan PNG belum tersimpan. Maksimal1 MiB; periksa kapasitas200 MiB. Data lama tetap tersedia.", "LOCAL_EVIDENCE_FAILED"); }
    }
    @PluginMethod public void evidence(PluginCall call) {
        try { byte[] bytes = store.read(scope(call), call.getString("name", "")); if (bytes == null) throw new IOException("EVIDENCE_MISSING"); call.resolve(new JSObject().put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("sha256", checksum(bytes))); }
        catch (Exception error) { call.reject("Bukti lokal belum dapat dibaca; jangan finalisasi atau hapus draft yang belum resolved.", "LOCAL_EVIDENCE_FAILED"); }
    }
    @PluginMethod public void preview(PluginCall call) {
        try {
            final String accountScope = scope(call);
            final String name = call.getString("name", "");
            final String expectedHash = call.getString("sha256", "");
            final String size = call.getString("size", "");
            if (!java.util.Arrays.asList("thumbnail", "fullscreen").contains(size) || !expectedHash.matches("[a-f0-9]{64}")) throw new SecurityException("INVALID_PREVIEW");
            previews.execute(() -> {
                try {
                    if (!accountScope.equals(scope(call))) throw new SecurityException("LOCAL_SCOPE_DENIED");
                    byte[] original = store.read(accountScope, name);
                    if (original == null || !expectedHash.equals(checksum(original))) throw new SecurityException("EVIDENCE_CHECKSUM_CHANGED");
                    MobileImagePreview.Result image = MobileImagePreview.create(original, "thumbnail".equals(size));
                    if (!accountScope.equals(scope(call))) throw new SecurityException("LOCAL_SCOPE_DENIED");
                    call.resolve(new JSObject().put("base64", Base64.encodeToString(image.bytes, Base64.NO_WRAP)).put("mime", image.mime).put("width", image.width).put("height", image.height));
                } catch (Exception | OutOfMemoryError error) {
                    call.reject("Pratinjau belum dapat dibuka. Bukti asli tetap tersimpan; coba lagi.", "LOCAL_PREVIEW_FAILED");
                }
            });
        } catch (Exception error) { rejectLocal(call, error); }
    }
    @Override protected void handleOnDestroy() { previews.shutdownNow(); super.handleOnDestroy(); }
    @PluginMethod public void cleanupCamera(PluginCall call) {
        try {
            scope(call); Uri uri = Uri.parse(call.getString("uri", ""));
            if ("file".equals(uri.getScheme()) || uri.getScheme() == null && uri.getPath().startsWith("/")) { File file = allowedCameraFile(uri); if (file.exists() && !file.delete()) throw new IOException("CAMERA_CLEANUP_FAILED"); }
            else if ("content".equals(uri.getScheme()) && (getContext().getPackageName() + ".fileprovider").equals(uri.getAuthority())) getContext().getContentResolver().delete(uri, null, null);
            else if ("content".equals(uri.getScheme())) { try { getContext().getContentResolver().releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (SecurityException ignored) {} }
            call.resolve();
        } catch (Exception error) { call.reject("Cache foto belum dapat dibersihkan; salinan draft tetap terenkripsi.", "LOCAL_CLEANUP_FAILED"); }
    }
}
