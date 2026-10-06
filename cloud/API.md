# LabPOS Cloud API — Contract

Base URL: `https://<your-api-host>` (e.g. `https://labpos-api.example.com`).
All data endpoints are JSON. Errors: `{ "error": "<message>" }` with a 4xx/5xx status.

The data endpoints are byte-compatible with the local embedded LabPOS server —
the frontend's `db.js` sync contract works unchanged against either one.

---

## 1. Data API (lab app sync)

| Method | Path | Description |
|---|---|---|
| GET | `/api/dump` | Full database: `{ seq, settings, users, patients, tests, doctors, invoices, payments, expenses, results }`. `seq` is normalized so client-generated IDs never collide after restart. Used by `DB.init()`. |
| GET | `/api/tables` | `["settings","users","patients","tests","doctors","invoices","payments","expenses","results"]` |
| GET | `/api/:table` | All rows of one table (404 `unknown table` for anything else) |
| POST | `/api/:table` | Upsert a row. Body must include `id`. Returns the stored row. 400 if `row.id` missing. |
| PUT | `/api/:table/:id` | Merge-patch a row (creates it if missing, preserving `id`). Returns the row. |
| DELETE | `/api/:table/:id` | Delete a row. Returns `{ ok: true }`. |
| POST | `/api/auth/login` | Body `{ username, password }` → `{ ok: true, user: { id, name, role } }` or 401 `{ error: "Invalid username or password" }`. Inactive users (`active: false`) are rejected. |
| POST | `/api/restore` | Replace the whole database from a `DB.export()` dump. Body = dump object. Returns `{ ok: true }`. |
| POST | `/api/admin/reseed` | Wipe and re-seed from `seed.json`. Returns the fresh dump. |

Tables and the seed are identical to the local server (`seed.json`): 3 users
(`admin/admin123`, `reception/rec123`, `technician/tech123`), 6 patients,
35 tests, 2 doctors, 10 invoices, 8 payments, 4 expenses, 20 results.

