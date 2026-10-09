#!/usr/bin/env bash
# Database spikes for the database study (study.md, section 6). Needs Docker.
# Run from the repository root: bash docs/research/database/spike.sh [apps]
# Every container it starts is named spike-database and removed at the end.
set -uo pipefail
N=${1:-100}
PG='postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
trap 'docker rm -f spike-database >/dev/null 2>&1' EXIT
docker rm -f spike-database >/dev/null 2>&1
docker run -d --name spike-database -e POSTGRES_PASSWORD=spike-only "$PG" >/dev/null
until docker exec spike-database pg_isready -U postgres -q 2>/dev/null; do sleep 1; done; sleep 2
P() { docker exec -i spike-database psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
app_ddl() { # a small generated app: two tables, a key, an index
  echo "create table $1.purchase_note (id bigint generated always as identity primary key, order_number text not null, note text, created_at timestamptz not null default now());"
  echo "create table $1.purchase_status (order_number text primary key, status text not null, updated_at timestamptz not null default now());"
  echo "create index on $1.purchase_note (order_number);"
}
mb() { awk '{printf "%.1f MB", $1/1048576}'; }

echo "S9 the cost of $N apps as schemas in one database, against $N apps as databases"
P -c 'create database schemas'
empty=$(P -d schemas -c "select pg_database_size('schemas')")
start=$(date +%s%N)
for i in $(seq 1 "$N"); do echo "create schema app_$i;"; app_ddl "app_$i"; done | P -d schemas
schema_ms=$(( ($(date +%s%N) - start) / 1000000 ))
schemas=$(P -d schemas -c "select pg_database_size('schemas')")
start=$(date +%s%N)
for i in $(seq 1 "$N"); do P -c "create database app_$i"; app_ddl public | P -d "app_$i"; done
database_ms=$(( ($(date +%s%N) - start) / 1000000 ))
databases=$(P -c "select sum(pg_database_size(datname)) from pg_database where datname like 'app\_%'")
echo "  an empty database: $(echo "$empty" | mb)"
echo "  $N schemas in one database: $(echo "$schemas" | mb) in total, created in ${schema_ms} ms"
echo "  $N databases: $(echo "$databases" | mb) in total, created in ${database_ms} ms"

echo 'S10 a database per company hides one company'"'"'s table names from another'
P -c 'create database company_a' -c 'create database company_b'
P -c "create role app_a login password 'spike-only'" -c 'revoke connect on database company_a, company_b from public' \
  -c 'grant connect on database company_a to app_a'
P -d company_a -c 'create schema p1' -c 'create table p1.vendas_por_cliente (id int)' -c 'grant usage on schema p1 to app_a'
P -d company_b -c 'create schema p2' -c 'create table p2.salarios_diretoria (id int)'
P -d company_a -c 'create schema p3' -c 'create table p3.outro_app_mesma_empresa (id int)'
q() { docker exec -i -e PGPASSWORD=spike-only spike-database psql -h 127.0.0.1 -U app_a -qtA "$@" 2>&1 | head -1; }
echo "  app_a lists table names in its own database: $(q -d company_a -c "select string_agg(relname, ', ' order by relname) from pg_class where relkind = 'r' and relnamespace::regnamespace::text in ('p1', 'p2', 'p3')")"
echo "  app_a connects to company B's database: $(q -d company_b -c 'select 1')"
echo "  app_a still sees cluster-wide names: databases $(q -d company_a -c "select string_agg(datname, ', ' order by datname) from pg_database where datname like 'company%'")"
