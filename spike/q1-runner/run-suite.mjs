// Decision instrument. `node run-suite.mjs <arm-a|arm-b>` provisions the shared substrate, applies
// the legitimate migrations, then runs ONE shared adversarial suite through the chosen arm's
// launcher. Prints one JSON line per case plus a summary, and writes .out/<arm>.json.
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import pg from 'pg';

const SPIKE = new URL('.', import.meta.url).pathname;
process.env.Q1_SPIKE = SPIKE;
const ARM = process.argv[2];
if (!['arm-a', 'arm-b'].includes(ARM)) { console.error('usage: run-suite.mjs <arm-a|arm-b>'); process.exit(1); }

const ADMIN = { host: 'localhost', port: 55432, user: 'postgres', password: 'arena', database: 'postgres' };
const CRED = {
  a_rt: { user: 'p_a_runtime', password: 'rt_a', database: 'conexus_apps' },
  b_rt: { user: 'p_b_runtime', password: 'rt_b', database: 'conexus_apps' },
  a_mg: { user: 'p_a_migrator', password: 'mg_a', database: 'conexus_apps' },
};
const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8' }).trim();

async function withClient(cfg, fn) {
  const c = new pg.Client(cfg); await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function applyMigration(cred, sqlPath) {
  const sql = readFileSync(sqlPath, 'utf8');
  await withClient({ ...ADMIN, ...cred }, (c) => c.query(sql));
}

async function connCount(user) {
  return withClient(ADMIN, async (c) => {
    const r = await c.query('select count(*)::int n from pg_stat_activity where usename=$1', [user]);
    return r.rows[0].n;
  });
}

// pass predicates per case kind
const KIND = {
  legit_insert: (o) => o.outcome === 'ok' && typeof o.value?.id !== 'undefined',
  legit_list: (o) => o.outcome === 'ok' && Array.isArray(o.value?.notes),
  refuse: (o) => (o.outcome === 'ok' && o.value?.BREACH !== true) || o.outcome === 'threw',
  terminate: (o) => ['killed', 'timeout', 'crashed'].includes(o.outcome),
  resp: (o) => o.outcome === 'ok' && o.value?.blocked === true,
};

async function main() {
  // 1. substrate + legit migrations (idempotent)
  sh('node', [`${SPIKE}/provision.mjs`]);
  await applyMigration(CRED.a_mg, `${SPIKE}/projects/A/migrations/001_follow_up_note.sql`);
  await applyMigration({ user: 'p_b_migrator', password: 'mg_b', database: 'conexus_apps' }, `${SPIKE}/projects/B/migrations/001_follow_up_note.sql`);
  // seed one note in B so cross-project reads have a target
  await withClient({ ...ADMIN, ...CRED.b_rt }, (c) => c.query("insert into follow_up_note(purchase_order_id,note) values('PO-B','secret-B-note')"));

  // 2. arm init
  if (ARM === 'arm-b') {
    // make the docker network internal (no egress) exactly once
    try { sh('docker', ['network', 'disconnect', '-f', 'conexus-q1-net', 'conexus-q1-arena']); } catch { /* */ }
    try { sh('docker', ['network', 'rm', 'conexus-q1-net']); } catch { /* */ }
    sh('docker', ['network', 'create', '--internal', 'conexus-q1-net']);
    sh('docker', ['network', 'connect', 'conexus-q1-net', 'conexus-q1-arena']);
  }
  const launcher = await import(`${SPIKE}/${ARM}/launch.mjs`);
  const initInfo = await launcher.init(['a', 'b']);

  const results = [];
  const record = (name, kind, o) => {
    const pass = KIND[kind](o);
    const row = { case: name, expected: kind, observed: o.outcome, detail: o.value ?? o.se ?? null, pass };
    results.push(row);
    console.log(JSON.stringify(row));
    return o;
  };
  const runtime = (proj) => (proj === 'a' ? CRED.a_rt : CRED.b_rt);

  // 3. legit + cold first-handler latency
  const coldA = await launcher.invoke({ handlerRel: 'projects/A/handlers/notes.mjs', cred: CRED.a_rt, project: 'a', input: { op: 'insert', purchaseOrderId: 'PO-1', note: 'first note' } });
  record('A_insert_legit', 'legit_insert', coldA);
  const coldB = await launcher.invoke({ handlerRel: 'projects/B/handlers/notes.mjs', cred: CRED.b_rt, project: 'b', input: { op: 'list' } });
  record('B_list_legit', 'legit_list', coldB);
  record('A_list_legit', 'legit_list', await launcher.invoke({ handlerRel: 'projects/A/handlers/notes.mjs', cred: CRED.a_rt, project: 'a', input: { op: 'list' } }));

  // 4. adversarial handlers (all as Project A runtime unless noted)
  const adv = [
    ['cross_project_sql', 'refuse'], ['hub_db_read', 'refuse'], ['read_secrets', 'refuse'],
    ['read_env', 'refuse'], ['read_proc', 'refuse'], ['walk_fs', 'refuse'],
    ['network_egress', 'refuse'], ['import_escape', 'refuse'],
  ];
  for (const [h, kind] of adv) {
    record(h, kind, await launcher.invoke({ handlerRel: `adversarial/${h}.mjs`, cred: CRED.a_rt, project: 'a', input: {} }));
  }
  record('time_bound', 'terminate', await launcher.invoke({ handlerRel: 'adversarial/time_bound.mjs', cred: CRED.a_rt, project: 'a', input: {}, timeMs: 1500 }));
  record('mem_bound', 'terminate', await launcher.invoke({ handlerRel: 'adversarial/mem_bound.mjs', cred: CRED.a_rt, project: 'a', input: {}, memMb: 96 }));
  record('resp_size', 'resp', await launcher.invoke({ handlerRel: 'adversarial/resp_size.mjs', cred: CRED.a_rt, project: 'a', input: {} }));

  // 5. crash then next request (supervisor survives)
  record('crash_worker', 'terminate', await launcher.invoke({ handlerRel: 'adversarial/crash.mjs', cred: CRED.a_rt, project: 'a', input: {}, timeMs: 1500 }));
  record('serves_after_crash', 'legit_list', await launcher.invoke({ handlerRel: 'projects/A/handlers/notes.mjs', cred: CRED.a_rt, project: 'a', input: { op: 'list' } }));

  // 6. migration-role attacks (arm-invariant: pure DB privilege). A statement that Postgres refuses
  // passes. A statement that succeeds passes only if a containment check proves no authority or data
  // actually crossed a boundary (an unprivileged, schema-scoped role owning its own objects can do
  // owner-only things that expose nothing beyond itself).
  const { MIGRATION_ATTACKS } = await import(`${SPIKE}/adversarial/migrations.mjs`);
  const contain = {
    // definer function runs as its owner; owner must be the unprivileged migrator, not a superuser
    mig_security_definer: async () => withClient({ ...ADMIN, ...CRED.a_mg }, (c) => c.query('select p_a_preview.esc() as u'))
      .then((r) => r.rows[0].u === 'p_a_migrator').catch(() => true),
    // did B actually gain readable rows of A's data? (USAGE on a schema without table grants is inert)
    mig_grant_cross: async () => withClient({ ...ADMIN, ...CRED.b_rt }, (c) => c.query('select * from p_a_preview.follow_up_note'))
      .then(() => false).catch(() => true),
  };
  for (const m of MIGRATION_ATTACKS) {
    let ok = false, err = null;
    try { await withClient({ ...ADMIN, ...CRED.a_mg }, (c) => c.query(m.sql)); ok = true; }
    catch (e) { err = e.code || e.message.slice(0, 50); }
    let pass, observed;
    if (!ok) { pass = true; observed = 'refused'; }
    else { const contained = contain[m.id] ? await contain[m.id]() : false; pass = contained; observed = contained ? 'allowed-but-contained' : 'SUCCEEDED-BREACH'; }
    const row = { case: m.id, expected: 'refuse-or-contain(migration-role)', observed, detail: err, pass };
    results.push(row); console.log(JSON.stringify(row));
  }

  // 7. measurements
  const t0 = Date.now();
  await launcher.invoke({ handlerRel: 'projects/A/handlers/notes.mjs', cred: CRED.a_rt, project: 'a', input: { op: 'list' } });
  const warm1 = Date.now() - t0;
  const N = Number(process.env.Q1_N || 200);
  const lat = [];
  for (let i = 0; i < N; i++) {
    const s = Date.now();
    await launcher.invoke({ handlerRel: 'projects/A/handlers/notes.mjs', cred: CRED.a_rt, project: 'a', input: { op: 'list' } });
    lat.push(Date.now() - s);
  }
  lat.sort((a, b) => a - b);
  const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))];
  // connection burst: 5 concurrent, sample max held by runtime role
  const burst = Promise.all(Array.from({ length: 5 }, () => launcher.invoke({ handlerRel: 'projects/A/handlers/notes.mjs', cred: CRED.a_rt, project: 'a', input: { op: 'list' } })));
  let maxConn = 0;
  for (let i = 0; i < 8; i++) { maxConn = Math.max(maxConn, await connCount('p_a_runtime')); }
  await burst;

  const measurements = {
    arm: ARM, initInfo,
    firstHandlerColdMs: { a: coldA.ms, b: coldB.ms },
    warmSingleMs: warm1,
    p50Ms: p(0.5), p95Ms: p(0.95), samples: N,
    maxRuntimeConnDuringBurst: maxConn,
  };
  const passCount = results.filter((r) => r.pass).length;
  const summary = { arm: ARM, cases: results.length, passed: passCount, failed: results.length - passCount, measurements };
  console.log('##SUMMARY##' + JSON.stringify(summary, null, 2));
  writeFileSync(`${SPIKE}/.out/${ARM}.json`, JSON.stringify({ summary, results }, null, 2));
  await launcher.teardown();
  process.exit(summary.failed > 0 ? 0 : 0); // always 0; verdict is in the table, not exit code
}
main().catch((e) => { console.error('SUITE FAIL', e); process.exit(1); });
