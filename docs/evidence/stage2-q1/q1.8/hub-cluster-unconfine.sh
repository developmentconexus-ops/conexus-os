#!/bin/bash
# Operator-approved (2026-09-23): takes the now-inert application-role confinement off the Hub cluster.
# Backs up pg_hba.conf, pg_ident.conf and postgresql.auto.conf, removes the conexus-application-roles
# blocks, resets the four ssl settings and reloads. No restart. Then verifies.
set -euo pipefail
hub=conexus-s7-postgres
data=/var/lib/postgresql/data
dir="$HOME/.local/share/conexus/pilot/slice7/backups/q1-hub-unconfine-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p -m 700 "$dir"
for f in pg_hba.conf pg_ident.conf postgresql.auto.conf; do docker exec -u postgres $hub cat "$data/$f" > "$dir/$f"; done
chmod 600 "$dir"/*
echo "backup $dir: $(ls "$dir" | tr '\n' ' ')"
sql() { docker exec -u postgres $hub psql -X -At -v ON_ERROR_STOP=1 -c "$1"; }
echo "before: start=$(sql 'select pg_postmaster_start_time()') ssl=$(sql 'show ssl') app hba rules=$(sql "select count(*) from pg_hba_file_rules where array_to_string(user_name, ',') like '%app_%'")"
for f in pg_hba.conf pg_ident.conf; do
  docker exec -u postgres $hub sed -i '/^# conexus-application-roles begin$/,/^# conexus-application-roles end$/d' "$data/$f"
done
sql 'ALTER SYSTEM RESET ssl'
sql 'ALTER SYSTEM RESET ssl_cert_file'
sql 'ALTER SYSTEM RESET ssl_key_file'
sql 'ALTER SYSTEM RESET ssl_ca_file'
echo "file rule errors: $(sql "select count(*) from pg_hba_file_rules where error is not null") ident errors: $(sql "select count(*) from pg_ident_file_mappings where error is not null")"
sql 'SELECT pg_reload_conf()' >/dev/null
sleep 2
echo "after: start=$(sql 'select pg_postmaster_start_time()') ssl=$(sql 'show ssl') app hba rules=$(sql "select count(*) from pg_hba_file_rules where array_to_string(user_name, ',') like '%app_%'") ident maps=$(sql "select count(*) from pg_ident_file_mappings where map_name = 'conexus_app_relay'") auto.conf ssl lines=$(docker exec -u postgres $hub grep -c '^ssl' $data/postgresql.auto.conf || true)"
diff <(sed '/^# conexus-application-roles begin$/,/^# conexus-application-roles end$/d' "$dir/pg_hba.conf") <(docker exec -u postgres $hub cat $data/pg_hba.conf) && echo "pg_hba.conf: only the block was removed"
