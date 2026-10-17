package com.retailpickup.mobile.dev;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class MobileDraftProcessDeathTest {
    private ActivityScenario<MainActivity> scenario;
    private static final String SCOPE="http://127.0.0.1:8000:1";
    private String evaluate(String expression)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript(expression,value->{result.set(value);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return result.get();}
    private void waitFor(String condition)throws Exception{for(int i=0;i<100;i++){if("true".equals(evaluate(condition)))return;Thread.sleep(200);}fail("Missing screen: "+condition+" screen="+evaluate("document.body.textContent.slice(-1300)"));}
    private void click(String text)throws Exception{
        if ("Pickup".equals(text)) { waitFor("document.querySelector('button[aria-label=\"Pickup\"]')?.disabled===false");evaluate("document.querySelector('button[aria-label=\"Pickup\"]').click()");return; }

        if ("Akun".equals(text)) {for(int back=0;back<7 && !"true".equals(evaluate("document.querySelector('.mobile-bottom-nav')!==null"));back++){androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);Thread.sleep(300);}}
String label=JSONObject.quote(text);waitFor("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==="+label+")?.disabled===false");evaluate("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==="+label+").click()");}
    private void fill(String selector,String text)throws Exception{evaluate("(()=>{const e=document.querySelector("+JSONObject.quote(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSONObject.quote(text)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");}
    private void openTask()throws Exception{
        if ("true".equals(evaluate("document.querySelector('h1').textContent==='Beranda'"))) click("Pickup");
waitFor("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('M3 Collected'))");evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('M3 Collected')).click()");waitFor("document.body.textContent.includes('Alamat pickup')||document.querySelector('ol[aria-label=\"Progres pickup\"]')!==null");if("true".equals(evaluate("document.querySelector('button[aria-label=\"Kerjakan Pickup\"]')!==null")))evaluate("document.querySelector('button[aria-label=\"Kerjakan Pickup\"]').click()");}
    private void optIn(){Assume.assumeTrue("Disposable process-death fixtures required","true".equals(InstrumentationRegistry.getArguments().getString("mobileProcessDeath")));}
    private android.view.accessibility.AccessibilityNodeInfo positiveButton(android.view.accessibility.AccessibilityNodeInfo node){
        if(node==null)return null;
        if("android:id/button1".equals(node.getViewIdResourceName()))return node;
        for(int i=0;i<node.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo found=positiveButton(node.getChild(i));if(found!=null)return found;}return null;
    }
    private void cancelPendingCapture()throws Exception{
        evaluate("setTimeout(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Batalkan Capture Tertunda').click(),0);true");
        android.view.accessibility.AccessibilityNodeInfo positive=null;
        for(int i=0;i<50&&positive==null;i++){positive=positiveButton(InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow());if(positive==null)Thread.sleep(100);}
        assertNotNull("Explicit native cancellation confirmation must appear",positive);assertTrue(positive.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK));
        waitFor("!document.body.textContent.includes('Pulihkan Capture')");
    }
    @Test public void prepareRecovery()throws Exception{
        optIn();android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();new SecureSessionStore(context).clear();MobileLocalStore local=new MobileLocalStore(context);for(String file:local.names(SCOPE))local.remove(SCOPE,file);
        scenario=ActivityScenario.launch(MainActivity.class);
        try{
            waitFor("document.querySelector('#email')!==null");fill("#email","android-smoke@example.test");fill("#password","password");click("Masuk");openTask();waitFor("document.querySelector('#qty-manual_hybrid')!==null");fill("#qty-manual_hybrid","3");waitFor("document.body.textContent.includes('Tersimpan di perangkat')");
            JSONObject draft=new JSONObject(new String(local.read(SCOPE,"pop-1"),StandardCharsets.UTF_8));
            android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(320,240,android.graphics.Bitmap.Config.ARGB_8888);new android.graphics.Canvas(bitmap).drawColor(android.graphics.Color.BLUE);java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG,90,output);bitmap.recycle();byte[] photo=output.toByteArray();String name="evidence-"+draft.getString("id")+"-process-test";
            local.write(SCOPE,name,photo);StringBuilder sha=new StringBuilder();for(byte value:java.security.MessageDigest.getInstance("SHA-256").digest(photo))sha.append(String.format("%02x",value));
            draft.put("photos",new JSONArray().put(new JSONObject().put("name",name).put("kind","photo").put("mime","image/jpeg").put("bytes",photo.length).put("sha256",sha.toString())));
            local.write(SCOPE,"pop-1",draft.toString().getBytes(StandardCharsets.UTF_8));
            local.write(SCOPE,"process-death-test",new JSONObject().put("pid",android.os.Process.myPid()).put("key",draft.getString("submissionKey")).put("photo",name).toString().getBytes(StandardCharsets.UTF_8));
            String captureSource=InstrumentationRegistry.getArguments().getString("captureSource","none");
            if(!"none".equals(captureSource)){
                scenario.recreate();waitFor("document.querySelector('nav')!==null");openTask();waitFor("document.querySelector('#qty-manual_hybrid')!==null");click("Lanjut ke Foto");waitFor("document.querySelector('.proof-photo-grid img')?.naturalWidth>0");
                click("Tambah Foto");click("camera".equals(captureSource)?"Ambil Foto":"Pilih dari Galeri");
                String foreground="";
                for(int i=0;i<50;i++){android.view.accessibility.AccessibilityNodeInfo root=InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();if(root!=null&&root.getPackageName()!=null)foreground=root.getPackageName().toString();if(foreground.contains("camera")||foreground.contains("documentsui"))break;Thread.sleep(100);}
                assertTrue("Expected external camera/gallery foreground, got "+foreground,foreground.contains("camera")||foreground.contains("documentsui"));
                assertTrue(new JSONObject(new String(local.read(SCOPE,"pop-1"),StandardCharsets.UTF_8)).has("pendingCapture"));
                android.util.Log.i("RetailCaptureDeath","source="+captureSource+", pid="+android.os.Process.myPid()+", foreground="+foreground);
            }
            assertNotNull(new SecureSessionStore(context).read());
        }finally{scenario.close();}
    }
    @Test public void recoverInDifferentProcessWithoutAutomaticSubmit()throws Exception{
        optIn();android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();MobileLocalStore local=new MobileLocalStore(context);
        JSONObject checkpoint=new JSONObject(new String(local.read(SCOPE,"process-death-test"),StandardCharsets.UTF_8));assertNotEquals(checkpoint.getInt("pid"),android.os.Process.myPid());assertNotNull(new SecureSessionStore(context).read());
        scenario=ActivityScenario.launch(MainActivity.class);
        try{
            waitFor("document.querySelector('nav')!==null");openTask();
            String captureSource=InstrumentationRegistry.getArguments().getString("captureSource","none");
            if(!"none".equals(captureSource)){waitFor("document.body.textContent.includes('Pulihkan Capture')");assertNotNull(new JSONObject(new String(local.read(SCOPE,"pop-1"),StandardCharsets.UTF_8)).optJSONObject("pendingCapture"));cancelPendingCapture();}
            else waitFor("document.querySelector('#qty-manual_hybrid')?.value==='3'");
            JSONObject recovered=new JSONObject(new String(local.read(SCOPE,"pop-1"),StandardCharsets.UTF_8));assertEquals(checkpoint.getString("key"),recovered.getString("submissionKey"));assertNotNull(local.read(SCOPE,checkpoint.getString("photo")));
            assertEquals("3",recovered.getJSONObject("quantities").getString("manual_hybrid"));
            if("none".equals(captureSource))click("Lanjut ke Foto");waitFor("document.body.textContent.includes('Foto opsional: 1/4')");
            click("Preview Foto 1");waitFor("document.querySelector('.proof-photo-fullscreen img')?.naturalWidth>0");click("Tutup Preview");
            click("Akun");click("Keluar");waitFor("document.querySelector('#email')!==null");assertNull(new SecureSessionStore(context).read());assertNotNull(local.read(SCOPE,"pop-1"));
        }finally{scenario.close();for(String file:local.names(SCOPE))local.remove(SCOPE,file);new SecureSessionStore(context).clear();}
    }
}
