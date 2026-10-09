#!/usr/bin/env bash
# Deployment spikes (study.md, section 6). Two PostgreSQL 17 hosts where Conexus is NOT a superuser, as on
# Neon, Supabase, Cloud SQL or RDS: Conexus gets one admin role that may create databases and roles, nothing more.
# P1: the control database with the simple tenant policy. P2: a company database with a schema and a login per
# app, made at runtime. P3: one company moved from host A to host B, then deleted from host A.
# P4: an admin role that bypasses row security, as Neon's neon_superuser and Supabase's postgres do.
# Needs Docker. Run from the repository root: bash docs/research/deployment/spike.sh
set -uo pipefail
PG='postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
A=spike-host-a; B=spike-host-b; work=$(mktemp -d)
trap 'docker rm -f $A $B >/dev/null 2>&1; rm -rf "$work"' EXIT
WA='aaaaaaaa-0000-0000-0000-000000000001'; WB='bbbbbbbb-0000-0000-0000-000000000002'

run() { local h=$1 u=$2 d=$3; shift 3; docker exec -i "$h" psql -X -qtA -U "$u" -d "$d" "$@" 2>&1; }
check() { local label=$1; shift; printf '  %-66s %s\n' "$label" "$(run "$@" | sed '/^$/d; s/.*ERROR: */refused: /' | tr '\n' ' ')"; }

for h in $A $B; do
  docker rm -f $h >/dev/null 2>&1
  docker run -d --name $h -e POSTGRES_PASSWORD=spike-only "$PG" >/dev/null
done
for h in $A $B; do until docker exec $h pg_isready -U postgres -q 2>/dev/null; do sleep 1; done; done; sleep 2
for h in $A $B; do
  # What a managed provider hands over. createrole_self_grant is a setting the role may set on itself (PostgreSQL 16+).
  run $h postgres postgres -v ON_ERROR_STOP=1 -c "create role platform_admin login password 'spike-only' createdb createrole" >/dev/null
done

echo 'P0 the admin role is not a superuser'
check 'rolsuper, rolbypassrls, rolcreatedb, rolcreaterole' $A platform_admin postgres \
  -c "select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname = current_user"
check 'it may not create a role that bypasses row security' $A platform_admin postgres -c 'create role escape bypassrls'

echo 'P1 the control database: one simple policy per company-scoped table'
run $A platform_admin postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
create database hub;
revoke all on database hub from public;
create role hub_runtime login password 'spike-only';
grant connect on database hub to hub_runtime;
\c hub
create schema core;
grant usage on schema core to hub_runtime;
create table core.connection (id int generated always as identity primary key, workspace_id uuid not null, name text not null);
alter table core.connection enable row level security;
alter table core.connection force row level security;
create policy tenant on core.connection
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);
grant select, insert, update, delete on core.connection to hub_runtime;
begin; set local app.workspace_id = '$WA'; insert into core.connection (workspace_id, name) values ('$WA', 'ERP da empresa A'); commit;
begin; set local app.workspace_id = '$WB'; insert into core.connection (workspace_id, name) values ('$WB', 'ERP da empresa B'); commit;
SQL
check 'runtime, company A set, a query with NO workspace filter' $A hub_runtime hub \
  -c "begin; set local app.workspace_id = '$WA'; select name from core.connection"
check 'runtime, no company set' $A hub_runtime hub -c "select count(*) from core.connection"
check 'runtime, company A set, writes a row for company B' $A hub_runtime hub \
  -c "begin; set local app.workspace_id = '$WA'; insert into core.connection (workspace_id, name) values ('$WB', 'x')"
check 'runtime turns the policy off' $A hub_runtime hub -c 'alter table core.connection disable row level security'
check 'the owning admin, no company set (FORCE applies to the owner)' $A platform_admin hub -c 'select count(*) from core.connection'
check 'runtime sets company B itself (a query the attacker writes)' $A hub_runtime hub \
  -c "begin; set local app.workspace_id = '$WB'; select name from core.connection"
