package com.retailpickup.mobile.dev;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class MobileLocalStoreTest {
    @Test public void backendOffsetTimestampCompatibilityDiagnostic() throws Exception {
        assertEquals(java.time.Instant.parse("2026-10-14T17:34:18Z"), MobileLocalPlugin.sessionExpiry("2026-10-14T17:34:18+00:00"));
        assertEquals(java.time.Instant.parse("2026-10-14T17:34:18Z"), MobileLocalPlugin.sessionExpiry("2026-10-15T00:34:18+07:00"));
        try { MobileLocalPlugin.sessionExpiry("invalid"); fail("Invalid expiry must not unlock local data"); }
        catch (java.time.DateTimeException expected) { assertNotNull(expected); }
    }
    @Test public void failedRestoredCaptureKeepsOriginalAccountContextAndDoesNotBlockNextAccount() throws Exception {
        org.junit.Assume.assumeTrue("Disposable mobile fixtures required", "true".equals(InstrumentationRegistry.getArguments().getString("mobileSmoke")));
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();SecureSessionStore vault=new SecureSessionStore(context);vault.clear();MobileLocalStore local=new MobileLocalStore(context);
        String environment="http://127.0.0.1:8000",first=environment+":10001",second=environment+":10002",operation="10000000-0000-4000-8000-000000000001",next="10000000-0000-4000-8000-000000000002";
        try(androidx.test.core.app.ActivityScenario<MainActivity> scenario=androidx.test.core.app.ActivityScenario.launch(MainActivity.class)) {
            Thread.sleep(1200);
            org.json.JSONObject session=new org.json.JSONObject().put("token","test-only-local-vault").put("user",new org.json.JSONObject().put("id",10001)).put("environment",environment).put("locked",false).put("expiresAt","2035-01-01T00:00:00Z");vault.write(session);
            evaluate(scenario,"window.__captureReady=false;window.Capacitor.Plugins.MobileLocal.beginCapture({account:'10001',environment:'"+environment+"',name:'evidence-test-capture',taskId:10001,draftId:'test',operationId:'"+operation+"',method:'chooseFromGallery'}).then(()=>window.__captureReady=true)");awaitTrue(scenario,"window.__captureReady");
            vault.clear();session.getJSONObject("user").put("id",10002);vault.write(session);
            evaluate(scenario,"window.__failureSaved=false;window.Capacitor.Plugins.MobileLocal.captureFailure({method:'chooseFromGallery'}).then(()=>window.__failureSaved=true)");awaitTrue(scenario,"window.__failureSaved");
            org.json.JSONObject ticket=new org.json.JSONObject(new String(local.read(first,"capture-"+operation),StandardCharsets.UTF_8));assertEquals(first,ticket.getString("scope"));assertEquals("FAILED",ticket.getString("phase"));
            evaluate(scenario,"window.__denied=false;window.Capacitor.Plugins.MobileLocal.read({account:'10001',environment:'"+environment+"',name:'capture-"+operation+"'}).catch(()=>window.__denied=true)");awaitTrue(scenario,"window.__denied");
            evaluate(scenario,"window.__nextReady=false;window.Capacitor.Plugins.MobileLocal.beginCapture({account:'10002',environment:'"+environment+"',name:'evidence-next-capture',taskId:10002,draftId:'next',operationId:'"+next+"',method:'chooseFromGallery'}).then(()=>window.__nextReady=true)");awaitTrue(scenario,"window.__nextReady");assertNotNull(local.read(first,"capture-"+operation));
        } finally {
            for(String scope:new String[]{first,second})for(String file:local.names(scope))local.remove(scope,file);
            byte[] bytes=local.read("capture-system-v1","ticket");if(bytes!=null){String owner=new org.json.JSONObject(new String(bytes,StandardCharsets.UTF_8)).optString("scope");if(owner.equals(first)||owner.equals(second))local.remove("capture-system-v1","ticket");}vault.clear();
        }
    }
    private String evaluate(androidx.test.core.app.ActivityScenario<MainActivity> scenario,String expression)throws Exception {
        java.util.concurrent.CountDownLatch done=new java.util.concurrent.CountDownLatch(1);java.util.concurrent.atomic.AtomicReference<String> result=new java.util.concurrent.atomic.AtomicReference<>();scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript(expression,value->{result.set(value);done.countDown();}));assertTrue(done.await(10,java.util.concurrent.TimeUnit.SECONDS));return result.get();
    }
    private void awaitTrue(androidx.test.core.app.ActivityScenario<MainActivity> scenario,String condition)throws Exception{for(int i=0;i<50;i++){if("true".equals(evaluate(scenario,condition)))return;Thread.sleep(100);}fail("Native capture context did not complete: "+condition);}
    @Test public void previewBridgeKeepsOriginalAndRejectsWrongHashAccountEnvironmentAndLockedSession() throws Exception {
        org.junit.Assume.assumeTrue("Disposable mobile fixtures required", "true".equals(InstrumentationRegistry.getArguments().getString("mobileSmoke")));
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        SecureSessionStore vault=new SecureSessionStore(context);vault.clear();MobileLocalStore local=new MobileLocalStore(context);
        String environment="http://127.0.0.1:8000",scope=environment+":10007",name="evidence-preview-bridge";
        android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(1200,800,android.graphics.Bitmap.Config.ARGB_8888);bitmap.eraseColor(android.graphics.Color.BLUE);
        java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG,90,output);bitmap.recycle();byte[] original=output.toByteArray();
        StringBuilder hash=new StringBuilder();for(byte value:java.security.MessageDigest.getInstance("SHA-256").digest(original))hash.append(String.format("%02x",value));
        local.write(scope,name,original);
        org.json.JSONObject session=new org.json.JSONObject().put("token","preview-fixture-only").put("locked",false).put("expiresAt","2035-01-01T00:00:00Z").put("environment",environment).put("user",new org.json.JSONObject().put("id",10007));
        String options="{account:'10007',environment:'"+environment+"',name:'"+name+"',sha256:'"+hash+"',size:'thumbnail'}";
        try(androidx.test.core.app.ActivityScenario<MainActivity> scenario=androidx.test.core.app.ActivityScenario.launch(MainActivity.class)){
            awaitTrue(scenario,"document.querySelector('#email')!==null");vault.write(session);
            evaluate(scenario,"window.__previewOk=false;window.Capacitor.Plugins.MobileLocal.preview("+options+").then(p=>window.__previewOk=p.width===300&&p.height===200&&p.mime==='image/jpeg'&&p.base64.length>0)");awaitTrue(scenario,"window.__previewOk");
            for(String denied:new String[]{options.replace(hash.toString(),"0".repeat(64)),options.replace("account:'10007'","account:'10008'"),options.replace(environment,"https://other.invalid")}){
                evaluate(scenario,"window.__previewDenied=false;window.Capacitor.Plugins.MobileLocal.preview("+denied+").catch(()=>window.__previewDenied=true)");awaitTrue(scenario,"window.__previewDenied");
            }
            session.put("locked",true);vault.write(session);
            evaluate(scenario,"window.__previewLocked=false;window.Capacitor.Plugins.MobileLocal.preview("+options+").catch(e=>window.__previewLocked=e.code==='LOCAL_SESSION_LOCKED')");awaitTrue(scenario,"window.__previewLocked");
            assertArrayEquals(original,local.read(scope,name));
        }finally{local.remove(scope,name);vault.clear();}
    }
    @Test public void serverOffsetSessionReadsPriorDraftAndRejectsInvalidExpiredOrOtherAccount() throws Exception {
        org.junit.Assume.assumeTrue("Disposable mobile fixtures required", "true".equals(InstrumentationRegistry.getArguments().getString("mobileSmoke")));
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        SecureSessionStore vault=new SecureSessionStore(context);MobileLocalStore local=new MobileLocalStore(context);
        String environment="https://offset-test.invalid",scope=environment+":10005";
        org.json.JSONObject session=new org.json.JSONObject().put("token","native-fixture-only").put("locked",false).put("expiresAt",java.time.Instant.now().plusSeconds(3600).toString().replace("Z","+00:00")).put("environment",environment).put("user",new org.json.JSONObject().put("id",10005));
        local.write(scope,"prior-draft","retained".getBytes(StandardCharsets.UTF_8));vault.clear();
        try(androidx.test.core.app.ActivityScenario<MainActivity> scenario=androidx.test.core.app.ActivityScenario.launch(MainActivity.class)){
            awaitTrue(scenario,"document.querySelector('#email')!==null");vault.write(session);
            evaluate(scenario,"window.__offsetRead=false;window.Capacitor.Plugins.MobileLocal.read({account:'10005',environment:'"+environment+"',name:'prior-draft'}).then(v=>window.__offsetRead=v.value==='retained')");awaitTrue(scenario,"window.__offsetRead");
            evaluate(scenario,"window.__offsetDenied=false;window.Capacitor.Plugins.MobileLocal.read({account:'10006',environment:'"+environment+"',name:'prior-draft'}).catch(e=>window.__offsetDenied=e.code==='LOCAL_SCOPE_DENIED')");awaitTrue(scenario,"window.__offsetDenied");
            session.put("expiresAt","invalid");vault.write(session);
            evaluate(scenario,"window.__offsetInvalid=false;window.Capacitor.Plugins.MobileLocal.read({account:'10005',environment:'"+environment+"',name:'prior-draft'}).catch(e=>window.__offsetInvalid=e.code==='LOCAL_SESSION_INVALID')");awaitTrue(scenario,"window.__offsetInvalid");
            session.put("expiresAt",java.time.Instant.now().minusSeconds(30).toString().replace("Z","+00:00"));vault.write(session);
            evaluate(scenario,"window.__offsetExpired=false;window.Capacitor.Plugins.MobileLocal.read({account:'10005',environment:'"+environment+"',name:'prior-draft'}).catch(e=>window.__offsetExpired=e.code==='LOCAL_SESSION_LOCKED')");awaitTrue(scenario,"window.__offsetExpired");
            assertEquals("retained",new String(local.read(scope,"prior-draft"),StandardCharsets.UTF_8));
        }finally{local.remove(scope,"prior-draft");vault.clear();}
    }
    @Test public void ciphertextRejectsTamperingAndFileSubstitution() throws Exception {
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        MobileLocalStore local=new MobileLocalStore(context);String scope="test-environment:10004";
        StringBuilder hash=new StringBuilder();for(byte value:java.security.MessageDigest.getInstance("SHA-256").digest(scope.getBytes(StandardCharsets.UTF_8)))hash.append(String.format("%02x",value));
        java.io.File directory=new java.io.File(context.getNoBackupFilesDir(),"mobile-local-v1/"+hash);
        java.io.File source=new java.io.File(directory,"test-secret.enc"),copy=new java.io.File(directory,"test-copy.enc");
        try {
            local.write(scope,"test-secret","private evidence plaintext".getBytes(StandardCharsets.UTF_8));
            byte[] encrypted=java.nio.file.Files.readAllBytes(source.toPath());
            assertFalse(new String(encrypted,StandardCharsets.UTF_8).contains("private evidence plaintext"));
            java.nio.file.Files.write(copy.toPath(),encrypted);
            try {local.read(scope,"test-copy");fail("AAD must reject substituted files");}catch(java.security.GeneralSecurityException expected){}
            encrypted[encrypted.length-1]^=1;java.nio.file.Files.write(source.toPath(),encrypted);
            try {local.read(scope,"test-secret");fail("GCM must reject tampering");}catch(java.security.GeneralSecurityException expected){}
            assertTrue(source.exists());
        } finally {local.remove(scope,"test-secret");local.remove(scope,"test-copy");}
    }
    @Test public void recoverySurvivesSessionLogoutAndIsolatesAccountAndEnvironment() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        MobileLocalStore local = new MobileLocalStore(context);
        String scope = "test-environment:10001";
        try {
            local.write(scope, "test-operation", "private draft".getBytes(StandardCharsets.UTF_8));
            new SecureSessionStore(context).clear();
            assertEquals("private draft", new String(new MobileLocalStore(context).read(scope, "test-operation"), StandardCharsets.UTF_8));
            assertNull(local.read("test-environment:10002", "test-operation"));
            assertNull(local.read("other-environment:10001", "test-operation"));
        } finally { local.remove(scope, "test-operation"); }
    }
    @Test public void quotaFailureDoesNotOverwriteSavedData() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        MobileLocalStore local = new MobileLocalStore(context);
        String scope = "test-environment:10003";
        try {
            local.write(scope, "test-quota", "saved".getBytes(StandardCharsets.UTF_8));
            try { new MobileLocalStore(context, 1).write(scope, "test-quota", "replacement".getBytes(StandardCharsets.UTF_8)); fail("Quota must fail"); }
            catch (java.io.IOException expected) { assertEquals("LOCAL_QUOTA_EXCEEDED", expected.getMessage()); }
            assertEquals("saved", new String(local.read(scope, "test-quota"), StandardCharsets.UTF_8));
        } finally { local.remove(scope, "test-quota"); }
    }
}
