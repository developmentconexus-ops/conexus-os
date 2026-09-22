import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { provisionApplicationDatabase } from '../../scripts/provision-application-database.mjs'
import { adminConnection, buildHubDatabase } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const { applyPendingMigrations, ensurePreviewAllocation, planMigrations, previewAllocation, readLedger, resetPreviewSchema, roleCredential } =
  await import(hubModuleUrl('app-runner/data-plane.js'))

// Every Project role here logs in with its own derived password, as the runner's worker does, so
// CONNECT and PUBLIC grants are exercised for real rather than through SET ROLE from a superuser.
const admin = adminConnection()
const key = randomBytes(32)
const credential = (role) => roleCredential(key, role)
const sha = (text) => createHash('sha256').update(text).digest('hex')
const migration = (name, sql) => ({ name, sql, sha256: sha(sql) })
const NOTES = migration('001_follow_up_note.sql', `CREATE TABLE follow_up_note (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_order_id text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now())`)

const attempt = async (client, sql, values) => {
  try {
    await client.query(sql, values)
    return 'ok'
  } catch (error) {
    return error.code ?? error.message
  }
}

const loginAs = async (t, role, database) => {
  const client = new pg.Client({ ...admin, database, user: role, password: credential(role) })
  await client.connect()
  t.after(() => client.end().catch(() => {}))
  return client
}

