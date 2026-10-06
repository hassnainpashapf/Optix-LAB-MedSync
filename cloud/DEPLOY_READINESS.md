# Optix LAB MedSync — Cloud Backend Deployment Readiness Report

**Date:** 2026-10-05
**Verdict:** The cloud backend code is **complete and deploy-ready**, but it is **not deployed anywhere**.
Today the web app, desktop app, and superadmin all run with **local-only data** (each browser / each PC has its own isolated database).

---

## 1. What's built (inventory of `cloud/`)

| File | Purpose |
|---|---|
| `server.js` | Express API. Same REST contract as the local embedded server (`/api/dump`, `/api/:table` CRUD, `/api/auth/login`, `/api/restore`, `/api/admin/reseed`) **plus** cloud-only endpoints: `/api/health`, `/api/version` (release channel), `/api/labs/heartbeat`, `GET /api/labs`, `POST /api/labs/:id/target` (fleet registry, guarded by `X-Superadmin-Key`), `/api-config.js`, static `/releases/` installer hosting, optional `WWW_ROOT` static frontend |
| `db-pg.js` | Postgres adapter — document-style JSONB store (`kv(t,id,data)` + `meta(k,v)` tables), additive schema (`CREATE TABLE IF NOT EXISTS`), transactional restore |
| `db-sqlite.js` | SQLite adapter — same interface, for quick local tests without Docker |
| `Dockerfile` | Production image: `node:20-alpine`, `npm ci`, healthcheck on `/api/health`, listens on 4000 |
| `docker-compose.yml` | Two services: `db` (postgres:16-alpine, named volume `labpos_pgdata`, healthcheck) + `api` (builds from Dockerfile, waits for healthy db) |
| `.env.example` | All config documented: `API_PORT`, `DB_ADAPTER`, `POSTGRES_*`, `SUPERADMIN_KEY`, `PUBLIC_API_URL`, `LAB_NAME`, `RELEASE_BUNDLE_URL` |
| `seed.json` | Demo seed: 3 users (`admin/admin123`, `reception/rec123`, `technician/tech123`), 35 tests, 6 patients, 2 doctors, 10 invoices, 8 payments, 4 expenses, 20 results |
| `releases.json` + `releases/` | Update channel consumed by the desktop auto-updater and shown in superadmin |
| `API.md`, `DEPLOY.md` | API contract + VPS deploy guide (both accurate against the code) |
| `superadmin/` | Superadmin dashboard source (also served at `/superadmin/` on Cloudflare Pages) |

**The frontend is already cloud-capable:** `assets/js/db.js` is a hybrid store —
if `window.LABPOS_API` is set (via `/api-config.js`), `DB.init()` loads the full
dump from the server and every write is mirrored to the API (write-through, fire-and-forget).
If the API is unreachable, it silently falls back to localStorage. No app code
changes are needed to go cloud — only configuration.

**The desktop updater is already cloud-capable:** `electron-src/updater.js`
heartbeats `POST <cloudUrl>/api/labs/heartbeat` and polls `GET <cloudUrl>/api/version`.
The URL comes from env `LABPOS_CLOUD_URL` or `electron-src/cloud.json`
(currently `"cloudUrl": ""` — configured but empty).

---

## 2. How data flows today (before cloud)

- **Web app** (`/app/` on Cloudflare Pages): `<script src="/api-config.js">` 404s on
  static hosting → `window.LABPOS_API` undefined → **localStorage mode**. Each
  browser/device has its own isolated data.
- **Desktop app** (Electron .exe/.dmg): starts the embedded Express+SQLite server
  on `127.0.0.1:3765–3784`; its `/api-config.js` hardcodes
  `window.LABPOS_API = http://127.0.0.1:<port>` → data in the local SQLite file
  (`%APPDATA%/Optix LAB MedSync/labpos.db` on Windows). Each PC isolated.
