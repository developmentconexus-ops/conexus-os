#!/usr/bin/env bash
# Instance-lock spikes (study.md, section 6). The Hub holds a session-level advisory lock for its life
# (apps/hub/src/platform/lifecycle.ts:55-77) and exits when that connection drops (:86-89).
# P5: a database restart, as managed providers do for maintenance. P6: a transaction pooler in front, as Neon's
# PgBouncer. P7: a lease row with an expiry, as the Builder's run lease, through both.
# Needs Docker, Node, npm and a local pgbouncer binary. Run from the repository root: bash docs/research/deployment/lock-spike.sh
set -uo pipefail
PG='postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
work=$(mktemp -d); chmod 777 "$work"
trap 'docker rm -f spike-lock >/dev/null 2>&1; [ -f "$work/bouncer.pid" ] && kill "$(cat "$work/bouncer.pid")" 2>/dev/null; rm -rf "$work"' EXIT
docker rm -f spike-lock >/dev/null 2>&1
docker run -d --name spike-lock -p 127.0.0.1:55440:5432 -e POSTGRES_PASSWORD=spike-only "$PG" >/dev/null
until docker exec spike-lock pg_isready -U postgres -q 2>/dev/null; do sleep 1; done; sleep 2
cat > "$work/bouncer.ini" <<INI
[databases]
postgres = host=127.0.0.1 port=55440 dbname=postgres user=postgres password=spike-only
[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 56440
auth_type = any
pool_mode = transaction
default_pool_size = 1
max_client_conn = 20
logfile = $work/bouncer.log
pidfile = $work/bouncer.pid
INI
pgbouncer -d -u nobody "$work/bouncer.ini"
echo "  $(pgbouncer --version | head -1), pool_mode = transaction, default_pool_size = 1"
cd "$work" && npm init -y >/dev/null && npm i --no-audit --no-fund pg@8.23.0 >/dev/null 2>&1
cat > probe.mjs <<'JS'
import pg from 'pg'
import { execSync } from 'node:child_process'
const direct = 'postgresql://postgres:spike-only@127.0.0.1:55440/postgres'
const pooled = 'postgresql://postgres@127.0.0.1:56440/postgres'
const KEY = '1538775160' // the Hub's key, lifecycle.ts:61
const open = async (url, label) => { const c = new pg.Client({ connectionString: url }); c.lost = null; c.on('error', (e) => { c.lost = e.message }); await c.connect(); c.label = label; return c }
const tryLock = async (c) => (await c.query('select pg_try_advisory_lock($1) as taken', [KEY])).rows[0].taken
const say = (label, value) => console.log(`  ${label.padEnd(70)} ${value}`)
const waitReady = async () => { for (let i = 0; i < 60; i++) { try { const c = await open(direct); await c.end(); return } catch { await new Promise((r) => setTimeout(r, 500)) } } }
const restart = async () => { execSync('docker restart spike-lock >/dev/null'); await waitReady() }

console.log('P5 a database restart ends the session lock')
const hub = await open(direct)
say('Hub A takes the instance lock', await tryLock(hub))
const second = await open(direct)
say('Hub B, while A holds it', await tryLock(second)); await second.end()
await restart()
await new Promise((r) => setTimeout(r, 500))
say("Hub A's lock connection after the restart", hub.lost ? `lost (${hub.lost})` : 'still open')
const third = await open(direct)
say('Hub B after the restart', await tryLock(third)); await third.end()
await hub.end().catch(() => {})

console.log('P6 a transaction pooler in front: the lock is not held by the client that took it')
const a = await open(pooled), b = await open(pooled)
say('Hub A takes the lock through the pooler', await tryLock(a))
say('Hub B takes the same lock through the pooler, while A holds it', await tryLock(b))
const watcher = await open(direct)
await a.end(); await b.end()
await new Promise((r) => setTimeout(r, 300))
say('after both disconnect, a direct client tries the lock', await tryLock(watcher))
await watcher.end()

console.log('P7 a lease row with an expiry, renewed on a timer (the run-lease pattern)')
const setup = await open(direct)
await setup.query('create table instance_lease (id int primary key, owner text not null, expires_at timestamptz not null)')
await setup.end()
const acquire = async (c, owner) => (await c.query(
  `insert into instance_lease values (1, $1, now() + interval '30 seconds')
   on conflict (id) do update set owner = excluded.owner, expires_at = excluded.expires_at
   where instance_lease.owner = excluded.owner or instance_lease.expires_at < now()
   returning owner`, [owner])).rowCount === 1
for (const [name, url] of [['direct', direct], ['through the pooler', pooled]]) {
  await (await open(direct)).query('delete from instance_lease').catch(() => {})
  let ha = await open(url), hb = await open(url)
  say(`${name}: Hub A acquires`, await acquire(ha, 'hub-a'))
  say(`${name}: Hub B acquires while A's lease is fresh`, await acquire(hb, 'hub-b'))
  await restart()
  await ha.end().catch(() => {}); await hb.end().catch(() => {})
  ha = await open(url); hb = await open(url)
  say(`${name}: after a restart, A reconnects and renews`, await acquire(ha, 'hub-a'))
  say(`${name}: after a restart, B acquires`, await acquire(hb, 'hub-b'))
  await ha.end(); await hb.end()
}
JS
node probe.mjs
