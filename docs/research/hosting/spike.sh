#!/usr/bin/env bash
# Hosting spikes for the hosting study (study.md, section 6). Needs Docker and `npm ci`.
# Run from the repository root: bash docs/research/hosting/spike.sh
# Every container it starts is named spike-hosting-* and removed at the end.
set -uo pipefail
cd "${CONEXUS_OS:-$(git rev-parse --show-toplevel)}"  # CONEXUS_OS: a conexus-os checkout, when run from elsewhere
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

echo 'S7 and S8: two companies as two Workspaces in one installation, read as hub_reader'
fresh; P -c 'create database tenancy'; migrate tenancy postgres
P -d tenancy <<'SQL' | sed 's/^/  /'
insert into iam.account(account_id, issuer, external_subject, display_name, email) values
 ('aaaaaaaa-0000-4000-8000-000000000001', 'https://idp.example', 'a', 'Person A', 'a@a.example'),
 ('bbbbbbbb-0000-4000-8000-000000000002', 'https://idp.example', 'b', 'Person B', 'b@b.example');
insert into workspace.workspace(workspace_id, name) values
 ('aaaaaaaa-1111-4000-8000-000000000001', 'Company A'), ('bbbbbbbb-1111-4000-8000-000000000002', 'Company B');
insert into iam.workspace_membership(account_id, workspace_id, role) values
 ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001', 'owner'),
 ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-1111-4000-8000-000000000002', 'owner');
insert into model.model_account(model_account_id, owner_account_id, provider, kind, secret, sharing) values
 ('bbbbbbbb-2222-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'anthropic', 'api_key', 'mastra:factory-secret:v1:spike', 'everyone');
begin;
set local role hub_reader;
select set_config('conexus.account_id', 'aaaaaaaa-0000-4000-8000-000000000001', true) is not null as acting;
select 'S7 A sees Workspaces: ' || string_agg(name, ', ') from workspace.workspace;
select 'S7 A sees memberships of B: ' || count(*) from iam.workspace_membership where workspace_id = 'bbbbbbbb-1111-4000-8000-000000000002';
select 'S7 A sees accounts: ' || string_agg(display_name, ', ') from iam.account;
select 'S8 A sees model accounts owned by B: ' || count(*) from model.model_account where owner_account_id = 'bbbbbbbb-0000-4000-8000-000000000002';
commit;
SQL

echo 'S5 unprivileged user namespaces inside a Docker container (the runner needs them, sandbox.ts)'
try() { if docker run --rm --user 999 "$@" --entrypoint unshare "$PG" -U -r -n -p -f --mount-proc true >/dev/null 2>&1; then echo "  allowed: ${*:-Docker defaults}"; else echo "  refused: ${*:-Docker defaults}"; fi; }
try
try --security-opt seccomp=unconfined
try --security-opt seccomp=unconfined --security-opt systempaths=unconfined
