#!/usr/bin/env bash
# Hosting spikes for the hosting study (study.md, section 6). Needs Docker and `npm ci`.
# Run from the repository root: bash docs/research/hosting/spike.sh
# Every container it starts is named spike-hosting-* and removed at the end.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
PG='postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
work=$(mktemp -d); trap 'docker rm -f spike-hosting-pg >/dev/null 2>&1; rm -rf "$work"' EXIT

fresh() {
  docker rm -f spike-hosting-pg >/dev/null 2>&1
  docker run -d --name spike-hosting-pg -p 127.0.0.1:55433:5432 -e POSTGRES_PASSWORD=spike-only "$PG" >/dev/null
  until docker exec spike-hosting-pg pg_isready -U postgres -q 2>/dev/null; do sleep 1; done; sleep 2
}
P() { docker exec -i spike-hosting-pg psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
migrate() { # database role
  printf 'postgresql://%s:spike-only@127.0.0.1:55433/%s\n' "$2" "$1" > "$work/$1.url"; chmod 600 "$work/$1.url"
  CONEXUS_MIGRATION_DATABASE_URL_FILE="$work/$1.url" node scripts/run-hub-migrations.mjs 2>&1 \
    | grep -oE '"verdict":"PASS"|^error: .*' | head -1 | sed "s/^/  [$1 as $2] /"
}
neon_like() { # role; a member of neon_superuser with CREATEDB CREATEROLE BYPASSRLS, never SUPERUSER
  P -c "create role neon_superuser nologin createdb createrole bypassrls replication"
  P -c "create role $1 login password 'spike-only' createdb createrole bypassrls in role neon_superuser"
}

echo 'S1 Hub migrations as the cluster superuser'
fresh; P -c 'create database ctl'; migrate ctl postgres

echo 'S2 Hub migrations as a Neon-like role, PostgreSQL default createrole_self_grant'
fresh; neon_like migrator; P -c 'create database neon owner migrator'; migrate neon migrator

echo "S3 the same with createrole_self_grant 'set, inherit'; then the first file that fails"
fresh; neon_like migrator; P -c "alter role migrator set createrole_self_grant = 'set, inherit'"
P -c 'create database neon owner migrator'; migrate neon migrator
for file in apps/hub/migrations/*.sql; do
  out=$(docker exec -i -e PGPASSWORD=spike-only spike-hosting-pg psql -h 127.0.0.1 -U migrator -d neon -v ON_ERROR_STOP=1 -qtA < "$file" 2>&1)
  if grep -q ERROR <<< "$out"; then echo "  first failing file: $(basename "$file"): $(grep -m1 ERROR <<< "$out")"; break; fi
done
echo "  memberships the creating role holds in Hub and owner roles:"
P -d neon -c "select count(*) from pg_auth_members m where pg_get_userbyid(m.member) = 'migrator' and (pg_get_userbyid(m.roleid) like 'hub\_%' or pg_get_userbyid(m.roleid) like '%\_owner' or pg_get_userbyid(m.roleid) = 'iam_rls')" | sed 's/^/  /'

echo 'S4 two installations in one cluster'
fresh; P -c 'create database first'; P -c 'create database second'; migrate first postgres; migrate second postgres
P -c "select '  hub_runtime may connect to ' || string_agg(datname, ' and ') from pg_database where datname in ('first', 'second') and has_database_privilege('hub_runtime', datname, 'CONNECT')"

echo 'S5 unprivileged user namespaces inside a Docker container (the runner needs them, sandbox.ts)'
try() { if docker run --rm --user 999 "$@" --entrypoint unshare "$PG" -U -r -n -p -f --mount-proc true >/dev/null 2>&1; then echo "  allowed: ${*:-Docker defaults}"; else echo "  refused: ${*:-Docker defaults}"; fi; }
try
try --security-opt seccomp=unconfined
try --security-opt seccomp=unconfined --security-opt systempaths=unconfined
