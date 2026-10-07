# LabPOS Cloud — VPS Deploy Guide

Deploys the LabPOS cloud API + Postgres 16 on a VPS with Docker Compose,
behind HTTPS (Nginx Proxy Manager), ready for the lab PCs and the
superadmin dashboard to connect.

## 0. Prerequisites

- A VPS with Docker Engine + the Compose plugin (`docker compose version` works).
- A domain (or subdomain) pointing at the VPS, e.g. `labpos-api.example.com`.
- This `cloud/` directory copied to the VPS (scp/rsync/git — your choice).

## 1. Configure

```bash
cd cloud
cp .env.example .env
nano .env
```

Set at minimum:
- `POSTGRES_PASSWORD` — strong password (avoid `?`, `#`, `&` if you ever switch to `DATABASE_URL`).
- `SUPERADMIN_KEY` — long random secret; the superadmin dashboard sends it as `X-Superadmin-Key`.
- `PUBLIC_API_URL` — `https://labpos-api.example.com` (your real domain).
- `LAB_NAME` — optional, stamped into the seeded settings row on first boot.
- `RELEASE_BUNDLE_URL` — URL of the Windows installer the updater will download
  (or leave empty and set `bundleUrl` in `releases.json` later).

## 2. Start

```bash
docker compose up -d --build
docker compose ps
```

First boot: the API waits for Postgres (healthcheck), creates the `kv`/`meta`
tables, and seeds the demo database from `seed.json` automatically
(3 users, 35 tests, 10 invoices — same as the local app).

## 3. Verify

```bash
curl http://localhost:4000/api/health
# {"ok":true,"version":"1.0.0","time":"..."}

curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
# {"ok":true,"user":{"id":"U-01","name":"Administrator","role":"admin"}}

curl http://localhost:4000/api/version
```

## 4. Put it behind HTTPS (Nginx Proxy Manager)

1. NPM → Proxy Hosts → Add: domain `labpos-api.example.com`,
   forward hostname `labpos-api` (or the VPS LAN IP), port `4000`.
2. Enable **Block Common Exploits**, then SSL → Request a new Let's Encrypt
   certificate → Force SSL, HTTP/2.
3. Verify: `curl https://labpos-api.example.com/api/health`

> The API trusts `X-Forwarded-Proto`, so `/api-config.js` returns the correct
> `https://` URL to linked frontends.

## 5. Connect the pieces

- **Superadmin dashboard** (separate Pages deploy): set its API base to
  `https://labpos-api.example.com` and its superadmin key to your
  `SUPERADMIN_KEY`. Fleet endpoints: `GET /api/labs`, `POST /api/labs/:id/target`.
- **Lab PCs / updater**: point the desktop app at `https://labpos-api.example.com`.
  It heartbeats via `POST /api/labs/heartbeat` and polls `GET /api/version`.
- **Publish an update**: edit `releases.json` (`latest`, `bundleUrl`, `changelog`)
  — no restart needed. To pin one lab: `POST /api/labs/<id>/target {"version":"1.1.0"}`
  with the `X-Superadmin-Key` header; the lab's next heartbeat returns it.

## 6. Backups

```bash
# database dump (run on the VPS)
docker compose exec db pg_dump -U labpos labpos | gzip > labpos-$(date +%F).sql.gz

# restore
gunzip -c labpos-2026-10-05.sql.gz | docker compose exec -T db psql -U labpos labpos
```

The named volume `labpos_pgdata` survives `docker compose down`; it is only
removed by `docker compose down -v` (don't).

## 7. Updating the API itself

```bash
cd cloud
# pull new code, then:
docker compose up -d --build api
docker compose logs -f api
```

Schema changes are additive (`CREATE TABLE IF NOT EXISTS`); the data volume
is untouched by rebuilds.

## Troubleshooting

| Symptom | Check |
|---|---|
| `api` restarts with "postgres unreachable" | `docker compose logs db`; password mismatch in `.env` |
| `/api/health` 502 via NPM | NPM forwards to port 4000 on the right host; `docker compose ps` |
| Superadmin gets 403 | `X-Superadmin-Key` header must equal `SUPERADMIN_KEY` |
| 500 "SUPERADMIN_KEY not configured" | set it in `.env` and `docker compose up -d` |
| Fresh DB but no seed | seed runs only when tables are empty; check `docker compose logs api` |

## Desktop app downloads (dashboard button)

1. Copy the installer into the releases dir on the VPS:
   `cp Optix-LAB-MedSync-Setup-1.0.0.exe /path/to/labpos/cloud/releases/`
   (or place it there before `docker compose up`; the dir is created automatically)
2. It is served at `https://<your-api-domain>/releases/Optix-LAB-MedSync-Setup-1.0.0.exe`
3. In the LabPOS app: Settings → Lab Profile → "Desktop App Download URL" → paste that URL → Save.
4. The dashboard "⬇ Download App" button will then download the installer.

## Password-reset email (SMTP)

"Forgot password?" emails a one-time link (valid 30 minutes). It needs one sender mailbox; add these to `.env` next to `docker-compose.yml` and run `docker compose up -d api`:

```
SMTP_HOST=smtp.gmail.com        # or smtp-relay.brevo.com, smtp.zoho.com, your domain's mail server
SMTP_PORT=587                   # 465 + SMTP_SECURE=1 for SSL
SMTP_USER=you@gmail.com
SMTP_PASS=<app password>        # Gmail: Google Account → Security → 2-Step Verification → App passwords
MAIL_FROM="Optix LAB MedSync <you@gmail.com>"
PUBLIC_APP_URL=https://optix-lab-medsync.pages.dev   # base address used in the emailed link
```

Without `SMTP_HOST` the forgot-password page tells users that email reset is not set up (an admin can still reset passwords in Settings → Users, and the operator in the superadmin console).
`MAIL_DEBUG_FILE=<path>` writes emails to a file instead of sending (testing).

## Automatic backups

`backup.sh` (installed on the VPS in `/opt/labpos-cloud/`, run by cron every day at 21:30 UTC = 02:30 Pakistan time) writes a gzip Postgres dump to `backups/auto/db-<date>.sql.gz` (last 14 days kept) and, on Sundays, an archive of `report-pdfs/` (last 4 kept). A dump smaller than 20 KB or a corrupt gzip is rejected, and every run appends a line to `backups/backup.log`.

Restore into an empty database (never over the live one while the API is running):

```
docker compose exec -T db psql -U labpos -d postgres -c "CREATE DATABASE labpos_restore"
gunzip -c backups/auto/db-<stamp>.sql.gz | docker compose exec -T db psql -U labpos -d labpos_restore
```

then point the API at it (or copy rows across). These backups live on the same server: copy `backups/auto/` to another machine now and then (`scp -r ubuntu@<vps>:/opt/labpos-cloud/backups/auto .`) to be safe against losing the disk.
