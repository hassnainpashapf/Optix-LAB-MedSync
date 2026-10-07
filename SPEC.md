# Optix Medical Science — Diagnostic Blood Lab POS — Build Spec

Single-page web app. Vanilla HTML/CSS/JS, no frameworks, no build step.
Data persists in browser localStorage (key `labpos_db_v1`). Currency PKR. UI language English.

## User flow (confirmed 2026-10-05)
Login → Dashboard → Test list → per-test BOOKING FORM (form-type screen: selected test on top, patient details form — select existing or add new — referral doctor, discount, payment) → Save → Invoice → Print. The `#/billing` screen serves as this form when opened via a test's Book button (sessionStorage `labpos_pretest`).

## Database — REAL database (revised 2026-10-05: local EXE install)
User wants a Windows EXE installed on the local lab computer. Architecture:
- **Desktop app (primary): Electron + embedded Express API + SQLite (node:sqlite, zero native deps).** Single install: app starts a local API on 127.0.0.1, frontend served from it. Real database file in the OS user-data dir — works fully offline.
- `db.js` keeps its SYNC `DB.*` API as a hybrid mirror: `DB.init()` loads `GET /api/dump` into memory; reads sync from memory; writes update memory + background write-through (`POST /api/:table`, `PUT /api/:table/:id`, `DELETE /api/:table/:id`). `DB.reset()` → `POST /api/restore`. Auth: `POST /api/auth/login`.
- **Server code** (`~/workspace/labpos/server/`): Express API + storage adapters — `sqlite.js` (node:sqlite, for EXE) and `pg.js` (node-postgres, for optional VPS cloud later). Same REST contract. `seed.js` shared (reuses db.js seed data).
- **Electron** (`~/workspace/labpos/electron/`): main.js starts API + opens window; packaged for **win32 x64** with electron-packager on Linux (no wine needed) → zip containing `Optix Medical Science.exe`. Try electron-builder NSIS installer if wine is available; otherwise folder+exe is the deliverable.
- **Cloud version (optional later):** same frontend + API + Postgres on VPS, frontend on Cloudflare Pages.
- Build order: (1) 10 frontend agents finish → (2) parent QA in browser → (3) server + Electron → (4) package win32 → (5) deliver zip.

## Folder layout (all under ~/workspace/labpos/)
```
index.html                  — shell (Agent 1)
assets/css/app.css          — design system (Agent 1)
assets/js/db.js             — DB layer + seed (Agent 2)
assets/js/app.js            — router + App API + auth (Agent 3)
assets/js/mod-dashboard.js  — Agent 4  (#/dashboard)
assets/js/mod-billing.js    — Agent 5  (#/billing)
assets/js/mod-invoices.js   — Agent 6  (#/invoices, #/invoice/:id, #/dues)
assets/js/mod-patients.js   — Agent 7  (#/patients, #/patient/:id)
assets/js/mod-masters.js    — Agent 8  (#/tests, #/doctors)
assets/js/mod-results.js    — Agent 9  (#/results, report print)
assets/js/mod-admin.js      — Agent 10 (#/expenses, #/reports, #/settings incl. users)
```
index.html loads scripts in this order: db.js, app.js, then all mod-*.js.
## Routes (hash router in app.js; each module registers its own)
Agent 5: `#/billing` | Agent 6: `#/invoices`, `#/invoice/:id`, `#/dues` | Agent 7: `#/patients`, `#/patient/:id` | Agent 8: `#/tests`, `#/doctors` | Agent 9: `#/results` | Agent 10: `#/expenses`, `#/reports`, `#/settings` | Agent 4: `#/dashboard` (default). Unknown hash → `#/dashboard`.

## Auth — login, users, roles (Agent A builds; all modules respect it)
- `users`: {id 'U-01', name, username, password (plain text, local app), role 'admin'|'reception'|'technician', active:true}
- Seed users: **admin / admin123** (Administrator, admin), **reception / rec123** (Receptionist), **technician / tech123** (Lab Technician)
- Session: localStorage `labpos_session` = {userId, name, role, loginAt}. Logout clears it.
- Login page (route `#/login`, no sidebar): lab branding card, username + password, wrong credentials → error message + shake. On success → `#/dashboard`.
- Route guard in app.js: no session → force `#/login` (except `#/login` itself); session + `#/login` → `#/dashboard`.
- Permissions:
  - admin: every route + user management
  - reception: dashboard, billing, invoices, dues, patients, doctors, expenses
  - technician: dashboard, results, tests (view), patients (view)
