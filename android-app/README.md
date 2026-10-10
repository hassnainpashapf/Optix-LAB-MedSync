# Optix LAB MedSync — Android app

A Capacitor wrapper that opens the cloud web app (`https://optix-lab-medsync.pages.dev/app/`) full-screen like a native app,
so it uses the same cloud account/data as the web and desktop apps. The app shell is cached by a service worker after first
online use. The authenticated patient portal can securely cache that patient's read-only portal view using the Android
Keystore; API responses and staff/lab records are never cached by the service worker. Payment claims and appointment
requests still require a connection. Staff editing and result entry do not work offline on Android.

Because the UI is loaded from the cloud, **UI changes never require a new APK**. Rebuild only to change the icon/name/version
or the native plugins.

## Patient portal offline view

The `@optix/offline-cache` plugin encrypts the latest authenticated patient portal response with an AES-GCM key held by
the Android Keystore. The encrypted file is app-private and excluded from Android backups. The cache is scoped to the
portal lab and phone number, expires after 30 days, and is removed when the portal user signs out or the portal session
expires. In airplane mode, an already signed-in patient can view cached reports, invoices, payment history, and appointment
requests. This is read-only; payment claims and appointment booking require internet access. Clearing app data or
uninstalling the app removes the cache.

## SMS gateway (this phone sends the SMS)

`plugins/sms-gateway/` is a local Capacitor plugin (`@optix/sms-gateway`) bundled with the app. When the user switches the
**SMS Gateway ON** in the app (Settings → SIM Setting → Phone gateway):

1. The plugin asks for the Android `SEND_SMS` runtime permission.
2. It starts `SmsGatewayService`, a foreground service (persistent "Optix SMS Gateway" notification) that every ~60 seconds
   calls `GET /api/sms/pending` on the lab server with the user's login token, sends each claimed message with
   `SmsManager` (multipart for long texts, per-part sent/delivered tracking), and `POST`s the outcome to
   `/api/sms/report`. No third-party app, no API keys, no tunnels — the SMS goes out from this phone's SIM.
3. A `BootReceiver` restarts the service after a reboot if the gateway was left ON.

The gateway switch, last-check time and sent counter live in the web UI (Settings → SIM Setting); they call the plugin
through `assets/js/sms-gateway.js` and are only shown inside the native app. For reliable background sending, set the app's
battery usage to **Unrestricted** (Android Settings → Apps → Optix Lab → Battery).

## Build (needs JDK 17+ + Android SDK 34)

```
npm install            # installs @capacitor/* v7 and the local native plugins
npx cap add android    # first time only
npx cap sync android   # picks up plugins/sms-gateway into the native project
```

Then copy `capacitor.config.json` + `www/` from here, set the icons/version/signing, then `cd android && ./gradlew assembleRelease`.
Keep the signing keystore (not in this repo) safe: updates of the app must be signed with the same key.
