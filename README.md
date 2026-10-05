# LabPOS — Optix LAB MedSync

Diagnostic blood-lab POS: Electron desktop app (Windows installer), Express + SQLite/Postgres API, vanilla-JS web frontend, cloud backend for VPS, superadmin dashboard, auto-update.

## Deploy pipeline

Git-first: push to `main` on GitHub (`hassnainpashapf/Optix-LAB-MedSync`) and Cloudflare Pages builds + deploys automatically:
- `labpos` → https://labpos.pages.dev (build: copy `index.html` + `assets/` to `dist/`)
- `labpos-superadmin` → https://labpos-superadmin.pages.dev (build: copy `cloud/superadmin/` to `dist/`)

Never deploy with direct upload; the old `labpos-auto-deploy` watcher is retired.
