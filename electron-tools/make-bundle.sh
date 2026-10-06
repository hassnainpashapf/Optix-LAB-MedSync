#!/bin/bash
# Frontend update bundle for installed desktop apps (they download it automatically and switch on the next restart):
#   ./make-bundle.sh 1.2.5  ->  dist-bundle/labpos-1.2.5.zip + prints the releases.json fields to publish.
# Upload the zip to the cloud's releases folder and set "latest", "bundleUrl", "sha256", "changelog" in releases.json.
set -euo pipefail
cd "$(dirname "$0")/.."
VER="${1:?usage: make-bundle.sh <version>}"
mkdir -p dist-bundle/stage && find dist-bundle/stage -mindepth 1 -delete
cp index.html dist-bundle/stage/ && cp -R assets dist-bundle/stage/
(cd dist-bundle/stage && zip -q -r -X "../labpos-$VER.zip" index.html assets)
SHA=$(shasum -a 256 "dist-bundle/labpos-$VER.zip" | cut -d' ' -f1)
echo "bundle: dist-bundle/labpos-$VER.zip ($(du -h dist-bundle/labpos-$VER.zip | cut -f1))"
echo "releases.json -> \"latest\": \"$VER\", \"bundleUrl\": \"<api>/releases/labpos-$VER.zip\", \"sha256\": \"$SHA\""
