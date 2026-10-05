# Git → Cloudflare Pages migration runbook

Goal: stop direct-upload deploys (`cf_deploy.py` / the `labpos-auto-deploy` watcher)
and connect the GitHub repo **hassnainpashapf/Optix-LAB-MedSync** to Cloudflare Pages
natively, so every push to `main` auto-deploys both sites.

Status quo (2026-10-05): projects `labpos` and `labpos-superadmin` are
direct-upload projects (`repo: null`). Updating their `source` object via the API
is rejected (Cloudflare error 8000069 pattern, same as the techub-co-working
project), so they must be **recreated** as GitHub-connected projects.

## ⚠️ Warning — irreversible

Deleting a Pages project is **irreversible** and its deployment history is lost
(rollbacks to old direct-upload deployments become impossible). The
`.pages.dev` subdomain is freed and can be reclaimed by recreating a project
with the same name, but do the delete → recreate back-to-back to minimise the
window where the URL serves nothing.

## Ordering

1. **User installs the Cloudflare Pages GitHub App** on their GitHub account
   (`hassnainpashapf`) with access to the `Optix-LAB-MedSync` repo.
   Without this, project creation fails with Cloudflare error 8000012
   ("linked to a repository that no longer exists"). This step needs the user
   in a browser — it cannot be done via API.
2. **Create both projects with TEMPORARY names** (payloads below, names
   `labpos-git` and `labpos-superadmin-git`). Push any commit (or an empty
   commit) to `main` and verify Cloudflare auto-builds and deploys from git.
   Open the temp URLs and confirm the login pages render.
3. **Delete the old direct-upload projects** `labpos` and `labpos-superadmin`
   (`DELETE /accounts/{id}/pages/projects/{name}`).
4. **Recreate with the final names** `labpos` / `labpos-superadmin` (same
   payloads, final names) so the existing `.pages.dev` URLs keep working.
5. **Disable the `labpos-auto-deploy` cron** — it becomes redundant
   (native git deploys take over). Keep
   `~/workspace/labpos-autodeploy/watch.py` on disk for reference.

## Payloads

Base: `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/pages/projects`
with `Content-Type: application/json` and the `custom.cloudflare` credential.

Account ID: `cdb40a27baae087add7d8cf3c28a681e`

### 1) Web app (labpos)

Temp name for step 2: `labpos-git` → final name for step 4: `labpos`.

```json
{
  "name": "labpos",
  "production_branch": "main",
  "source": {
    "type": "github",
    "config": {
      "owner": "hassnainpashapf",
      "repo_name": "Optix-LAB-MedSync",
      "production_branch": "main",
      "deployments_enabled": true,
      "production_deployment_enabled": true,
      "pr_comments_enabled": false,
      "preview_deployment_setting": "none"
    }
  },
  "build_config": {
    "build_command": "mkdir -p dist && cp index.html dist/ && cp -r assets dist/",
    "destination_dir": "dist",
    "root_dir": ""
  }
}
```

### 2) Superadmin (labpos-superadmin)

Temp name for step 2: `labpos-superadmin-git` → final name for step 4: `labpos-superadmin`.

```json
{
  "name": "labpos-superadmin",
  "production_branch": "main",
  "source": {
    "type": "github",
    "config": {
      "owner": "hassnainpashapf",
      "repo_name": "Optix-LAB-MedSync",
      "production_branch": "main",
      "deployments_enabled": true,
      "production_deployment_enabled": true,
      "pr_comments_enabled": false,
      "preview_deployment_setting": "none"
    }
  },
  "build_config": {
    "build_command": "mkdir -p dist && cp -r cloud/superadmin/index.html cloud/superadmin/assets dist/",
    "destination_dir": "dist",
    "root_dir": ""
  }
}
```

## Notes

- Both build commands are plain shell that run in Cloudflare's build image;
  no framework build is needed (static sites). `root_dir: ""` builds from the
  repo root so the superadmin project can reach `cloud/superadmin/`.
- `preview_deployment_setting: "none"` avoids preview deploys on every branch.
- After step 4, the first production deploy triggers on the next push to
  `main` (or immediately if Cloudflare auto-deploys on project creation).
- The Electron desktop app and the VPS cloud backend are unaffected by this
  migration; only the two Pages sites change deploy path.

## 2026-10-05: merged into ONE project

Per user request the two projects were merged into a single Cloudflare Pages
project `labpos`: the main app is served at `/`, the superadmin console at
`/superadmin/`. The `labpos-superadmin` project was deleted. Build command:

```
mkdir -p dist dist/superadmin && cp index.html dist/ && cp -r assets dist/ && cp -r cloud/superadmin/index.html cloud/superadmin/assets dist/superadmin/
```

Cross-login links are relative now (`/superadmin/` and `/`); the desktop
Electron build opens the live `https://optix-lab-medsync.pages.dev/superadmin/` URL in
the system browser via `labposDesktop` preload flag + `setWindowOpenHandler`.

## 2026-10-05: project renamed labpos → optix-lab-medsync

Full product rebrand to "Optix LAB MedSync" (user: "har jaga sa labpos ni ha").
The Pages project is being renamed `labpos` → `optix-lab-medsync`
(URL https://optix-lab-medsync.pages.dev). The desktop app's Superadmin button
now opens https://optix-lab-medsync.pages.dev/superadmin/ in the system browser.
Electron productName is "Optix LAB MedSync" (exe + install dir); the SQLite
database migrates one-time from %APPDATA%/LabPOS/labpos.db to
%APPDATA%/Optix LAB MedSync/labpos.db on first boot (see main.js).
