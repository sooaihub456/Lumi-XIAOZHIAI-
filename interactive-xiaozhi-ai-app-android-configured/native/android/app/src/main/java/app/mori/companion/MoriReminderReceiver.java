package app.mori.companion;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.Calendar;

public class MoriReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "lumi_daily_reminders";
    private static final String EXTRA_ID = "mori_reminder_id";
    private static final String EXTRA_TITLE = "mori_reminder_title";
    private static final String EXTRA_HOUR = "mori_reminder_hour";
    private static final String EXTRA_MINUTE = "mori_reminder_minute";

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra(EXTRA_ID, 0);
        String title = intent.getStringExtra(EXTRA_TITLE);
        int hour = intent.getIntExtra(EXTRA_HOUR, 8);
        int minute = intent.getIntExtra(EXTRA_MINUTE, 0);
        if (id <= 0 || title == null || title.trim().isEmpty()) return;

        showNotification(context, id, title.trim());
        // Reschedule from the receiver instead of relying on exact repeating
        // alarms. Android may batch it slightly while the phone is idle.
        schedule(context, id, title.trim(), hour, minute);
    }

    static void schedule(Context context, int id, String title, int hour, int minute) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) throw new IllegalStateException("Android alarm service is unavailable");

        Calendar when = Calendar.getInstance();
        when.set(Calendar.HOUR_OF_DAY, hour);
        when.set(Calendar.MINUTE, minute);
        when.set(Calendar.SECOND, 0);
        when.set(Calendar.MILLISECOND, 0);
        if (when.getTimeInMillis() <= System.currentTimeMillis()) when.add(Calendar.DAY_OF_YEAR, 1);

        Intent intent = new Intent(context, MoriReminderReceiver.class);
        intent.putExtra(EXTRA_ID, id);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_HOUR, hour);
        intent.putExtra(EXTRA_MINUTE, minute);
        PendingIntent pending = PendingIntent.getBroadcast(
            context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when.getTimeInMillis(), pending);
    }

    private static void showNotification(Context context, int id, String title) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Lumi daily reminders", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Daily reminders created with Lumi");
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.mori_mark)
            .setContentTitle("Lumi reminder")
            .setContentText(title)
            .setContentIntent(openPending)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PRIVATE);
        manager.notify(id, builder.build());
    }
}
