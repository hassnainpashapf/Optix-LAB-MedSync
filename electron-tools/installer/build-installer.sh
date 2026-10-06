#!/bin/bash
# Optix LAB MedSync Windows installer — full rebuild pipeline (no wine needed).
#   1. stages the latest app source from ../../electron-src (read-only copy)
#   2. repacks the win32 Electron app via electron-builder --dir
#   3. compiles the MUI2 NSIS installer with native makensis
# Output: ../../dist-installer/Optix-LAB-MedSync-Setup-<version>.exe
# Usage: ./build-installer.sh   (run from electron-tools/installer/)
set -euo pipefail
cd "$(dirname "$0")"

echo "== 0/3 syncing embedded server =="; ../sync-server.sh
echo "== 1/3 staging app source =="
rm -rf app-stage
cp -a ../../electron-src app-stage 2>/dev/null || cp -r ../../electron-src app-stage
for f in main.js preload.js server/server.js server/sync-store.js server/desktop-sync.js server/db-sqlite.js; do
  node --check "app-stage/$f" || { echo "SYNTAX ERROR in $f"; exit 1; }
done

echo "== 2/3 packing win32 app (electron-builder --dir) =="
ARCH="${ARCH:-x64}"
if [ "$ARCH" = "ia32" ]; then UNP=win-ia32-unpacked; PF='$PROGRAMFILES'; SUF=-win10-x86; else UNP=win-unpacked; PF='$PROGRAMFILES64'; SUF=; fi
rm -rf ../../dist-installer/$UNP
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win --$ARCH --dir --config electron-builder.yml 2>&1 | tail -2

echo "== 3/3 compiling NSIS installer =="
VER=$(node -p "require('./app-stage/package.json').version")
KB=$(du -sk ../../dist-installer/$UNP | cut -f1)
echo "version=$VER  installed-KB=$KB"
cp -f ../../electron-src/icon.ico ./icon.ico
sed -e "s/__APP_VERSION__/${VER}/g" -e "s/__ESTIMATED_KB__/${KB}/g" -e "s/__UNPACKED__/${UNP}/g" -e "s|__PF__|${PF}|g" -e "s/__OUT__/dist-installer/g" -e "s/__SUFFIX__/${SUF}/g" \
  labpos-setup.nsi > labpos-setup.build.nsi
makensis -V2 labpos-setup.build.nsi

echo "== done =="
ls -lh ../../dist-installer/Optix-LAB-MedSync-Setup-${VER}${SUF}.exe
