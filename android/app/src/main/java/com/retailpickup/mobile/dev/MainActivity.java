package com.retailpickup.mobile.dev;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureSessionPlugin.class);
        registerPlugin(MobileLocalPlugin.class);
        registerPlugin(ScanFeedbackPlugin.class);
        super.onCreate(savedInstanceState);
        boolean debug=(getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0;
        android.webkit.WebView.setWebContentsDebuggingEnabled(debug);
        getBridge().getWebView().getSettings().setMixedContentMode(debug ? android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW : android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    }
}
