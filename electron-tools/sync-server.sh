#!/bin/bash
# Copies the shared cloud server (also used as the desktop's embedded local server) into electron-src/server/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p electron-src/server
for f in server.js sync-store.js tenant-store.js saas.js mailer.js desktop-sync.js db-sqlite.js http-fetch.js seed.json default-params.json report-viewer.html; do cp -f "cloud/$f" "electron-src/server/$f"; done
rm -f electron-src/server/index.js electron-src/server/store.js
echo "embedded server synced from cloud/ ($(ls electron-src/server | tr '\n' ' '))"
