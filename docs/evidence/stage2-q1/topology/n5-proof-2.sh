#!/bin/bash
# N5: confinement must never leave a cluster that cannot restart. Throwaway container on 55444.
# 1. The authority's server key is swapped for one that matches nothing: confine refuses before it
#    changes anything, ssl stays off, the container restarts.
# 2. The TLS probe the script now uses answers "not served" on that cluster (ssl off).
# 3. With the real key restored, confine loads TLS, the probe answers "served", the container restarts.
set -uo pipefail
source "$HOME/.nvm/nvm.sh" >/dev/null
cd "$HOME/wt-q1" && nvm use >/dev/null
base="$HOME/q1c/n5"
image=postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f
rm -rf "$base" && mkdir -p "$base"
docker rm -f q1c-n5 >/dev/null 2>&1
docker run -d --name q1c-n5 -e POSTGRES_PASSWORD=n5-throwaway -e POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 -p 127.0.0.1:55444:5432 "$image" >/dev/null
ready() { for i in $(seq 1 40); do docker exec q1c-n5 pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && return 0; sleep 0.5; done; return 1; }
restart_check() {
  docker restart q1c-n5 >/dev/null
  sleep 2
  ready && r=yes || r=no
  echo "after restart: $(docker inspect -f '{{.State.Status}}' q1c-n5) ready=$r ssl=$(docker exec -u postgres q1c-n5 psql -Atc 'show ssl' 2>/dev/null)"
}
probe() {
  docker exec -u postgres -e PGPASSFILE=/nonexistent q1c-n5 psql -X -w -Atc 'SELECT 1' \
    "host=127.0.0.1 dbname=postgres user=postgres sslmode=verify-full sslrootcert=/var/lib/postgresql/data/conexus-tls/ca.pem connect_timeout=5" 2>&1 | head -1
}
ready
node -e "import('./scripts/confine-application-cluster.mjs').then(m => m.ensureTlsMaterial({ authorityDir: '$base/authority', relayDir: '$base/relay' }))"
cp -p "$base/authority/server-key.pem" "$base/server-key.pem.real"
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:prime256v1 -out "$base/authority/server-key.pem" 2>/dev/null
chmod 600 "$base/authority/server-key.pem"

echo "== 1. mismatched server key"
node scripts/confine-application-cluster.mjs --container q1c-n5 --authority-dir "$base/authority" --tls-dir "$base/relay" --database conexus_apps 2>&1 | grep -o 'CONFINE_[A-Z_]*: .*' | head -1
echo "ssl after refusal: $(docker exec -u postgres q1c-n5 psql -Atc 'show ssl'); auto.conf ssl lines: $(docker exec -u postgres q1c-n5 grep -c '^ssl' /var/lib/postgresql/data/postgresql.auto.conf)"
restart_check

echo "== 2. the TLS probe on a cluster that serves no TLS"
docker exec -u postgres q1c-n5 mkdir -p -m 700 /var/lib/postgresql/data/conexus-tls
docker exec -i -u postgres q1c-n5 sh -c 'cat > /var/lib/postgresql/data/conexus-tls/ca.pem' < "$base/authority/ca.pem"
echo "probe: $(probe)"

echo "== 3. real key restored"
cp -p "$base/server-key.pem.real" "$base/authority/server-key.pem"
node scripts/confine-application-cluster.mjs --container q1c-n5 --authority-dir "$base/authority" --tls-dir "$base/relay" --database conexus_apps | tr -d '\n ' | cut -c1-200; echo
echo "probe: $(probe)"
restart_check
echo "probe after restart: $(probe)"
docker rm -f q1c-n5 >/dev/null
