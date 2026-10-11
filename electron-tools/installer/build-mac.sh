#!/bin/bash
# macOS .dmg builds (Apple silicon + Intel), unsigned like earlier releases.
#   ./build-mac.sh [arm64|x64|both]   (default both; run from electron-tools/installer/ on a Mac)
# 1. syncs the embedded server and stages electron-src (same as build-installer.sh)
# 2. electron-builder --mac --dir  ->  ../../dist-mac-<arch>/mac[-arm64]/Optix LAB MedSync.app
# 3. hdiutil: dmgroot (app + Applications link) -> UDZO .dmg, then a .dmg.tar.gz (what the website serves)
# Output: ../../dist-mac-<arch>/Optix-LAB-MedSync-<version>-<arch>.dmg(.tar.gz)
set -euo pipefail
cd "$(dirname "$0")"
WHICH="${1:-both}"
echo "== syncing embedded server =="; ../sync-server.sh
rm -rf app-stage; cp -a ../../electron-src app-stage
for f in main.js preload.js server/server.js server/sync-store.js server/desktop-sync.js server/db-sqlite.js; do node --check "app-stage/$f"; done
VER=$(node -p "require('./app-stage/package.json').version")
build_one() {
  local ARCH="$1" OUT="../../dist-mac-$1" APPDIR
  [ "$ARCH" = "arm64" ] && APPDIR=mac-arm64 || APPDIR=mac
  rm -rf "$OUT/$APPDIR" "$OUT/dmgroot"
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --$ARCH --dir --config electron-builder-mac.yml -c.directories.output="$OUT" 2>&1 | tail -3
  mkdir -p "$OUT/dmgroot"; cp -R "$OUT/$APPDIR/Optix LAB MedSync.app" "$OUT/dmgroot/"; ln -sfn /Applications "$OUT/dmgroot/Applications"
  local DMG="$OUT/Optix-LAB-MedSync-$VER-$ARCH.dmg"
  rm -f "$DMG" "$DMG.tar.gz"
  hdiutil create -volname "Optix LAB MedSync" -srcfolder "$OUT/dmgroot" -ov -format UDZO "$DMG" >/dev/null
  (cd "$OUT" && tar czf "$(basename "$DMG").tar.gz" "$(basename "$DMG")")
  ls -lh "$DMG" "$DMG.tar.gz"
}
if [ "$WHICH" = both ] || [ "$WHICH" = arm64 ]; then build_one arm64; fi
if [ "$WHICH" = both ] || [ "$WHICH" = x64 ]; then build_one x64; fi
