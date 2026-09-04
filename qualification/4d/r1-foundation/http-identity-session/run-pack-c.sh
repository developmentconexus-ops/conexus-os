#!/usr/bin/env bash
set -euo pipefail

NODE_HOME=/home/leandrotheodoro/.cache/conexus-r1-admission/node-v24.20.0
NPM_CLI=/home/leandrotheodoro/.nvm/versions/node/v24.18.0/lib/node_modules/npm/bin/npm-cli.js
SOURCE_ROOT=/mnt/c/Users/leandro.theodoro/Documents/conexus-os/qualification/4d/r1-foundation
KEYCLOAK_CACHE_TAG=conexus-r1f-keycloak:26.7.2-optimized
EXPECTED_KEYCLOAK_CACHE_IMAGE=sha256:a3b52c7dfe3c27df11c0665957d92b9eb3a3b73b640a5cde4c2473385833585c
POSTGRES_IMAGE=docker.io/library/postgres@sha256:6e5a6518f9d2ff9e9f4cba2a5a87d8f41b0f067f6f92ac847c344351a6c8d923
DOCKER='/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe'
REDIRECT_URI=http://127.0.0.1:43123/callback
PATH="$NODE_HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH

SOURCE_ROOT_WIN=$(wslpath -w "$SOURCE_ROOT")
if ! "$DOCKER" image inspect "$KEYCLOAK_CACHE_TAG" >/dev/null 2>&1; then
  "$DOCKER" build \
    --file "$SOURCE_ROOT_WIN\\http-identity-session\\keycloak-optimized.Dockerfile" \
    --tag "$KEYCLOAK_CACHE_TAG" \
    "$SOURCE_ROOT_WIN\\http-identity-session" >/dev/null
fi
KEYCLOAK_IMAGE=$("$DOCKER" image inspect --format '{{.Id}}' "$KEYCLOAK_CACHE_TAG")
if [ "$KEYCLOAK_IMAGE" != "$EXPECTED_KEYCLOAK_CACHE_IMAGE" ]; then
  printf 'unadmitted Keycloak qualification cache image\n' >&2
  exit 1
fi

RUN_ID=$(openssl rand -hex 6)
RUN_ROOT=$(mktemp -d -t conexus-r1f-pack-c-XXXXXXXX)
PG_NAME="conexus-r1f-pg-$RUN_ID"
KC_NAME="conexus-r1f-kc-$RUN_ID"

cleanup() {
  "$DOCKER" rm -f "$KC_NAME" >/dev/null 2>&1 || true
  "$DOCKER" rm -f "$PG_NAME" >/dev/null 2>&1 || true
  rm -rf -- "$RUN_ROOT"
}
on_error() {
  local code=$?
  local line=$1
  trap - ERR
  printf 'pack-c-error line=%s code=%s\n' "$line" "$code" >&2
  "$DOCKER" logs --tail 30 "$KC_NAME" 2>/dev/null >&2 || true
  "$DOCKER" logs --tail 30 "$PG_NAME" 2>/dev/null >&2 || true
  return "$code"
}
trap 'on_error $LINENO' ERR
trap cleanup EXIT INT TERM

for file in pg-password keycloak-admin-password oidc-primary-secret oidc-other-secret oidc-user-password; do
  openssl rand -base64 36 | tr -d '\n' > "$RUN_ROOT/$file"
  chmod 0600 "$RUN_ROOT/$file"
done

PG_PASSWORD=$(<"$RUN_ROOT/pg-password")
KC_ADMIN_PASSWORD=$(<"$RUN_ROOT/keycloak-admin-password")

"$DOCKER" run --detach --name "$PG_NAME" --platform linux/amd64 \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_USER=r1f \
  --env POSTGRES_DB=r1f \
  --env POSTGRES_PASSWORD="$PG_PASSWORD" \
  "$POSTGRES_IMAGE" >/dev/null

