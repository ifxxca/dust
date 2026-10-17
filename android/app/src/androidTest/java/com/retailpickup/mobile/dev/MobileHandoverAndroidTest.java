package com.retailpickup.mobile.dev;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class MobileHandoverAndroidTest {
    private ActivityScenario<MainActivity> scenario;
    private String evaluate(String expression)throws Exception{
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript(expression,value->{result.set(value);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return result.get();
    }
    private void waitFor(String condition)throws Exception{for(int i=0;i<100;i++){if("true".equals(evaluate(condition)))return;Thread.sleep(200);}fail(condition+" screen="+evaluate("document.body.textContent.slice(0,1600)"));}
    private void click(String text)throws Exception{
        if ("Handover Pickup".equals(text)) { waitFor("document.querySelector('button[aria-label=\"Handover Pickup\"]')?.disabled===false");evaluate("document.querySelector('button[aria-label=\"Handover Pickup\"]').click()");return; }
        if ("Pickup".equals(text)) { waitFor("document.querySelector('button[aria-label=\"Pickup\"]')?.disabled===false");evaluate("document.querySelector('button[aria-label=\"Pickup\"]').click()");return; }

        if ("Akun".equals(text)) {for(int back=0;back<7 && !"true".equals(evaluate("document.querySelector('.mobile-bottom-nav')!==null"));back++){androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);Thread.sleep(300);}}
String label=JSONObject.quote(text);waitFor("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==="+label+")?.disabled===false");evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==="+label+").click()");}
    private void screenshot(String name) throws Exception {
        java.util.concurrent.CountDownLatch rendered = new java.util.concurrent.CountDownLatch(1);
        scenario.onActivity(activity -> {if (!activity.hasWindowFocus()) {rendered.countDown();return;} activity.getBridge().getWebView().invalidate();activity.getBridge().getWebView().postVisualStateCallback(System.nanoTime(), new android.webkit.WebView.VisualStateCallback(){@Override public void onComplete(long requestId){rendered.countDown();}});});
        assertTrue("WebView frame did not commit",rendered.await(10,java.util.concurrent.TimeUnit.SECONDS));

        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().waitForIdleSync();Thread.sleep(400);
        try (java.io.InputStream output = new android.os.ParcelFileDescriptor.AutoCloseInputStream(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("screencap -p /data/local/tmp/retail-ux-" + name + ".png"))) { while(output.read()!=-1) {} }
    }
    private void fill(String selector,String text)throws Exception{evaluate("(()=>{const e=document.querySelector("+JSONObject.quote(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSONObject.quote(text)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");}
    private void tap(String text) throws Exception {
        String label = JSONObject.quote(text);
        evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==="+label+").scrollIntoView({block:'center'})");
        Thread.sleep(300);
        JSONArray point = new JSONArray(evaluate("(()=>{const r=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==="+label+").getBoundingClientRect();return [Math.round((r.x+r.width/2)*devicePixelRatio),Math.round((r.y+r.height/2)*devicePixelRatio)];})()"));
        AtomicReference<int[]> origin = new AtomicReference<>();
        scenario.onActivity(activity->{int[] value=new int[2];activity.getBridge().getWebView().getLocationOnScreen(value);origin.set(value);});
        try(java.io.InputStream output=new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("input tap "+(point.getInt(0)+origin.get()[0])+" "+(point.getInt(1)+origin.get()[1])))){while(output.read()!=-1){}}
    }
    private boolean keyboardVisible() {
        AtomicReference<Boolean> visible=new AtomicReference<>(false);scenario.onActivity(activity->visible.set(activity.getWindow().getDecorView().getRootWindowInsets().isVisible(android.view.WindowInsets.Type.ime())));return visible.get();
    }
    private void exerciseKeyboard()throws Exception{
        JSONArray point=new JSONArray(evaluate("(()=>{const e=document.querySelector('#verify-manual_hybrid');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return[(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio];})()"));
        AtomicReference<int[]> origin=new AtomicReference<>();scenario.onActivity(activity->{int[] value=new int[2];activity.getBridge().getWebView().getLocationOnScreen(value);origin.set(value);});
        try(java.io.InputStream output=new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("input tap "+(point.getInt(0)+origin.get()[0])+" "+(point.getInt(1)+origin.get()[1])))){while(output.read()!=-1){}}
        for(int i=0;i<50&&!keyboardVisible();i++)Thread.sleep(100);assertTrue("Real numeric keyboard must open",keyboardVisible());
        screenshot("handover-keyboard");InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);for(int i=0;i<50&&keyboardVisible();i++)Thread.sleep(100);assertFalse(keyboardVisible());
        assertEquals("\"2\"",evaluate("document.querySelector('#verify-manual_hybrid').value"));assertEquals("true",evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
    }
    @Test public void crossStaffLostCreateResponseRestartWholeListAmendAndStaleEditor()throws Exception{
        Assume.assumeTrue("Isolated M4 fixtures required","true".equals(InstrumentationRegistry.getArguments().getString("mobileM4")));
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();SecureSessionStore vault=new SecureSessionStore(context);vault.clear();
        MobileLocalStore local=new MobileLocalStore(context);String scope="http://127.0.0.1:8000:1";for(String file:local.names(scope))local.remove(scope,file);
        scenario=ActivityScenario.launch(MainActivity.class);
        try{
            waitFor("document.querySelector('#email')!==null");fill("#email","android-smoke@example.test");fill("#password","password");click("Masuk");waitFor("document.querySelector('nav')!==null");
            evaluate("window.__confirmationCount=0;window.confirm=()=>{window.__confirmationCount++;return true;}");
            click("Handover Pickup");waitFor("document.body.textContent.includes('Session Saya')");screenshot("handover");click("Buat Handover");waitFor("document.querySelectorAll('input[type=checkbox]').length===20");
            assertEquals("false",evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.startsWith('Hapus PCK-'))"));
            evaluate("document.querySelector('input[aria-label=\"Pilih PCK-1\"]').click();document.querySelector('input[aria-label=\"Pilih PCK-3\"]').click()");
            click("Berikutnya");waitFor("document.querySelector('input[aria-label=\"Pilih PCK-21\"]')!==null");evaluate("document.querySelector('input[aria-label=\"Pilih PCK-21\"]').click()");waitFor("document.body.textContent.includes('3 Pickup Dipilih')");
            evaluate("document.querySelector('input[aria-label=\"Pilih PCK-21\"]').click()");
            assertEquals("1",evaluate("document.querySelectorAll('input[aria-label=\"Pilih PCK-1\"]').length"));
            evaluate("document.querySelector('input[aria-label=\"Pilih PCK-1\"]').click()");waitFor("document.body.textContent.includes('1 Pickup Dipilih')");
            click("Sebelumnya");waitFor("document.querySelector('input[aria-label=\"Pilih PCK-1\"]')?.checked===false");evaluate("document.querySelector('input[aria-label=\"Pilih PCK-1\"]').click()");
            fill("input[aria-label='Cari pickup handover']","PCK-3");waitFor("document.querySelectorAll('input[type=checkbox]').length===1");assertEquals("true",evaluate("document.querySelector('input[type=checkbox]').checked"));
            fill("input[aria-label='Cari pickup handover']","");waitFor("document.querySelectorAll('input[type=checkbox]').length===20");screenshot("handover-selection");
            click("Review Handover");screenshot("handover-review");click("Kembali ke Pilih Pickup");assertEquals("true",evaluate("document.querySelector('input[aria-label=\"Pilih PCK-3\"]').checked"));click("Review Handover");
            evaluate("(()=>{const original=window.fetch;let lost=false;window.fetch=async(...args)=>{const u=String(args[0]);if(u.endsWith('/handovers')&&args[1]?.method==='POST'){await original(...args);lost=true;throw new TypeError('response lost');}if(lost&&u.includes('/submissions/'))throw new TypeError('read offline');return original(...args);};})()");
            evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Buat Session Handover');b.click();b.click();})()");waitFor("document.body.textContent.includes('Menunggu konfirmasi server')");assertNotNull(local.read(scope,"handover-operation"));assertEquals("0",evaluate("window.__confirmationCount"));
            scenario.recreate();waitFor("document.querySelector('nav')!==null");click("Handover Pickup");waitFor("document.body.textContent.includes('Menunggu konfirmasi server')");click("Periksa Hasil Handover");waitFor("document.body.textContent.includes('Session berhasil dibuat')");assertNull(local.read(scope,"handover-operation"));
            assertEquals("false",evaluate("document.querySelector('#verify-manual_hybrid')!==null || Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Edit Session')"));screenshot("handover-created");click("Lihat Detail Handover");
            assertEquals("false",evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Verifikasi PCK-')||b.textContent.trim()==='Tutup Session Handover')"));
            click("Edit Session");waitFor("document.querySelector('input[aria-label=\"Pilih PCK-2\"]')!==null");evaluate("document.querySelector('input[aria-label=\"Pilih PCK-1\"]').click();document.querySelector('input[aria-label=\"Pilih PCK-2\"]').click()");click("Review Handover");fill("#handover-reason","Native whole list");click("Simpan Perubahan Session");waitFor("document.body.textContent.includes('versi 2')");
            click("Edit Session");waitFor("document.querySelector('input[aria-label=\"Pilih PCK-2\"]')!==null");evaluate("document.querySelector('input[aria-label=\"Pilih PCK-2\"]').click()");click("Review Handover");fill("#handover-reason","Should not overwrite");
            String token=vault.read().getString("token");
            evaluate("window.__rivalDone=false;fetch('http://127.0.0.1:8000/api/mobile/v1/handovers/1/members',{method:'POST',headers:{'Authorization':'Bearer '+"+JSONObject.quote(token)+",'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({expected_version:2,reason:'Concurrent review',task_ids:[2,3]})}).then(r=>{window.__rivalDone=r.ok;})");waitFor("window.__rivalDone===true");
            click("Simpan Perubahan Session");waitFor("document.body.textContent.includes('Session berubah')");assertNull(local.read(scope,"handover-operation"));click("Muat Ulang Session");waitFor("document.body.textContent.includes('versi 3')");
            click("Akun");click("Keluar");waitFor("document.querySelector('#email')!==null");fill("#email","android-receiver@example.test");fill("#password","password");click("Masuk");waitFor("document.querySelector('nav')!==null");click("Handover Pickup");waitFor("document.body.textContent.includes('Menunggu Verifikasi')");
            waitFor("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.startsWith('HO-1'))");evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('HO-1')).click()");waitFor("document.body.textContent.includes('versi 3')");click("Verifikasi PCK-2");fill("#verify-manual_hybrid","2");fill("#verify-cashless_hybrid","1");fill("#verify-css_orion","0");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);waitFor("document.querySelector('#verify-manual_hybrid')===null");click("Verifikasi PCK-2");assertEquals("\"2\"",evaluate("document.querySelector('#verify-manual_hybrid').value"));screenshot("handover-verification");exerciseKeyboard();
            String receiverToken=vault.read().getString("token");
            evaluate("window.__concurrent=false;fetch('http://127.0.0.1:8000/api/mobile/v1/handovers/1/members',{method:'POST',headers:{'Authorization':'Bearer '+"+JSONObject.quote(receiverToken)+",'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({expected_version:3,reason:'Concurrent device while verification open',task_ids:[2,3]})}).then(r=>window.__concurrent=r.ok)");waitFor("window.__concurrent===true");
            click("Simpan Verifikasi");waitFor("document.body.textContent.includes('Session berubah')");assertEquals("\"2\"",evaluate("document.querySelector('#verify-manual_hybrid').value"));assertEquals("true",evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Simpan Verifikasi').disabled"));screenshot("handover-stale-verification");click("Muat Ulang & Tinjau POP");waitFor("document.body.textContent.includes('POP terbaru ditampilkan')");
            evaluate("(()=>{const original=window.fetch;let lost=false;window.fetch=async(...args)=>{const u=String(args[0]);if(u.endsWith('/verification')&&args[1]?.method==='POST'){const response=await original(...args);if(response.ok){lost=true;throw new TypeError('verify response lost');}return response;}if(lost&&u.endsWith('/handovers/1'))throw new TypeError('reconciliation offline');return original(...args);};})()");
            click("Simpan Verifikasi");waitFor("document.body.textContent.includes('Menunggu konfirmasi server')");String receivingScope="http://127.0.0.1:8000:2";assertEquals("verify",new JSONObject(new String(local.read(receivingScope,"handover-operation"),java.nio.charset.StandardCharsets.UTF_8)).getString("kind"));
            scenario.recreate();waitFor("document.querySelector('nav')!==null");click("Handover Pickup");waitFor("document.body.textContent.includes('Menunggu konfirmasi server')");click("Periksa Hasil Handover");waitFor("document.body.textContent.includes('versi 5')");assertNull(local.read(receivingScope,"handover-operation"));
            click("Verifikasi PCK-3");fill("#verify-manual_hybrid","0");fill("#verify-cashless_hybrid","2");fill("#verify-css_orion","0");waitFor("document.body.textContent.includes('-2 · KURANG') && document.body.textContent.includes('+1 · LEBIH')");fill("#verify-manual_hybrid","1");click("Simpan Verifikasi");waitFor("document.body.textContent.includes('Catatan wajib')");
            assertEquals("1",evaluate("document.querySelectorAll('[role=alert]').length"));assertEquals("\"1\"",evaluate("document.querySelector('#verify-manual_hybrid').value"));assertNull(local.read(receivingScope,"handover-operation"));screenshot("handover-validation");
            evaluate("(()=>{const e=document.querySelector('#verify-discrepancy');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Kategori berbeda meskipun total sama');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
            evaluate("(()=>{const original=window.fetch;let rejected=false;window.fetch=async(...args)=>{if(!rejected&&String(args[0]).endsWith('/verification')&&args[1]?.method==='POST'){rejected=true;return new Response(JSON.stringify({message:'Catatan ditolak server',errors:{discrepancy_notes:['Periksa catatan hasil hitung.']}}),{status:422,headers:{'Content-Type':'application/json'}});}return original(...args);};})()");
            click("Simpan Verifikasi");waitFor("document.body.textContent.includes('Periksa catatan hasil hitung.')");assertEquals("1",evaluate("document.querySelectorAll('[role=alert]').length"));assertEquals("\"Kategori berbeda meskipun total sama\"",evaluate("document.querySelector('#verify-discrepancy').value"));assertNull(local.read(receivingScope,"handover-operation"));
            screenshot("handover-discrepancy");click("Simpan Verifikasi");waitFor("document.body.textContent.includes('versi 6')");assertEquals("false",evaluate("document.querySelector('#verify-manual_hybrid')!==null"));
            tap("Tutup Session Handover");waitFor("document.querySelector('[role=dialog]')!==null");screenshot("handover-close-confirmation");click("Kembali ke Detail");click("Tutup Session Handover");click("Ya, Tutup Session");waitFor("document.body.textContent.includes('Session berhasil ditutup')");assertNull(local.read(receivingScope,"handover-operation"));screenshot("handover-closed");
            click("Lihat Detail Handover");waitFor("document.body.textContent.includes('versi 7')");assertEquals("false",evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Verifikasi PCK-')||b.textContent==='Tutup Session Handover')"));click("Aktivitas");waitFor("document.querySelector('ol.activity-timeline li')!==null");screenshot("handover-activity");click("Daftar Handover");click("Riwayat Handover");waitFor("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.startsWith('HO-1'))");screenshot("handover-history");
            click("Akun");click("Keluar");waitFor("document.querySelector('#email')!==null");assertNull(vault.read());
        }        finally{scenario.close();vault.clear();}
    }
}
