package com.retailpickup.mobile.dev;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private SecureSessionStore store;

    @Override public void load() { store = new SecureSessionStore(getContext()); }

    @PluginMethod public void read(PluginCall call) {
        try {
            JSONObject value = store.read();
            call.resolve(new JSObject().put("value", value == null ? JSONObject.NULL : value.toString()));
        } catch (Exception error) { call.reject("Sesi aman tidak dapat dibaca; login ulang atau hubungi support.", "SECURE_STORAGE_FAILED"); }
    }
    @PluginMethod public void write(PluginCall call) {
        try { store.write(new JSONObject(call.getString("value", ""))); call.resolve(); }
        catch (Exception error) { call.reject("Sesi aman gagal disimpan.", "SECURE_STORAGE_FAILED"); }
    }
    @PluginMethod public void clear(PluginCall call) {
        try { store.clear(); call.resolve(); }
        catch (Exception error) { call.reject("Sesi aman gagal dibersihkan.", "SECURE_STORAGE_FAILED"); }
    }
    @PluginMethod public void lock(PluginCall call) {
        try { store.lock(); call.resolve(); }
        catch (Exception error) { call.reject("Penyimpanan kunci lokal gagal; akses ditutup dan token server belum dicabut. Login ulang atau hubungi support.", "SECURE_STORAGE_FAILED"); }
    }
    @PluginMethod public void installation(PluginCall call) {
        try { call.resolve(new JSObject().put("id", store.installation())); }
        catch (Exception error) { call.reject("Identitas instalasi gagal disimpan.", "SECURE_STORAGE_FAILED"); }
    }
    @PluginMethod public void pushConfigured(PluginCall call) {
        int resource = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        call.resolve(new JSObject().put("configured", resource != 0));
    }
}
