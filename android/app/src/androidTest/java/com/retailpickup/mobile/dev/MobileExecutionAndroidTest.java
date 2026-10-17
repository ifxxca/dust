package com.retailpickup.mobile.dev;



import androidx.test.core.app.ActivityScenario;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;

import org.junit.runner.RunWith;

import java.util.concurrent.*;

import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;



@RunWith(AndroidJUnit4.class)

public class MobileExecutionAndroidTest {

    private ActivityScenario<MainActivity> scenario;

    private String evaluate(String expression) throws Exception {

        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();

        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(expression, value -> { result.set(value); done.countDown(); }));

        assertTrue(done.await(10, TimeUnit.SECONDS)); return result.get();

    }

    private void waitFor(String condition) throws Exception {

        for (int index = 0; index < 80; index++) { if ("true".equals(evaluate(condition))) return; Thread.sleep(250); }

        fail("Screen missing: " + condition + " screen=" + evaluate("document.body.textContent.slice(0,1200)"));

    }

    private void click(String label) throws Exception {
        if ("Pickup".equals(label)) { waitFor("document.querySelector('button[aria-label=\"Pickup\"]')?.disabled===false");evaluate("document.querySelector('button[aria-label=\"Pickup\"]').click()");return; }

        if ("Akun".equals(label)) {
            for(int back=0;back<7 && !"true".equals(evaluate("document.querySelector('.mobile-bottom-nav')!==null"));back++) {
                androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);Thread.sleep(300);
            }
        }


        String literal = org.json.JSONObject.quote(label);

        waitFor("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===" + literal + ")?.disabled===false");

        evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===" + literal + ").click()");

    }

    private void screenshot(String name) throws Exception {
        java.util.concurrent.CountDownLatch rendered = new java.util.concurrent.CountDownLatch(1);
        scenario.onActivity(activity -> {if (!activity.hasWindowFocus()) {rendered.countDown();return;} activity.getBridge().getWebView().invalidate();activity.getBridge().getWebView().postVisualStateCallback(System.nanoTime(), new android.webkit.WebView.VisualStateCallback(){@Override public void onComplete(long requestId){rendered.countDown();}});});
        assertTrue("WebView frame did not commit",rendered.await(10,java.util.concurrent.TimeUnit.SECONDS));


        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().waitForIdleSync();Thread.sleep(400);

        try (java.io.InputStream output = new android.os.ParcelFileDescriptor.AutoCloseInputStream(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("screencap -p /data/local/tmp/retail-ux-" + name + ".png"))) { while(output.read()!=-1) {} }

    }

    private void fill(String selector, String value) throws Exception {

        evaluate("(()=>{const e=document.querySelector(" + org.json.JSONObject.quote(selector) + ");Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e," + org.json.JSONObject.quote(value) + ");e.dispatchEvent(new Event('input',{bubbles:true}));})()");

    }

    private void open(String name) throws Exception {
        if ("true".equals(evaluate("document.querySelector('h1').textContent==='Beranda'"))) click("Pickup");


        waitFor("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes(" + org.json.JSONObject.quote(name) + "))");

        evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(" + org.json.JSONObject.quote(name) + ")).click()");

        waitFor("document.body.textContent.includes('Alamat pickup')||document.querySelector('ol[aria-label=\"Progres pickup\"]')!==null");if("true".equals(evaluate("document.querySelector('button[aria-label=\"Kerjakan Pickup\"]')!==null")))evaluate("document.querySelector('button[aria-label=\"Kerjakan Pickup\"]').click()");

    }

    @Test public void takeoverLostResponseRestartCollectedNoPackagesManualFollowUpAndLogout() throws Exception {

        org.junit.Assume.assumeTrue("Isolated M2 fixtures required", "true".equals(androidx.test.platform.app.InstrumentationRegistry.getArguments().getString("mobileM2")));

        android.content.Context context = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext();

        SecureSessionStore vault = new SecureSessionStore(context); vault.clear();

        scenario = ActivityScenario.launch(MainActivity.class);

        try {

            waitFor("document.querySelector('#email')!==null"); fill("#email", "android-smoke@example.test"); fill("#password", "password"); click("Masuk"); click("Pickup");

            waitFor("document.body.textContent.includes('M2 Own')");

            org.json.JSONObject savedSession=vault.read();String scope=savedSession.getString("environment")+":"+savedSession.getJSONObject("user").getLong("id");

            MobileLocalStore local=new MobileLocalStore(context);local.write(scope,"pop-1","{}".getBytes(java.nio.charset.StandardCharsets.UTF_8));

            StringBuilder hash=new StringBuilder();for(byte b:java.security.MessageDigest.getInstance("SHA-256").digest(scope.getBytes(java.nio.charset.StandardCharsets.UTF_8)))hash.append(String.format("%02x",b));

            java.io.File corrupt=new java.io.File(context.getNoBackupFilesDir(),"mobile-local-v1/"+hash+"/pop-1.enc");byte[] original=java.nio.file.Files.readAllBytes(corrupt.toPath());original[original.length-1]^=1;java.nio.file.Files.write(corrupt.toPath(),original);

            open("M2 Own");waitFor("document.body.textContent.includes('Coba Baca Ulang Draft')");

            waitFor("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Mulai Pickup')?.disabled===false");

            click("Coba Baca Ulang Draft");waitFor("document.body.textContent.includes('Coba Baca Ulang Draft')");

            assertArrayEquals(original,java.nio.file.Files.readAllBytes(corrupt.toPath()));local.remove(scope,"pop-1");click("Kembali");click("Kembali");click("Tersedia");open("M2 Available");

            waitFor("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Ambil Tugas')");

            evaluate("(()=>{const original=window.fetch;window.fetch=async(...args)=>{const u=String(args[0]);if(u.includes('/takeover')){await original(...args);throw new TypeError('response lost');}if(/pickup-tasks\\/\\d+$/.test(u))throw new TypeError('network offline');return original(...args);};})()");

            click("Ambil Tugas"); click("Konfirmasi Operasi");

            waitFor("document.body.textContent.includes('Menunggu konfirmasi server')");

            scenario.recreate(); waitFor("document.body.textContent.includes('M2 Own')"); open("M2 Available");

            waitFor("document.body.textContent.includes('Menunggu konfirmasi server')"); click("Periksa hasil di server");

            waitFor("document.body.textContent.includes('Tugas berhasil diambil alih.')");

            click("Mulai Pickup");

            waitFor("document.querySelector('#visit-outcome')!==null");
            assertEquals("false", evaluate("document.querySelector('[role=dialog]')!==null"));
            assertEquals("true", evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Simpan Hasil Kunjungan').disabled"));
            evaluate("window.__visitPosts=0;window.__countedFetch=window.fetch;window.fetch=(...args)=>{if(String(args[0]).endsWith('/visits')&&args[1]?.method==='POST')window.__visitPosts++;return window.__countedFetch(...args);}");
            click("Paket berhasil diambil");
            assertEquals("0",evaluate("window.__visitPosts"));
            assertEquals("true",evaluate("document.querySelector('[role=radio][aria-checked=true]')!==null"));
            assertEquals("false",evaluate("document.body.textContent.includes('Buat Draft POP')"));
            screenshot("outcome"); click("Simpan Hasil Kunjungan");

            waitFor("document.querySelector('#qty-manual_hybrid')!==null");
            assertEquals("1",evaluate("window.__visitPosts"));

            assertEquals("false", evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Batalkan'))"));

            click("Kembali"); click("Kembali"); open("M2 Retry"); click("Mulai Pickup");

            waitFor("document.querySelector('#visit-outcome')!==null");

            evaluate("(()=>{const e=document.querySelector('#visit-outcome');e.value='NO_PACKAGES';e.dispatchEvent(new Event('change',{bubbles:true}));})()");

            waitFor("document.body.textContent.includes('Alasan (wajib)')");

            assertEquals("true", evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Simpan Hasil Kunjungan').disabled"));

            fill("#execution-reason", "Customer tutup"); click("Simpan Hasil Kunjungan");

            waitFor("document.body.textContent.includes('Pickup selesai tanpa paket')");
            assertEquals("false",evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Otorisasi Retry')"));
            screenshot("no-packages-complete");
            click("Buat Kunjungan Baru");
            waitFor("document.querySelector('#manual-schedule')!==null");
            assertEquals("true",evaluate("Math.abs(document.querySelector('.mobile-shell').getBoundingClientRect().width-window.innerWidth)<1"));
            assertEquals("true",evaluate("document.querySelector('.mobile-bottom-nav')===null"));
            fill("#manual-schedule","2026-12-01T10:00"); fill("#manual-notes","Customer sekarang siap");
            screenshot("manual-pickup");
            evaluate("(()=>{const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).endsWith('/pickup-tasks')&&args[1]?.method==='POST'){await original(...args);throw new TypeError('response lost');}return original(...args);};})()");
            click("Buat Pickup"); waitFor("document.body.textContent.includes('Hasil pembuatan perlu diperiksa')");
            byte[] savedBytes=local.read(scope,"manual-pickup"); assertNotNull(savedBytes); String saved=new String(savedBytes,java.nio.charset.StandardCharsets.UTF_8);
            String key=new org.json.JSONObject(saved).getJSONObject("body").getString("submission_key");
            scenario.recreate(); waitFor("document.querySelector('button[aria-label=\"Pickup\"]')!==null");
            assertEquals(key,new org.json.JSONObject(new String(local.read(scope,"manual-pickup"),java.nio.charset.StandardCharsets.UTF_8)).getJSONObject("body").getString("submission_key"));
            click("Pickup"); click("Buat Pickup Manual");waitFor("document.body.textContent.includes('Hasil pembuatan perlu diperiksa')");
            click("Periksa hasil di server");waitFor("document.querySelector('button[aria-label=\"Kerjakan Pickup\"]')!==null");
            assertNull(local.read(scope,"manual-pickup"));
            screenshot("manual-pickup-created");
            click("Kembali");click("Buat Pickup Manual");waitFor("document.querySelector('[data-manual-customer]')!==null");
            evaluate("document.querySelector('[data-manual-customer]').click()");waitFor("document.querySelector('#manual-customer-search')===null");
            fill("#manual-schedule","2026-12-02T10:00");fill("#manual-notes","Pickup langsung dari customer existing");
            screenshot("manual-new-pickup");click("Buat Pickup");waitFor("document.querySelector('button[aria-label=\"Kerjakan Pickup\"]')!==null");
            click("Kembali"); click("Riwayat");waitFor("document.body.textContent.includes('M2 Retry')");
            assertEquals("true",evaluate("document.body.textContent.includes('Selesai tanpa paket')"));

            click("Akun"); click("Keluar"); waitFor("document.querySelector('#email')!==null"); assertNull(vault.read());

        } finally { scenario.close(); new MobileLocalStore(context).remove("http://127.0.0.1:8000:1","pop-3"); vault.clear(); }

    }

}

