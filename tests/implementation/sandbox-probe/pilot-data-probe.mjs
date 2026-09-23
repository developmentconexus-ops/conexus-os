import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hubModuleUrl } from '../hub-build.mjs'

// Runs the database cases of Q1.7 through the real runner path against a pilot's Applications
// PostgreSQL: a probe handler's runtime session and probe migrations, each through the relay as the
// probe Project's own role. Prints each statement's outcome (SQLSTATE or ok) and the expected one.
// Reads another Project's table only to be refused; never prints row contents. Rerun:
//
//   CONEXUS_APP_DB_HOST=127.0.0.1 CONEXUS_APP_DB_PORT=5434 CONEXUS_APP_DB_NAME=conexus_apps \
//   CONEXUS_DB_APP_PROVISIONER_PASSWORD_FILE=... CONEXUS_APP_RELAY_TLS_DIR=... \
//   CONEXUS_PROBE_FOREIGN_TABLE=p_<hex>_preview.<table> node tests/implementation/sandbox-probe/pilot-data-probe.mjs
//
// It allocates two fixed probe Projects, the same ones on every run.

const { createSupervisor } = await import(hubModuleUrl('app-runner/supervisor.js'))
const { stageWorkerRuntime } = await import(hubModuleUrl('app-runner/sandbox.js'))
const { readRelayTls } = await import(hubModuleUrl('app-runner/pg-relay.js'))
const { previewAllocation } = await import(hubModuleUrl('app-runner/data-plane.js'))

const RUNTIME_PROBE = '00000000-0000-4000-8000-0000000000be'
const MIGRATION_PROBE = '00000000-0000-4000-8000-0000000000bf'
const required = (name) => process.env[name] || (() => { throw new Error(`MISSING_CONFIG_${name}`) })()
const foreignTable = required('CONEXUS_PROBE_FOREIGN_TABLE')
if (!/^p_[0-9a-f]{32}_preview\.[a-z_][a-z0-9_]*$/.test(foreignTable)) throw new Error('PROBE_FOREIGN_TABLE_REFUSED')
const foreignRuntime = `app_${foreignTable.slice(2, 34)}_preview_rt`
const own = previewAllocation(MIGRATION_PROBE)

// Each runtime case: [name, SQL, expected outcome].
const RUNTIME_CASES = [
  ['read another Project table', `SELECT count(*) FROM ${foreignTable}`, '42501'],
  ['databases on this cluster', "SELECT string_agg(datname, ',' ORDER BY datname) AS v FROM pg_database", 'conexus_apps,postgres,template0,template1'],
  ['session identity', "SELECT current_database() || ' ' || current_user AS v", `conexus_apps ${previewAllocation(RUNTIME_PROBE).runtimeRole}`],
  ['create a table', 'CREATE TABLE probe_ddl (i int)', '42501'],
  ['create a schema', 'CREATE SCHEMA probe_schema', '42501'],
  ['create dblink', 'CREATE EXTENSION dblink', '42501'],
  ['dblink to the Hub database', "SELECT dblink_connect('dbname=conexus_s7')", '42883'],
  ['set role to the provisioner', 'SET ROLE app_provisioner', '42501'],
  ['set role to another Project', `SET ROLE ${foreignRuntime}`, '42501'],
  ['read pg_stat_statements', 'SELECT count(*) FROM pg_stat_statements', '42P01'],
  ['read a server file', "SELECT pg_read_file('/etc/passwd')", '42501'],
  ['copy to a program', "COPY (SELECT 1) TO PROGRAM 'id'", '42501'],
  ['lift temp_file_limit', "SET temp_file_limit = '-1'", '42501'],
  ['create a function', 'CREATE FUNCTION probe_f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$', '42501'],
]

