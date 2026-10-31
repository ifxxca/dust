package com.retailpickup.mobile.dev;

import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScanFeedback")
public class ScanFeedbackPlugin extends Plugin {
    @PluginMethod
    public void success(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getBridge().getWebView().performHapticFeedback(
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                        ? HapticFeedbackConstants.CONFIRM
                        : HapticFeedbackConstants.VIRTUAL_KEY
                );
            } catch (RuntimeException ignored) {
                // A device without haptics must still record the scan and play its tone.
            }
            try {
                ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_MUSIC, 70);
                new Handler(Looper.getMainLooper()).postDelayed(tone::release, 200);
                tone.startTone(ToneGenerator.TONE_PROP_BEEP, 100);
            } catch (RuntimeException ignored) {
                // Respect unavailable audio without turning a saved scan into a failure.
            }
            call.resolve();
        });
    }
}