### Frontend wiring
`GET /api-config.js` returns JavaScript that sets `window.LABPOS_API` to the
public API URL (`PUBLIC_API_URL`, or the request's own origin when unset).
A linked frontend includes it **before** `db.js` so the hybrid store talks to
the cloud instead of localStorage:

```html
<script src="https://<your-api-host>/api-config.js"></script>
<script src="assets/js/db.js"></script>
```

---

## 2. Health & release channel

### `GET /api/health` → `{ ok: true, version, time }`
Liveness probe (used by Docker healthchecks and the reverse proxy).

### `GET /api/version` → `{ latest, minRequired, bundleUrl, changelog }`
Read from `releases.json` on every request (edit the file, no restart needed).
`bundleUrl` can be overridden with the `RELEASE_BUNDLE_URL` env var.
The desktop auto-updater polls this; the superadmin dashboard displays it.

Example:
```json
{ "latest": "1.0.0", "minRequired": "1.0.0",
  "bundleUrl": "https://example.com/downloads/LabPOS-Setup-1.0.0.exe",
  "changelog": ["Initial cloud release."] }
```

---

## 3. Lab registry (fleet management)

Each lab PC's desktop app periodically calls heartbeat; the superadmin
dashboard manages the fleet through the guarded endpoints.

Guard: header `X-Superadmin-Key` must equal the server's `SUPERADMIN_KEY`
env var, otherwise `403 { error: "forbidden" }`.

### `POST /api/labs/heartbeat`
Body: `{ labId, name, version, platform }` — `labId` required (stable per PC,
e.g. a machine UUID). Upserts the registry entry, preserving any
`targetVersion` the superadmin set.

Response: `{ ok: true, targetVersion: "<version>" | null }`

The updater compares `targetVersion` (or `latest` from `/api/version`)
against its own version and downloads `bundleUrl` when an update is due.

### `GET /api/labs` *(guarded)*
Response: array sorted by most-recent heartbeat —
```json
[{ "labId": "pc-01", "name": "Main Counter PC", "version": "1.0.0",
   "platform": "win32", "targetVersion": null,
   "lastSeen": "2026-10-05T13:00:00.000Z" }]
```

### `POST /api/labs/:id/target` *(guarded)*
Body: `{ version }`. Pins one lab to a specific version; the lab's next
heartbeat returns it as `targetVersion` and the updater applies it.
404 `{ error: "unknown lab" }` if the lab never sent a heartbeat.
Clear with `{ "version": "" }`? No — send `null` is not accepted; instead the
superadmin dashboard should treat empty as "follow latest". (Setting a
version string is the only write; heartbeat keeps returning it until changed.)

---

## 4. Landing

`GET /` → `{ service: "labpos-cloud-api", version, health: "/api/health", docs: "API.md" }`
unless `WWW_ROOT` points at a static frontend build, which is then served.

---

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API listen port |
| `BIND_HOST` | `0.0.0.0` | Bind address (`127.0.0.1` for local-only) |
| `DB_ADAPTER` | `pg` | `pg` (production) or `sqlite` (local test) |
| `DATABASE_URL` | — | Full postgres URL; wins over `PG*` vars when set |
| `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` | — | Read natively by `pg` when `DATABASE_URL` unset |
| `SQLITE_PATH` | `./labpos-cloud.db` | SQLite file when `DB_ADAPTER=sqlite` |
| `SUPERADMIN_KEY` | — | **Required** for `/api/labs` and `/api/labs/:id/target` |
| `PUBLIC_API_URL` | — | Public HTTPS URL, used by `/api-config.js` |
| `LAB_NAME` | — | Stamped into seeded settings on first boot |
| `RELEASE_BUNDLE_URL` | — | Overrides `releases.json` → `bundleUrl` |
| `WWW_ROOT` | — | Optional static frontend dir to serve |


## Authentication (v1.1)

All data routes now require a signed token.

- `POST /api/auth/login` `{username,password}` -> `{ok,user,token}` (public; rate-limited per IP+username: 8 failures / 15 min).
  Send `Authorization: Bearer <token>` on every other `/api/*` call. Tokens last `TOKEN_TTL_HOURS` (default 12) and stop
  working immediately if the user is deleted or disabled.
- `POST /api/auth/change-password` `{current,next}` (any signed-in user).
- Public (no token): `GET /api/health`, `GET /api/version`, `GET /api/public-info` (lab name/logo for the login page),
  `POST /api/labs/heartbeat`, `GET /r/<key>` (report PDF behind the printed QR).
- Superadmin key (`X-Superadmin-Key`): `GET /api/labs`, `POST /api/labs/:id/target`, `POST /api/admin/reseed`.
- Roles: `settings` writes, `users` create/edit/delete, `POST /api/restore` and `POST /api/admin/reseed` are admin-only
  (staff may edit their own profile, never their role). Passwords are stored as scrypt hashes and never returned by the API.
- `POST /api/:table` returns `409` when the id already exists (two PCs generated the same record number); the web app
  then refreshes its data and asks the user to retry.

## SaaS (multi-lab) endpoints

One cloud serves many labs. Every lab ("tenant") has its own isolated data; the original single-lab data is the default lab (`main`).
Sign-in: `POST /api/auth/login { username, password, lab }` — `lab` is the Lab ID (slug); empty = the default lab. The token carries the lab.

Public: `GET /api/saas/plans` · `GET /api/saas/check-slug?slug=` · `POST /api/saas/signup { labName, ownerName, email, phone, slug, username, password }` (14-day trial, 5 sign-ups/hour/IP, `SAAS_SIGNUPS_PER_HOUR` to change)

Signed-in lab: `GET /api/saas/me` (plan, status, usage, limits, payments) · `POST /api/saas/pay-request` (admin; manual JazzCash / Easypaisa / bank payment reference)

Operator (`X-Superadmin-Key`): `GET /api/saas/stats` · `GET|POST /api/saas/labs` · `PUT /api/saas/labs/:id` · `POST /api/saas/labs/:id/extend` · `POST /api/saas/labs/:id/reset-admin` · `DELETE /api/saas/labs/:id` (header `X-Confirm-Slug`) · `GET /api/saas/payments` · `POST /api/saas/payments/:id/approve|reject` · `GET|PUT /api/saas/settings`

Status: `trial` → `expired` after the trial; `active` (paid) → `expired` 3 days after `paidUntil`; `suspended` by the operator. Expired labs are read-only (writes return 402 `EXPIRED`); plan limits return 402 `LIMIT_USERS` / `LIMIT_INVOICES`; a suspended lab cannot sign in (403).

Audit trail: `GET /api/audit?from=&to=&user=&table=&action=&q=&limit=&offset=` (admin). Written server-side, read-only, kept 365 days.
