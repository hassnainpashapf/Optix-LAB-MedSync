package com.optix.labmedsync.smsgateway;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Capacitor bridge for the Optix SMS gateway.
 *
 * The web app (running in this app's WebView) calls setEnabled(true) with the
 * current API base URL + session token; the plugin then runs SmsGatewayService,
 * a foreground service that polls the server's SMS outbox every ~60 seconds
 * and sends each message from the phone's SIM via SmsManager.
 */
@CapacitorPlugin(
        name = "SmsGateway",
        permissions = {
                @Permission(strings = { Manifest.permission.SEND_SMS }, alias = "sms")
        }
)
public class SmsGatewayPlugin extends Plugin {

    static final String PREFS = "optix_sms_gateway";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean hasSmsPermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.SEND_SMS)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * setEnabled({ enabled, apiBase, token })
     * Persists the config, then starts/stops the foreground polling service.
     * If enabling without the SEND_SMS permission, the permission is requested
     * first and the service starts once granted.
     */
    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        String apiBase = call.getString("apiBase", "");
        String token = call.getString("token", "");
        prefs().edit()
                .putBoolean("enabled", enabled)
                .putString("apiBase", apiBase)
                .putString("token", token)
                .apply();
        if (enabled) {
            if (hasSmsPermission()) {
                startService();
                call.resolve();
            } else {
                requestPermissionForAlias("sms", call, "onPermissionResult");
            }
        } else {
            stopService();
            call.resolve();
        }
    }

    @PermissionCallback
    private void onPermissionResult(PluginCall call) {
        boolean wantOn = prefs().getBoolean("enabled", false);
        JSObject r = new JSObject();
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            if (wantOn) startService();
            r.put("granted", true);
        } else {
            prefs().edit().putBoolean("enabled", false).apply();
            r.put("granted", false);
        }
        call.resolve(r);
    }

    /** getStatus() -> { enabled, lastPoll, lastSentAt, sentCount, permission } */
    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject r = new JSObject();
        r.put("enabled", p.getBoolean("enabled", false));
        r.put("lastPoll", p.getString("lastPoll", ""));
        r.put("lastSentAt", p.getString("lastSentAt", ""));
        r.put("sentCount", p.getInt("sentCount", 0));
        r.put("permission", hasSmsPermission());
        call.resolve(r);
    }

    /** Ask for SEND_SMS at runtime (also reachable from the settings card). */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasSmsPermission()) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("sms", call, "onPermissionResult");
    }

    /** Open this app's system settings page (for the Unrestricted-battery step). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(android.net.Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    private void startService() {
        Context ctx = getContext();
        Intent i = new Intent(ctx, SmsGatewayService.class);
        i.setAction(SmsGatewayService.ACTION_START);
        ContextCompat.startForegroundService(ctx, i);
    }

    private void stopService() {
        Context ctx = getContext();
        Intent i = new Intent(ctx, SmsGatewayService.class);
        i.setAction(SmsGatewayService.ACTION_STOP);
        ctx.startService(i);
    }
}
