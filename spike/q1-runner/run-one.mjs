// The worker. Launched once per invocation by an arm launcher inside that arm's isolation.
// It receives, only through the environment the platform sets, its Project DB credential and the
// exact admitted handler path. It cannot choose Project, role, credential or handler.
import pg from 'pg';

const RESP_CAP = 1 * 1024 * 1024; // 1 MiB response bound
const INPUT_CAP = 64 * 1024;
const TIME_MS = Number(process.env.Q1_TIME_MS || 3000);

function out(tag, obj) { process.stdout.write(`##${tag}##` + JSON.stringify(obj) + '\n'); }

const handlerPath = process.env.Q1_HANDLER;
const input = JSON.parse(process.env.Q1_INPUT || '{}');

// soft timer for awaiting handlers (busy loops are killed externally by the launcher)
const timer = setTimeout(() => { out('T', { reason: 'soft-timeout' }); process.exit(124); }, TIME_MS);
timer.unref();

async function main() {
  if ((process.env.Q1_INPUT || '').length > INPUT_CAP) { out('E', { reason: 'input_too_large' }); process.exit(2); }
  const client = new pg.Client({
    host: process.env.PGHOST, port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
    connectionTimeoutMillis: 2000,
  });
  await client.connect();
  const ctx = { db: { query: (t, p) => client.query(t, p) } };
  const mod = await import(handlerPath);
  const result = await mod.default(input, ctx);
  await client.end().catch(() => {});
  const s = JSON.stringify(result ?? null);
  if (s.length > RESP_CAP) { out('R', { blocked: true, reason: 'response_too_large', bytes: s.length }); process.exit(0); }
  out('R', result);
  process.exit(0);
}
main().catch((e) => { out('E', { code: e.code, message: String(e.message || e).slice(0, 120) }); process.exit(3); });
