#!/bin/bash
# Builds the static web files for Cloudflare Pages into ./dist, with the same layout that is live:
#   /            the website (site/)
#   /app/        the web app (index.html + assets/)
#   /superadmin/ the operator console (cloud/superadmin/)
# Build command: npm run build      Output directory: dist      (no deploy command needed)
set -e
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist/app dist/superadmin
cp -R site/. dist/
cp index.html dist/app/
cp -R assets dist/app/
cp cloud/superadmin/index.html dist/superadmin/
cp -R cloud/superadmin/assets dist/superadmin/
echo "built: $(find dist -type f | wc -l | tr -d ' ') files in dist/"
