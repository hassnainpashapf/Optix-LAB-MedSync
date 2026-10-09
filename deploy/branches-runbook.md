# Multi-Branch — VPS Deploy Runbook

Deploys the multi-branch backend changes (branch CRUD API, per-lab branch limit,
per-lab feature access matrix) to the production VPS.

- VPS: `ubuntu@150.230.52.29`
- App dir on VPS: `/opt/labpos-cloud` (Docker Compose stack)
- API service name in compose: **`api`**
- Build context: the **`cloud/`** directory (the Dockerfile runs `COPY . ./`,
  so every file in `cloud/` — including `server.js`, `saas.js`, `db-pg.js`,
  `db-sqlite.js` — is baked into the image; no selective copy needed, just
  replace the changed files)
- Health endpoint: `GET /api/health` → `{"ok":true,...}`
- Public API base (behind Nginx Proxy Manager): `https://labpos-api.150.230.52.29.sslip.io`
- Compose default host port mapping is `${API_PORT:-4000}:4000`. VERIFY MANUALLY:
  the VPS has historically run the API on **:4002**, so `API_PORT=4002` is
  expected in the VPS `.env`. Confirm before running the port-bound curls below.

**Access rule:** no VPS password is stored anywhere on the agent side. The
human (or the parent agent) executes every SSH/SCP step below with the password
provided directly by the owner at deploy time.

---

## Prerequisites

1. SSH access to the VPS: `ssh ubuntu@150.230.52.29` (password from the owner).
2. The multi-branch commit is merged to GitHub **main**
   (`hassnainpashapf/Optix-LAB-MedSync`).
3. A local copy of this repo with the merged commit pulled.
4. A current Postgres backup exists (the VPS cron already writes daily dumps to
   `/opt/labpos-cloud/backups/auto/`; confirm the latest file's timestamp
   before starting).

---

## Step 1 — Verify GitHub main has the commit

From your local machine:

```bash
cd ~/workspace/optix-sms
git checkout main && git pull origin main
git log --oneline -3
# expect the multi-branch merge commit at the top
git show --stat HEAD | grep -E "cloud/server.js|cloud/saas.js|cloud/db-pg.js|deploy/branches-migration.sql"
```

If the merge commit is not on `origin/main`, STOP — do not deploy until it is.

---

## Step 2 — Get the new `cloud/` files onto the VPS

Only `cloud/` matters for the backend deploy (the web UI ships via Cloudflare
Pages from GitHub main automatically — no VPS step needed for it).

