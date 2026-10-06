# Optix LAB MedSync

Diagnostic blood-lab POS: Electron desktop app (Windows installer), Express + SQLite/Postgres API, vanilla-JS web frontend, cloud backend for VPS, superadmin dashboard, auto-update.

## Download

- **Windows:** [Optix-LAB-MedSync-Setup-1.2.4-win10-11-x64.exe](https://labpos-api.150.230.52.29.sslip.io/releases/Optix-LAB-MedSync-Setup-1.2.4-win10-11-x64.exe) — Windows 10/11 64-bit
- **Mac:** [Optix-LAB-MedSync-1.2.4-arm64.dmg.tar.gz](https://labpos-api.150.230.52.29.sslip.io/releases/Optix-LAB-MedSync-1.2.4-arm64.dmg.tar.gz) — macOS 12+ (Apple Silicon)

The desktop apps keep their own copy of your data and work fully offline. When the internet is available they sync both ways with the cloud, so the same account works on the web and on any PC, and a fresh install (e.g. after a crash) signs in once and gets all data and report PDFs back.

## Features

- **Marketing website** (https://optix-lab-medsync.pages.dev) with a dedicated [Download page](/download) for the desktop installers.
- **App dashboard** styled to match the website (navy/blue palette, Plus Jakarta Sans): stat cards with count-ups, 7-day chart, monthly collection goal, payments-by-method donut, dues aging, month P&L, and a Desktop App download card.
- **Header quick actions** in the app topbar: + New Bill, + Add Patient, + Add Expense, Download App (role-aware; technicians get Lab Results / View Tests).
- **Dashboard-style stat cards** on every main page: New Bill, Lab Results, Invoices, Dues, Patients, Doctors, Expenses, Reports — all real data, no placeholders.
- **10% zoom-out** across the app UI (`body{zoom:.9}`), with print output kept at full size.
- Website notes: the "Book Service Now" buttons and the floating WhatsApp icon were removed from the marketing site.

## Deploy pipeline

Git-first: push to `main` on GitHub (`hassnainpashapf/Optix-LAB-MedSync`) and Cloudflare Pages builds + deploys automatically:
- `optix-lab-medsync` → https://optix-lab-medsync.pages.dev (main app at `/`, superadmin console at `/superadmin/`)

Never deploy with direct upload; the old `labpos-auto-deploy` watcher is retired.
