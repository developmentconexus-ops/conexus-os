#!/usr/bin/env bash
# App runtime spikes for the app runtime study (study.md, section 6). Needs Docker, Node and network
# access to npm. Run from the repository root: bash docs/research/app-runtime/spike.sh
# It installs pinned tools into a temporary directory, starts PostgreSQL 17.10 named spike-runtime,
# runs the Builder skill's example handler in isolated-vm and in workerd, and removes everything.
set -uo pipefail
work=$(mktemp -d)
stop() { # npx starts workerd as a child, so stop every process this run started by its directory
  for pid in $(ps -eo pid=,args= | grep -F "$work" | grep -v grep | awk '{print $1}'); do kill -9 "$pid" 2>/dev/null; done
  kill $platform_pid $workerd_pid 2>/dev/null; docker rm -f spike-runtime >/dev/null 2>&1; rm -rf "$work"
}
trap stop EXIT
platform_pid=; workerd_pid=
PG='postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
URL='postgresql://app_rt:spike-only@127.0.0.1:55437/postgres'
cd "$work" && npm init -y >/dev/null && npm i --no-audit --no-fund isolated-vm@6.2.0 workerd@1.20261009.1 esbuild@0.28.2 pg@8.23.0 >/dev/null 2>&1
docker rm -f spike-runtime >/dev/null 2>&1
docker run -d --name spike-runtime -p 127.0.0.1:55437:5432 -e POSTGRES_PASSWORD=spike-only "$PG" >/dev/null
until docker exec spike-runtime pg_isready -U postgres -q 2>/dev/null; do sleep 1; done; sleep 2
docker exec -i spike-runtime psql -U postgres -q <<'SQL'
create schema app;
create table app.ticket (id int generated always as identity primary key, subject text not null, status text not null, opened_at timestamptz not null default now());
create table app.ticket_history (ticket_id int not null, status text not null, note text, by_account_id text, by_name text);
insert into app.ticket (subject, status) values ('Pedido 101 atrasado', 'open'), ('Nota sem XML', 'open'), ('Troca de fornecedor', 'done');
create role app_rt login password 'spike-only';
grant usage on schema app to app_rt; grant select, insert, update on all tables in schema app to app_rt;
alter role app_rt set search_path = app;
SQL
cat > handler.ts <<'FILE'
// The example handler of the Builder's conexus-server skill (builder-skills/conexus-server/SKILL.md).
type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }
type Caller = { accountId: string; email: string | null; displayName: string }
export async function listTickets(input: { status: string }, { db }: { db: Db }) {
  const { rows } = await db.query(
    'SELECT id, subject, opened_at AS "openedAt" FROM ticket WHERE status = $1 ORDER BY opened_at DESC LIMIT 500',
    [input.status])
  return rows
}
export async function changeTicketStatus(input: { id: number; status: string; note: string }, { db, caller }: { db: Db; caller: Caller }) {
  const { rows } = await db.query(
    `WITH changed AS (UPDATE ticket SET status = $2 WHERE id = $1 RETURNING id)
     INSERT INTO ticket_history (ticket_id, status, note, by_account_id, by_name)
     SELECT id, $2, $3, $4, $5 FROM changed RETURNING ticket_id AS id`,
    [input.id, input.status, input.note, caller.accountId, caller.displayName])
  return { id: rows[0]?.id }
}
// What a hostile handler would try.
export async function probe() {
  const g = globalThis as any
  const tries: Record<string, string> = {}
  tries.process = typeof g.process
  tries.require = typeof g.require
  tries.fetch = typeof g.fetch
  if (typeof g.fetch === 'function') {
    try { const r = await g.fetch('https://example.com'); tries.fetchResult = `status ${r.status}` } catch (e: any) { tries.fetchResult = `refused: ${String(e?.message ?? e).slice(0, 80)}` }
  }
  try { tries.importFs = typeof (await import('node:fs' as string)) } catch (e: any) { tries.importFs = `refused: ${String(e?.message ?? e).slice(0, 60)}` }
  return tries
}
export async function spin() { for (;;) {} }
FILE
cat > ivm-host.mjs <<'FILE'
// Runs one handler call in a fresh V8 isolate. The isolate gets no Node API, no network, no file
// system: only the input, the caller and one host function that runs SQL as the app's own role.
import ivm from 'isolated-vm'
import pg from 'pg'
import { readFileSync } from 'node:fs'
const pool = new pg.Pool({ connectionString: process.argv[2], max: 4 })
const code = readFileSync("./handler.iife.js", 'utf8')
const glue = `;globalThis.__run = async (op, inputJson, callerJson) => {
  const db = { query: async (text, values = []) => ({ rows: JSON.parse(await __dbQuery.apply(undefined, [text, JSON.stringify(values)], { result: { promise: true } })) }) }
  const out = await handlers[op](JSON.parse(inputJson), { db, caller: JSON.parse(callerJson), connectors: {} })
  return JSON.stringify(out ?? null)
}`
async function invoke(op, input, caller, timeout = 1000) {
  const isolate = new ivm.Isolate({ memoryLimit: 32 })
  try {
    const context = await isolate.createContext()
    await context.global.set('__dbQuery', new ivm.Reference(async (text, values) => JSON.stringify((await pool.query(text, JSON.parse(values))).rows)))
    await (await isolate.compileScript(code + glue)).run(context)
    const run = await context.global.get('__run', { reference: true })
    return JSON.parse(await run.apply(undefined, [op, JSON.stringify(input), JSON.stringify(caller)], { result: { promise: true }, timeout }))
  } finally { isolate.dispose() }
}
const caller = { accountId: 'a-1', email: null, displayName: 'Pessoa A' }
console.log('  listTickets:', JSON.stringify(await invoke('listTickets', { status: 'open' }, caller)).slice(0, 120))
console.log('  changeTicketStatus:', JSON.stringify(await invoke('changeTicketStatus', { id: 1, status: 'done', note: 'ok' }, caller)))
console.log('  probe:', JSON.stringify(await invoke('probe', {}, caller)))
try { await invoke('spin', {}, caller, 100) ; console.log('  spin: returned?') } catch (e) { console.log('  spin (100 ms limit):', String(e.message).slice(0, 60)) }
const times = []
for (let i = 0; i < 50; i++) { const t = performance.now(); await invoke('listTickets', { status: 'open' }, caller); times.push(performance.now() - t) }
times.sort((a, b) => a - b)
console.log(`  50 calls, a fresh isolate each: median ${times[25].toFixed(1)} ms, p95 ${times[47].toFixed(1)} ms`)
await pool.end()
FILE
cat > app-worker.js <<'FILE'
// One generated app as a Worker. Its only capability is the PLATFORM binding; the global outbound is a
// service that refuses, so `fetch` to anywhere else fails.
import * as handlers from './handler.esm.js'
export default {
  async fetch(request, env) {
    const { op, input, caller } = await request.json()
    const db = { query: async (text, values = []) => {
      const answer = await env.PLATFORM.fetch('http://platform/query', { method: 'POST', body: JSON.stringify({ text, values }) })
      return { rows: await answer.json() }
    } }
    const out = await handlers[op](input, { db, caller, connectors: {} })
    return Response.json(out ?? null)
  },
}
FILE
cat > deny.js <<'FILE'
export default { fetch() { return new Response('egress refused', { status: 403 }) } }
FILE
cat > config.capnp <<'FILE'
using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "app", worker = .appWorker),
    (name = "platform", external = (address = "127.0.0.1:18080", http = ())),
    (name = "deny", worker = .denyWorker),
  ],
  sockets = [ (name = "http", address = "127.0.0.1:18081", http = (), service = "app") ],
);
const appWorker :Workerd.Worker = (
  modules = [ (name = "worker", esModule = embed "app-worker.js"), (name = "handler.esm.js", esModule = embed "handler.esm.js") ],
  compatibilityDate = "2025-09-01",
  bindings = [ (name = "PLATFORM", service = "platform") ],
  globalOutbound = "deny",
);
const denyWorker :Workerd.Worker = (
  modules = [ (name = "deny", esModule = embed "deny.js") ],
  compatibilityDate = "2025-09-01",
);
FILE
cat > platform.mjs <<'FILE'
// The platform side of the binding: runs SQL as the app's own role. In the design, the caller's
// identity (app, company) comes from the binding, never from the request body.
import http from 'node:http'
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.argv[2], max: 4 })
http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c
  try { const { text, values } = JSON.parse(body); const r = await pool.query(text, values); res.end(JSON.stringify(r.rows)) }
  catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message) })) }
}).listen(18080, '127.0.0.1')
FILE
npx esbuild handler.ts --bundle --format=iife --global-name=handlers --platform=neutral --outfile=handler.iife.js --log-level=warning
npx esbuild handler.ts --bundle --format=esm --platform=neutral --outfile=handler.esm.js --log-level=warning

