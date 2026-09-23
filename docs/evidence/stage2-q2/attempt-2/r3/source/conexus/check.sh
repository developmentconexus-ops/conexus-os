#!/bin/sh
# Builds app/ and the conexus/ server half the way Conexus builds them before a Preview. Run it from the repository root.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
ln -sfn /opt/conexus/compiler/node_modules "$root/app/node_modules"
cd "$root/app"
CONEXUS_COMPILE_ROOT="$root/app" node /opt/conexus/compiler/node_modules/vite/bin/vite.js build --config /opt/conexus/compiler/vite.config.mjs --configLoader native --outDir /tmp/conexus-check-dist --emptyOutDir
node /opt/conexus/server-build.mjs "$root" /tmp/conexus-check-dist
