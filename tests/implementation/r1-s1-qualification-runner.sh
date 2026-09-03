#!/usr/bin/env bash
set -euo pipefail

tar -C /source --exclude=node_modules --exclude=.wireframe-preview -cf - . | tar -C /work -xf -
cd /work
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0=/work

node --version
npm --version
test "$(node --version)" = "v24.20.0"
test "$(npm --version)" = "12.0.2"
npm ci
npm run r1:g0:verify
npm run r1:s1:verify
npm run verify
