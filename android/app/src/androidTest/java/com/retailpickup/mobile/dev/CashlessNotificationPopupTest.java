package com.retailpickup.mobile.dev;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CashlessNotificationPopupTest {
    @Test
    public void cashlessAttentionUsesItsChannelWithoutForegroundSystemNotification() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        if (Build.VERSION.SDK_INT >= 33) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                activity.getBridge().getWebView().loadData("<html><body>Uji notifikasi Cashless</body></html>", "text/html", "UTF-8");
                activity.getBridge().getPlugin("NotificationSettings").getInstance();
                NotificationChannel channel = manager.getNotificationChannel("cashless_processing");
                assertNotNull(channel);
                assertTrue(channel.getImportance() >= NotificationManager.IMPORTANCE_HIGH);
                assertNotNull(channel.getSound());
                assertTrue(channel.shouldVibrate());
                assertNotEquals(Notification.VISIBILITY_PUBLIC, channel.getLockscreenVisibility());
                try {
                    Class<?> builderClass = Class.forName("com.google.firebase.messaging.RemoteMessage$Builder");
                    Class<?> messageClass = Class.forName("com.google.firebase.messaging.RemoteMessage");
                    Object builder = builderClass.getConstructor(String.class).newInstance("fixture");
                    builderClass.getMethod("setMessageId", String.class).invoke(builder, "cashless-popup-fixture");
                    String[][] fields = {{"gcm.n.e", "1"}, {"gcm.n.title", "UJI NOTIFIKASI CASHLESS"},
                        {"gcm.n.body", "Uji lokal banner cashless. Tidak ada pengiriman ke server."},
                        {"gcm.n.android_channel_id", "cashless_processing"}, {"gcm.n.sound2", "retail_notification"},
                        {"gcm.n.tag", "cashless-popup-fixture"}, {"type", "cashless_entry_attention"},
                        {"task_id", "1"}, {"recipient_id", "1"}, {"event_id", "1"}, {"batch_id", "1"}};
                    for (String[] field : fields) builderClass.getMethod("addData", String.class, String.class).invoke(builder, field[0], field[1]);
                    Object message = builderClass.getMethod("build").invoke(builder);
                    assertNotNull(messageClass.getMethod("getNotification").invoke(message));
                    PushNotificationsPlugin plugin = (PushNotificationsPlugin) activity.getBridge().getPlugin("PushNotifications").getInstance();
                    plugin.getClass().getMethod("fireNotification", messageClass).invoke(plugin, message);
                } catch (ReflectiveOperationException error) {
                    throw new AssertionError(error);
                }
            });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            Thread.sleep(300);
            for (StatusBarNotification notification : manager.getActiveNotifications()) {
                assertNotEquals("Foreground cashless must stay in-app", "cashless-popup-fixture", notification.getTag());
            }
        } finally {
            for (StatusBarNotification notification : manager.getActiveNotifications()) {
                if ("cashless-popup-fixture".equals(notification.getTag())) manager.cancel(notification.getTag(), notification.getId());
            }
        }
    }
}
