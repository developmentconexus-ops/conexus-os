#!/bin/bash
# Prototype for the Project check: what the Builder's E2B sandbox would run before Preview to
# prove a Project's migrations and a handler apply cleanly against a real Postgres 17. Starts a
# disposable cluster from the template's warm baked seed (step 2 measured warm at 215 ms median
# vs 861 ms for a fresh initdb, well inside the check's budget), provisions one Project's
# migrator/runtime role pair (schema-owner + DML-only, public revoked, matching the Q1 arena
# shape proven in fidelity.sh), applies conexus/migrations/*.sql in order as the migrator role,
# then runs a trivial smoke query as the runtime role. Always stops the cluster and always prints
# one JSON verdict line, whether or not the checks passed, so a caller can parse stdout
# unconditionally and use the exit code to gate the Project check.
set -uo pipefail
PGBIN="${PGBIN:?set PGBIN}"
SEED="${PGDATA_SEED:?set PGDATA_SEED}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-./conexus/migrations}"
SCHEMA="${PROJECT_SCHEMA:-app}"
MIGRATOR="${MIGRATOR_ROLE:-app_migrator}"
RUNTIME="${RUNTIME_ROLE:-app_runtime}"
DATA=/tmp/pgdata-check
PORT=55434
START_MS=$(date +%s%N)

json_exit() {
  local ok="$1" error="$2" applied="$3" smoke_ok="$4"
  local elapsed=$(( ($(date +%s%N) - START_MS) / 1000000 ))
  printf '{"ok":%s,"error":%s,"migrationsApplied":%s,"smokeOk":%s,"elapsedMs":%d}\n' \
    "$ok" "$error" "$applied" "$smoke_ok" "$elapsed"
  exit "$5"
}

# node ships in the base image (this is a Node E2B template); avoid assuming python3 is present.
json_string() { node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8").slice(0,500)))'; }

rm -rf "$DATA"
cp -a "$SEED" "$DATA"
if ! "$PGBIN/pg_ctl" -D "$DATA" -l /tmp/pglog-check.log -o "-p $PORT -k /tmp -c listen_addresses=''" start >/tmp/pgctl-check.log 2>&1; then
  json_exit false '"cluster start failed"' '[]' false 1
fi
trap '"$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 100); do
  "$PGBIN/pg_isready" -h /tmp -p "$PORT" >/dev/null 2>&1 && break
  sleep 0.05
done

OWNER="$(id -un)"
PSQL_SUPER="$PGBIN/psql -h /tmp -p $PORT -v ON_ERROR_STOP=1 -q -U $OWNER -d postgres"
PSQL_MIGRATOR="$PGBIN/psql -h /tmp -p $PORT -v ON_ERROR_STOP=1 -q -U $MIGRATOR -d app"
PSQL_RUNTIME="$PGBIN/psql -h /tmp -p $PORT -v ON_ERROR_STOP=1 -q -U $RUNTIME -d app"

provision_err=$($PSQL_SUPER <<SQL 2>&1
create database app;
\c app
revoke all on schema public from public;
revoke all on database app from public;
create role $MIGRATOR login nosuperuser nocreatedb nocreaterole;
create role $RUNTIME login nosuperuser nocreatedb nocreaterole;
create schema $SCHEMA authorization $MIGRATOR;
grant connect on database app to $RUNTIME;
grant connect on database app to $MIGRATOR;
grant usage on schema $SCHEMA to $RUNTIME;
alter default privileges for role $MIGRATOR in schema $SCHEMA grant select, insert, update, delete on tables to $RUNTIME;
alter default privileges for role $MIGRATOR in schema $SCHEMA grant usage, select on sequences to $RUNTIME;
alter role $MIGRATOR set search_path to $SCHEMA;
alter role $RUNTIME set search_path to $SCHEMA;
SQL
)
if [ $? -ne 0 ]; then
  json_exit false "$(printf '%s' "$provision_err" | json_string)" '[]' false 1
fi

applied=()
migrate_err=""
for f in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$f" ] || continue
  if ! out=$($PSQL_MIGRATOR -f "$f" 2>&1); then
    migrate_err="$out"
    break
  fi
  applied+=("\"$(basename "$f")\"")
done
applied_json="[$(IFS=,; echo "${applied[*]:-}")]"

if [ -n "$migrate_err" ]; then
  err_json=$(printf '%s' "$migrate_err" | json_string)
  json_exit false "$err_json" "$applied_json" false 1
fi

smoke_ok=true
smoke_err=$($PSQL_RUNTIME -c 'select 1' 2>&1) || smoke_ok=false
if [ "$smoke_ok" = false ]; then
  err_json=$(printf '%s' "$smoke_err" | json_string)
  json_exit false "$err_json" "$applied_json" false 1
fi

json_exit true null "$applied_json" true 0