echo '  logical dump of the control database:'
printf '  %-66s %s\n' '  pg_dump as the owning admin' \
  "$(docker exec $A pg_dump -U platform_admin -d hub --data-only 2>&1 >/dev/null | sed 's/.*error: *//' | head -1)"
run $A platform_admin hub -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role hub_backup login password 'spike-only';
grant connect on database hub to hub_backup;
grant usage on schema core to hub_backup;
grant select on all tables in schema core to hub_backup;
grant select on all sequences in schema core to hub_backup;
create policy backup_reads_all on core.connection for select to hub_backup using (true);
SQL
printf '  %-66s %s\n' '  pg_dump --enable-row-security as a backup role with a read-all policy' \
  "$(docker exec $A pg_dump -U hub_backup -d hub --data-only --enable-row-security 2> "$work/backup.err" | grep -c 'ERP da empresa') rows $(head -1 "$work/backup.err")"

echo 'P2 a company database and two apps, made at runtime by the admin role'
company() { # host company apps...
  local h=$1 c=$2; shift 2
  run $h platform_admin postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
create database $c;
revoke all on database $c from public;
SQL
  for app in "$@"; do
    run $h platform_admin "$c" -v ON_ERROR_STOP=1 >/dev/null <<SQL
create role ${c}_${app}_owner nologin;
create role ${c}_${app}_rt login password 'spike-${RANDOM}${RANDOM}';
grant connect on database $c to ${c}_${app}_rt;
create schema $app authorization ${c}_${app}_owner;
grant usage on schema $app to ${c}_${app}_rt;
SQL
  done
}
run $A platform_admin postgres -c "alter role platform_admin set createrole_self_grant = 'set, inherit'" >/dev/null
company $A company_a app1 app2
company $A company_b app1
run $A platform_admin company_a -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
set role company_a_app1_owner;
create table app1.note (id int primary key, body text not null);
insert into app1.note select g, 'nota ' || g from generate_series(1, 10000) g;
grant select, insert, update, delete on app1.note to company_a_app1_rt;
set role company_a_app2_owner;
create table app2.salary (id int primary key, amount int not null);
insert into app2.salary values (1, 99999);
grant select on app2.salary to company_a_app2_rt;
SQL
check 'app1 reads its own table' $A company_a_app1_rt company_a -c 'select count(*) from app1.note'
check 'app1 reads app2 of the same company' $A company_a_app1_rt company_a -c 'select amount from app2.salary'
check 'app1 switches to app2' $A company_a_app1_rt company_a -c 'set role company_a_app2_rt'
check 'app1 opens company B' $A company_a_app1_rt company_b -c 'select 1'
check 'app1 opens the control database' $A company_a_app1_rt hub -c 'select 1'
check 'app1 creates a schema' $A company_a_app1_rt company_a -c 'create schema mine'
check 'app1 creates a table in public' $A company_a_app1_rt company_a -c 'create table public.t (x int)'
check 'schema names app1 can list in its own company' $A company_a_app1_rt company_a \
  -c "select string_agg(nspname, ',' order by nspname) from pg_namespace where nspname like 'app%'"
run $B platform_admin postgres -c 'create database probe' >/dev/null
check 'without createrole_self_grant: the admin makes a schema for a new role' $B platform_admin probe \
  -c "create role probe_owner nologin; create schema probe authorization probe_owner"