- **Superadmin** (`/superadmin/`): `window.SUPERADMIN_API` unset → same-origin fetch
  against Cloudflare Pages, which serves no API → fleet view non-functional until
  pointed at the cloud API.

---

## 3. Deployment readiness checklist

| Item | Status |
|---|---|
| API server code | ✅ Ready (`server.js`, `npm start`) |
| Postgres adapter + additive migrations | ✅ Ready |
| Dockerfile (node 20, healthcheck) | ✅ Ready |
| docker-compose (API + Postgres 16, volumes, healthchecks) | ✅ Ready |
| Env config template | ✅ Ready (`.env.example`) |
| Seed data | ✅ Ready |
| Release/update channel | ✅ Ready (`/api/version`, `/releases/`) |
| Desktop auto-update + heartbeat wiring | ✅ Ready (needs `cloudUrl` set) |
| Frontend cloud sync (write-through) | ✅ Ready (needs `LABPOS_API` set) |
| Superadmin fleet view wiring | ✅ Ready (needs `SUPERADMIN_API` + key set) |
| **Deployed to a VPS** | ❌ **Not done** |
| **Auth on data endpoints** | ✅ Done (v1.1: signed tokens, scrypt hashes, roles — see API.md) |
| Multi-lab data isolation | ❌ **Missing — see §4** |

---

## 4. Gaps to fix before production (in priority order)

### ✅ FIXED in v1.1 — Data API authentication (kept for history)
`/api/dump`, `GET/POST/PUT/DELETE /api/:table`, `/api/restore`, and even
`/api/admin/reseed` (full wipe!) are **open to the internet** once the API has a
public URL. Only the lab-registry endpoints (`GET /api/labs`, `POST /api/labs/:id/target`)
are guarded by `SUPERADMIN_KEY`.
**Fix before exposing publicly:** add an API-key or token check to the data routes
(e.g. require the same `X-Superadmin-Key`-style header or a per-lab `X-Api-Key`),
and have `db.js`/`apiWrite` send it.

### 🔴 CRITICAL — One shared database, no tenant isolation
The data API is a single global store. If two lab PCs point at the same cloud API,
**they will read and overwrite each other's patients, invoices, and results.**
The lab registry tracks labs but does not scope data.
**Options:** (a) deploy one cloud stack per lab (simplest, matches current code);
(b) add a `labId` tenant column to every table and scope all queries (bigger change).

### ✅ FIXED in v1.1 — passwords are now scrypt-hashed (history below)
Login compares `u.password !== password` directly and seeds ship with
`admin123`-style passwords. Acceptable for a LAN pilot; **hash passwords
(bcrypt) and force a password change on first login before any internet exposure.**

### 🟡 No rate limiting
Add `express-rate-limit` (or rely on Nginx Proxy Manager) before public exposure.

### 🟢 Nice-to-have
- Structured logging / log rotation for the API container.
- Automated DB backup cron on the VPS (manual `pg_dump` commands are in DEPLOY.md §6).
- `/api/admin/reseed` should require the superadmin key (it wipes the DB).

---

## 5. Exact deploy steps — Ubuntu VPS with Docker

Prerequisites: Ubuntu 22.04/24.04 VPS, Docker Engine + Compose plugin,
a subdomain with DNS pointing at the VPS (e.g. `labpos-api.example.com`).

