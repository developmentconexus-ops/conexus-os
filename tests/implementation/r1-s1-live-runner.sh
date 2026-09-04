#!/usr/bin/env bash
set -euo pipefail

tar -C /source --exclude=.git --exclude=node_modules --exclude=.wireframe-preview -cf - . | tar -C /work -xf -
cd /work
test "$(node --version)" = "v24.20.0"
test -x node_modules/.bin/playwright
node -e "const fs=require('node:fs'); for (const [path,value] of [['/tmp/kc-admin','admin-test-only'],['/tmp/oidc-primary','primary-test-only'],['/tmp/oidc-other','other-test-only'],['/tmp/oidc-user','user-test-only'],['/tmp/db-runtime','runtime-test-only']]) fs.writeFileSync(path, value+'\n', { mode: 0o600 })"
node tests/implementation/r1-s1-live-setup.mjs

export CONEXUS_BOOTSTRAP_SUBJECT="$(tr -d '\r\n' </tmp/bootstrap-subject)"
export NODE_ENV=test
export CONEXUS_TEST_ALLOW_INSECURE_OIDC=true
export CONEXUS_ORIGIN=http://localhost:3000
export CONEXUS_OIDC_ISSUER=http://keycloak:8080/realms/r1f
export CONEXUS_OIDC_CLIENT_ID=r1f-primary
export CONEXUS_OIDC_CLIENT_SECRET_FILE=/tmp/oidc-primary
export CONEXUS_DB_HOST=postgres
export CONEXUS_DB_PORT=5432
export CONEXUS_DB_NAME=conexus_s1
export CONEXUS_DB_USER=hub_iam_runtime
export CONEXUS_DB_PASSWORD_FILE=/tmp/db-runtime
export CONEXUS_LIVE_USER_PASSWORD=user-test-only

hub_build_root="$(mktemp -d /work/apps/hub/.conexus-build-XXXXXX)"
node node_modules/typescript/bin/tsc --project apps/hub/tsconfig.json --noEmit false --outDir "$hub_build_root"
node "$hub_build_root/server.js" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; rm -rf "$hub_build_root"' EXIT
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:3000 >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://localhost:3000 >/dev/null
./node_modules/.bin/playwright test tests/implementation/r1-s1-live-browser.spec.mjs --workers=1 --reporter=line