"$DOCKER" run --detach --name "$KC_NAME" --platform linux/amd64 \
  --publish 127.0.0.1::8080 \
  --env KC_BOOTSTRAP_ADMIN_USERNAME=r1f-admin \
  --env KC_BOOTSTRAP_ADMIN_PASSWORD="$KC_ADMIN_PASSWORD" \
  "$KEYCLOAK_IMAGE" start --optimized --http-enabled=true --hostname-strict=false >/dev/null

if [ "$("$DOCKER" inspect --format '{{.State.Running}}' "$PG_NAME")" != true ]; then
  "$DOCKER" logs --tail 50 "$PG_NAME" >&2
  exit 1
fi
if [ "$("$DOCKER" inspect --format '{{.State.Running}}' "$KC_NAME")" != true ]; then
  "$DOCKER" logs --tail 50 "$KC_NAME" >&2
  exit 1
fi

PG_PORT=$("$DOCKER" port "$PG_NAME" 5432/tcp | sed 's/.*://')
KC_PORT=$("$DOCKER" port "$KC_NAME" 8080/tcp | sed 's/.*://')

for _ in $(seq 1 180); do
  if [ "$("$DOCKER" inspect --format '{{.State.Running}}' "$PG_NAME")" != true ]; then
    "$DOCKER" logs --tail 50 "$PG_NAME" >&2
    exit 1
  fi
  if "$DOCKER" exec "$PG_NAME" pg_isready --username r1f --dbname r1f >/dev/null 2>&1; then break; fi
  sleep 2
done
"$DOCKER" exec "$PG_NAME" pg_isready --username r1f --dbname r1f >/dev/null

for _ in $(seq 1 180); do
  if [ "$("$DOCKER" inspect --format '{{.State.Running}}' "$KC_NAME")" != true ]; then
    "$DOCKER" logs --tail 50 "$KC_NAME" >&2
    exit 1
  fi
  if curl --fail --silent "http://127.0.0.1:$KC_PORT/realms/master/.well-known/openid-configuration" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl --fail --silent "http://127.0.0.1:$KC_PORT/realms/master/.well-known/openid-configuration" >/dev/null

mkdir -p "$RUN_ROOT/npm"
cp "$SOURCE_ROOT/package.json" "$SOURCE_ROOT/package-lock.json" "$SOURCE_ROOT/.npmrc" "$RUN_ROOT/npm/"
cp -r "$SOURCE_ROOT/http-identity-session" "$RUN_ROOT/npm/"
cd "$RUN_ROOT/npm"
node "$NPM_CLI" ci --strict-allow-scripts --registry=https://registry.npmjs.org/ >/dev/null

node --test http-identity-session/http-harness.test.mjs

R1F_PG_HOST=127.0.0.1 \
R1F_PG_PORT="$PG_PORT" \
R1F_PG_DATABASE=r1f \
R1F_PG_USER=r1f \
R1F_PG_PASSWORD_FILE="$RUN_ROOT/pg-password" \
node --test http-identity-session/session-store.test.mjs

R1F_KEYCLOAK_BASE_URL="http://127.0.0.1:$KC_PORT" \
R1F_OIDC_REDIRECT_URI="$REDIRECT_URI" \
R1F_KEYCLOAK_ADMIN_USERNAME=r1f-admin \
R1F_KEYCLOAK_ADMIN_PASSWORD_FILE="$RUN_ROOT/keycloak-admin-password" \
R1F_OIDC_PRIMARY_SECRET_FILE="$RUN_ROOT/oidc-primary-secret" \
R1F_OIDC_OTHER_SECRET_FILE="$RUN_ROOT/oidc-other-secret" \
R1F_OIDC_USER_PASSWORD_FILE="$RUN_ROOT/oidc-user-password" \
node --test http-identity-session/oidc-probe.test.mjs

printf 'pack-c=PASS\npostgres-port=dynamic\nkeycloak-port=dynamic\ncleanup=pending-trap\n'
