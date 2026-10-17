package com.retailpickup.mobile.dev;

import android.graphics.*;
import android.content.ContentValues;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.*;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class MobileProofAndroidTest {
    private ActivityScenario<MainActivity> scenario;
    private String evaluate(String expression) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript(expression,value->{result.set(value);done.countDown();}));
        assertTrue(done.await(10,TimeUnit.SECONDS));return result.get();
    }
    private void waitFor(String condition) throws Exception {
        for(int i=0;i<100;i++){if("true".equals(evaluate(condition)))return;Thread.sleep(200);}
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();MobileLocalStore local=new MobileLocalStore(context);String paths="";
        for(String file:local.names("http://127.0.0.1:8000:1"))if(file.startsWith("capture-"))paths+=new JSONObject(new String(local.read("http://127.0.0.1:8000:1",file),java.nio.charset.StandardCharsets.UTF_8)).optString("phase");
        fail("Expected screen missing: "+condition+" capture="+paths+" screen="+evaluate("document.body.textContent.slice(0,1800)"));
    }
    private void click(String label) throws Exception {
        if ("Pickup".equals(label)) { waitFor("document.querySelector('button[aria-label=\"Pickup\"]')?.disabled===false");evaluate("document.querySelector('button[aria-label=\"Pickup\"]').click()");return; }

        if ("Akun".equals(label)) {
            for(int back=0;back<7 && !"true".equals(evaluate("document.querySelector('.mobile-bottom-nav')!==null"));back++) {
                androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);Thread.sleep(300);
            }
        }

        String text=JSONObject.quote(label);waitFor("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==="+text+")?.disabled===false");
        evaluate("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==="+text+").click()");
    }
    private void screenshot(String name) throws Exception {
        java.util.concurrent.CountDownLatch rendered = new java.util.concurrent.CountDownLatch(1);
        scenario.onActivity(activity -> {if (!activity.hasWindowFocus()) {rendered.countDown();return;} activity.getBridge().getWebView().invalidate();activity.getBridge().getWebView().postVisualStateCallback(System.nanoTime(), new android.webkit.WebView.VisualStateCallback(){@Override public void onComplete(long requestId){rendered.countDown();}});});
        assertTrue("WebView frame did not commit",rendered.await(10,java.util.concurrent.TimeUnit.SECONDS));

        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().waitForIdleSync();Thread.sleep(400);
        try (java.io.InputStream output = new android.os.ParcelFileDescriptor.AutoCloseInputStream(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("screencap -p /data/local/tmp/retail-ux-" + name + ".png"))) { while(output.read()!=-1) {} }
    }
    private void fill(String selector,String value) throws Exception {
        evaluate("(()=>{const e=document.querySelector("+JSONObject.quote(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSONObject.quote(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    }
    private void login(String email) throws Exception {
        waitFor("document.querySelector('#email')!==null");fill("#email",email);fill("#password","password");click("Masuk");waitFor("document.querySelector('nav')!==null");
    }
    private void openTask() throws Exception {
        if ("true".equals(evaluate("document.querySelector('h1').textContent==='Beranda'"))) click("Pickup");

        waitFor("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('M3 Collected'))");
        evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('M3 Collected')).click()");waitFor("document.body.textContent.includes('Alamat pickup')||document.querySelector('ol[aria-label=\"Progres pickup\"]')!==null");if("true".equals(evaluate("document.querySelector('button[aria-label=\"Kerjakan Pickup\"]')!==null")))evaluate("document.querySelector('button[aria-label=\"Kerjakan Pickup\"]').click()");
    }
    private AccessibilityNodeInfo thumbnail(AccessibilityNodeInfo node) {
        if(node==null)return null;
        String id=node.getViewIdResourceName();String desc=String.valueOf(node.getContentDescription());Rect rect=new Rect();node.getBoundsInScreen(rect);
        if((id!=null&&(id.toLowerCase().contains("thumbnail")||id.endsWith("icon_thumb")))||(desc.startsWith("Photo taken on")&&rect.width()>80&&rect.height()>80))return node;
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=thumbnail(node.getChild(i));if(child!=null)return child;}
        return null;
    }
    private AccessibilityNodeInfo galleryFixture(AccessibilityNodeInfo node){
        if(node==null)return null;
        if(String.valueOf(node.getContentDescription()).startsWith("retail-pickup-native-test.jpg,")||"retail-pickup-native-test.jpg".contentEquals(String.valueOf(node.getText())))return node;
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo found=galleryFixture(node.getChild(i));if(found!=null)return found;}return null;
    }
    private void selectGalleryPhoto() throws Exception {
        android.app.UiAutomation automation=InstrumentationRegistry.getInstrumentation().getUiAutomation();
        for(int i=0;i<100;i++){
            AccessibilityNodeInfo root=automation.getRootInActiveWindow();
            AccessibilityNodeInfo image=galleryFixture(root);
            boolean fixtureLabel=image!=null;
            if(image==null)image=thumbnail(root);
            if(image!=null&&image.isVisibleToUser()){
                Thread.sleep(300);AccessibilityNodeInfo target=image;
                for(AccessibilityNodeInfo parent=image.getParent();parent!=null;parent=parent.getParent()){
                    String type=String.valueOf(parent.getClassName());if(type.contains("RecyclerView")||type.contains("ListView"))break;
                    if(parent.isClickable())target=parent;
                }
                Rect rect=new Rect();target.getBoundsInScreen(rect);
                if(fixtureLabel){image.getBoundsInScreen(rect);android.util.Log.i("RetailPickerTarget",image.getContentDescription()+" "+rect);shellInput("input tap "+(rect.left+rect.width()/4)+" "+(rect.top+rect.height()*3/4));}
                else if(target==null||!target.performAction(AccessibilityNodeInfo.ACTION_CLICK))shellInput("input tap "+rect.centerX()+" "+rect.centerY());
                for(int attempt=0;attempt<60;attempt++) {
                    AccessibilityNodeInfo activeRoot=automation.getRootInActiveWindow(),done=galleryDone(activeRoot);
                    if(activeRoot!=null&&"com.retailpickup.mobile.dev".contentEquals(activeRoot.getPackageName()))return;
                    if(done!=null){done.getBoundsInScreen(rect);if(!done.performAction(AccessibilityNodeInfo.ACTION_CLICK))shellInput("input tap "+rect.centerX()+" "+rect.centerY());}
                    Thread.sleep(200);
                }
                fail("Picker did not return selected image: "+describe(automation.getRootInActiveWindow()));
            }
            Thread.sleep(200);
        }
        fail("Gallery image thumbnail unavailable: "+describe(automation.getRootInActiveWindow()));
    }
    private AccessibilityNodeInfo galleryDone(AccessibilityNodeInfo node){
        if(node==null)return null;String id=String.valueOf(node.getViewIdResourceName()),desc=String.valueOf(node.getContentDescription());if(node.isVisibleToUser()&&node.isEnabled()&&("Done".contentEquals(String.valueOf(node.getText()))||"Done".equals(desc)||desc.equalsIgnoreCase("Review done")||id.endsWith("done_button")))return node;
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo value=galleryDone(node.getChild(i));if(value!=null)return value;}return null;
    }
    private AccessibilityNodeInfo shutter(AccessibilityNodeInfo node){
        if(node==null)return null;String id=String.valueOf(node.getViewIdResourceName()),desc=String.valueOf(node.getContentDescription()).toLowerCase();
        if(node.isVisibleToUser()&&node.isEnabled()&&(id.contains("shutter_button")||desc.equals("take photo")||desc.equals("capture photo")))return node;
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo value=shutter(node.getChild(i));if(value!=null)return value;}return null;
    }
    private void takeCameraPhoto()throws Exception{
        android.app.UiAutomation automation=InstrumentationRegistry.getInstrumentation().getUiAutomation();
        for(int i=0;i<100;i++){
            AccessibilityNodeInfo button=shutter(automation.getRootInActiveWindow());
            if(button!=null){Thread.sleep(500);Rect rect=new Rect();button.getBoundsInScreen(rect);if(!button.performAction(AccessibilityNodeInfo.ACTION_CLICK))shellInput("input tap "+rect.centerX()+" "+rect.centerY());
                for(int attempt=0;attempt<80;attempt++){AccessibilityNodeInfo done=galleryDone(automation.getRootInActiveWindow());if(done!=null){screenshot("camera-confirm");done.getBoundsInScreen(rect);if(!done.performAction(AccessibilityNodeInfo.ACTION_CLICK))shellInput("input tap "+rect.centerX()+" "+rect.centerY());return;}Thread.sleep(200);}fail("Camera confirmation unavailable: "+describe(automation.getRootInActiveWindow()));
            }Thread.sleep(200);
        }fail("Camera shutter unavailable: "+describe(automation.getRootInActiveWindow()));
    }
    private String describe(AccessibilityNodeInfo node) {
        if(node==null)return "null";
        String value="["+node.getClassName()+"/"+node.getViewIdResourceName()+"/"+node.getText()+"/"+node.getContentDescription()+"]";
        for(int i=0;i<node.getChildCount();i++)value+=describe(node.getChild(i));
        return value;
    }
    private void tap(float x,float y) {
        long now=android.os.SystemClock.uptimeMillis();inject(now,now,MotionEvent.ACTION_DOWN,x,y);inject(now,now+30,MotionEvent.ACTION_UP,x,y);
    }
    private void shellInput(String command) throws Exception {
        try(android.os.ParcelFileDescriptor descriptor=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);java.io.InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(descriptor)){while(input.read()!=-1){}}
    }
    private void inject(long down,long time,int action,float x,float y) {
        MotionEvent event=MotionEvent.obtain(down,time,action,x,y,0);event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        assertTrue(InstrumentationRegistry.getInstrumentation().getUiAutomation().injectInputEvent(event,true));event.recycle();
    }
    private void sign() throws Exception {
        evaluate("document.querySelector('canvas').scrollIntoView({block:'center'})");Thread.sleep(300);
        String encoded=evaluate("(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return JSON.stringify([r.left,r.top,r.width,r.height,devicePixelRatio]);})()");
        JSONArray bounds=new JSONArray((String)new JSONTokener(encoded).nextValue());
        int[] origin=new int[2];scenario.onActivity(activity->activity.getBridge().getWebView().getLocationOnScreen(origin));
        float scale=(float)bounds.getDouble(4);float x=origin[0]+(float)(bounds.getDouble(0)+bounds.getDouble(2)*0.2)*scale;
        float y=origin[1]+(float)(bounds.getDouble(1)+bounds.getDouble(3)*0.5)*scale;long now=android.os.SystemClock.uptimeMillis();
        shellInput("input swipe "+(int)x+" "+(int)y+" "+(int)(x+120)+" "+(int)(y+30)+" 500");
        waitFor("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Hapus / Ganti Tanda Tangan')?.disabled===false");
        waitFor("document.body.textContent.includes('Tersimpan di perangkat')");
    }
    private boolean keyboardVisible()throws Exception{
        AtomicReference<Boolean> visible=new AtomicReference<>(false);scenario.onActivity(activity->{if(android.os.Build.VERSION.SDK_INT>=30)visible.set(activity.getWindow().getDecorView().getRootWindowInsets().isVisible(android.view.WindowInsets.Type.ime()));});return visible.get();
    }
    private void exerciseNotesKeyboard()throws Exception{
        JSONArray point=new JSONArray(evaluate("(()=>{const e=document.querySelector('#proof-notes');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return[(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio];})()"));
        int[] origin=new int[2];scenario.onActivity(activity->activity.getBridge().getWebView().getLocationOnScreen(origin));shellInput("input tap "+(origin[0]+point.getInt(0))+" "+(origin[1]+point.getInt(1)));
        for(int i=0;i<50&&!keyboardVisible();i++)Thread.sleep(100);assertTrue("POP notes must open actual Android IME",keyboardVisible());
        waitFor("document.querySelector('.mobile-shell').dataset.keyboard==='true'");evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Review POP').scrollIntoView({block:'end'})");screenshot("pop-keyboard");
        assertEquals("true",evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Review POP').getBoundingClientRect().bottom<=visualViewport.height+2"));
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);for(int i=0;i<50&&keyboardVisible();i++)Thread.sleep(100);assertFalse(keyboardVisible());
        assertEquals("\"Native encrypted recovery\"",evaluate("document.querySelector('#proof-notes').value"));
    }
    @Test public void gallerySignatureRestartAccountIsolationLostResponseAndVerifiedCleanup() throws Exception {
        org.junit.Assume.assumeTrue("Isolated M3 fixtures required","true".equals(InstrumentationRegistry.getArguments().getString("mobileM3")));
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();SecureSessionStore vault=new SecureSessionStore(context);vault.clear();
        MobileLocalStore local=new MobileLocalStore(context);String fixtureScope="http://127.0.0.1:8000:1";
        for(String file:local.names(fixtureScope))local.remove(fixtureScope,file);
        byte[] oldCapture=local.read("capture-system-v1","ticket");
        if(oldCapture!=null&&fixtureScope.equals(new JSONObject(new String(oldCapture,java.nio.charset.StandardCharsets.UTF_8)).optString("scope")))local.remove("capture-system-v1","ticket");
        ContentValues media=new ContentValues();media.put(MediaStore.Images.Media.DISPLAY_NAME,"retail-pickup-native-test.jpg");media.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");media.put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/RetailPickupTests");media.put(MediaStore.Images.Media.IS_PENDING,1);media.put(MediaStore.Images.Media.DATE_TAKEN,System.currentTimeMillis());
        Uri image=context.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,media);
        Bitmap bitmap=Bitmap.createBitmap(320,240,Bitmap.Config.ARGB_8888);new Canvas(bitmap).drawColor(Color.MAGENTA);
        try(java.io.OutputStream output=context.getContentResolver().openOutputStream(image)){bitmap.compress(Bitmap.CompressFormat.JPEG,90,output);}bitmap.recycle();
        ContentValues published=new ContentValues();published.put(MediaStore.Images.Media.IS_PENDING,0);published.put(MediaStore.Images.Media.DATE_MODIFIED,System.currentTimeMillis()/1000);context.getContentResolver().update(image,published,null,null);
        scenario=ActivityScenario.launch(MainActivity.class);
        try {
            login("android-smoke@example.test");openTask();waitFor("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Mulai Pickup')?.disabled===false");waitFor("getComputedStyle(Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Mulai Pickup')).position==='fixed'");screenshot("pickup-start-step");click("Mulai Pickup");waitFor("document.querySelector('#visit-outcome')!==null");click("Paket berhasil diambil");assertEquals("false",evaluate("document.body.textContent.includes('Hasil kunjungan disimpan.')"));click("Simpan Hasil Kunjungan");
            waitFor("document.querySelector('#qty-manual_hybrid')!==null");
            assertEquals("true",evaluate("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Lanjut ke Foto').disabled"));
            evaluate("Array.from(document.querySelectorAll('summary')).find(e=>e.textContent==='Kelola draft').click()");click("Buang Draft");
            waitFor("document.querySelector('[role=dialog]')!==null");click("Pertahankan Draft");waitFor("document.querySelector('[role=dialog]')===null");
            assertNotNull(local.read(fixtureScope,"pop-1"));
            click("Buang Draft");click("Konfirmasi Buang Draft");click("Buat Draft POP");waitFor("document.querySelector('#qty-manual_hybrid')!==null");
            assertEquals("true",evaluate("document.querySelector('button[aria-label=\"Kurangi Manual Hybrid Non-Cashless\"]').disabled"));
            fill("#qty-manual_hybrid","-1");assertEquals("true",evaluate("document.querySelector('#qty-manual_hybrid').getAttribute('aria-invalid')==='true'"));
            fill("#qty-manual_hybrid","1000001");assertEquals("true",evaluate("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Lanjut ke Foto').disabled"));
            fill("#qty-manual_hybrid","0");
            evaluate("(()=>{const b=document.querySelector('button[aria-label=\"Tambah Manual Hybrid Non-Cashless\"]');b.click();b.click();})()");waitFor("document.querySelector('#qty-manual_hybrid').value==='2'");
            fill("#qty-manual_hybrid","3");fill("#qty-cashless_hybrid","1");
            assertEquals("true",evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"));
            assertEquals("true",evaluate("document.querySelector('.quantity-controls button').getBoundingClientRect().height>=44"));
            evaluate("document.querySelector('.quantity-total').scrollIntoView({block:'center',behavior:'instant'})");
            assertEquals("true",evaluate("document.querySelector('.quantity-total').getBoundingClientRect().bottom<=document.querySelector('section[aria-label=\"Draft POP\"] .workflow-primary').getBoundingClientRect().top"));
            screenshot("pop-quantities");
            click("Lanjut ke Foto");
            assertEquals("0",evaluate("document.querySelectorAll('.proof-photo-grid img').length"));
            screenshot("pop-zero-photos");
            click("Lanjut ke Tanda Tangan");
            assertEquals("true",evaluate("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Review POP').disabled"));
            evaluate("(()=>{const c=document.querySelector('canvas');const r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:r.left+20,clientY:r.top+20}));c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));})()");
            assertEquals("true",evaluate("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Review POP').disabled"));
            click("Kembali ke Foto");
            click("Tambah Foto");click("Pilih dari Galeri");Thread.sleep(500);InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);waitFor("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Tambah Foto')?.disabled===false");
            click("Tambah Foto");click("Ambil Foto");takeCameraPhoto();waitFor("document.body.textContent.includes('Foto opsional: 1/4')");
            waitFor("document.querySelector('.proof-photo-grid img')?.naturalWidth>0");
            assertEquals("1",evaluate("document.querySelectorAll('.proof-photo-grid img').length"));
            assertEquals("true",evaluate("document.querySelector('.proof-photo-grid img').naturalWidth<=512"));
            screenshot("pop-one-photo");
            click("Preview Foto 1");waitFor("document.querySelector('.proof-photo-fullscreen img')?.naturalWidth>0");
            assertEquals("true",evaluate("getComputedStyle(document.querySelector('.proof-photo-fullscreen img')).objectFit==='contain' && document.querySelector('[role=dialog]').getBoundingClientRect().width>=innerWidth-1"));
            screenshot("pop-fullscreen");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);waitFor("document.querySelector('[role=dialog]')===null");
            assertEquals("Preview Back must preserve photo step: "+evaluate("document.body.textContent.slice(-1800)"),"true",evaluate("document.body.textContent.includes('Foto opsional: 1/4')"));
            evaluate("document.querySelector('.proof-photo-grid img').src='data:image/png;base64,invalid'");waitFor("document.body.textContent.includes('Pratinjau belum tersedia.')");
            click("Preview Foto 1");waitFor("document.querySelector('.proof-photo-fullscreen img')?.naturalWidth>0");click("Tutup Preview");
            click("Hapus Foto 1");waitFor("document.querySelector('[role=dialog]')!==null");screenshot("pop-delete-confirmation");click("Pertahankan Foto");assertEquals("true",evaluate("document.body.textContent.includes('Foto opsional: 1/4')"));
            JSONObject beforeDelete=new JSONObject(new String(local.read(fixtureScope,"pop-1"),java.nio.charset.StandardCharsets.UTF_8));String originalName=beforeDelete.getJSONArray("photos").getJSONObject(0).getString("name");
            click("Hapus Foto 1");click("Ya, Hapus Foto");waitFor("document.body.textContent.includes('Foto opsional: 0/4') && document.querySelector('[role=dialog]')===null");assertNull(local.read(fixtureScope,originalName));
            click("Tambah Foto");click("Ambil Foto");takeCameraPhoto();waitFor("document.body.textContent.includes('Foto opsional: 1/4')");
            for(int i=2;i<=4;i++){click("Tambah Foto");click("Pilih dari Galeri");selectGalleryPhoto();waitFor("document.body.textContent.includes('Foto opsional: "+i+"/4')");waitFor("document.querySelectorAll('.proof-photo-grid img').length==="+i);}
            assertEquals("false",evaluate("Array.from(document.querySelectorAll('button')).some(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Tambah Foto')"));
            assertEquals("true",evaluate("getComputedStyle(document.querySelector('.proof-photo-grid')).gridTemplateColumns.split(' ').length===2 && Array.from(document.querySelectorAll('.proof-photo-tile')).every(e=>Math.abs(e.clientWidth-e.clientHeight)<2) && document.documentElement.scrollWidth<=innerWidth+1"));
            assertEquals("false",evaluate("document.body.textContent.includes('Foto tersimpan di perangkat.')"));
            screenshot("pop-photos");click("Lanjut ke Tanda Tangan");sign();fill("#proof-notes","Native encrypted recovery");waitFor("document.body.textContent.includes('Tersimpan di perangkat')");exerciseNotesKeyboard();
            scenario.recreate();waitFor("document.querySelector('nav')!==null");openTask();waitFor("document.querySelector('canvas')!==null");
            click("Akun");click("Keluar");login("android-other@example.test");click("Akun");
            waitFor("document.body.textContent.includes('Belum ada draft tersimpan.')");
            evaluate("window.__scopeDenied=false;window.Capacitor.Plugins.MobileLocal.read({account:'1',environment:'http://127.0.0.1:8000',name:'pop-1'}).then(()=>{},()=>{window.__scopeDenied=true;})");waitFor("window.__scopeDenied===true");
            click("Keluar");login("android-smoke@example.test");openTask();waitFor("document.querySelector('#qty-manual_hybrid')?.value==='3'");click("Lanjut ke Foto");waitFor("document.body.textContent.includes('Foto opsional: 4/4')");click("Lanjut ke Tanda Tangan");
            waitFor("Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Hapus / Ganti Tanda Tangan')?.disabled===false");
            click("Kembali ke Foto");waitFor("document.body.textContent.includes('Foto opsional: 4/4')");click("Kembali ke Jumlah");waitFor("document.querySelector('#qty-manual_hybrid').value==='3'");click("Lanjut ke Foto");click("Lanjut ke Tanda Tangan");click("Review POP");
            String reviewKey=new JSONObject(new String(local.read(fixtureScope,"pop-1"),java.nio.charset.StandardCharsets.UTF_8)).getString("submissionKey");
            evaluate("document.querySelector('ol[aria-label=\"Langkah POP\"] button').click()");waitFor("document.querySelector('#qty-manual_hybrid').value==='3'");
            waitFor("document.querySelectorAll('ol[aria-label=\"Langkah POP\"] button')[3]?.disabled===false");
            evaluate("document.querySelectorAll('ol[aria-label=\"Langkah POP\"] button')[3].click()");waitFor("document.body.textContent.includes('Ringkasan POP')");
            assertEquals(reviewKey,new JSONObject(new String(local.read(fixtureScope,"pop-1"),java.nio.charset.StandardCharsets.UTF_8)).getString("submissionKey"));
            screenshot("pop-review");
            evaluate("(()=>{const original=window.fetch;let lost=false;window.fetch=async(...args)=>{const u=String(args[0]);if(u.endsWith('/proof')){await original(...args);lost=true;throw new TypeError('response lost');}if(lost&&(u.includes('/submissions/')||/pickup-tasks\\/\\d+$/.test(u)))throw new TypeError('network offline');return original(...args);};})()");
            click("Selesaikan Pickup");waitFor("document.querySelector('[role=dialog]')!==null");
            assertEquals("EDITING",new JSONObject(new String(local.read(fixtureScope,"pop-1"),java.nio.charset.StandardCharsets.UTF_8)).getString("state"));
            click("Kembali ke Review");waitFor("document.querySelector('[role=dialog]')===null");
            click("Selesaikan Pickup");screenshot("pop-confirmation");
            assertEquals("true",evaluate("(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.left>=15&&r.right<=innerWidth-15&&r.top>=15&&r.bottom<=innerHeight-15&&Math.abs((r.left+r.right)/2-innerWidth/2)<2;})()"));
            assertEquals("true",evaluate("(()=>{const d=document.querySelector('[role=dialog]');return Array.from(d.querySelectorAll('button')).every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});})()"));
            try(java.io.FileOutputStream evidence=new java.io.FileOutputStream(new java.io.File(context.getExternalFilesDir(null),"pop-confirmation.html"))){evidence.write(new org.json.JSONArray("["+evaluate("document.querySelector('[role=dialog]').outerHTML")+"]").getString(0).getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            try(java.io.InputStream evidence=new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cp "+new java.io.File(context.getExternalFilesDir(null),"pop-confirmation.html").getAbsolutePath()+" /data/local/tmp/retail-ux-pop-confirmation.html"))){while(evidence.read()!=-1){}}
            evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())==='Ya, Selesaikan Pickup');b.click();b.click();})()");
            waitFor("document.body.textContent.includes('Menunggu konfirmasi server')");
            assertEquals("false",evaluate("document.body.textContent.includes('Buang Draft')"));
            assertEquals("false",evaluate("document.querySelector('[role=dialog]')!==null"));
            scenario.recreate();waitFor("document.querySelector('nav')!==null");click("Pickup");click("Riwayat");openTask();waitFor("document.body.textContent.includes('Menunggu konfirmasi server')");assertEquals("false",evaluate("Array.from(document.querySelectorAll('h3')).some(e=>e.textContent==='Pickup selesai')"));click("Periksa Hasil POP");
            waitFor("document.body.textContent.includes('Pickup selesai') && document.body.textContent.includes('POP telah dikonfirmasi server.')");waitFor("document.querySelector('#pickup-proof-detail')?.open===false");screenshot("completion");click("Lihat Detail");waitFor("document.querySelector('#pickup-proof-detail').open===true && document.body.textContent.includes('Receipt belum dikonfigurasi')");
            evaluate("window.__draftGone=false;window.Capacitor.Plugins.MobileLocal.read({account:'1',environment:'http://127.0.0.1:8000',name:'pop-1'}).then(r=>{window.__draftGone=r.value===null;})");waitFor("window.__draftGone===true");
            evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Lihat foto')).click()");
            waitFor("document.querySelector('img[alt=\"Bukti POP privat\"]')?.naturalWidth>0");
            click("Akun");click("Keluar");waitFor("document.querySelector('#email')!==null");assertNull(vault.read());
        } finally {scenario.close();vault.clear();context.getContentResolver().delete(image,null,null);
            byte[] ticket=local.read("capture-system-v1","ticket");if(ticket!=null&&fixtureScope.equals(new JSONObject(new String(ticket,java.nio.charset.StandardCharsets.UTF_8)).optString("scope")))local.remove("capture-system-v1","ticket");
            for(String file:local.names(fixtureScope))if(file.equals("pop-1")||file.equals("pending-camera")||file.startsWith("capture-")||file.startsWith("evidence-"))local.remove(fixtureScope,file);
        }
    }
}