```bash
# 1. Install Docker (skip if present)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login after this

# 2. Copy the backend to the VPS (from your machine)
scp -r ~/workspace/labpos/cloud user@VPS_IP:/opt/labpos-cloud

# 3. Configure (ON THE VPS)
cd /opt/labpos-cloud
cp .env.example .env
nano .env
#   Set: POSTGRES_PASSWORD (strong, random)
#        SUPERADMIN_KEY    (long random secret)
#        PUBLIC_API_URL=https://labpos-api.example.com
#        LAB_NAME=Optix LAB MedSync   (optional)
#        RELEASE_BUNDLE_URL=           (leave empty; use releases.json instead)

# 4. Start
docker compose up -d --build
docker compose ps            # both services "healthy"

# 5. Verify (ON THE VPS)
curl http://localhost:4000/api/health
# {"ok":true,"version":"1.0.0","time":"..."}
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
# {"ok":true,"user":{"id":"U-01","name":"Administrator","role":"admin"}}

# 6. HTTPS via Nginx Proxy Manager (same pattern as the existing techub-api host)
#    NPM -> Proxy Hosts -> Add: domain labpos-api.example.com,
#    forward to <VPS LAN IP or container host>, port 4000
#    -> SSL: request Let's Encrypt cert, Force SSL, HTTP/2
curl https://labpos-api.example.com/api/health   # must return ok:true
```

**Firewall:** open 80/443 only. Port 4000 should NOT be public (bind via NPM only).
**Backups:** `docker compose exec db pg_dump -U labpos labpos | gzip > labpos-$(date +%F).sql.gz`
(the `labpos_pgdata` volume survives `docker compose down`; only `down -v` deletes it).

**Publish installer updates for the fleet:**
1. Drop the new `.exe`/`.dmg` into `/opt/labpos-cloud/releases/` on the VPS —
   served automatically at `https://labpos-api.example.com/releases/<file>` (no restart).
2. Edit `releases.json` → `latest`, `bundleUrl`, `changelog` (read live, no restart).
3. Desktop apps heartbeat every 6h, see the new `latest`, download `bundleUrl`.
4. To pin one PC: `POST /api/labs/<labId>/target {"version":"1.1.0"}` with header `X-Superadmin-Key`.

---

## 6. How to point each client at the cloud API

### Desktop app (Electron .exe / .dmg)
Two separate channels, configure both:
1. **Updater/heartbeat (already wired):** set `cloudUrl` in `electron-src/cloud.json`
   (or env `LABPOS_CLOUD_URL`) to `https://labpos-api.example.com`, then rebuild
   the installers. No code change needed.
2. **Data sync (needs a small code change):** today the embedded server's
   `/api-config.js` hardcodes `http://127.0.0.1:<port>`. Add an override —
   e.g. if `cloud.json`/`LABPOS_CLOUD_URL` has a data URL, serve that instead —
   so `DB.init()` pulls `/api/dump` from the cloud and write-through mirrors every
   invoice/payment/result to Postgres. (Also add the API-key header from §4 here.)

### Web app (`/app/` on Cloudflare Pages)
`/api-config.js` 404s on static hosting, so `db.js` stays in localStorage mode.
Pick one:
- **Option A (recommended):** add a Cloudflare Pages Function at `/api-config.js`
  that returns `window.LABPOS_API="https://labpos-api.example.com";`
- **Option B:** inline `<script>window.LABPOS_API="https://labpos-api.example.com"</script>`
  before `db.js` in `index.html` (needs the API-key header from §4 in `apiWrite`).
- **Option C:** serve the frontend from the cloud API itself via `WWW_ROOT=/path/to/app`
  — then `/api-config.js` works natively.

### Superadmin dashboard (`/superadmin/`)
Set `window.SUPERADMIN_API = "https://labpos-api.example.com"` (script tag before
`app.js`) and enter the `SUPERADMIN_KEY` in its login screen (stored in session
storage, sent as `X-Superadmin-Key`). Fleet list + targeted rollouts then work.

---

## 7. Bottom line

- **Code:** complete, coherent, documented — `docker compose up -d` will run it today.
- **Blockers for real use:** no auth on the data API, no multi-lab isolation,
  plaintext passwords. Fix §4 items 1–2 before any lab PC connects over the internet.
- **Recommended rollout:** (1) fix auth + per-lab isolation (or one stack per lab),
  (2) deploy to VPS per §5, (3) point superadmin at it, (4) configure desktop
  `cloudUrl` + rebuild installers, (5) connect web app via Pages Function,
  (6) pilot with one lab before fleet-wide rollout.
