// Provider probe (study.md, section 11): runs the target data layout's checks against ANY PostgreSQL the operator
// points it at (Neon, Supabase, RDS, Cloud SQL, Magalu, a VM), with the admin role that provider hands over.
// It creates two throwaway databases and four roles, checks them, and drops them all at the end.
// Usage (from the repository root, after `npm install` so `pg` resolves):
//   PROBE_ADMIN_URL='postgresql://<admin>:<password>@<host>/postgres?sslmode=require' node docs/research/deployment/provider-probe.mjs
// Use the provider's DIRECT endpoint, not a pooled one: CREATE DATABASE and session settings need a real session.
import { randomBytes } from 'node:crypto'
import pg from 'pg'

const adminUrl = process.env.PROBE_ADMIN_URL
if (!adminUrl) { console.error('Set PROBE_ADMIN_URL to the provider admin connection string.'); process.exit(2) }
const tag = `probe_${randomBytes(4).toString('hex')}`
const secret = () => randomBytes(24).toString('base64url') // about 190 bits: above Neon's 60-bit minimum
const urlFor = (database, user, password) => {
  const u = new URL(adminUrl)
  u.pathname = `/${database}`
  if (user) { u.username = user; u.password = password }
  return u.toString()
}
const results = []
const check = (label, ok, detail) => { results.push(ok); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(64)} ${detail ?? ''}`) }
const attempt = async (client, text, values) => {
  try { const r = await client.query(text, values); return { rows: (Array.isArray(r) ? r.at(-1) : r).rows } } catch (e) { return { error: e.message } }
}
const connect = async (url) => { const c = new pg.Client({ connectionString: url }); c.on('error', () => {}); await c.connect(); return c }
const timed = async (n, fn) => { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await fn(); t.push(performance.now() - s) } t.sort((a, b) => a - b); return `median ${t[n >> 1].toFixed(1)} ms, p95 ${t[Math.floor(n * 0.95)].toFixed(1)} ms` }

const company = `${tag}_company`, roles = { owner1: `${tag}_app1_owner`, rt1: `${tag}_app1_rt`, owner2: `${tag}_app2_owner`, rt2: `${tag}_app2_rt` }
const pw = { rt1: secret(), rt2: secret() }
const admin = await connect(adminUrl)
try {
  console.log('Who Conexus is on this provider')
  const me = (await admin.query(`select current_user, version() as v, current_setting('max_connections') as maxc,
    r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole from pg_roles r where r.rolname = current_user`)).rows[0]
  console.log(`  ${me.current_user}: superuser=${me.rolsuper} bypassrls=${me.rolbypassrls} createdb=${me.rolcreatedb} createrole=${me.rolcreaterole} max_connections=${me.maxc}`)
  console.log(`  ${me.v.split(' on ')[0]}`)
  check('PostgreSQL 17 or later (the Hub needs transaction_timeout)', Number(me.v.match(/PostgreSQL (\d+)/)[1]) >= 17, me.v.match(/PostgreSQL [\d.]+/)[0])
  check('the admin may create databases and roles', me.rolcreatedb && me.rolcreaterole)

  console.log('Latency from here (one connection reused, and a fresh login each time)')
  console.log(`  select 1 on a reused connection: ${await timed(50, () => admin.query('select 1'))}`)
  console.log(`  fresh connection + login + select 1: ${await timed(10, async () => { const c = await connect(adminUrl); await c.query('select 1'); await c.end() })}`)

  console.log('A company database with two apps, made at runtime')
  await admin.query("set createrole_self_grant = 'set, inherit'")
  const made = await attempt(admin, `create database ${company}`)
  check('CREATE DATABASE as the admin', !made.error, made.error)
  if (made.error) throw new Error('cannot continue without a database')
  await admin.query(`revoke all on database ${company} from public`)
  await admin.query(`create database ${tag}_other`)
  await admin.query(`revoke all on database ${tag}_other from public`)
  for (const [owner, rt, password] of [[roles.owner1, roles.rt1, pw.rt1], [roles.owner2, roles.rt2, pw.rt2]]) {
    await admin.query(`create role ${owner} nologin`)
    await admin.query(`create role ${rt} login password '${password}'`)
    await admin.query(`grant connect on database ${company} to ${rt}`)
  }
  const inCompany = await connect(urlFor(company))
  await inCompany.query("set createrole_self_grant = 'set, inherit'")
  for (const [app, owner, rt] of [['app1', roles.owner1, roles.rt1], ['app2', roles.owner2, roles.rt2]]) {
    const schema = await attempt(inCompany, `create schema ${app} authorization ${owner}`)
    check(`schema ${app} owned by its own role`, !schema.error, schema.error)
    await inCompany.query(`grant usage on schema ${app} to ${rt}`)
    await inCompany.query(`set role ${owner}`)
    await inCompany.query(`create table ${app}.item (id int primary key, body text not null)`)
    await inCompany.query(`insert into ${app}.item values (1, '${app} row')`)
    await inCompany.query(`grant select, insert, update, delete on ${app}.item to ${rt}`)
    await inCompany.query('reset role')
  }

  console.log('The simple tenant policy, with a runtime role that owns nothing')
  await inCompany.query(`create schema core;
    create table core.connection (id int generated always as identity primary key, workspace_id uuid not null, name text not null);
    alter table core.connection enable row level security; alter table core.connection force row level security;
    create policy tenant on core.connection
      using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
      with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
    grant usage on schema core to ${roles.rt1}; grant select, insert on core.connection to ${roles.rt1};`)
  await inCompany.query(`begin; set local row_security = on;
    set local app.workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001'; insert into core.connection (workspace_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'company A');
    set local app.workspace_id = 'bbbbbbbb-0000-0000-0000-000000000002'; insert into core.connection (workspace_id, name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'company B'); commit;`)
  const adminSees = (await inCompany.query('select count(*)::int as n from core.connection')).rows[0].n
  console.log(`  the admin with no company set sees ${adminSees} rows (${me.rolbypassrls ? 'it bypasses row security: never run the Hub as this role' : 'FORCE binds it too'})`)

  const app1 = await connect(urlFor(company, roles.rt1, pw.rt1))
  const own = await attempt(app1, 'select body from app1.item')
  check('app1 reads its own table', own.rows?.length === 1, own.error)
  const other = await attempt(app1, 'select body from app2.item')
  check('app1 cannot read app2', !!other.error, other.error ?? 'it READ app2')
  const become = await attempt(app1, `set role ${roles.rt2}`)
  check('app1 cannot become app2', !!become.error, become.error ?? 'it BECAME app2')
  const schema = await attempt(app1, 'create schema mine')
  check('app1 cannot create a schema', !!schema.error, schema.error ?? 'it CREATED a schema')
  const noFilter = await attempt(app1, "begin; set local app.workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001'; select name from core.connection")
  check('runtime with company A set, no filter: only A', noFilter.rows?.length === 1 && noFilter.rows[0].name === 'company A', JSON.stringify(noFilter.rows ?? noFilter.error))
  await app1.query('rollback').catch(() => {})
  const leftover = await attempt(app1, "select current_setting('app.workspace_id', true) as v")
  console.log(`  on this reused connection, after an earlier transaction set the company, the setting reads ${JSON.stringify(leftover.rows?.[0].v)}: the policy must treat '' as unset (nullif)`)
  const none = await attempt(app1, 'select count(*)::int as n from core.connection')
  check('runtime with no company set: 0 rows', none.rows?.[0].n === 0, JSON.stringify(none.rows ?? none.error))
  await app1.end()
  try { await connect(urlFor(`${tag}_other`, roles.rt1, pw.rt1)).then((c) => c.end()); check('app1 cannot open another company database', false, 'it CONNECTED') }
  catch (e) { check('app1 cannot open another company database', true, e.message) }
  try { await connect(urlFor('postgres', roles.rt1, pw.rt1)).then((c) => c.end()); console.log("  note  app1 CAN open the provider's default database 'postgres' (CONNECT is granted to PUBLIC there): keep nothing in it") }
  catch (e) { console.log(`  note  app1 cannot open 'postgres': ${e.message}`) }
  await inCompany.end()
} catch (e) {
  console.log(`  STOP  ${e.message}`)
  results.push(false)
} finally {
  await attempt(admin, `drop database if exists ${company} with (force)`)
  await attempt(admin, `drop database if exists ${tag}_other with (force)`)
  for (const r of [roles.rt1, roles.owner1, roles.rt2, roles.owner2]) await attempt(admin, `drop role if exists ${r}`)
  const left = (await admin.query('select count(*)::int as n from pg_roles where rolname like $1', [`${tag}%`])).rows[0].n
  console.log(`Cleanup: databases dropped, ${left} probe roles left`)
  await admin.end()
}
const failed = results.filter((ok) => !ok).length
console.log(failed ? `${failed} check(s) failed` : 'All checks passed')
process.exit(failed ? 1 : 0)
