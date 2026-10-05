# Optix LAB MedSync

Diagnostic blood-lab POS: Electron desktop app (Windows installer), Express + SQLite/Postgres API, vanilla-JS web frontend, cloud backend for VPS, superadmin dashboard, auto-update.

## Download

- **Windows:** [Optix-LAB-MedSync-Setup-1.0.0.exe](https://github.com/hassnainpashapf/Optix-LAB-MedSync/releases/download/v1.0.0/Optix-LAB-MedSync-Setup-1.0.0.exe) — Windows 10/11 64-bit
- **Mac:** [Optix-LAB-MedSync-1.0.0.dmg](https://github.com/hassnainpashapf/Optix-LAB-MedSync/releases/download/v1.0.0/Optix-LAB-MedSync-1.0.0.dmg) — macOS 12+ (Apple Silicon & Intel)

The desktop apps work fully offline, with all data stored on the computer.

## Deploy pipeline

Git-first: push to `main` on GitHub (`hassnainpashapf/Optix-LAB-MedSync`) and Cloudflare Pages builds + deploys automatically:
- `optix-lab-medsync` → https://optix-lab-medsync.pages.dev (main app at `/`, superadmin console at `/superadmin/`)

Never deploy with direct upload; the old `labpos-auto-deploy` watcher is retired.
