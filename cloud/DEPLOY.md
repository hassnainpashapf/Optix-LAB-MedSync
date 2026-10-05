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
   `cp LabPOS-Setup-1.0.0.exe /path/to/labpos/cloud/releases/`
   (or place it there before `docker compose up`; the dir is created automatically)
2. It is served at `https://<your-api-domain>/releases/LabPOS-Setup-1.0.0.exe`
3. In the LabPOS app: Settings → Lab Profile → "Desktop App Download URL" → paste that URL → Save.
4. The dashboard "⬇ Download App" button will then download the installer.