echo 'R1 isolated-vm: a fresh V8 isolate per call, SQL through one host function'
node ivm-host.mjs "$URL"

echo 'R2 workerd: the app as a Worker, SQL through a service binding, every other fetch refused'
node "$work/platform.mjs" "$URL" & platform_pid=$!
npx workerd serve "$work/config.capnp" > workerd.log 2>&1 & workerd_pid=$!
for i in $(seq 1 60); do curl -s -o /dev/null -m 1 http://127.0.0.1:18081/ && break; sleep 0.5; done
curl -s -o /dev/null -m 1 http://127.0.0.1:18081/ || { echo '  workerd did not start:'; tail -5 workerd.log; }
call() { curl -s -m 3 -X POST http://127.0.0.1:18081/ -H 'content-type: application/json' -d "$1"; }
echo "  listTickets: $(call '{"op":"listTickets","input":{"status":"open"},"caller":{"accountId":"a-1","email":null,"displayName":"Pessoa A"}}' | cut -c1-100)"
echo "  probe: $(call '{"op":"probe","input":{},"caller":{}}')"
start=$(date +%s%N); for i in $(seq 1 50); do call '{"op":"listTickets","input":{"status":"open"},"caller":{}}' >/dev/null; done
echo "  50 calls: $(( ($(date +%s%N) - start) / 50000000 )) ms each on average, curl included"
echo "  spin, 3 s cap: $(curl -s -m 3 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:18081/ -d '{"op":"spin","input":{},"caller":{}}')"
echo "  a normal call right after: $(curl -s -m 3 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:18081/ -d '{"op":"listTickets","input":{"status":"open"},"caller":{}}')"
