package com.optix.labmedsync.smsgateway;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.content.ContextCompat;

/**
 * Restarts the SMS gateway service after a reboot if it was left ON.
 * (SEND_SMS runtime permission survives reboots, so no user action is needed.)
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            SharedPreferences p = context.getSharedPreferences(SmsGatewayPlugin.PREFS, Context.MODE_PRIVATE);
            if (p.getBoolean("enabled", false)) {
                Intent i = new Intent(context, SmsGatewayService.class);
                i.setAction(SmsGatewayService.ACTION_START);
                ContextCompat.startForegroundService(context, i);
            }
        }
    }
}
