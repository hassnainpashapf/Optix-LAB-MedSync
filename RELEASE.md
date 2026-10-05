# Optix LAB MedSync — Release Process

Release engineering for the cloud + installer era. Local installs, cloud backend, and the web demo all version from this document.

## 1. Versioning — semver (MAJOR.MINOR.PATCH)

- Version lives in exactly two files and they must match: `electron-src/package.json` (`version`) and `server/package.json` (`version`). The NSIS installer reads `electron-src/package.json`; the local API exposes `/api/version` from `server/package.json`.
- **PATCH** (1.0.0 → 1.0.1): bug fixes, UI/CSS tweaks, no schema change.
- **MINOR** (1.0.0 → 1.1.0): new features, new API endpoints, backward-compatible DB schema additions (new tables/columns only — never rename or drop).
- **MAJOR** (1.0.0 → 2.0.0): breaking changes — DB schema rewrites, REST contract changes, new Electron major. Requires a tested migration path before release.

## 2. Release checklist

1. **Bump versions** — update `version` in `electron-src/package.json` and `server/package.json` (same value).
2. **QA** — login (admin/reception/technician), billing → invoice → print, dues collect, results entry → report print, WhatsApp share, backup/restore. Zero JS errors.
3. **Build NSIS installer** — via electron-builder under wine (`/usr/bin/wine`); output: `LabPOS-Setup-<version>.exe`.
4. **Publish bundle to cloud releases** — upload the installer to the cloud backend's releases store (e.g. `~/workspace/labpos/cloud/` releases endpoint / object path), with its SHA-256.
5. **Update cloud `releases.json`** — set `latest` to the new version, `url` to the bundle, `sha256` to the checksum, `minAutoUpdate` if older clients must skip intermediate versions.
6. **Push superadmin target** — in the superadmin dashboard, set the target version for the lab registry (all labs, or selected lab IDs via `PUT /api/labs/:id/target`, guarded by `X-Superadmin-Key`).
7. **Verify lab heartbeat** — each local install heartbeats to `POST /api/labs/heartbeat`; confirm in the superadmin dashboard that labs report the new `currentVersion` after their next restart.

## 3. Rollback procedure

- In the superadmin dashboard, set the lab target version back to the previous known-good version (from `releases.json` history).
- On next heartbeat + restart, the local app downloads the previous bundle and swaps it in. The app keeps the last two installed versions on disk; if the new version fails to start (health check via `/api/health` fails after swap), it auto-reverts to the previous one and reports `rollback: true` in its heartbeat.
- If a release is bad for all labs, set `latest` in `releases.json` back to the previous version — no new build needed.

## 4. The DB guarantee — updates never touch the local database

- The local SQLite database (`labpos.db`, in the OS user-data dir, e.g. `%AppData%/LabPOS/labpos.db`) is **never modified, migrated silently, or deleted by an update**. The installer and the auto-updater only replace application files (`resources/app`, the EXE); the user-data dir is out of scope.
- Schema changes ship as code: on startup the embedded API runs additive migrations only (new tables/columns); a MAJOR release with breaking schema changes must ship a tested migration script and is flagged in `releases.json` (`requiresMigration: true`) so the superadmin can stage it per lab.
- Before any update swap, the updater takes a timestamped backup copy of `labpos.db` next to the original. Rollback restores the app files; the DB backup is retained for manual restore and is never auto-overwritten.
