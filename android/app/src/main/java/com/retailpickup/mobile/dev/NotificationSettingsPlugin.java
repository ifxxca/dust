package com.retailpickup.mobile.dev;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NotificationSettings")
public class NotificationSettingsPlugin extends Plugin {
    private static final String CHANNEL = "cashless_processing";

    @Override
    public void load() {
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Pemrosesan Cashless", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Hasil pemrosesan cashless yang perlu diperiksa.");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        channel.setSound(Uri.parse("android.resource://" + getContext().getPackageName() + "/" + R.raw.retail_notification),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        manager.createNotificationChannel(channel);
    }

    @PluginMethod
    public void status(PluginCall call) {
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
        call.resolve(new JSObject().put("enabled", manager.areNotificationsEnabled())
            .put("highImportance", channel != null && channel.getImportance() >= NotificationManager.IMPORTANCE_HIGH)
            .put("sound", channel != null && channel.getSound() != null));
    }

    @PluginMethod
    public void open(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                NotificationManager manager = getContext().getSystemService(NotificationManager.class);
                Intent settings = new Intent(manager.areNotificationsEnabled() ? Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS : Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                settings.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                settings.putExtra(Settings.EXTRA_CHANNEL_ID, CHANNEL);
                getActivity().startActivity(settings);
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Buka Pengaturan Android > Aplikasi > Retail Pickup > Notifikasi secara manual.");
            }
        });
    }
}
