#!/bin/bash
# Brings up the pilot's Applications PostgreSQL on its fixed-size filesystem, after a backup.
# Converges on rerun. Never prints a secret.
set -euo pipefail
source "$HOME/.nvm/nvm.sh" >/dev/null
cd "$HOME/wt-q1" && nvm use >/dev/null
secrets="$HOME/.local/share/conexus/pilot/slice7/secrets"
env_file="$HOME/wt-rmmc/.audit/slice7/hub.env"
hub=conexus-s7-postgres
apps=conexus-apps-postgres
port=5434
pgdata=/var/lib/conexus/applications-postgres/pgdata
apps_root="$secrets/db-apps-root"

dir="$HOME/.local/share/conexus/pilot/slice7/backups/q1-apps-cluster-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p -m 700 "$dir"
docker exec $hub pg_dump -U postgres -Fc conexus_s7 > "$dir/conexus_s7.dump"
docker exec $hub pg_dump -U postgres -Fc conexus_apps > "$dir/conexus_apps.dump"
docker exec $hub pg_dumpall -U postgres --globals-only > "$dir/hub-globals.sql"
for f in pg_hba.conf pg_ident.conf postgresql.auto.conf; do docker exec -u postgres $hub cat "/var/lib/postgresql/data/$f" > "$dir/hub-$f"; done
cp -p "$env_file" "$dir/hub.env.bak"
chmod 600 "$dir"/*
echo "backup $dir"
echo "conexus_s7 table-data entries: $(docker exec -i $hub pg_restore --list < "$dir/conexus_s7.dump" | grep -c 'TABLE DATA')"
echo "conexus_apps table-data entries: $(docker exec -i $hub pg_restore --list < "$dir/conexus_apps.dump" | grep -c 'TABLE DATA')"
ls -la "$dir" | tail -n +2 | awk '{print $1, $5, $9}'

[ -f "$apps_root" ] || (umask 077 && head -c 32 /dev/urandom | base64 | tr -d '/+=\n' > "$apps_root")
if ! docker inspect $apps >/dev/null 2>&1; then
  bash scripts/run-application-cluster.sh $apps $port "$pgdata" "$apps_root" >/dev/null
fi
for i in $(seq 1 90); do docker exec $apps pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 1; done
docker exec $apps pg_isready -U postgres -h 127.0.0.1

node scripts/confine-application-cluster.mjs --container $apps --authority-dir "$secrets/apps-cluster-authority" --tls-dir "$secrets/apps-relay-tls" --database conexus_apps
CONEXUS_APP_DB_HOST=127.0.0.1 CONEXUS_APP_DB_PORT=$port CONEXUS_APP_DB_NAME=conexus_apps \
CONEXUS_APP_DB_INSTALL_USER=postgres CONEXUS_APP_DB_INSTALL_PASSWORD_FILE="$apps_root" \
CONEXUS_DB_APP_PROVISIONER_PASSWORD_FILE="$secrets/db-app-provisioner" \
  node --env-file="$env_file" scripts/provision-application-database.mjs
