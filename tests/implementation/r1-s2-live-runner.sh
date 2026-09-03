#!/usr/bin/env bash
set -euo pipefail

tar -C /source --exclude=.git --exclude=node_modules --exclude=.wireframe-preview -cf - . | tar -C /work -xf -
cd /work
test "$(node --version)" = "v24.20.0"
test -x node_modules/.bin/playwright
node -e "const fs=require('node:fs'); for (const [path,value] of [['/tmp/kc-admin','admin-test-only'],['/tmp/oidc-primary','primary-test-only'],['/tmp/oidc-other','other-test-only'],['/tmp/oidc-user','user-test-only'],['/tmp/db-runtime','runtime-test-only'],['/tmp/db-ws01','ws01-test-only'],['/tmp/db-s2-read','s2-read-test-only']]) fs.writeFileSync(path, value+'\n', { mode: 0o600 })"

export POSTGRES_ADMIN_PASSWORD=postgres-test-only
export KEYCLOAK_ADMIN_PASSWORD=admin-test-only
export KEYCLOAK_ADMIN_PASSWORD_FILE=/tmp/kc-admin
export OIDC_CLIENT_SECRET_FILE=/tmp/oidc-primary
export OIDC_OTHER_SECRET_FILE=/tmp/oidc-other
export OIDC_USER_PASSWORD_FILE=/tmp/oidc-user
export OIDC_SECONDARY_USER_PASSWORD=secondary-test-only
export IAM_RUNTIME_PASSWORD_FILE=/tmp/db-runtime
export WS01_COMMAND_PASSWORD_FILE=/tmp/db-ws01
export S2_READ_PASSWORD_FILE=/tmp/db-s2-read
export BOOTSTRAP_SUBJECT_FILE=/tmp/bootstrap-subject
export SECONDARY_SUBJECT_FILE=/tmp/secondary-subject
node tests/implementation/r1-s2-live-setup.mjs

export CONEXUS_BOOTSTRAP_SUBJECT="$(tr -d '\r\n' </tmp/bootstrap-subject)"
export CONEXUS_LIVE_SECONDARY_SUBJECT="$(tr -d '\r\n' </tmp/secondary-subject)"
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
export CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE=/tmp/db-ws01
export CONEXUS_DB_S2_READ_PASSWORD_FILE=/tmp/db-s2-read
export CONEXUS_LIVE_USER_PASSWORD=user-test-only
export CONEXUS_LIVE_SECONDARY_PASSWORD=secondary-test-only

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
test "$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/api/control/access-context)" = "401"
./node_modules/.bin/playwright test tests/implementation/r1-s2-live-browser.spec.mjs --workers=1 --reporter=line