- Sidebar shows only permitted items; direct nav to forbidden route → toast error + redirect dashboard.
- Topbar: logged-in user chip (name + role badge) + Logout button.
- Invoices/payments/expenses store `createdBy` = username.
- `#/settings` (Agent D): lab profile form + **Users tab** (admin only: table, add/edit/deactivate, reset password) + Backup tab (export/import JSON) + Danger zone (reset demo data w/ confirm).

## DB schema (localStorage `labpos_db_v1` = {seq:{...}, tables...})
`db.js` exposes `window.DB`:
- `DB.all(table)` → array copy
- `DB.get(table, id)` → object|null
- `DB.insert(table, obj)` → obj with auto id
- `DB.update(table, id, patch)` → updated obj
- `DB.remove(table, id)`
- `DB.reset()` → reseed (used by Settings danger zone)
- `DB.export()` / `DB.import(json)` → backup/restore

Tables & fields:
- `settings` (single row id 'main'): {labName, tagline, address, phone, email, invoicePrefix:'INV', footerNote, currency:'PKR'}
- `patients`: {id 'P-0001', name, age, gender 'Male'|'Female'|'Other', phone, address, createdAt}
- `tests`: {id 'T-001', code 'CBC', name 'Complete Blood Count', category, price (number), sampleType 'Blood'|'Urine'|'Serum', tat 'Same day', active:true, params:[{name,unit,ref}]}
- `doctors`: {id 'D-01', name, clinic, phone, commissionPct (number)}
- `invoices`: {id 'INV-0001', no, patientId, doctorId|null, items:[{testId,code,name,price}], subtotal, discount, total, paid, due, status 'paid'|'partial'|'unpaid', createdAt, createdBy}
- `payments`: {id, invoiceId, amount, method 'Cash'|'Bank'|'Card', date, note}
- `expenses`: {id, title, category, amount, date, note}
- `results`: {id, invoiceId, testId, values:{paramName:value}, status 'pending'|'ready', reportedAt, reportedBy}

IDs: patients P-0001 seq; tests T-001 seq; doctors D-01 seq; invoices use settings.invoicePrefix + '-' + 4-digit seq (INV-0001); payments PM-0001; expenses EX-0001; results R-0001.

## Seed data (db.js must seed on first run)
Settings: labName 'City Blood Lab', tagline 'Accurate • Fast • Trusted', address 'Main Road, Lahore', phone '0300-1234567', footerNote 'Get well soon. Reports available online & on counter.'
Doctors: Dr. Ahmed Khan (City Clinic, 15%), Dr. Sara Malik (Health Center, 10%).
Tests (~30, categories: Hematology, Biochemistry, Serology, Hormones, Diabetes, Lipid, Urine). Prices PKR realistic:
Hematology: CBC 800, ESR 300, Hemoglobin 250, Platelet Count 400, Blood Group 350, PT/INR 900, Reticulocyte 600
Biochemistry: LFT 1200, RFT/KFT 1200, Serum Electrolytes 900, Calcium 600, Uric Acid 450, CRP 800
Diabetes: Fasting Glucose 300, Random Glucose 300, HbA1c 1100, OGTT 900
Lipid: Lipid Profile 1300, Cholesterol 450, Triglycerides 450
Serology: HBsAg 700, Anti-HCV 700, HIV Screening 900, Dengue NS1 1200, Widal 600, Typhidot 800
Hormones: TSH 900, T3/T4/TSH 1800, Testosterone 1500, Vitamin D 2500, Vitamin B12 2200, Ferritin 1400
Urine: Urine RE 400, Urine Culture 1500, Pregnancy Test 500
Give CBC params: [{name:'Hemoglobin',unit:'g/dL',ref:'13.5–17.5'},{name:'TLC',unit:'/µL',ref:'4,000–11,000'},{name:'Platelets',unit:'/µL',ref:'150,000–450,000'},{name:'ESR',unit:'mm/hr',ref:'0–20'}]; HbA1c params: [{name:'HbA1c',unit:'%',ref:'< 5.7'}]; Lipid Profile params: [{name:'Total Cholesterol',unit:'mg/dL',ref:'< 200'},{name:'Triglycerides',unit:'mg/dL',ref:'< 150'},{name:'HDL',unit:'mg/dL',ref:'> 40'},{name:'LDL',unit:'mg/dL',ref:'< 100'}]; others may have empty params (free-text result box).
Sample history: 6 patients, 10 invoices spread over last 7 days (mixed paid/partial/unpaid, linked tests/doctors), matching payments, 4 expenses. Mark some results 'ready'.

