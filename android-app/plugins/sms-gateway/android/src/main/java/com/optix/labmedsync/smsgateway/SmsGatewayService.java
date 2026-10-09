package com.optix.labmedsync.smsgateway;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.telephony.SmsManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Foreground service that turns the phone into the lab's SMS gateway.
 *
 * Every ~60 seconds it GETs {apiBase}/api/sms/pending (lab login Bearer token),
 * sends each claimed message with SmsManager (multipart when long, per-part
 * sent/delivered tracking), and POSTs the outcome to {apiBase}/api/sms/report.
 * A persistent notification shows the gateway is active.
 */
public class SmsGatewayService extends Service {

    static final String ACTION_START = "com.optix.labmedsync.smsgateway.START";
    static final String ACTION_STOP = "com.optix.labmedsync.smsgateway.STOP";

    private static final String CHANNEL = "optix_sms_gateway";
    private static final int NOTIF_ID = 4121;
    private static final long POLL_MS = 60_000;
    private static final int HTTP_TIMEOUT_MS = 20_000;

    private volatile boolean running = false;
    private Thread worker;

    // ------------------------------------------------------------------ lifecycle

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopLoop();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) {
            running = true;
            startForegroundCompat(buildNotification("Starting…"));
            worker = new Thread(this::loop, "optix-sms-gateway");
            worker.start();
        } else {
            updateNotification("Active");
        }
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopLoop();
        super.onDestroy();
    }

    private void stopLoop() {
        running = false;
        if (worker != null) {
            worker.interrupt();
            worker = null;
        }
        try {
            stopForeground(true);
        } catch (Exception ignored) { /* already stopped */ }
    }

    // ------------------------------------------------------------------ poll loop

    private void loop() {
        while (running) {
            try {
                pollOnce();
            } catch (Exception ignored) {
                // keep the loop alive; next poll in 60s
            }
            try {
                Thread.sleep(POLL_MS);
            } catch (InterruptedException ie) {
                break;
            }
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(SmsGatewayPlugin.PREFS, MODE_PRIVATE);
    }

    private void pollOnce() {
        SharedPreferences p = prefs();
        if (!p.getBoolean("enabled", false)) return;
        String apiBase = p.getString("apiBase", "");
        String token = p.getString("token", "");
        if (apiBase.isEmpty() || token.isEmpty()) return;

        String body;
        try {
            body = httpGet(apiBase + "/api/sms/pending", token);
        } catch (HttpError he) {
            if (he.code == 401 || he.code == 403) {
                // session expired: stand down; the user re-enables after logging in again
                p.edit().putBoolean("enabled", false).apply();
                stopLoop();
                stopSelf();
            }
            return;
        } catch (Exception e) {
            return; // network down: try again next poll
        }

        int sent = 0;
        try {
            JSONObject j = new JSONObject(body);
            if (!j.optBoolean("ok", false)) return;
            JSONArray rows = j.optJSONArray("rows");
            if (rows != null) {
                for (int i = 0; i < rows.length() && running; i++) {
                    JSONObject r = rows.getJSONObject(i);
                    String id = r.optString("id");
                    String to = r.optString("to");
                    String text = r.optString("text");
                    SendResult res = sendSms(id, to, text);
                    report(id, res.status, res.error, apiBase, token);
                    if ("sent".equals(res.status) || "delivered".equals(res.status)) sent++;
                }
            }
        } catch (Exception ignored) { /* malformed payload: skip */ }

        String now = isoNow();
        SharedPreferences.Editor e = p.edit().putString("lastPoll", now);
        if (sent > 0) {
            e.putString("lastSentAt", now);
            e.putInt("sentCount", p.getInt("sentCount", 0) + sent);
        }
        e.apply();
        updateNotification(sent > 0 ? sent + " sent · last check " + now : "Last check " + now);
    }

    // ------------------------------------------------------------------ sending

    private static final class SendResult {
        final String status; // sent | delivered | failed
        final String error;
        SendResult(String s, String e) { status = s; error = e; }
    }

    private SendResult sendSms(String id, String to, String text) {
        if (to == null || to.isEmpty() || text == null || text.isEmpty() || id == null) {
            return new SendResult("failed", "empty destination or text");
        }
        final SmsManager sm;
        try {
            if (Build.VERSION.SDK_INT >= 31) sm = getSystemService(SmsManager.class);
            else sm = SmsManager.getDefault();
        } catch (Exception e) {
            return new SendResult("failed", "SmsManager unavailable");
        }
        ArrayList<String> parts;
        try {
            parts = sm.divideMessage(text);
        } catch (Exception e) {
            return new SendResult("failed", "cannot encode message");
        }
        final int n = Math.max(parts.size(), 1);
        final CountDownLatch latch = new CountDownLatch(n * 2); // sent + delivered per part
        final AtomicInteger sentOk = new AtomicInteger(0);
        final AtomicInteger deliveredOk = new AtomicInteger(0);
        final AtomicReference<String> failReason = new AtomicReference<>(null);

        ArrayList<PendingIntent> sentPIs = new ArrayList<>(n);
        ArrayList<PendingIntent> delPIs = new ArrayList<>(n);
        ArrayList<BroadcastReceiver> receivers = new ArrayList<>(n);
        ArrayList<String> sentActions = new ArrayList<>(n);
        ArrayList<String> delActions = new ArrayList<>(n);
        int reqBase = (id.hashCode() & 0x00ffffff);
        try {
            for (int i = 0; i < n; i++) {
                final String sentAct = "com.optix.labmedsync.smsgateway.SENT_" + reqBase + "_" + i;
                final String delAct = "com.optix.labmedsync.smsgateway.DELIVERED_" + reqBase + "_" + i;
                sentActions.add(sentAct);
                delActions.add(delAct);
                sentPIs.add(PendingIntent.getBroadcast(this, reqBase + i,
                        new Intent(sentAct), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
                delPIs.add(PendingIntent.getBroadcast(this, reqBase + 100000 + i,
                        new Intent(delAct), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
                BroadcastReceiver r = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context ctx, Intent intent) {
                        String act = intent.getAction();
                        if (sentAct.equals(act)) {
                            if (getResultCode() == Activity.RESULT_OK) sentOk.incrementAndGet();
                            else failReason.compareAndSet(null, "carrier rejected part (code " + getResultCode() + ")");
                            latch.countDown();
                        } else if (delAct.equals(act)) {
                            if (getResultCode() == Activity.RESULT_OK) deliveredOk.incrementAndGet();
                            latch.countDown();
                        }
                    }
                };
                receivers.add(r);
                IntentFilter f = new IntentFilter();
                f.addAction(sentAct);
                f.addAction(delAct);
                if (Build.VERSION.SDK_INT >= 33) registerReceiver(r, f, Context.RECEIVER_NOT_EXPORTED);
                else registerReceiver(r, f);
            }
            if (n > 1) sm.sendMultipartTextMessage(to, null, parts, sentPIs, delPIs);
            else sm.sendTextMessage(to, null, text, sentPIs.get(0), delPIs.get(0));
            latch.await(90, TimeUnit.SECONDS);
        } catch (SecurityException se) {
            return new SendResult("failed", "SEND_SMS permission missing");
        } catch (Exception e) {
            return new SendResult("failed", e.getMessage() != null ? e.getMessage() : "send error");
        } finally {
            for (BroadcastReceiver r : receivers) {
                try { unregisterReceiver(r); } catch (Exception ignored) { /* already gone */ }
            }
        }
        if (sentOk.get() == n) {
            return new SendResult(deliveredOk.get() == n ? "delivered" : "sent", null);
        }
        String reason = failReason.get();
        return new SendResult("failed", reason != null ? reason : "not all parts were sent");
    }

    private void report(String id, String status, String error, String apiBase, String token) {
        try {
            JSONObject b = new JSONObject();
            b.put("id", id);
            b.put("status", status);
            if (error != null) b.put("error", error);
            httpPost(apiBase + "/api/sms/report", token, b);
        } catch (Exception ignored) { /* reported next poll via stale claim release */ }
    }

    // ------------------------------------------------------------------ http

    private static final class HttpError extends Exception {
        final int code;
        HttpError(int c, String m) { super(m); code = c; }
    }

    private String httpGet(String url, String token) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod("GET");
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setConnectTimeout(HTTP_TIMEOUT_MS);
        c.setReadTimeout(HTTP_TIMEOUT_MS);
        int code = c.getResponseCode();
        if (code == 401 || code == 403) throw new HttpError(code, "auth");
        String body = readAll(code < 400 ? c.getInputStream() : c.getErrorStream());
        if (code < 200 || code >= 300) throw new HttpError(code, body);
        return body;
    }

    private String httpPost(String url, String token, JSONObject body) throws Exception {
        byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setRequestProperty("Content-Type", "application/json");
        c.setConnectTimeout(HTTP_TIMEOUT_MS);
        c.setReadTimeout(HTTP_TIMEOUT_MS);
        try (OutputStream os = c.getOutputStream()) {
            os.write(data);
        }
        int code = c.getResponseCode();
        if (code == 401 || code == 403) throw new HttpError(code, "auth");
        String rb = readAll(code < 400 ? c.getInputStream() : c.getErrorStream());
        if (code < 200 || code >= 300) throw new HttpError(code, rb);
        return rb;
    }

    private static String readAll(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int r;
        while ((r = in.read(buf)) != -1) bos.write(buf, 0, r);
        in.close();
        return bos.toString("UTF-8");
    }

    private static String isoNow() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date());
    }

    // ------------------------------------------------------------------ notification

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "SMS Gateway",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while the lab SMS gateway is active on this phone");
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String text) {
        Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = (i != null)
                ? PendingIntent.getActivity(this, 0, i,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
                : null;
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle("Optix SMS Gateway")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setOngoing(true);
        if (pi != null) b.setContentIntent(pi);
        return b.build();
    }

    private void startForegroundCompat(Notification n) {
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIF_ID, n);
        }
    }

    private void updateNotification(String text) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID, buildNotification(text));
        } catch (Exception ignored) { /* notification shade unavailable */ }
    }
}
