package com.retailpickup.mobile.dev;

import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class MobileWorkspaceTest {
    private ActivityScenario<MainActivity> scenario;

    private String evaluate(String expression) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(expression, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView evaluation did not complete", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void waitFor(String condition) throws Exception {
        for (int attempt = 0; attempt < 60; attempt++) {
            if ("true".equals(evaluate(condition))) return;
            Thread.sleep(250);
        }
        fail("Expected mobile screen did not appear: " + condition + "; screen=" + evaluate("document.body.textContent.slice(0,700)"));
    }

    private void click(String label) throws Exception {
        if ("Pickup".equals(label)) { waitFor("document.querySelector('button[aria-label=\"Pickup\"]')?.disabled===false");evaluate("document.querySelector('button[aria-label=\"Pickup\"]').click()");return; }

        if ("Akun".equals(label)) {
            for(int back=0;back<7 && !"true".equals(evaluate("document.querySelector('.mobile-bottom-nav')!==null"));back++) {
                androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);Thread.sleep(300);
            }
        }

        waitFor("Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === " + org.json.JSONObject.quote(label) + ")?.disabled === false");
        evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === " + org.json.JSONObject.quote(label) + ")?.click()");
    }

    private void screenshot(String name) throws Exception {
        java.util.concurrent.CountDownLatch rendered = new java.util.concurrent.CountDownLatch(1);
        scenario.onActivity(activity -> {if (!activity.hasWindowFocus()) {rendered.countDown();return;} activity.getBridge().getWebView().invalidate();activity.getBridge().getWebView().postVisualStateCallback(System.nanoTime(), new android.webkit.WebView.VisualStateCallback(){@Override public void onComplete(long requestId){rendered.countDown();}});});
        assertTrue("WebView frame did not commit",rendered.await(10,java.util.concurrent.TimeUnit.SECONDS));

        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().waitForIdleSync();Thread.sleep(1200);
        try (java.io.InputStream output = new android.os.ParcelFileDescriptor.AutoCloseInputStream(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("screencap -p /data/local/tmp/retail-ux-" + name + ".png"))) { while(output.read()!=-1) {} }
    }
    private void fill(String selector, String value) throws Exception {
        evaluate("(() => { const e=document.querySelector(" + org.json.JSONObject.quote(selector) + "); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e," + org.json.JSONObject.quote(value) + "); e.dispatchEvent(new Event('input',{bubbles:true})); })()");
    }
    private boolean keyboardVisible() throws Exception {
        AtomicReference<Boolean> visible=new AtomicReference<>(false);
        scenario.onActivity(activity -> { if(android.os.Build.VERSION.SDK_INT>=30) visible.set(activity.getWindow().getDecorView().getRootWindowInsets().isVisible(android.view.WindowInsets.Type.ime())); });
        return visible.get();
    }
    private void exerciseSearchKeyboard() throws Exception {
        org.json.JSONArray point=new org.json.JSONArray(evaluate("(()=>{const e=document.querySelector('input[aria-label=\"Cari tugas\"]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio];})()"));
        int[] location=new int[2];scenario.onActivity(activity->activity.getBridge().getWebView().getLocationOnScreen(location));
        try(java.io.InputStream output=new android.os.ParcelFileDescriptor.AutoCloseInputStream(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("input tap "+(location[0]+point.getInt(0))+" "+(location[1]+point.getInt(1))))){while(output.read()!=-1){}}
        for(int i=0;i<50&&!keyboardVisible();i++)Thread.sleep(200);
        assertTrue("Actual Android IME must open for search",keyboardVisible());
        waitFor("getComputedStyle(document.querySelector('.mobile-bottom-nav')).display==='none'");screenshot("keyboard");
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);
        for(int i=0;i<50&&keyboardVisible();i++)Thread.sleep(200);
        assertFalse("Back must dismiss IME",keyboardVisible());
        waitFor("getComputedStyle(document.querySelector('.mobile-bottom-nav')).display!=='none'");
        assertEquals("true",evaluate("document.body.textContent.includes('Native Customer')"));
    }

    private void exerciseLoginKeyboard() throws Exception {
        org.json.JSONArray point=new org.json.JSONArray(evaluate("(()=>{const e=document.querySelector('#password');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio];})()"));
        int[] location=new int[2];scenario.onActivity(activity->activity.getBridge().getWebView().getLocationOnScreen(location));
        try(java.io.InputStream output=new android.os.ParcelFileDescriptor.AutoCloseInputStream(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("input tap "+(location[0]+point.getInt(0))+" "+(location[1]+point.getInt(1))))){while(output.read()!=-1){}}
        for(int index=0;index<50&&!keyboardVisible();index++)Thread.sleep(200);
        assertTrue("Login uses the actual Android keyboard",keyboardVisible());
        waitFor("document.querySelector('.mobile-shell').dataset.keyboard==='true'");
        evaluate("document.querySelector('.login-submit').scrollIntoView({block:'end'})");
        screenshot("login-keyboard");
        assertEquals("true",evaluate("document.querySelector('.login-submit').getBoundingClientRect().bottom<=window.visualViewport.height+2"));
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);
        for(int index=0;index<50&&keyboardVisible();index++)Thread.sleep(200);
        assertFalse(keyboardVisible());
    }

    @Test public void deviceLoginPaginationDetailSearchAndLockedRestartLogout() throws Exception {
        org.junit.Assume.assumeTrue("Requires the isolated backend from MobileAndroidSmokeTest",
            "true".equals(androidx.test.platform.app.InstrumentationRegistry.getArguments().getString("mobileSmoke")));
        android.content.Context context = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext();
        SecureSessionStore store = new SecureSessionStore(context);
        store.clear();
        scenario = ActivityScenario.launch(MainActivity.class);
        try {
            waitFor("document.querySelector('#email') !== null");
            waitFor("document.querySelector('.login-logo')?.complete && document.querySelector('.login-logo').naturalWidth>0");
            click("Lupa password?");waitFor("document.querySelector('.login-help-message')!==null");click("Lupa password?");
            evaluate("document.querySelector('button[aria-label=\"Tampilkan password\"]').click()");waitFor("document.querySelector('#password').type==='text'");
            evaluate("document.querySelector('button[aria-label=\"Sembunyikan password\"]').click()");waitFor("document.querySelector('#password').type==='password'");
            screenshot("jne-login");
            assertEquals("true",evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"));
            assertEquals("true",evaluate("(()=>{const r=document.querySelector('.login-brand').getBoundingClientRect();return Math.abs(r.left)<1&&Math.abs(r.right-innerWidth)<1;})()"));
            assertEquals("true",evaluate("document.querySelector('.login-form').getBoundingClientRect().height>=innerHeight-2"));
            assertEquals("true",evaluate("parseFloat(getComputedStyle(document.querySelector('.login-brand')).paddingTop)>=16"));
            assertEquals("true",evaluate("document.querySelector('.login-brand-copy p').getBoundingClientRect().bottom+8<=document.querySelector('.login-card').getBoundingClientRect().top"));
            exerciseLoginKeyboard();
            fill("#email", "android-smoke@example.test");fill("#password","wrong-password");click("Masuk");
            waitFor("document.querySelector('#email').getAttribute('aria-invalid')==='true'");
            assertEquals("true",evaluate("document.querySelector('#login-email-error')!==null && document.querySelector('.operational-feedback[data-tone=error]')!==null"));
            screenshot("login-validation");
            fill("#email", "android-smoke@example.test");
            fill("#password", "password");
            click("Masuk");
            waitFor("document.querySelector('h1').textContent==='Beranda'");
            waitFor("document.body.textContent.includes('21 tugas')");waitFor("document.querySelector('.daily-summary b')?.textContent==='0'");screenshot("home");
            click("Notifikasi");waitFor("document.body.textContent.includes('Belum ada notifikasi sesi ini')");
            assertEquals("false",evaluate("document.body.textContent.includes('Native Customer')"));
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);
            waitFor("document.querySelector('h1').textContent==='Beranda'");
            click("Menu");waitFor("document.querySelectorAll('button:disabled').length>=3");screenshot("menu");
            assertEquals("true",evaluate("Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('Segera Hadir')).every(b=>b.disabled)"));
            click("Pickup");
            waitFor("document.body.textContent.includes('Native Customer')");
            assertEquals("false",evaluate("document.querySelector('button[aria-expanded=true]')!==null"));
            click("Handover Pickup");waitFor("document.body.textContent.includes('Session Saya')");
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);
            waitFor("document.querySelector('input[aria-label=\"Cari tugas\"]')!==null");
            waitFor("document.body.textContent.includes('Native Customer')");
            waitFor("Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('Native Customer')).length === 20");
            waitFor("!document.body.textContent.includes('Memuat')");screenshot("tasks");
            click("Muat lebih banyak");
            waitFor("Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('Native Customer')).length === 21");
            evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Native Customer')).click()");
            waitFor("document.body.textContent.includes('Alamat pickup')");
            screenshot("detail");
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);
            waitFor("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Lihat & Kerjakan'))");
            evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Native Customer')).click()");
            waitFor("document.body.textContent.includes('Alamat pickup')");
            click("Kembali");
            click("Tersedia");
            waitFor("document.body.textContent.includes('Available Candidate')");
            assertEquals("false", evaluate("document.body.textContent.includes('Native Customer')"));
            click("Tugas Saya");
            waitFor("document.querySelector('input[aria-label=\"Cari tugas\"]') !== null");
            exerciseSearchKeyboard();
            fill("input[aria-label=\"Cari tugas\"]", "nothing-matches");
            click("Cari");
            waitFor("document.body.textContent.includes('Belum ada tugas')");
            click("Akun");
            waitFor("document.body.textContent.includes('Native Staff')");
            waitFor("document.querySelector('section[aria-label=\"Profil dan pengaturan akun\"]')!==null");
            assertEquals("false",evaluate("/ID instalasi|akun #|Sesi berakhir|http:\\/\\/|Development|RETAIL OPERATIONS DEV|Firebase|FCM|akun\\/environment/.test(document.body.textContent)"));
            screenshot("account");
            if (context.getResources().getIdentifier("google_app_id", "string", context.getPackageName()) == 0) {
                waitFor("document.body.textContent.includes('Notifikasi belum tersedia')");
            }
            evaluate("document.querySelector('section[aria-label=\"Profil dan pengaturan akun\"] details').open=true");
            click("Kunci Aplikasi");
            waitFor("document.body.textContent.includes('Sesi terkunci di perangkat')");
            waitFor("document.body.textContent.includes('Anda belum keluar dari akun')");
            assertTrue(store.read().getBoolean("locked"));
            scenario.recreate();
            waitFor("document.body.textContent.includes('Sesi terkunci di perangkat')");
            click("Selesaikan Keluar");
            waitFor("document.querySelector('#email') !== null");
            assertNull(store.read());
        } finally {
            scenario.close();
            store.clear();
        }
    }

    @Test public void unauthorizedNotificationTaskDoesNotExposeCustomerOrEnableExecution() throws Exception {
        org.junit.Assume.assumeTrue("Requires isolated backend", "true".equals(androidx.test.platform.app.InstrumentationRegistry.getArguments().getString("mobileSmoke")));
        android.content.Context context=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext();SecureSessionStore vault=new SecureSessionStore(context);vault.clear();
        android.content.Intent intent=new android.content.Intent(context,MainActivity.class).putExtra("google.message_id","synthetic-denied-task").putExtra("type","pickup_assigned").putExtra("task_id","22").putExtra("recipient_id","1").putExtra("event_id","2");
        scenario=ActivityScenario.launch(intent);
        try {
            waitFor("document.querySelector('#email')!==null");fill("#email","android-smoke@example.test");fill("#password","password");click("Masuk");
            waitFor("document.body.textContent.includes('Data tidak tersedia untuk akun ini')");
            assertEquals("false",evaluate("document.body.textContent.includes('Restricted Scheduled Customer')"));
            assertEquals("false",evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Mulai Pickup')"));
            click("Akun");click("Keluar");waitFor("document.querySelector('#email')!==null");assertNull(vault.read());
        } finally { scenario.close();vault.clear(); }
    }
    @Test public void simulatedColdNotificationTapWaitsForLoginThenOpensTask() throws Exception {
        org.junit.Assume.assumeTrue("Requires isolated backend, not real FCM delivery",
            "true".equals(androidx.test.platform.app.InstrumentationRegistry.getArguments().getString("mobileSmoke")));
        android.content.Context context = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext();
        SecureSessionStore store = new SecureSessionStore(context);
        store.clear();
        store.write(new org.json.JSONObject().put("token", "expired-test-only").put("locked", false)
            .put("environment", "http://127.0.0.1:8000").put("expiresAt", "2000-01-01T00:00:00Z")
            .put("timezone", "Asia/Jakarta").put("user", new org.json.JSONObject().put("id", 1).put("name", "Native Staff").put("role", "pickup_staff").put("is_active", true)));
        android.content.Intent intent = new android.content.Intent(context, MainActivity.class)
            .putExtra("google.message_id", "simulated-notification-tap")
            .putExtra("type", "pickup_assigned").putExtra("task_id", "1").putExtra("recipient_id", "1").putExtra("event_id", "1");
        scenario = ActivityScenario.launch(intent);
        try {
            waitFor("document.querySelector('#email') !== null");
            assertNull(store.read());
            fill("#email", "android-smoke@example.test");
            fill("#password", "password");
            click("Masuk");
            waitFor("document.body.textContent.includes('Alamat pickup')");
            assertEquals("true", evaluate("document.body.textContent.includes('Native Customer')"));
            waitFor("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Mulai Pickup')?.disabled===false");
            evaluate("(()=>{const original=window.fetch;window.fetch=(...args)=>String(args[0]).endsWith('/pickup-tasks/1')?Promise.resolve(new Response('{}',{status:404,headers:{'Content-Type':'application/json'}})):original(...args);})()");
            click("Refresh");waitFor("document.body.textContent.includes('Data tidak tersedia untuk akun ini')");
            assertEquals("false",evaluate("document.body.textContent.includes('Native Customer')"));
            assertEquals("false",evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Mulai Pickup')"));
            click("Akun");
            click("Keluar");
            waitFor("document.querySelector('#email') !== null");
            assertNull(store.read());
        } finally {
            scenario.close();
            store.clear();
        }
    }
}
