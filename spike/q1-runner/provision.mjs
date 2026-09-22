// Idempotent DB substrate shared by both arms.
// Topology: one app database `conexus_apps`, a stand-in `hub` database, and per Project a
// preview schema `p_<id>_preview` with two roles: a runtime login role (DML on its schema only)
// and a migration login role (owns the schema, no cross-Project or Hub authority).
import pg from 'pg';

const ADMIN = { host: process.env.ARENA_HOST || 'localhost', port: 55432, user: 'postgres', password: 'arena', database: 'postgres' };
const PROJECTS = ['a', 'b'];

async function withClient(cfg, fn) {
  const c = new pg.Client(cfg);
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
const q = (c, t, p) => c.query(t, p).catch((e) => { if (!/already exists|does not exist|duplicate/i.test(e.message)) throw e; });

async function ensureDb(name) {
  await withClient(ADMIN, async (c) => {
    const r = await c.query('select 1 from pg_database where datname=$1', [name]);
    if (!r.rowCount) await c.query(`create database ${name}`);
  });
}
async function ensureRole(name, pw) {
  await withClient(ADMIN, async (c) => {
    const r = await c.query('select 1 from pg_roles where rolname=$1', [name]);
    if (!r.rowCount) await c.query(`create role ${name} login password '${pw}' nosuperuser nocreatedb nocreaterole`);
  });
}

async function main() {
  await ensureDb('conexus_apps');
  await ensureDb('hub');
  // hub stand-in holds a secret table no Project role may read
  await withClient({ ...ADMIN, database: 'hub' }, async (c) => {
    await q(c, 'create table if not exists hub_secret(k text primary key, v text)');
    await q(c, "insert into hub_secret values('factory-token','TOP-SECRET-DO-NOT-LEAK') on conflict do nothing");
  });

  const appDb = { ...ADMIN, database: 'conexus_apps' };
  // Close the public-schema hole for everyone in this database.
  await withClient(appDb, async (c) => {
    await q(c, 'revoke all on schema public from public');
    await q(c, 'revoke all on database conexus_apps from public');
  });

  for (const id of PROJECTS) {
    const schema = `p_${id}_preview`;
    const runtime = `p_${id}_runtime`;
    const migrator = `p_${id}_migrator`;
    await ensureRole(runtime, `rt_${id}`);
    await ensureRole(migrator, `mg_${id}`);
    await withClient(appDb, async (c) => {
      await q(c, `create schema if not exists ${schema} authorization ${migrator}`);
      // Runtime role: connect + use schema, DML only. No CREATE on schema (migrator owns DDL).
      await q(c, `grant connect on database conexus_apps to ${runtime}`);
      await q(c, `grant connect on database conexus_apps to ${migrator}`);
      await q(c, `grant usage on schema ${schema} to ${runtime}`);
      await q(c, `alter default privileges for role ${migrator} in schema ${schema} grant select, insert, update, delete on tables to ${runtime}`);
      await q(c, `alter default privileges for role ${migrator} in schema ${schema} grant usage, select on sequences to ${runtime}`);
      // set search_path per role so a handler need not qualify, but cannot see another schema by default
      await q(c, `alter role ${runtime} set search_path to ${schema}`);
      await q(c, `alter role ${migrator} set search_path to ${schema}`);
      // Deny cross-project: revoke usage on the OTHER project's schema explicitly (defensive; not granted anyway)
    });
    // hub db: no project role may connect
    await withClient({ ...ADMIN, database: 'hub' }, async (c) => {
      await q(c, `revoke connect on database hub from ${runtime}`);
      await q(c, `revoke connect on database hub from ${migrator}`);
    });
  }
  console.log('provisioned: conexus_apps, hub, roles p_a_*/p_b_* with per-schema authority');
}
main().catch((e) => { console.error('PROVISION FAIL', e.message); process.exit(1); });
