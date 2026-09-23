#!/bin/bash
# Sandbox-side fidelity check, run as conexus-agent (the cluster's initdb owner) inside the E2B
# spike sandbox. The docker comparison path does not use this script: a plain postgres:17.10
# container already runs its cluster, so docker-fidelity.mjs applies the same SQL files straight
# through `docker exec ... psql` instead of starting one.
# Starts a warm cluster from the baked seed, provisions the Q1 role/schema shape, applies the
# migration, runs the legitimate handler's SQL, then runs both attack files and prints one
# `RESULT <id> <REFUSED|BREACH> <sqlstate>` line per attack so the caller can diff sandbox vs
# comparison output. Assumes provision.sql, 001_follow_up_note.sql, handler-smoke.sql,
# attacks-migration.sql and attacks-cross-project.sql are already in the working directory, and
# PGBIN/PGDATA_SEED are set by the caller.
set -euo pipefail
PGBIN="${PGBIN:?set PGBIN}"
SEED="${PGDATA_SEED:?set PGDATA_SEED}"
DATA=/tmp/pgdata-fidelity
PORT=55433

rm -rf "$DATA"
cp -a "$SEED" "$DATA"
"$PGBIN/pg_ctl" -D "$DATA" -l /tmp/pglog-fidelity.log -o "-p $PORT -k /tmp -c listen_addresses=''" start
trap '"$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true' EXIT
until "$PGBIN/pg_isready" -h /tmp -p "$PORT" >/dev/null 2>&1; do sleep 0.05; done

PSQL="$PGBIN/psql -h /tmp -p $PORT -v ON_ERROR_STOP=1 -q"

echo "== provision =="
$PSQL -U "$(id -un)" -d postgres -f provision.sql

echo "== migration (p_a_migrator) =="
$PSQL -U p_a_migrator -d conexus_apps -f 001_follow_up_note.sql

echo "== handler smoke (p_a_runtime) =="
$PSQL -U p_a_runtime -d conexus_apps -f handler-smoke.sql

echo "== migration attacks (p_a_migrator) =="
$PGBIN/psql -h /tmp -p "$PORT" -U p_a_migrator -d conexus_apps -q -f attacks-migration.sql 2>&1 | grep -E 'RESULT ' | sed 's/^NOTICE:  //'

echo "== cross-project attacks (p_a_runtime) =="
$PGBIN/psql -h /tmp -p "$PORT" -U p_a_runtime -d conexus_apps -q -f attacks-cross-project.sql 2>&1 | grep -E 'RESULT ' | sed 's/^NOTICE:  //'
