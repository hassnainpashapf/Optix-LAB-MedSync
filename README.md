# Optix Medical Sync

Diagnostic blood-lab POS: Electron desktop app (Windows installer), Express + SQLite/Postgres API, vanilla-JS web frontend, cloud backend for VPS, superadmin dashboard, auto-update.

## Download

- **Windows:** [Optix-LAB-MedSync-Setup-1.4.2-win10-11-x64.exe](https://labpos-api.150.230.52.29.sslip.io/releases/Optix-LAB-MedSync-Setup-1.4.2-win10-11-x64.exe) — Windows 10/11 64-bit
- **Mac:** [Optix-LAB-MedSync-1.4.2-arm64.dmg.tar.gz](https://labpos-api.150.230.52.29.sslip.io/releases/Optix-LAB-MedSync-1.4.2-arm64.dmg.tar.gz) — macOS 12+ (Apple Silicon)

The desktop apps keep their own copy of your data and work fully offline. When the internet is available they sync both ways with the cloud, so the same account works on the web and on any PC, and a fresh install (e.g. after a crash) signs in once and gets all data and report PDFs back.

## Features

- **Marketing website** (https://optix-lab-medsync.pages.dev) with a dedicated [Download page](/download) for the desktop installers.
- **App dashboard** styled to match the website (navy/blue palette, Plus Jakarta Sans): stat cards with count-ups, 7-day chart, monthly collection goal, payments-by-method donut, dues aging, month P&L, and a Desktop App download card.
- **Header quick actions** in the app topbar: + New Bill, + Add Patient, + Add Expense, Download App (role-aware; technicians get Lab Results / View Tests).
- **Dashboard-style stat cards** on every main page: New Bill, Lab Results, Invoices, Dues, Patients, Doctors, Expenses, Reports — all real data, no placeholders.
- **Stock → Purchase Orders**: the first admin visit to Stock each local calendar month creates one draft for active low/out-of-stock items. Admins can edit quantities or remove lines; past drafts and empty months stay recorded. Drafts never send supplier orders or change stock. Generation requires a visit with the app open; missed months are not backfilled.
- **10% zoom-out** across the app UI (`body{zoom:.9}`), with print output kept at full size.
- Website notes: the "Book Service Now" buttons and the floating WhatsApp icon were removed from the marketing site.

## Deploy pipeline

Git-first: push to `main` on GitHub (`hassnainpashapf/Optix-LAB-MedSync`) and Cloudflare Pages builds + deploys automatically:
- `optix-lab-medsync` → https://optix-lab-medsync.pages.dev (main app at `/`, superadmin console at `/superadmin/`)

Never deploy with direct upload; the old `labpos-auto-deploy` watcher is retired.

## Report PDF rendering

Lab reports and Settings → Lab Profile → Full Page Preview use the same `reportHtml()` template. The preview's Download PDF and Print controls render the current form values, including unsaved custom header/footer edits. Report viewing, downloading and QR sharing render the saved profile with the selected invoice data. PDF failures are shown explicitly; the app does not switch to a differently styled report.

The authenticated `/api/report-pdf/render` endpoint prints this HTML with Chromium. Cloud Docker images include Chromium and the supported profile fonts. For a non-Docker server, install Chromium and set `REPORT_CHROMIUM_PATH` to its executable before starting the API. Desktop builds use Electron's bundled Chromium locally, with embedded fonts and no additional browser download. Ship both the backend and frontend changes; existing desktop installations need a rebuilt app containing `report-pdf.js` and the `server/report-fonts` directory.

Rendering disables document scripts, blocks non-font external resources, verifies embedded report images and reserves the measured footer height on every page. Do not add a second PDF layout for lab reports. The older vector drawing helper is retained for compatibility regression checks, not used by the report export flow.

Run `node scripts/test-profile-pdf.js` for template/route checks. For actual browser integration, install the cloud dependencies and set `REPORT_CHROMIUM_PATH`; optionally set `REPORT_SAMPLE_DIR` to a scratch directory to inspect generated single- and multi-page PDFs. Existing `scripts/test-report-*.js` and `scripts/test-qr-report-pdf.js` cover identity, footer, QR publication and comparison regressions.
