package com.retailpickup.mobile.dev;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

final class MobileLocalStore {
    static final long QUOTA = 200L * 1024 * 1024;
    private static final String KEY = "retail-mobile-drafts-v1";
    private final File root;
    private final long quota;
    MobileLocalStore(Context context) { this(context, QUOTA); }
    MobileLocalStore(Context context, long quota) {
        root = new File(context.getNoBackupFilesDir(), "mobile-local-v1");
        this.quota = quota;
    }
    private SecretKey key(boolean create) throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        if (keys.containsAlias(KEY)) return (SecretKey) keys.getKey(KEY, null);
        if (!create || size(root) > 0) throw new java.security.UnrecoverableKeyException("LOCAL_KEY_UNAVAILABLE");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    private File directory(String scope) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(scope.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder(); for (byte value : hash) name.append(String.format("%02x", value));
        return new File(root, name.toString());
    }
    private AtomicFile file(String scope, String name) throws Exception {
        if (!name.matches("[a-z0-9-]{1,100}")) throw new SecurityException("Invalid local identifier");
        return new AtomicFile(new File(directory(scope), name + ".enc"));
    }
    private long size(File file) {
        if (!file.isDirectory()) return file.length();
        long total = 0; File[] children = file.listFiles();
        if (children != null) for (File child : children) total += size(child);
        return total;
    }
    synchronized void write(String scope, String name, byte[] value) throws Exception {
        if (value.length > 6 * 1024 * 1024) throw new IOException("LOCAL_FILE_LIMIT");
        if (size(root) + value.length + 64 > quota) throw new IOException("LOCAL_QUOTA_EXCEEDED");
        File directory = directory(scope); if (!directory.exists() && !directory.mkdirs()) throw new IOException("LOCAL_STORAGE_FAILED");
        AtomicFile target = file(scope, name);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key(true));
        cipher.updateAAD((scope + ":" + name).getBytes(StandardCharsets.UTF_8));
        byte[] ciphertext = cipher.doFinal(value);
        FileOutputStream output = target.startWrite();
        try { output.write(cipher.getIV().length); output.write(cipher.getIV()); output.write(ciphertext); target.finishWrite(output); }
        catch (Exception error) { target.failWrite(output); throw error; }
    }
    synchronized byte[] read(String scope, String name) throws Exception {
        AtomicFile target = file(scope, name);
        if (!target.getBaseFile().exists() && !new File(target.getBaseFile().getPath() + ".bak").exists()) return null;
        try (FileInputStream input = target.openRead()) {
            int ivLength = input.read(); if (ivLength != 12) throw new SecurityException("Invalid local envelope");
            byte[] iv = new byte[ivLength]; new DataInputStream(input).readFully(iv);
            ByteArrayOutputStream buffer = new ByteArrayOutputStream(); byte[] chunk = new byte[8192]; int count;
            while ((count = input.read(chunk)) != -1) {
                buffer.write(chunk, 0, count);
                if (buffer.size() > 6 * 1024 * 1024 + 16) throw new SecurityException("Invalid local envelope");
            }
            byte[] ciphertext = buffer.toByteArray();
            if (iv.length != ivLength || ciphertext.length > 6 * 1024 * 1024 + 16) throw new SecurityException("Invalid local envelope");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
            cipher.updateAAD((scope + ":" + name).getBytes(StandardCharsets.UTF_8)); return cipher.doFinal(ciphertext);
        }
    }
    synchronized void remove(String scope, String name) throws Exception {
        AtomicFile target = file(scope, name); target.delete();
        if (target.getBaseFile().exists() || new File(target.getBaseFile().getPath() + ".bak").exists()) throw new IOException("LOCAL_CLEANUP_FAILED");
    }
    synchronized String[] names(String scope) throws Exception {
        File[] entries = directory(scope).listFiles(); java.util.ArrayList<String> names = new java.util.ArrayList<>();
        if (entries != null) for (File entry : entries) {
            String name = entry.getName();
            if (name.endsWith(".enc.bak")) name = name.substring(0,name.length()-8);
            else if (name.endsWith(".enc")) name = name.substring(0,name.length()-4);
            else continue;
            if (!names.contains(name)) names.add(name);
        }
        return names.toArray(new String[0]);
    }
}