const setup = async (t) => {
  await refuseProtectedCluster()
  const database = `conexus_apps_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const provisionerPassword = randomBytes(24).toString('base64url')
  const hub = await buildHubDatabase(t, 'conexus_q1_hub')
  await provisionApplicationDatabase({
    cluster: { host: admin.host, port: admin.port },
    database,
    installation: { user: admin.user, password: admin.password },
    provisionerPassword,
  })
  const provisioner = new pg.Client({ ...admin, database, user: 'app_provisioner', password: provisionerPassword })
  await provisioner.connect()
  const projects = [randomUUID(), randomUUID()].map(previewAllocation)
  const superuser = new pg.Client({ ...admin, database: 'postgres' })
  await superuser.connect()
  hub.onCleanup(async () => {
    await provisioner.end().catch(() => {})
    await superuser.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
    for (const project of projects) {
      await superuser.query(`DROP ROLE IF EXISTS ${project.runtimeRole}`)
      await superuser.query(`DROP ROLE IF EXISTS ${project.migrationRole}`)
    }
    await superuser.end()
  })
  for (const allocation of projects) await ensurePreviewAllocation(provisioner, { allocation, database, credential })
  return { database, hubDatabase: hub.database, provisioner, projects }
}

test('Project Preview data is confined to its own schema, roles and database', async (t) => {
  const { database, hubDatabase, provisioner, projects } = await setup(t)
  const [a, b] = projects

  await t.test('the migration role creates the Project table and the runtime role writes and reads it', async (st) => {
    for (const allocation of [a, b]) {
      const migrator = await loginAs(st, allocation.migrationRole, database)
      await applyPendingMigrations(migrator, allocation.schema, planMigrations([], [NOTES]).pending)
    }
    const runtimeA = await loginAs(st, a.runtimeRole, database)
    await runtimeA.query("INSERT INTO follow_up_note (purchase_order_id, note) VALUES ('PO-1', 'A only')")
    assert.deepEqual((await runtimeA.query('SELECT purchase_order_id, note FROM follow_up_note')).rows, [{ purchase_order_id: 'PO-1', note: 'A only' }])
    assert.deepEqual(await readLedger(provisioner, a), [{ position: 1, name: NOTES.name, sha256: NOTES.sha256 }])
  })

  await t.test('Project A runtime reaches nothing of Project B and cannot change schema or roles', async (st) => {
    const runtimeA = await loginAs(st, a.runtimeRole, database)
    assert.deepEqual({
      readForeignTable: await attempt(runtimeA, `SELECT * FROM ${b.schema}.follow_up_note`),
      writeForeignTable: await attempt(runtimeA, `INSERT INTO ${b.schema}.follow_up_note (purchase_order_id, note) VALUES ('x', 'y')`),
      setForeignRuntimeRole: await attempt(runtimeA, `SET ROLE ${b.runtimeRole}`),
      setOwnMigrationRole: await attempt(runtimeA, `SET ROLE ${a.migrationRole}`),
      setProvisionerRole: await attempt(runtimeA, 'SET ROLE app_provisioner'),
      createTable: await attempt(runtimeA, 'CREATE TABLE sneaky (id int)'),
      dropTable: await attempt(runtimeA, 'DROP TABLE follow_up_note'),
      alterTable: await attempt(runtimeA, 'ALTER TABLE follow_up_note ADD COLUMN x int'),
      truncate: await attempt(runtimeA, 'TRUNCATE follow_up_note'),
      readLedger: await attempt(runtimeA, `SELECT * FROM ${a.schema}.conexus_migration`),
      createInPublic: await attempt(runtimeA, 'CREATE TABLE public.sneaky (id int)'),
      createTemp: await attempt(runtimeA, 'CREATE TEMP TABLE sneaky (id int)'),
      createSchema: await attempt(runtimeA, 'CREATE SCHEMA sneaky'),
      alterRole: await attempt(runtimeA, `ALTER ROLE ${a.runtimeRole} CREATEDB`),
      grantOwnSchema: await attempt(runtimeA, `GRANT USAGE ON SCHEMA ${a.schema} TO ${b.runtimeRole}`),
    }, {
      readForeignTable: '42501', writeForeignTable: '42501', setForeignRuntimeRole: '42501', setOwnMigrationRole: '42501',
      setProvisionerRole: '42501', createTable: '42501', dropTable: '42501', alterTable: '42501', truncate: '42501', readLedger: '42501',
      createInPublic: '42501', createTemp: '42501', createSchema: '42501', alterRole: '42501', grantOwnSchema: 'ok',
    })
    // GRANT by a non-owner without grant option only warns; it must have granted nothing.
    const { rows } = await provisioner.query('SELECT has_schema_privilege($1, $2, $3) AS usage', [b.runtimeRole, a.schema, 'USAGE'])
    assert.equal(rows[0].usage, false)
    const runtimeB = await loginAs(st, b.runtimeRole, database)
    assert.deepEqual((await runtimeB.query('SELECT note FROM follow_up_note')).rows, [])
  })

  await t.test('a Project role holds no authority in the Hub database and no grant a default hands out', async (st) => {
    for (const role of [a.runtimeRole, a.migrationRole]) {
      const client = await loginAs(st, role, hubDatabase)
      const { rows } = await client.query(`SELECT
        (SELECT count(*) FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'public') AND n.nspname NOT LIKE 'pg_%'
          AND (has_schema_privilege(n.oid, 'USAGE') OR has_schema_privilege(n.oid, 'CREATE')))::int AS schemas,
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_%' AND has_table_privilege(c.oid, 'SELECT,INSERT,UPDATE,DELETE'))::int AS tables,
        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND has_function_privilege(p.oid, 'EXECUTE'))::int AS functions`)
      assert.deepEqual(rows[0], { schemas: 0, tables: 0, functions: 0 }, `${role} in the Hub database`)
    }
    const stranger = `app_stranger_${randomUUID().replaceAll('-', '').slice(0, 8)}`
    const superuser = new pg.Client({ ...admin, database: 'postgres' })
    await superuser.connect()
    try {
      await superuser.query(`CREATE ROLE ${stranger} LOGIN PASSWORD '${credential(stranger)}'`)
      const refused = await new pg.Client({ ...admin, database, user: stranger, password: credential(stranger) }).connect().then(() => 'connected', (error) => error.code)
      assert.equal(refused, '42501', 'PUBLIC holds no CONNECT on the application database')
    } finally {
      await superuser.query(`DROP ROLE IF EXISTS ${stranger}`)
      await superuser.end()
    }
  })

  await t.test('a generated migration gains nothing beyond its own Project schema', async (st) => {
    const migratorA = await loginAs(st, a.migrationRole, database)
    const attacks = {
      createExtension: 'CREATE EXTENSION IF NOT EXISTS dblink',
      foreignDataWrapper: 'CREATE EXTENSION IF NOT EXISTS postgres_fdw',
      copyProgram: "COPY (SELECT 1) TO PROGRAM 'id'",
      copyServerFile: "COPY (SELECT 1) TO '/tmp/conexus-q1'",
      readServerFile: "SELECT pg_read_file('/etc/hostname')",
      largeObjectImport: "SELECT lo_import('/etc/hostname')",
      alterOwnRuntimeRole: `ALTER ROLE ${a.runtimeRole} SUPERUSER`,
      alterForeignRole: `ALTER ROLE ${b.runtimeRole} PASSWORD 'x'`,
      createRole: 'CREATE ROLE sneaky',
      createSchema: 'CREATE SCHEMA sneaky',
      createInPublic: 'CREATE TABLE public.sneaky (id int)',
      createInForeignSchema: `CREATE TABLE ${b.schema}.sneaky (id int)`,
      readForeignTable: `SELECT * FROM ${b.schema}.follow_up_note`,
      writeCatalog: `UPDATE pg_authid SET rolsuper = true WHERE rolname = '${a.migrationRole}'`,
      dropOwnSchema: `DROP SCHEMA ${a.schema} CASCADE`,
      dropLedger: `DROP TABLE ${a.schema}.conexus_migration`,
      rewriteLedger: `DELETE FROM ${a.schema}.conexus_migration`,
      setProvisionerRole: 'SET ROLE app_provisioner',
      grantSchemaToForeign: `GRANT USAGE ON SCHEMA ${a.schema} TO ${b.runtimeRole}`,
      grantTableToForeign: `GRANT SELECT ON follow_up_note TO ${b.runtimeRole}`,
      securityDefiner: 'CREATE FUNCTION whoami() RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT current_user::text $$',
    }
    const observed = {}
    for (const [name, sql] of Object.entries(attacks)) observed[name] = await attempt(migratorA, sql)
    assert.deepEqual(observed, {
      createExtension: '42501', foreignDataWrapper: '42501', copyProgram: '42501', copyServerFile: '42501', readServerFile: '42501',
      largeObjectImport: '42501', alterOwnRuntimeRole: '42501', alterForeignRole: '42501', createRole: '42501', createSchema: '42501',
      createInPublic: '42501', createInForeignSchema: '42501', readForeignTable: '42501', writeCatalog: '42501', dropOwnSchema: '42501',
      dropLedger: '42501', rewriteLedger: '42501', setProvisionerRole: '42501',
      // Owner-only statements that succeed, and must carry nothing across the boundary.
      grantSchemaToForeign: 'ok', grantTableToForeign: 'ok', securityDefiner: 'ok',
    })
    const runtimeB = await loginAs(st, b.runtimeRole, database)
    assert.equal(await attempt(runtimeB, `SELECT * FROM ${a.schema}.follow_up_note`), '42501', 'a table grant without schema USAGE carries no rows')
    const runtimeA = await loginAs(st, a.runtimeRole, database)
    assert.deepEqual((await runtimeA.query(`SELECT ${a.schema}.whoami() AS definer`)).rows, [{ definer: a.migrationRole }],
      'a SECURITY DEFINER function runs as the unprivileged migration role, not above it')
  })

  await t.test('a failed migration leaves the schema and ledger as they were', async (st) => {
    const migratorA = await loginAs(st, a.migrationRole, database)
    const broken = [NOTES, migration('002_status.sql', 'ALTER TABLE follow_up_note ADD COLUMN status text; SELEC broken')]
    const plan = planMigrations(await readLedger(provisioner, a), broken)
    assert.deepEqual(plan.pending.map((entry) => [entry.position, entry.name]), [[2, '002_status.sql']])
    await assert.rejects(applyPendingMigrations(migratorA, a.schema, plan.pending), (error) => error.code === '42601')
    const { rows } = await provisioner.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = $1 AND column_name = 'status'`, [a.schema])
    assert.equal(rows[0].n, 0)
    assert.equal((await readLedger(provisioner, a)).length, 1)
  })

  await t.test('an edited applied migration resets the Preview schema and replays every migration', async (st) => {
    const edited = [migration(NOTES.name, `${NOTES.sql.replace('note text NOT NULL', 'note text NOT NULL, author text')}`)]
    const plan = planMigrations(await readLedger(provisioner, a), edited)
    assert.equal(plan.reset, true)
    await resetPreviewSchema(provisioner, a)
    await ensurePreviewAllocation(provisioner, { allocation: a, database, credential })
    const migratorA = await loginAs(st, a.migrationRole, database)
    await applyPendingMigrations(migratorA, a.schema, plan.pending)
    const runtimeA = await loginAs(st, a.runtimeRole, database)
    assert.deepEqual((await runtimeA.query('SELECT count(*)::int AS n FROM follow_up_note')).rows, [{ n: 0 }])
    assert.deepEqual(await readLedger(provisioner, a), [{ position: 1, name: NOTES.name, sha256: edited[0].sha256 }])
  })
})

