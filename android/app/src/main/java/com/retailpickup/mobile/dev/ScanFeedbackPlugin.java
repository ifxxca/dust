package com.retailpickup.mobile.dev;

import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScanFeedback")
public class ScanFeedbackPlugin extends Plugin {
    private final Handler feedbackHandler = new Handler(Looper.getMainLooper());
    private ToneGenerator activeTone;

    @Override
    public void load() {
        getActivity().runOnUiThread(this::prepareTone);
    }

    @PluginMethod
    public void success(PluginCall call) { feedback(call, "success"); }
    @PluginMethod
    public void error(PluginCall call) { feedback(call, "error"); }
    @PluginMethod
    public void duplicate(PluginCall call) { feedback(call, "duplicate"); }
    @PluginMethod
    public void accepted(PluginCall call) { feedback(call, "accepted"); }
    @PluginMethod
    public void vibration(PluginCall call) { feedback(call, "vibration"); }

    private void feedback(PluginCall call, String kind) {
        getActivity().runOnUiThread(() -> {
            if (!getActivity().hasWindowFocus()) {
                call.resolve();
                return;
            }
            if (Boolean.TRUE.equals(call.getBoolean("vibration", true))) {
                try {
                    Vibrator vibrator;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        VibratorManager manager = getContext().getSystemService(VibratorManager.class);
                        vibrator = manager == null ? null : manager.getDefaultVibrator();
                    } else vibrator = getContext().getSystemService(Vibrator.class);
                    boolean enabled = Settings.System.getInt(getContext().getContentResolver(), Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) != 0;
                    if (enabled && vibrator != null && vibrator.hasVibrator()) {
                        if (kind.equals("error")) vibrator.vibrate(VibrationEffect.createWaveform(new long[] {0, 150, 80, 150}, -1));
                        else if (kind.equals("duplicate")) vibrator.vibrate(VibrationEffect.createWaveform(new long[] {0, 35, 45, 35}, -1));
                        else vibrator.vibrate(VibrationEffect.createOneShot(kind.equals("accepted") ? 25 : 70, VibrationEffect.DEFAULT_AMPLITUDE));
                    }
                } catch (RuntimeException ignored) {
                    // Visual feedback remains available without haptics.
                }
            }
            if (Boolean.TRUE.equals(call.getBoolean("sound", true)) && !kind.equals("accepted") && !kind.equals("vibration")) {
                try {
                    AudioManager audio = getContext().getSystemService(AudioManager.class);
                    if (audio != null && audio.getRingerMode() == AudioManager.RINGER_MODE_NORMAL && audio.getStreamVolume(AudioManager.STREAM_MUSIC) > 0) {
                        feedbackHandler.removeCallbacksAndMessages(null);
                        prepareTone();
                        if (activeTone != null) {
                            activeTone.stopTone();
                            activeTone.startTone(kind.equals("error") ? ToneGenerator.TONE_PROP_NACK : kind.equals("duplicate") ? ToneGenerator.TONE_PROP_ACK : ToneGenerator.TONE_PROP_BEEP,
                                kind.equals("duplicate") ? 60 : 140);
                            if (kind.equals("error")) feedbackHandler.postDelayed(() -> {
                                try {
                                    if (activeTone != null) activeTone.startTone(ToneGenerator.TONE_PROP_NACK, 140);
                                } catch (RuntimeException ignored) {
                                    // A disappearing audio route must not interrupt scanning.
                                }
                            }, 220);
                        }
                    }
                } catch (RuntimeException ignored) {
                    // Respect system audio routing, volume, ringer and DND restrictions.
                }
            }
            call.resolve();
        });
    }

    private void prepareTone() {
        if (activeTone == null) {
            try { activeTone = new ToneGenerator(AudioManager.STREAM_MUSIC, 85); }
            catch (RuntimeException ignored) { /* Visual feedback remains available. */ }
        }
    }

    @Override
    protected void handleOnPause() {
        feedbackHandler.removeCallbacksAndMessages(null);
        if (activeTone != null) activeTone.stopTone();
        super.handleOnPause();
    }

    @Override
    protected void handleOnDestroy() {
        feedbackHandler.removeCallbacksAndMessages(null);
        if (activeTone != null) { activeTone.release(); activeTone = null; }
        super.handleOnDestroy();
    }
}