// Each migration case runs as the probe Project's migration role after the base migration.
const MIGRATION_CASES = [
  ['create dblink', 'CREATE EXTENSION dblink', '42501'],
  ['create postgres_fdw', 'CREATE EXTENSION postgres_fdw', '42501'],
  ['security definer function', 'CREATE FUNCTION probe_definer() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$', '42501'],
  ['do block', 'DO $$ BEGIN PERFORM 1; END $$', '42501'],
  ['copy to a program', "COPY (SELECT 1) TO PROGRAM 'id'", '42501'],
  ['alter its runtime role', `ALTER ROLE ${own.runtimeRole} CONNECTION LIMIT -1`, '42501'],
  ['create a role', 'CREATE ROLE probe_role', '42501'],
  ['create a schema', 'CREATE SCHEMA probe_schema', '42501'],
  ['write another Project schema', `CREATE TABLE ${foreignTable.split('.')[0]}.probe_t (i int)`, '42501'],
  ['read another Project table', `SELECT count(*) FROM ${foreignTable}`, '42501'],
  ['create a foreign server', 'CREATE SERVER probe_server FOREIGN DATA WRAPPER postgres_fdw', '42704'],
]

const sha = (text) => createHash('sha256').update(text).digest('hex')
const file = (path, text) => ({ path: `conexus-server/${path}`, sha256: sha(text), content: Buffer.from(text).toString('base64') })
const text = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }
const serverTree = (migrations, handler) => [
  file('manifest.json', JSON.stringify({
    version: 1,
    migrations: migrations.map(([name, sql]) => ({ name, sha256: sha(sql), sql })),
    operations: { probe: { module: 'handlers/probe.mjs', export: 'probe', input: { type: 'object', properties: {}, additionalProperties: false }, output: text } },
  })),
  file('handlers/probe.mjs', handler),
]
const BASE = ['001_probe.sql', 'CREATE TABLE probe_note (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, note text NOT NULL)']
const HANDLER = `const CASES = ${JSON.stringify(RUNTIME_CASES.map(([name, sql]) => [name, sql]))}
export async function probe(input, { db }) {
  const outcomes = []
  for (const [name, sql] of CASES) {
    outcomes.push(await db.query(sql).then((result) => [name, result.rows[0]?.v ?? 'ok'], (error) => [name, error.code ?? String(error.message)]))
  }
  return { text: JSON.stringify(outcomes) }
}
`

const stateDir = join(tmpdir(), 'conexus-data-probe')
const supervisor = createSupervisor({
  stateDir,
  runtimeDir: stageWorkerRuntime(join(stateDir, 'runtime')),
  cluster: { host: required('CONEXUS_APP_DB_HOST'), port: Number(required('CONEXUS_APP_DB_PORT')) },
  database: required('CONEXUS_APP_DB_NAME'),
  provisionerPassword: readFileSync(required('CONEXUS_DB_APP_PROVISIONER_PASSWORD_FILE'), 'utf8').trim(),
  relayTls: readRelayTls(required('CONEXUS_APP_RELAY_TLS_DIR')),
})
try {
  const results = []
  const runtimeTree = serverTree([BASE], HANDLER)
  const prepared = await supervisor.prepare({ projectId: RUNTIME_PROBE, files: runtimeTree })
  if (prepared.state !== 'READY') throw new Error(`PROBE_PREPARE_FAILED: ${JSON.stringify(prepared)}`)
  const answer = await supervisor.invoke({ projectId: RUNTIME_PROBE, operation: 'probe', input: {}, files: runtimeTree })
  if (answer.status !== 200) throw new Error(`PROBE_INVOKE_FAILED: ${JSON.stringify(answer.body)}`)
  const observed = new Map(JSON.parse(answer.body.text))
  for (const [name, , expected] of RUNTIME_CASES) results.push({ path: 'runtime', name, expected, observed: observed.get(name) })

  for (const [index, [name, sql, expected]] of MIGRATION_CASES.entries()) {
    const tree = serverTree([BASE, [`9${String(index).padStart(2, '0')}_attack.sql`, sql]], HANDLER)
    const outcome = await supervisor.prepare({ projectId: MIGRATION_PROBE, files: tree })
    const observedCode = outcome.state === 'READY' ? 'ok' : (outcome.detail?.match(/^([0-9A-Z]{5}) /)?.[1] ?? outcome.detail)
    results.push({ path: 'migration', name, expected, observed: observedCode })
  }
  const breaches = results.filter((result) => result.observed !== result.expected)
  process.stdout.write(`${JSON.stringify({ probe: 'Q1.7 database cases on the Applications cluster', at: new Date().toISOString(), results, breach: breaches.length > 0 }, null, 2)}\n`)
  if (breaches.length > 0) process.exitCode = 1
} finally {
  await supervisor.close()
}
