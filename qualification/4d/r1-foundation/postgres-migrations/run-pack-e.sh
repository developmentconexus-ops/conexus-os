#!/usr/bin/env bash
set -euo pipefail

NODE_HOME=/home/leandrotheodoro/.cache/conexus-r1-admission/node-v24.20.0
NPM_CLI=/home/leandrotheodoro/.nvm/versions/node/v24.18.0/lib/node_modules/npm/bin/npm-cli.js
ATLAS=/home/leandrotheodoro/.cache/conexus-r1-admission/atlas-community-1.3.0/atlas
SOURCE_ROOT=/mnt/c/Users/leandro.theodoro/Documents/conexus-os/qualification/4d/r1-foundation
POSTGRES_IMAGE=docker.io/library/postgres@sha256:6e5a6518f9d2ff9e9f4cba2a5a87d8f41b0f067f6f92ac847c344351a6c8d923
DOCKER='/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe'
PATH="$NODE_HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH

printf '10d7913e3dce43ab99b8d71534a4cbadaf11a16dc293adf3b91d10e83a0ac70b  %s\n' "$ATLAS" | sha256sum --check >/dev/null
RUN_ID=$(openssl rand -hex 6)
RUN_ROOT=$(mktemp -d -t conexus-r1f-pack-e-XXXXXXXX)
PG_NAME="conexus-r1f-pack-e-$RUN_ID"

cleanup() {
  "$DOCKER" rm -f "$PG_NAME" >/dev/null 2>&1 || true
  rm -rf -- "$RUN_ROOT"
}
on_error() {
  local code=$?
  local line=$1
  trap - ERR
  printf 'pack-e-error line=%s code=%s\n' "$line" "$code" >&2
  "$DOCKER" logs --tail 40 "$PG_NAME" 2>/dev/null >&2 || true
  return "$code"
}
trap 'on_error $LINENO' ERR
trap cleanup EXIT INT TERM

openssl rand -base64 36 | tr -d '\n' > "$RUN_ROOT/pg-password"
chmod 0600 "$RUN_ROOT/pg-password"
PG_PASSWORD=$(<"$RUN_ROOT/pg-password")

"$DOCKER" run --detach --name "$PG_NAME" --platform linux/amd64 \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_USER=r1f \
  --env POSTGRES_DB=r1f \
  --env POSTGRES_PASSWORD="$PG_PASSWORD" \
  "$POSTGRES_IMAGE" >/dev/null

if [ "$("$DOCKER" inspect --format '{{.State.Running}}' "$PG_NAME")" != true ]; then
  "$DOCKER" logs --tail 50 "$PG_NAME" >&2
  exit 1
fi
PG_PORT=$("$DOCKER" port "$PG_NAME" 5432/tcp | sed 's/.*://')

for _ in $(seq 1 180); do
  if [ "$("$DOCKER" inspect --format '{{.State.Running}}' "$PG_NAME")" != true ]; then
    "$DOCKER" logs --tail 50 "$PG_NAME" >&2
    exit 1
  fi
  if "$DOCKER" exec "$PG_NAME" pg_isready --username r1f --dbname r1f >/dev/null 2>&1; then break; fi
  sleep 2
done
"$DOCKER" exec "$PG_NAME" pg_isready --username r1f --dbname r1f >/dev/null

mkdir -p "$RUN_ROOT/npm"
cp "$SOURCE_ROOT/package.json" "$SOURCE_ROOT/package-lock.json" "$SOURCE_ROOT/.npmrc" "$RUN_ROOT/npm/"
cp -r "$SOURCE_ROOT/postgres-migrations" "$RUN_ROOT/npm/"
cd "$RUN_ROOT/npm"
node "$NPM_CLI" ci --strict-allow-scripts --registry=https://registry.npmjs.org/ >/dev/null

R1F_PG_HOST=127.0.0.1 \
R1F_PG_PORT="$PG_PORT" \
R1F_PG_USER=r1f \
R1F_PG_PASSWORD_FILE="$RUN_ROOT/pg-password" \
R1F_ATLAS_PATH="$ATLAS" \
node --test postgres-migrations/pack-e.test.mjs

printf 'pack-e=PASS\npostgres-port=dynamic\ncleanup=pending-trap\n'
