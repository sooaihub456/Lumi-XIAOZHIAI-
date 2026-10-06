package app.mori.companion;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;


@CapacitorPlugin(name = "MoriUtilities")
public class MoriUtilitiesPlugin extends Plugin {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 7421;

    @PluginMethod
    public void openNavigation(PluginCall call) {
        String destination = call.getString("destination", "").trim();
        if (destination.isEmpty() || destination.length() > 300) {
            call.reject("Enter a valid destination.");
            return;
        }
        try {
            Activity activity = getActivity();
            Uri googleNavigation = Uri.parse("google.navigation:q=" + Uri.encode(destination));
            Intent intent = new Intent(Intent.ACTION_VIEW, googleNavigation);
            intent.setPackage("com.google.android.apps.maps");
            if (intent.resolveActivity(activity.getPackageManager()) == null) {
                Uri geo = Uri.parse("geo:0,0?q=" + Uri.encode(destination));
                intent = new Intent(Intent.ACTION_VIEW, geo);
            }
            if (intent.resolveActivity(activity.getPackageManager()) == null) {
                Uri web = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=" + Uri.encode(destination));
                intent = new Intent(Intent.ACTION_VIEW, web);
            }
            activity.startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("target", destination);
            call.resolve(result);
        } catch (Throwable throwable) {
            call.reject("Could not open navigation: " + cleanMessage(throwable));
        }
    }

    @PluginMethod
    public void scheduleDailyReminder(PluginCall call) {
        Integer id = call.getInt("id");
        String title = call.getString("title", "").trim();
        String time = call.getString("time", "").trim();
        if (id == null || id <= 0 || title.isEmpty() || title.length() > 140 || !time.matches("\\d{2}:\\d{2}")) {
            call.reject("Invalid daily reminder.");
            return;
        }
        String[] parts = time.split(":", 2);
        int hour;
        int minute;
        try {
            hour = Integer.parseInt(parts[0]);
            minute = Integer.parseInt(parts[1]);
        } catch (NumberFormatException error) {
            call.reject("Invalid reminder time.");
            return;
        }
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            call.reject("Invalid reminder time.");
            return;
        }

        boolean requestedPermission = false;
        if (Build.VERSION.SDK_INT >= 33 && getActivity().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestedPermission = true;
            getActivity().requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, NOTIFICATION_PERMISSION_REQUEST);
        }

        try {
            MoriReminderReceiver.schedule(getContext(), id, title, hour, minute);
            JSObject result = new JSObject();
            result.put("scheduled", true);
            result.put("permissionRequested", requestedPermission);
            call.resolve(result);
        } catch (Throwable throwable) {
            call.reject("Could not schedule the reminder: " + cleanMessage(throwable));
        }
    }

    @PluginMethod
    public void cancelReminder(PluginCall call) {
        Integer id = call.getInt("id");
        if (id == null || id <= 0) {
            call.reject("Invalid reminder id.");
            return;
        }
        try {
            Intent intent = new Intent(getContext(), MoriReminderReceiver.class);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                getContext(), id, intent, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );
            if (pendingIntent != null) {
                AlarmManager alarms = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
                if (alarms != null) alarms.cancel(pendingIntent);
                pendingIntent.cancel();
            }
            JSObject result = new JSObject();
            result.put("cancelled", true);
            call.resolve(result);
        } catch (Throwable throwable) {
            call.reject("Could not cancel the reminder: " + cleanMessage(throwable));
        }
    }

    private static String cleanMessage(Throwable throwable) {
        if (throwable == null) return "unknown error";
        String message = throwable.getMessage();
        if (message == null || message.trim().isEmpty()) message = throwable.getClass().getSimpleName();
        message = message.replace('\r', ' ').replace('\n', ' ').trim();
        return message.length() > 180 ? message.substring(0, 180) + "…" : message;
    }
}
