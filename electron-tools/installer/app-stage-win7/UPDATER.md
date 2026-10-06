# LabPOS Auto-Update

How the local Windows app pulls updates from the cloud server — and how we ship a release.

## How it works (lab PC side)

1. **Check.** On app start (20s after launch, so boot is never slowed) and every
   6 hours after, `updater.js`:
   - `POST <cloudUrl>/api/labs/heartbeat` with `{ labId, name, version, platform, arch }`
     → the cloud replies `{ ok:true, targetVersion }`. `targetVersion` is set by the
     superadmin per lab; `null` means "no forced update".
   - `GET <cloudUrl>/api/version` → `{ latest, minRequired, bundleUrl, changelog, sha256 }`.
   - An update is needed when `targetVersion` (forced) or `latest` is newer than the
     installed version. If `minRequired` is newer than installed, the banner says
     "(required)".
2. **Download + verify.** The bundle zip is streamed to
   `%AppData%/LabPOS/updates/v-<version>/bundle.zip` and checked:
   zip magic bytes, minimum size, expected file layout after extraction
   (`index.html` + `assets/js/app.js`), and `sha256` when the manifest provides one.
   Redirects are followed; failures are only logged — the app keeps working.
3. **Stage.** The zip is extracted (PowerShell `Expand-Archive` on Windows) to a
   staging folder and marked `ready.json`. Nothing in the live app changes yet.
4. **Notify.** The renderer gets `labpos:update-available` over preload IPC and shows
   a non-blocking banner: **"Update 1.2.0 ready — Restart to apply"** (+ changelog,
   "Later" dismisses it for the session).
5. **Apply on restart.** Before the local server starts, `applyPendingUpdate()`:
   - backs up the current `index.html` + `assets/` to `updates/backup-<oldVersion>/`
   - copies the staged files over the app folder
   - writes the new `version.json` and a health marker
     (`updates/pending-health.json`, `{ version, prevVersion, booted:false }`)
6. **Health + rollback.** When the window finishes loading the new frontend,
   the marker is flipped to `booted:true`.
   - If the app starts and finds a marker with `booted:false` (previous run crashed
     before the page loaded), it **automatically restores the backup**, puts the old
     `version.json` back, and boots the previous version.
   - If the page fails to load right after an update, it rolls back and relaunches
     once (loop-guarded).

## Data-safety guarantee

- An update replaces **only** `index.html` and `assets/` inside the app folder.
- The SQLite database (`%AppData%/LabPOS/labpos.db`), `device.json`, and everything
  else in userData are **never touched, moved, or deleted** by the updater.
- Backups contain frontend files only — a rollback can never lose lab data.
- `server/` and `node_modules/` are intentionally NOT updated by this mechanism;
  backend changes ship with a new installer (see below).

## Configuration

`electron-src/cloud.json` (ships with a placeholder; set it per deployment):

```json
{
  "cloudUrl": "https://labpos-cloud.example.com",
  "labId": "",
  "labName": "City Blood Lab — Main Branch",
  "checkIntervalHours": 6
}
```

Environment overrides (useful for testing / managed installs):
`LABPOS_CLOUD_URL`, `LABPOS_LAB_ID`, `LABPOS_LAB_NAME`.
If `cloudUrl` is empty, the updater is disabled and the app runs fully offline.
`labId` is auto-generated once (`lab-<uuid>`) and stored in
`%AppData%/LabPOS/device.json` if not provided.

The app folder must be writable by the logged-in user (true for the portable
zip install). No code signing is required — integrity comes from the zip/sha256
checks above, not signatures.

## Cutting a release (the update flow the user asked for)

Whenever we change the web app and want every lab PC to pick it up:

1. **Bump the version** in two places (they must match):
   - `electron-src/package.json` → `"version": "1.2.0"`
   - `electron-src/version.json` → `{"version":"1.2.0"}`
2. **Build the bundle zip** — frontend only:
   ```bash
   cd electron-src
   zip -r ../release/labpos-1.2.0.zip index.html assets version.json
   ```
   (On Windows: select `index.html` + `assets` + `version.json` → Send to → Compressed folder.)
3. **Hash it:** `sha256sum ../release/labpos-1.2.0.zip`
4. **Publish** the zip to the cloud releases directory (served over HTTPS),
   e.g. `https://<cloud>/releases/labpos-1.2.0.zip`.
5. **Update the manifest** `cloud/releases.json` on the cloud server:
   ```json
   {
     "latest": "1.2.0",
     "minRequired": "1.1.0",
     "bundleUrl": "https://<cloud>/releases/labpos-1.2.0.zip",
     "changelog": "New: doctor commission tracking; fixed dues rounding.",
     "sha256": "<hex from step 3>"
   }
   ```
6. **Done.** Within 6 hours (or on next app start) every online lab PC downloads
   the bundle, shows "Restart to apply", and swaps it in on restart.
   To force one lab immediately, set its `targetVersion` in the superadmin
   dashboard (`POST /api/labs/:id/target`).

The embedded API also serves `GET /api/version` (reads `../cloud/releases.json`
when present, else the local version) so the same server code runs unchanged
on desktop, standalone, and cloud.

## Files

| File | Role |
|---|---|
| `electron-src/updater.js` | Check / download / verify / stage / apply / rollback |
| `electron-src/preload.js` | `window.labposUpdater` bridge + update banner |
| `electron-src/main.js` | Hooks: `applyPendingUpdate()` at boot, `wireWindow`, `startUpdateChecks`, restart IPC |
| `electron-src/version.json` | Installed version (source of truth for the updater) |
| `electron-src/cloud.json` | Cloud URL + lab identity + check interval |
| `server/index.js` (+ `electron-src/server/index.js`) | Additive `GET /api/version` |

## Troubleshooting

- **No banner, no update:** check `cloud.json` has the right `cloudUrl` (https),
  the PC is online, and the cloud `/api/version` is reachable.
- **Update downloaded but never applies:** the user must restart (banner button).
  Staged state lives in `%AppData%/LabPOS/updates/v-<version>/`.
- **Rolled back unexpectedly:** the new bundle failed to boot (e.g. broken
  `index.html`). Fix the bundle, bump the version, re-release.
- **Console logs** are prefixed `[updater]` in the main-process log.
