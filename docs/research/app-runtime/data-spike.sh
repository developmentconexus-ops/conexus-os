#!/usr/bin/env bash
# Data path spikes for the app runtime study (study.md, section 11). Needs Docker, Node and npm.
# Run from the repository root: bash docs/research/app-runtime/data-spike.sh
set -uo pipefail
work=$(mktemp -d); trap 'docker rm -f spike-data >/dev/null 2>&1; rm -rf "$work"' EXIT
PG='postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
cd "$work" && npm init -y >/dev/null && npm i --no-audit --no-fund pg@8.23.0 >/dev/null 2>&1
docker rm -f spike-data >/dev/null 2>&1
docker run -d --name spike-data -p 127.0.0.1:55438:5432 -e POSTGRES_PASSWORD=spike-only "$PG" >/dev/null
until docker exec spike-data pg_isready -U postgres -q 2>/dev/null; do sleep 1; done; sleep 2
docker exec -i spike-data psql -U postgres -q <<'SQL'
create database company_a;
\c company_a
create schema app_a; create table app_a.note (id int primary key, body text); insert into app_a.note values (1, 'nota do app A');
create schema app_b; create table app_b.salary (id int primary key, amount int); insert into app_b.salary values (1, 99999);
create role app_a_rt login password 'spike-only'; grant usage on schema app_a to app_a_rt; grant select on app_a.note to app_a_rt;
create role app_b_rt login password 'spike-only'; grant usage on schema app_b to app_b_rt; grant select on app_b.salary to app_b_rt;
-- the shared design: one company login that may become any app role of the company
create role company_a_login login password 'spike-only' noinherit;
grant app_a_rt, app_b_rt to company_a_login;
SQL
cat > probe.mjs <<'JS'
import pg from 'pg'
const url = (user) => `postgresql://${user}:spike-only@127.0.0.1:55438/company_a`
const time = async (label, n, fn) => { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await fn(); t.push(performance.now() - s) } t.sort((a, b) => a - b); console.log(`  ${label}: median ${t[n >> 1].toFixed(2)} ms, p95 ${t[Math.floor(n * 0.95)].toFixed(2)} ms`) }

console.log('D1 a fresh login per query against a pooled connection (local, no network distance)')
await time('fresh connection (TCP + SCRAM login) + query', 50, async () => { const c = new pg.Client({ connectionString: url('app_a_rt') }); await c.connect(); await c.query('select body from app_a.note'); await c.end() })
const pool = new pg.Pool({ connectionString: url('app_a_rt'), max: 1 })
await time('pooled connection + query', 50, async () => { await pool.query('select body from app_a.note') })
await pool.end()

console.log('D2 one company login; each handler call runs in a transaction switched to app A')
const shared = new pg.Client({ connectionString: url('company_a_login') }); await shared.connect()
const asAppA = async (label, steps) => {
  await shared.query('begin'); await shared.query('set local role app_a_rt')
  const out = []
  for (const [text, values] of steps) {
    try { const r = await shared.query(text, values ?? []); out.push(JSON.stringify(r.rows)) } catch (e) { out.push(`refused (${e.message})`); break }
  }
  await shared.query('rollback')
  console.log(`  ${label}: ${out.join(' -> ')}`)
}
await asAppA('app A reads its own note', [['select body from app_a.note where id = $1', [1]]])
await asAppA('app A reads app B directly', [['select amount from app_b.salary']])
await asAppA('two statements in one parameterized query', [['select 1; select 2', [1]]])
await asAppA('SET ROLE app_b_rt, then read app B', [['set role app_b_rt'], ['select amount from app_b.salary']])
await asAppA("set_config('role'), then read app B", [["select set_config('role', 'app_b_rt', true)"], ['select amount from app_b.salary']])
await asAppA('RESET ROLE, then read app B', [['reset role'], ['select amount from app_b.salary']])
await shared.end()

console.log('D3 a login per app: the same attempts')
const own = new pg.Client({ connectionString: url('app_a_rt') }); await own.connect()
const tryOwn = async (label, text) => { try { const r = await own.query(text); console.log(`  ${label}: ${JSON.stringify(r.rows)}`) } catch (e) { console.log(`  ${label}: refused (${e.message})`) } }
await tryOwn('SET ROLE app_b_rt', 'set role app_b_rt')
await tryOwn('read app B', 'select amount from app_b.salary')
await own.end()
JS
node probe.mjs
