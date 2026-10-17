package com.retailpickup.mobile.dev;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SecureSessionStoreTest {
    @Test public void ciphertextRestoresAfterNewInstanceAndLocksDurably() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SecureSessionStore store = new SecureSessionStore(context);
        store.clear();
        try {
            store.write(new JSONObject().put("token", "test-secret-not-plaintext").put("locked", false));
            File file = new File(context.getNoBackupFilesDir(), "mobile-session.json");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            }
            assertFalse(bytes.toString(StandardCharsets.UTF_8.name()).contains("test-secret-not-plaintext"));
            SecureSessionStore restored = new SecureSessionStore(context);
            assertEquals("test-secret-not-plaintext", restored.read().getString("token"));
            restored.lock();
            assertTrue(new SecureSessionStore(context).read().getBoolean("locked"));
            assertEquals(store.installation(), restored.installation());
        } finally { store.clear(); }
        assertNull(store.read());
    }

    @Test public void repeatedWritesUseDifferentCiphertextAndTamperingFailsClosed() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SecureSessionStore store = new SecureSessionStore(context);
        store.clear();
        try {
            JSONObject value = new JSONObject().put("token", "repeat-test").put("locked", false);
            store.write(value);
            File file = new File(context.getNoBackupFilesDir(), "mobile-session.json");
            String first = readFile(file);
            store.write(value);
            assertNotEquals(first, readFile(file));
            try (java.io.FileOutputStream output = new java.io.FileOutputStream(file)) {
                output.write("corrupt".getBytes(StandardCharsets.UTF_8));
            }
            try { store.read(); fail("Tampered storage must not return a token"); }
            catch (Exception expected) { assertNotNull(expected); }
        } finally { store.clear(); }
    }

    @Test public void backupRestoresAndLockFailureRetainsDraftKey() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SecureSessionStore store = new SecureSessionStore(context);
        MobileLocalStore drafts = new MobileLocalStore(context);
        String scope = "session-failure-fixture";
        store.clear();
        try {
            drafts.write(scope, "draft", "retained".getBytes(StandardCharsets.UTF_8));
            store.write(new JSONObject().put("token", "backup-test").put("locked", false));
            File file = new File(context.getNoBackupFilesDir(), "mobile-session.json");
            assertTrue(file.renameTo(new File(file.getPath() + ".bak")));
            assertEquals("backup-test", new SecureSessionStore(context).read().getString("token"));
            try (java.io.FileOutputStream output = new java.io.FileOutputStream(file)) {
                output.write("{}".getBytes(StandardCharsets.UTF_8));
            }
            try { store.lock(); fail("Corrupt session must fail closed"); }
            catch (Exception expected) { assertNotNull(expected); }
            assertNull(new SecureSessionStore(context).read());
            assertEquals("retained", new String(new MobileLocalStore(context).read(scope, "draft"), StandardCharsets.UTF_8));
        } finally { store.clear(); drafts.remove(scope, "draft"); }
    }

    private String readFile(File file) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
        }
        return bytes.toString(StandardCharsets.UTF_8.name());
    }
}