## Routes (hash router in app.js; each module registers its own)
Agent B: `#/billing` (new bill POS), `#/invoices`, `#/invoice/INV-0001`, `#/dues`
Agent C: `#/patients`, `#/patient/P-0001`, `#/tests`, `#/doctors`
Agent D: `#/dashboard` (default route), `#/results`, `#/expenses`, `#/reports`, `#/settings`
Unknown hash → redirect `#/dashboard`.

## window.App API (app.js)
- `App.route(path, renderFn)` — path may contain `:param`
- `App.nav(path)` — location.hash = path
- `App.toast(msg, type='ok'|'err')`
- `App.modal(title, bodyHTML, {onOpen})` → close()
- `App.confirm(msg)` → Promise<boolean>
- `App.money(n)` → 'Rs 1,250'
- `App.d(d)` → '05 Oct 2026', `App.dt(d)` → with time
- `App.today()` → 'YYYY-MM-DD'
- `App.print(title, bodyHTML)` — opens print-only window with lab letterhead
- `App.el(html)` → element; `App.esc(s)` → escaped
- `App.empty(msg)` → placeholder block HTML
- `App.badge(status)` → colored pill for paid/partial/unpaid/ready/pending
- `App.renderShell()` — sidebar+topbar (Agent 3), nav items in EXACT order:
  Dashboard, Tests, New Bill, Lab Results, Invoices, Dues, Patients, Doctors, Expenses, Reports, Settings