echo 'P3 move company A from host A to host B, then delete it from host A'
before=$(run $A platform_admin company_a -c "select md5(string_agg(id || body, ',' order by id)) from app1.note")
t0=$(date +%s%N)
docker exec $A pg_dump -U platform_admin -d company_a -Fc > "$work/company_a.dump" 2> "$work/dump.err"; rc=$?
t1=$(date +%s%N)
printf '  %-66s %s\n' 'pg_dump as the admin role' "exit=$rc, $(stat -c %s "$work/company_a.dump") bytes, $(( (t1 - t0) / 1000000 )) ms $(head -1 "$work/dump.err")"
# Host B: the roles come from Conexus's own register with NEW passwords; roles are not part of a database dump.
run $B platform_admin postgres -c "alter role platform_admin set createrole_self_grant = 'set, inherit'" >/dev/null
run $B platform_admin postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create database company_a;
revoke all on database company_a from public;
create role company_a_app1_owner nologin; create role company_a_app1_rt login password 'new-on-host-b';
create role company_a_app2_owner nologin; create role company_a_app2_rt login password 'new-on-host-b';
grant connect on database company_a to company_a_app1_rt, company_a_app2_rt;
SQL
t0=$(date +%s%N)
docker exec -i $B pg_restore -U platform_admin -d company_a --exit-on-error < "$work/company_a.dump" 2> "$work/restore.err"; rc=$?
t1=$(date +%s%N)
printf '  %-66s %s\n' 'pg_restore as the admin role on host B' "exit=$rc, $(( (t1 - t0) / 1000000 )) ms $(head -1 "$work/restore.err")"
after=$(run $B platform_admin company_a -c "select md5(string_agg(id || body, ',' order by id)) from app1.note")
printf '  %-66s %s\n' 'rows identical after the move (md5 of app1.note)' "$([ "$before" = "$after" ] && echo yes || echo "no ($before / $after)")"
check 'host B: table owners kept' $B platform_admin company_a \
  -c "select string_agg(tablename || '=' || tableowner, ',' order by tablename) from pg_tables where schemaname like 'app%'"
check 'host B: app1 reads its own table' $B company_a_app1_rt company_a -c 'select count(*) from app1.note'
check 'host B: app1 reads app2' $B company_a_app1_rt company_a -c 'select amount from app2.salary'
run $A platform_admin postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
drop database company_a with (force);
drop role company_a_app1_rt, company_a_app1_owner, company_a_app2_rt, company_a_app2_owner;
SQL
check 'host A after deletion: databases left' $A platform_admin postgres \
  -c "select string_agg(datname, ',' order by datname) from pg_database where datname not like 'template%'"
check 'host A after deletion: company A roles left' $A platform_admin postgres \
  -c "select count(*) from pg_roles where rolname like 'company_a_%'"

echo 'P4 the admin bypasses row security (Neon, Supabase); the roles it creates do not'
run $B postgres postgres -v ON_ERROR_STOP=1 -c "create role bypass_admin login password 'spike-only' createdb createrole bypassrls" >/dev/null
run $B bypass_admin postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
create database hub4;
revoke all on database hub4 from public;
create role hub4_runtime login password 'spike-only';
grant connect on database hub4 to hub4_runtime;
\c hub4
create schema core;
grant usage on schema core to hub4_runtime;
create table core.connection (id int generated always as identity primary key, workspace_id uuid not null, name text not null);
alter table core.connection enable row level security;
alter table core.connection force row level security;
create policy tenant on core.connection
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);
grant select, insert, update, delete on core.connection to hub4_runtime;
insert into core.connection (workspace_id, name) values ('$WA', 'ERP da empresa A'), ('$WB', 'ERP da empresa B');
SQL
check 'the admin, no company set' $B bypass_admin hub4 -c 'select count(*) from core.connection'
check 'the runtime it created: bypassrls attribute' $B bypass_admin hub4 -c "select rolbypassrls from pg_roles where rolname = 'hub4_runtime'"
check 'the runtime, company A set, no filter' $B hub4_runtime hub4 -c "begin; set local app.workspace_id = '$WA'; select name from core.connection"
check 'the runtime, no company set' $B hub4_runtime hub4 -c 'select count(*) from core.connection'
check 'the runtime becomes the admin' $B hub4_runtime hub4 -c 'set role bypass_admin'
