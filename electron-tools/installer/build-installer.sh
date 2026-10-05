#!/bin/bash
# Build the LabPOS Windows installer with native makensis (no wine needed).
# Usage: ./build-installer.sh   (run from electron-tools/installer/)
set -euo pipefail
cd "$(dirname "$0")"

VER=$(node -p "require('./app-stage/package.json').version")
KB=$(du -sk ../../dist-installer/win-unpacked | cut -f1)

echo "version=$VER  installed-KB=$KB"

# icon next to the script for MUI_ICON
cp -f ../../electron-src/icon.ico ./icon.ico

# fill placeholders
sed -e "s/__APP_VERSION__/${VER}/g" -e "s/__ESTIMATED_KB__/${KB}/g" \
  labpos-setup.nsi > labpos-setup.build.nsi

makensis -V2 labpos-setup.build.nsi

OUT="../../dist-installer/LabPOS-Setup-${VER}.exe"
echo "---- result ----"
ls -lh "$OUT"