## CSS tokens & classes (app.css) — WHITE premium theme, rich GUI
Overall: clean white clinical-premium look (like modern hospital software). White surfaces, soft shadows, teal brand accents, generous spacing, refined typography. Must feel RICH, not flat.
Tokens: --bg:#f6f8fb; --card:#ffffff; --ink:#0f1e2e; --muted:#64748b; --line:#e8eef4; --brand:#0d9488 (teal); --brand-d:#0f766e; --brand-soft:#e6f7f5; --blue:#2563eb; --blue-soft:#e8f0fe; --red:#dc2626; --red-soft:#fdecec; --amber:#d97706; --amber-soft:#fef4e2; --green:#059669; --green-soft:#e6f7f0; --sidebar:#ffffff (WHITE sidebar, dark ink text, 1px right border); --topbar:#ffffff; radius 14px cards, 10px inputs; font Inter/system; shadow sm: 0 1px 3px rgba(15,30,46,.06), md: 0 8px 24px -8px rgba(15,30,46,.12).
Sidebar: white, logo area with teal gradient logo mark, nav items with icon + label, active = teal-soft bg + teal text + left indicator bar; section labels uppercase muted.
Stat cards: white, colored soft icon chip (teal/blue/amber/red), big number, delta line.
Tables: white card, sticky header row (light gray bg #f8fafc), row hover, rounded.
Buttons: .btn-primary = teal gradient (#0d9488→#0f766e), white text, shadow; .btn-ghost white w/ border.
Login page: split layout — left brand panel (teal gradient, lab name, feature bullets), right white login card. Rich, premium.
Print stylesheet: hide sidebar/topbar, lab letterhead (name, address, phone), clean tables.
Classes: .btn .btn-primary .btn-danger .btn-ghost .btn-sm, .card .card-h .card-b, .table wrap in .tbl-wrap, .input .select .label .form-grid, .badge .b-paid .b-partial .b-unpaid .b-ready .b-pending, .toolbar, .stat-grid .stat, .modal-ov .modal, .toast-wrap .toast, .empty, .actions (row end buttons), .search, print stylesheet: hide sidebar/topbar, show letterhead.
Design: professional lab-software look — dense, clean, fast. NO marketing fluff.

## Module contracts
Agent B `#/billing`: patient select (search or quick-add modal), test multi-add with live search, referral doctor select, discount Rs/%, payment method + amount tendered, change calc, Save → creates invoice + payment (if paid>0) → redirect to invoice view with Print button. `#/invoices`: table w/ search+date filter, row → `#/invoice/:id` (detail: items, payments list, add-payment modal, print invoice, delete w/ confirm). `#/dues`: unpaid/partial invoices, total due stat, collect-payment modal per row.
Agent C: full CRUD tables; patient detail shows invoice history + total spent + due; test form incl. params editor (name/unit/ref rows); doctor form with commission %.
Agent D: `#/dashboard`: stat cards (today collection, today tests, pending dues, month collection), recent invoices table, low-level: tests-due-today list. `#/results`: pending (invoices with items lacking results) → entry form per test (params table or textarea) → save marks ready; print lab report (letterhead, patient, table of results w/ ref ranges, footer note, signature line). `#/expenses`: CRUD + month total. `#/reports`: date-range filter → collection summary (cash/bank, tests count, discount), test-wise count/revenue table, doctor-wise referrals + commission, expenses total, net. `#/settings`: lab profile form, backup export/import (download/upload JSON), danger: reset demo data.
All money via App.money. All dates via App.d. Escape user input. After any mutation: DB op → App.toast → re-render.

## Rules
- English UI only. No placeholder/demo buttons — everything works.
- Each agent touches ONLY its own files (Agent A also owns index.html).
- Mobile: sidebar collapses to top bar under 900px (Agent A).

## v2 Additions (2026-10-05)
- **Edit Invoice** (#/invoice/:id): add/remove tests, change discount (Rs), change referral doctor. Totals recalculated; removal of tests with ready results is blocked; pending results auto-synced; paid/due/status recalculated.
- **Payment actions**: Void payment (recalculates paid/due/status), Print payment receipt per collection.
- **WhatsApp share**: invoice summary (invoice detail) and report-ready notification (results ready tab) via wa.me with auto PK number normalization (0xxx -> 92xxx).
- **Test Packages**: tests can be flagged as packages with included test list; billing shows Package badge, adds as one line at package price; results rows auto-expand to included tests on invoice save and edit.
- **Doctor commission payments**: record commission paid per doctor (amount/date/note), monthly paid vs due shown in doctors table.
- **Results**: Clear result (reset ready -> pending) per test.

## Cloud & Update Architecture (2026-10-05)

Two-tier system: cloud backend on the user's VPS + local Windows installs in each lab. The web demo (https://optix-lab-medsync.pages.dev, static frontend, browser localStorage) is unchanged and stays a demo only.

### Cloud backend (`~/workspace/labpos/cloud/`)
- Docker on VPS: API container + PostgreSQL container. Same REST contract as the local embedded API, storage adapter `pg.js`.
- API surface (fixed contract): `GET /api/health`, `GET /api/version`, `POST /api/labs/heartbeat`, `GET /api/labs`, `PUT /api/labs/:id/target`. Superadmin routes guarded by `X-Superadmin-Key` header.
- Hosts the releases store (installer bundles + `releases.json`: `latest`, `url`, `sha256`, `minAutoUpdate`, `requiresMigration`).

### Superadmin dashboard
- Lab registry: every local install is a lab record (id, name, currentVersion, lastHeartbeat, update status).
- Push updates: set a target version per lab or fleet-wide (`PUT /api/labs/:id/target`); monitor rollout via heartbeats; roll back by resetting the target to a previous version.

### Local app auto-update flow
1. **Heartbeat**: on start (and periodically), the local app posts its lab id + `currentVersion` to `POST /api/labs/heartbeat`.
2. **Target check**: cloud replies with `targetVersion` for that lab. If newer than `currentVersion`, the app downloads the bundle (SHA-256 verified against `releases.json`).
3. **Swap on restart**: the update is staged next to the install; on next app start the staged bundle replaces `resources/app` + EXE. The app keeps the last two installed versions on disk.
4. **Rollback**: if `/api/health` fails after a swap, the app auto-reverts to the previous version and reports `rollback: true` in its next heartbeat.
5. **DB untouched**: the updater never modifies `labpos.db` (OS user-data dir); it takes a timestamped backup copy before every swap. Schema changes are additive migrations run by the embedded API at startup.

### Installer
- NSIS installer (`Optix-LAB-MedSync-Setup-<version>.exe`), built with electron-builder under wine. Installs to Program Files, next-next flow: copies app files, creates Start Menu / desktop shortcuts, registers uninstaller. First run seeds the local SQLite DB and registers the lab with the cloud (lab id issued by superadmin).
