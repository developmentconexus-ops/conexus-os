#!/bin/bash
# Runs the guard mutation lever on freshly created throwaway clusters, so no earlier run's roles or
# grants decide an outcome: an Applications test cluster (conexus-lever-apps, 55462) started by the
# repository's run script on an ordinary directory, and a Hub test cluster (conexus-lever-hub, 55463).
# The two cluster-state mutations each get fresh clusters of their own. Needs Docker, bubblewrap and
# the repository's Node; writes guard-mutations.txt beside this file.
set -uo pipefail
repository="$(cd "$(dirname "$0")/../../.." && pwd)"
image=postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f
out="$repository/docs/evidence/stage2-q1/guard-mutations.txt"
work="$(mktemp -d)"
head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$work/apps-pw"
head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$work/hub-pw"
chmod 600 "$work/apps-pw" "$work/hub-pw"
cleanup() {
  docker rm -f conexus-lever-apps conexus-lever-hub >/dev/null 2>&1
  docker run --rm --mount "type=bind,source=$work,target=/s" --entrypoint rm "$image" -rf /s/apps/pgdata
  rm -rf "$work"
}
trap cleanup EXIT
fresh() {
  docker rm -f conexus-lever-apps conexus-lever-hub >/dev/null 2>&1
  mkdir -p "$work/apps"
  docker run --rm --mount "type=bind,source=$work/apps,target=/s" "$image" sh -c 'rm -rf /s/pgdata && mkdir -m 700 /s/pgdata && chown 999:999 /s/pgdata'
  touch "$work/apps/.conexus-apps-storage"
  CONEXUS_APP_CLUSTER_UNMOUNTED_STORAGE=ci bash "$repository/scripts/run-application-cluster.sh" conexus-lever-apps 55462 "$work/apps" "$work/apps-pw" >/dev/null
  docker run -d --name conexus-lever-hub -e POSTGRES_DB=conexus_test -e POSTGRES_PASSWORD="$(cat "$work/hub-pw")" -p 127.0.0.1:55463:5432 "$image" >/dev/null
  for container in conexus-lever-apps conexus-lever-hub; do
    for _ in $(seq 1 60); do docker exec "$container" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 1; done
  done
  rm -rf "$work/tls"
  (cd "$repository" && node scripts/confine-application-cluster.mjs --container conexus-lever-apps --authority-dir "$work/tls/authority" --tls-dir "$work/tls/relay" --database '/^conexus_apps_[0-9a-f]{12}$' >/dev/null)
}
lever() {
  (cd "$repository" && \
    CONEXUS_TEST_DB_HOST=127.0.0.1 CONEXUS_TEST_DB_PORT=55463 CONEXUS_TEST_DB_NAME=conexus_test CONEXUS_TEST_DB_USER=postgres \
    CONEXUS_TEST_DB_PASSWORD="$(cat "$work/hub-pw")" CONEXUS_TEST_DB_CONTAINER=conexus-lever-hub \
    CONEXUS_TEST_APP_DB_HOST=127.0.0.1 CONEXUS_TEST_APP_DB_PORT=55462 CONEXUS_TEST_APP_DB_USER=postgres \
    CONEXUS_TEST_APP_DB_PASSWORD="$(cat "$work/apps-pw")" CONEXUS_TEST_APP_TLS_DIR="$work/tls/relay" \
    node tests/implementation/guard-mutations.mjs "$@")
}
: > "$out"
fresh; lever no-reserved-connections-inherit >> "$out"
fresh; lever no-public-connect-revoke >> "$out"
fresh; lever no-language-revoke no-tls-key-check no-tls-reset no-storage-mountpoint-check no-storage-entrypoint-guard \
  no-valid-until no-ledger-rls runtime-gets-create schemas-open-to-public no-role-temp-file-limit no-role-transaction-timeout \
  no-language-startup-check no-runtime-privilege-restore no-relay-dir-files-check no-relay-dir-mode-check no-unshare-net \
  no-relay-cancel no-hub-cluster-refusal >> "$out"
cat "$out"