test('the migration plan applies only an exact continuation of the applied history', () => {
  const one = { name: '001.sql', sha256: 'a'.repeat(64), sql: 'x' }
  const two = { name: '002.sql', sha256: 'b'.repeat(64), sql: 'y' }
  const applied = [{ position: 1, name: '001.sql', sha256: 'a'.repeat(64) }]
  assert.deepEqual(planMigrations(applied, [one, two]), { reset: false, pending: [{ ...two, position: 2 }] })
  assert.deepEqual(planMigrations(applied, [one]), { reset: false, pending: [] })
  assert.deepEqual(planMigrations(applied, [two]).reset, true)
  assert.deepEqual(planMigrations(applied, [{ ...one, sha256: 'c'.repeat(64) }, two]).pending.map((entry) => entry.position), [1, 2])
  assert.deepEqual(planMigrations(applied, []).reset, true)
})

test('allocation names derive from the Project id alone and refuse anything else', () => {
  assert.deepEqual(previewAllocation('0f5e1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b'), {
    projectId: '0f5e1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
    schema: 'p_0f5e1c2a3b4d4e5f8a9b0c1d2e3f4a5b_preview',
    runtimeRole: 'app_0f5e1c2a3b4d4e5f8a9b0c1d2e3f4a5b_preview_rt',
    migrationRole: 'app_0f5e1c2a3b4d4e5f8a9b0c1d2e3f4a5b_preview_mig',
  })
  for (const refused of ['', 'x', '0F5E1C2A-3B4D-4E5F-8A9B-0C1D2E3F4A5B', "0f5e1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b'; drop"]) {
    assert.throws(() => previewAllocation(refused), /APPLICATION_PROJECT_ID_REFUSED/)
  }
  assert.throws(() => roleCredential(new Uint8Array(16), 'r'), /APPLICATION_CREDENTIAL_KEY_REFUSED/)
})