How files reach the VPS was never pinned down (DEPLOY.md allows scp/rsync/git
— operator's choice), so both options are given. Either one works.

### Option A — the VPS pulls from git (if `/opt/labpos-cloud` is a git clone)

```bash
ssh ubuntu@150.230.52.29
cd /opt/labpos-cloud
git fetch origin && git reset --hard origin/main   # or: git pull
git log --oneline -1   # must match the commit verified in Step 1
```

VERIFY MANUALLY: whether `/opt/labpos-cloud` is actually a git clone. If it is
a plain copied directory, `git` will fail here — use Option B.

### Option B — copy the changed files with scp (works either way)

From your local machine (repo root), copy each changed backend file:

```bash
cd ~/workspace/optix-sms
scp cloud/server.js    ubuntu@150.230.52.29:/opt/labpos-cloud/server.js
scp cloud/saas.js      ubuntu@150.230.52.29:/opt/labpos-cloud/saas.js
scp cloud/db-pg.js     ubuntu@150.230.52.29:/opt/labpos-cloud/db-pg.js
scp cloud/db-sqlite.js ubuntu@150.230.52.29:/opt/labpos-cloud/db-sqlite.js
```

The compose build uses `build: .` with a Dockerfile that `COPY`s the entire
`cloud/` context, so `server.js`, `saas.js`, `db-pg.js`, `db-sqlite.js` are all
included automatically — no Dockerfile change is needed for file additions in
`cloud/`. (If `package.json`/`package-lock.json` changed, the full copy is
still fine; the Docker layer cache just invalidates at the `npm ci` step.)

Skip files that did not change — e.g. if only `server.js` and `saas.js` were
touched, copy only those two.

---

## Step 3 — (Optional) run the migration SQL safety checks

The multi-branch migration ships as `deploy/branches-migration.sql` in the repo
(produced by the migration worker). It is designed to be idempotent / additive.

1. Copy it to the VPS:

```bash
scp deploy/branches-migration.sql ubuntu@150.230.52.29:/opt/labpos-cloud/deploy/branches-migration.sql
```

2. Run it against Postgres inside the compose stack (service name `db`):

```bash
ssh ubuntu@150.230.52.29
cd /opt/labpos-cloud
docker compose exec -T db psql -U "${POSTGRES_USER:-labpos}" -d "${POSTGRES_DB:-labpos}" \
  -f /dev/stdin < deploy/branches-migration.sql
```

Notes:
- Run this **before** the rebuild (Step 4) so the new code boots against an
  already-migrated schema.
- If the new `server.js` runs its own migrations at boot (check its boot code
  / release notes for the multi-branch merge), the SQL file may be redundant —
  in that case the manual run is a harmless no-op or can be skipped. VERIFY
  MANUALLY against the merge's migration notes.

---

## Step 4 — Rebuild + restart the API

```bash
ssh ubuntu@150.230.52.29
cd /opt/labpos-cloud
docker compose build api
docker compose up -d api
```

This rebuilds only the `api` service image (leaving the `db` Postgres service
running and its `pgdata` volume untouched) and restarts the container with the
new image. Expect ~30–60 seconds of API downtime; Postgres stays up.

Do NOT use `docker compose down` — it is unnecessary and would restart the
database too.

---

## Step 5 — Verify

Wait ~30 seconds for boot (the API waits on the Postgres healthcheck first),
then from the VPS:

```bash
# 1. Health — expect {"ok":true,...}
curl -s http://localhost:${API_PORT:-4000}/api/health

# 2. Multi-branch route exists — expect HTTP 401 (no token), which proves the
#    route is registered; a 404 would mean the old code is still running.
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:${API_PORT:-4000}/api/lab/features

# 3. Container logs — look for boot errors
docker compose logs --tail=50 api
```

Then from outside (your local machine), verify the public path:

```bash
curl -s https://labpos-api.150.230.52.29.sslip.io/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://labpos-api.150.230.52.29.sslip.io/api/lab/features
```

The 401s come from the superadmin/lab auth guards (`requireSuperadmin` /
lab-token middleware) — unauthenticated requests must be rejected, not 404.

If anything looks wrong, check `docker compose logs api` for stack traces and
confirm the image actually rebuilt (Step 6 covers the rollback).

---

## Step 6 — Rollback

If the new build is broken, revert to the previous commit:

```bash
ssh ubuntu@150.230.52.29
cd /opt/labpos-cloud

# Option A (git clone): roll the files back
git reset --hard <previous-commit-sha>
# Option B (copied dir): re-scp the OLD versions of the files from your local
# checkout at the previous commit, then:

docker compose build api
docker compose up -d api
```

Then repeat Step 5 to confirm health is green again.

The database volume (`pgdata`) is never touched by the rebuild, so data is
preserved across rollback. If the migration added columns/tables, they stay —
they are additive and harmless to the old code.

---

## Quick reference

| Item | Value |
|---|---|
| VPS | `ubuntu@150.230.52.29` |
| App dir | `/opt/labpos-cloud` |
| Compose services | `api` (node build), `db` (postgres:16-alpine) |
| Build context | `cloud/` dir; Dockerfile `COPY . ./` — all `.js` files included |
| Health | `GET /api/health` → `{"ok":true,...}` |
| New route check | `GET /api/lab/features` → `401` without token (proves route exists) |
| Public base | `https://labpos-api.150.230.52.29.sslip.io` |
| Web UI deploy | Cloudflare Pages auto-deploys from GitHub main — no VPS step |
| VPS password | NOT available to agents — owner supplies it at deploy time |

## Items marked VERIFY MANUALLY

1. VPS `.env` `API_PORT` (expected `4002`; adjust port in the curl commands).
2. Whether `/opt/labpos-cloud` is a git clone (decides Step 2 Option A vs B).
3. Whether `deploy/branches-migration.sql` is still needed, or the new
   `server.js` self-migrates at boot (check the merge's migration notes).
