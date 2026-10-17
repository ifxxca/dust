package com.retailpickup.mobile.dev;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureSessionStore {
    private static final String KEY = "retail-mobile-session-v1";
    private final Context context;
    private final AtomicFile file;

    SecureSessionStore(Context context) {
        this.context = context.getApplicationContext();
        this.file = new AtomicFile(new File(this.context.getNoBackupFilesDir(), "mobile-session.json"));
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY)) return (SecretKey) store.getKey(KEY, null);
        if (!create) throw new SecurityException("Secure session key unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    synchronized JSONObject read() throws Exception {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath() + ".bak").exists()) return null;
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (FileInputStream input = file.openRead()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) {
                bytes.write(buffer, 0, count);
                if (bytes.size() > 32768) throw new SecurityException("Invalid session file");
            }
        }
        JSONObject envelope = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, Base64.decode(envelope.getString("iv"), Base64.NO_WRAP)));
        cipher.updateAAD(context.getPackageName().getBytes(StandardCharsets.UTF_8));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
    }

    synchronized void write(JSONObject value) throws Exception {
        byte[] plain = value.toString().getBytes(StandardCharsets.UTF_8);
        if (plain.length > 16384) throw new SecurityException("Session too large");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(true));
        cipher.updateAAD(context.getPackageName().getBytes(StandardCharsets.UTF_8));
        JSONObject envelope = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(cipher.doFinal(plain), Base64.NO_WRAP));
        FileOutputStream output = file.startWrite();
        try {
            output.write(envelope.toString().getBytes(StandardCharsets.UTF_8));
            file.finishWrite(output);
        } catch (Exception error) {
            file.failWrite(output);
            throw error;
        }
    }

    synchronized void clear() throws Exception {
        file.delete();
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        store.deleteEntry(KEY);
        if (file.getBaseFile().exists()) throw new SecurityException("Session deletion failed");
    }

    synchronized void lock() throws Exception {
        try {
            JSONObject value = read();
            if (value != null) write(value.put("locked", true));
        } catch (Exception error) {
            clear();
            throw error;
        }
    }

    synchronized String installation() throws Exception {
        android.content.SharedPreferences settings = context.getSharedPreferences("mobile-installation", Context.MODE_PRIVATE);
        String id = settings.getString("id", null);
        if (id == null) {
            id = UUID.randomUUID().toString();
            if (!settings.edit().putString("id", id).commit()) throw new SecurityException("Installation ID not saved");
        }
        return id;
    }
}
