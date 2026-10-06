#!/bin/bash
# Windows 7 / 8 / 8.1 installer (Electron 22 + better-sqlite3), same app + cloud sync as the Windows 10/11 build.
#   ARCH=x64|ia32 ./build-win7.sh   (prebuilt win32 better-sqlite3 for Electron 22 expected in $BS3_DIR/node_modules)
set -euo pipefail
cd "$(dirname "$0")"
ARCH="${ARCH:-x64}"
BS3_DIR="${BS3_DIR:?set BS3_DIR to a folder where: npm_config_runtime=electron npm_config_target=22.3.27 npm_config_platform=win32 npm_config_arch=\$ARCH npm i better-sqlite3@8.7.0}"
if [ "$ARCH" = "ia32" ]; then UNP=win-ia32-unpacked; PF='$PROGRAMFILES'; SUF=-win7-8-x86; else UNP=win-unpacked; PF='$PROGRAMFILES64'; SUF=-win7-8-x64; fi
echo "== syncing embedded server =="; ../sync-server.sh
echo "== staging ($ARCH) =="
rm -rf app-stage-win7 && mkdir app-stage-win7 && cp -a ../../electron-src/. app-stage-win7/
for m in better-sqlite3 bindings file-uri-to-path; do rm -rf "app-stage-win7/node_modules/$m"; cp -a "$BS3_DIR/node_modules/$m" app-stage-win7/node_modules/; done
# electron-builder only packs declared dependencies: declare the bundled native module + its runtime deps
node -e "
const fs=require('fs'),p='app-stage-win7/package.json',j=JSON.parse(fs.readFileSync(p));
j.dependencies=j.dependencies||{};
for (const m of ['better-sqlite3','bindings','file-uri-to-path']) j.dependencies[m]=JSON.parse(fs.readFileSync('app-stage-win7/node_modules/'+m+'/package.json')).version;
fs.writeFileSync(p,JSON.stringify(j,null,1));"
for f in main.js preload.js server/server.js server/sync-store.js server/desktop-sync.js server/db-sqlite.js server/http-fetch.js; do node --check "app-stage-win7/$f"; done
echo "== packing win32 $ARCH with Electron 22 =="
rm -rf ../../dist-installer-win7/$UNP
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win --$ARCH --dir --config electron-builder-win7.yml 2>&1 | tail -2
echo "== NSIS =="
VER=$(node -p "require('./app-stage-win7/package.json').version")
KB=$(du -sk ../../dist-installer-win7/$UNP | cut -f1)
cp -f ../../electron-src/icon.ico ./icon.ico
sed -e "s/__APP_VERSION__/${VER}/g" -e "s/__ESTIMATED_KB__/${KB}/g" -e "s/__UNPACKED__/${UNP}/g" -e "s|__PF__|${PF}|g" -e "s/__SUFFIX__/${SUF}/g" -e "s/__OUT__/dist-installer-win7/g" labpos-setup.nsi > labpos-setup.build.nsi
makensis -V2 labpos-setup.build.nsi
ls -lh ../../dist-installer/Optix-LAB-MedSync-Setup-${VER}${SUF}.exe
