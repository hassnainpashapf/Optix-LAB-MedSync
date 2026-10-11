#!/bin/bash
# Copies the current web UI (index.html + assets/) into electron-src/ for the desktop build.
# index.html is copied without the service-worker registration (the desktop loads from its local server, no PWA cache).
set -euo pipefail
cd "$(dirname "$0")/.."
rsync -a --delete assets/ electron-src/assets/
node -e "
const fs=require('fs');
let h=fs.readFileSync('index.html','utf8');
const re=/if \('serviceWorker' in navigator\) \{[\s\S]*?\n\}\n/;
if(!re.test(h)){console.error('service-worker block not found in index.html');process.exit(1);}
h=h.replace(re,'');
fs.writeFileSync('electron-src/index.html',h);"
echo "web UI synced into electron-src/ (stamp $(grep -o "__ASSET_V = '[0-9]*'" electron-src/index.html))"
