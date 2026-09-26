#!/usr/bin/env bash
# Create the Conexus Keycloak from scratch: a container of the pinned image, the realm `conexus` imported
# from realm-conexus.json, and the Hub client's secret set from the Hub's own secret file.
#
# Usage:
#   infra/keycloak/provision.sh --client-secret-file <path> [--users-file <path>] [--theme-jar <path>]
#     [--container conexus-keycloak] [--port 8443] [--hostname https://hub.conexus.localhost:8443]
#     [--tls-dir ~/.local/share/conexus-local-tls] [--no-tls]
#
# The realm is the whole configuration: infra/keycloak/realm-conexus.json holds every setting that differs
# from Keycloak's defaults, and the README says why. --users-file is a users export from export-users.sh
# (people with their password hashes, kept outside the repository); without it the realm has no users.
# The bootstrap admin password is generated here and lives only in the container's environment, where
# `docker exec` reads it, as in install-theme.sh. Nothing secret is printed.

set -euo pipefail

IMAGE="quay.io/keycloak/keycloak@sha256:c2a17fe407e892196d0b7cf9cef54e60952d6c372a9205f661a9efa0911463b0"
CONTAINER="conexus-keycloak"
PORT="8443"
HOSTNAME_URL="https://hub.conexus.localhost:8443"
TLS_DIR="$HOME/.local/share/conexus-local-tls"
REALM="conexus"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
client_secret_file=""
users_file=""
theme_jar=""
tls=1

while [ $# -gt 0 ]; do
  case "$1" in
    --client-secret-file) client_secret_file="$2"; shift 2 ;;
    --users-file) users_file="$2"; shift 2 ;;
    --theme-jar) theme_jar="$2"; shift 2 ;;
    --container) CONTAINER="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --hostname) HOSTNAME_URL="$2"; shift 2 ;;
    --tls-dir) TLS_DIR="$2"; shift 2 ;;
    --no-tls) tls=0; shift ;;
    *) echo "usage: $0 --client-secret-file <path> [--users-file <path>] [--theme-jar <path>] [--container n] [--port p] [--hostname url] [--tls-dir d] [--no-tls]" >&2; exit 2 ;;
  esac
done
[ -f "$client_secret_file" ] || { echo "error: --client-secret-file is required and must exist" >&2; exit 1; }
[ -z "$users_file" ] || [ -f "$users_file" ] || { echo "error: $users_file not found" >&2; exit 1; }
docker inspect "$CONTAINER" >/dev/null 2>&1 && { echo "error: container $CONTAINER already exists; remove or rename it first" >&2; exit 1; }
if docker ps --format '{{.Ports}}' | grep -q "127.0.0.1:$PORT->"; then
  echo "error: port $PORT is held by a running container; stop or rename it first" >&2; exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"
mkdir "$work/import"
CX_USERS="$users_file" node -e '
  const fs = require("node:fs")
  const realm = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  if (process.env.CX_USERS) realm.users = JSON.parse(fs.readFileSync(process.env.CX_USERS, "utf8"))
  fs.writeFileSync(process.argv[2], JSON.stringify(realm))
' "$REPO_ROOT/infra/keycloak/realm-conexus.json" "$work/import/realm-conexus.json"

admin_password="$(openssl rand -hex 24)"
args=(--name "$CONTAINER" -p "127.0.0.1:$PORT:$([ "$tls" = 1 ] && echo 8443 || echo 8080)"
  -e KC_BOOTSTRAP_ADMIN_USERNAME=conexus-admin -e KC_BOOTSTRAP_ADMIN_PASSWORD="$admin_password"
  -v "$CONTAINER-data:/opt/keycloak/data")
# Plain HTTP stays on for kcadm inside the container; only the HTTPS port is published to the host.
cmd=(start-dev --import-realm --hostname "$HOSTNAME_URL" --http-enabled=true)
if [ "$tls" = 1 ]; then
  args+=(-v "$TLS_DIR/server.pem:/tls/server.pem:ro" -v "$TLS_DIR/server-key.pem:/tls/server-key.pem:ro")
  cmd+=(--https-port=8443 --https-certificate-file=/tls/server.pem --https-certificate-key-file=/tls/server-key.pem)
fi

docker create "${args[@]}" "$IMAGE" "${cmd[@]}" >/dev/null
unset admin_password
tar -C "$work" -cf - import | docker cp - "$CONTAINER:/opt/keycloak/data/"
[ -z "$theme_jar" ] || docker cp "$theme_jar" "$CONTAINER:/opt/keycloak/providers/conexus-keycloak-theme.jar"
docker start "$CONTAINER" >/dev/null

kcadm() {
  docker exec -i "$CONTAINER" bash -c '
    /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master \
      --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1
    /opt/keycloak/bin/kcadm.sh "$@"
  ' kcadm "$@"
}

echo "Waiting for Keycloak..."
for _ in $(seq 1 90); do
  if kcadm get "realms/$REALM" --fields realm </dev/null >/dev/null 2>&1; then break; fi
  sleep 3
done
kcadm get "realms/$REALM" --fields realm </dev/null >/dev/null

client_id="$(kcadm get clients -r "$REALM" -q clientId=conexus-hub --fields id --format csv --noquotes </dev/null)"
[ -n "$client_id" ] || { echo "error: client conexus-hub was not imported" >&2; exit 1; }
{ printf 'secret='; cat "$client_secret_file"; } | docker exec -i "$CONTAINER" bash -c '
  IFS= read -r line
  /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master \
    --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1
  /opt/keycloak/bin/kcadm.sh update "clients/'"$client_id"'" -r conexus -s "$line"
'
# The import ran once; the file held the people's password hashes and is not kept.
docker exec "$CONTAINER" rm -f /opt/keycloak/data/import/realm-conexus.json
echo "Realm $REALM is ready on $HOSTNAME_URL (container $CONTAINER, data volume $CONTAINER-data)."
