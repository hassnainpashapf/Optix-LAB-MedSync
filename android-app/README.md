# Optix LAB MedSync — Android app

A Capacitor wrapper that opens the cloud web app (`https://optix-lab-medsync.pages.dev/app/`) full-screen like a native app,
so it always shows the latest UI and uses the same cloud account/data as the web and desktop apps. When the phone is offline
it shows `www/offline.html` ("No internet connection — Try again").

Because the UI is loaded from the cloud, **UI changes never require a new APK**. Rebuild only to change the icon/name/version.

Build (needs JDK 21 + Android SDK 35): `npm i @capacitor/core@7 @capacitor/cli@7 @capacitor/android@7 && npx cap add android`,
copy `capacitor.config.json` + `www/` from here, set the icons/version/signing, then `cd android && ./gradlew assembleRelease`.
Keep the signing keystore (not in this repo) safe: updates of the app must be signed with the same key.
