import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { assertServerMaterial, ensureTlsMaterial } from '../../scripts/confine-application-cluster.mjs'
import { hubRoleNames, provisionApplicationDatabase } from '../../scripts/provision-application-database.mjs'
import { applicationClusterAdmin, loginThroughRelay, refuseProtectedApplicationCluster, relayTls } from './application-cluster.mjs'
import { adminConnection, buildHubDatabase } from './hub-database.mjs'
import { hubModuleUrl } from './hub-build.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const { applyPendingMigrations, convergePreviewAllocations, ensurePreviewAllocation, planMigrations, previewAllocation, readLedger, resetPreviewSchema } =
  await import(hubModuleUrl('app-runner/data-plane.js'))

// Every Project role here logs in through the runner's relay with its client certificate, as the
// worker does, so CONNECT, pg_hba and PUBLIC grants are exercised for real rather than through SET
// ROLE from a superuser. Application data lives on the Applications cluster and the Hub's database on
// the Hub's own cluster, as on an installation.
const admin = applicationClusterAdmin()
const hubCluster = adminConnection()
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

const loginAs = (t, role, database) => loginThroughRelay(t, { host: admin.host, port: admin.port }, role, database)

// A login that does not go through the relay: a password, or the runner's certificate presented
// directly. Answers the SQLSTATE of the refusal.
const loginDirectly = (options, cluster = admin) => {
  const client = new pg.Client({ host: cluster.host, port: cluster.port, connectionTimeoutMillis: 5000, ...options })
  return client.connect().then(async () => { await client.end(); return 'connected' }, (error) => error.code ?? error.message)
}

// The same password login, on a cluster where pg_hba does not confine the role: the role is renamed
// outside the Project naming the rules match, tried, and renamed back.
const loginWithoutPgHbaRules = async (role, password, database) => {
  const outside = `outside_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const superuser = new pg.Client({ ...admin, database: 'postgres' })
  await superuser.connect()
  try {
    await superuser.query(`ALTER ROLE ${role} RENAME TO ${outside}`)
    return await loginDirectly({ user: outside, password, database })
  } finally {
    await superuser.query(`ALTER ROLE ${outside} RENAME TO ${role}`)
    await superuser.end()
  }
}

const setup = async (t) => {
  await refuseProtectedCluster()
  await refuseProtectedApplicationCluster()
  const database = `conexus_apps_${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const provisionerPassword = randomBytes(24).toString('base64url')
  const hub = await buildHubDatabase(t, 'conexus_q1_hub')
  await provisionApplicationDatabase({
    cluster: { host: admin.host, port: admin.port },
    database,
    hubRoles: hubRoleNames({}),
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
  for (const allocation of projects) await ensurePreviewAllocation(provisioner, { allocation, database })
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

  await t.test('a Project session cannot lift its temporary-file bound; statement_timeout it can', async (st) => {
    for (const [role, limit] of [[a.runtimeRole, '256MB'], [a.migrationRole, '1GB']]) {
      const session = await loginAs(st, role, database)
      assert.deepEqual({
        limit: (await session.query('SHOW temp_file_limit')).rows[0].temp_file_limit,
        lift: await attempt(session, "SET temp_file_limit = '-1'"),
        liftForRole: await attempt(session, `ALTER ROLE ${role} SET temp_file_limit = '-1'`),
        liftStatementTimeout: await attempt(session, 'SET statement_timeout = 0'),
      }, { limit, lift: '42501', liftForRole: '42501', liftStatementTimeout: 'ok' }, role)
    }
  })

  // Where each Applications cluster bound is set, and what a Project session can do to it. Cluster
  // values come from scripts/run-application-cluster.sh, role values from data-plane.ts.
  await t.test('the Applications cluster bounds: where each is set and what a Project session can change', async (st) => {
    const bounds = ['statement_timeout', 'transaction_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout', 'temp_file_limit', 'max_connections', 'reserved_connections', 'max_wal_size']
    const observed = {}
    for (const role of [a.runtimeRole, a.migrationRole]) {
      const session = await loginAs(st, role, database)
      const { rows } = await session.query('SELECT name, setting, source FROM pg_settings WHERE name = ANY($1) ORDER BY name', [bounds])
      const connectionLimit = (await session.query('SELECT rolconnlimit FROM pg_roles WHERE rolname = current_user')).rows[0].rolconnlimit
      observed[role] = {
        settings: Object.fromEntries(rows.map((row) => [row.name, `${row.setting} ${row.source}`])),
        connectionLimit,
        setStatementTimeout: await attempt(session, 'SET statement_timeout = 0'),
        setTransactionTimeout: await attempt(session, 'SET transaction_timeout = 0'),
        setLockTimeout: await attempt(session, 'SET lock_timeout = 0'),
        setIdleTimeout: await attempt(session, 'SET idle_in_transaction_session_timeout = 0'),
        setTempFileLimit: await attempt(session, "SET temp_file_limit = '-1'"),
        alterSystem: await attempt(session, "ALTER SYSTEM SET statement_timeout = '0'"),
        alterDatabase: await attempt(session, `ALTER DATABASE ${database} SET statement_timeout = 0`),
        alterOwnRole: await attempt(session, `ALTER ROLE ${role} IN DATABASE ${database} SET transaction_timeout = 0`),
        alterConnectionLimit: await attempt(session, `ALTER ROLE ${role} CONNECTION LIMIT -1`),
      }
    }
    const cluster = { max_connections: '60 command line', max_wal_size: '512 command line', reserved_connections: '4 command line' }
    const refusals = { setTempFileLimit: '42501', alterSystem: '42501', alterDatabase: '42501', alterConnectionLimit: '42501' }
    // A role may even store its own default for a user-settable timeout; the invocation wall clock,
    // not these defaults, is the bound, and the next prepare restores them.
    const userSettable = { setStatementTimeout: 'ok', setTransactionTimeout: 'ok', setLockTimeout: 'ok', setIdleTimeout: 'ok', alterOwnRole: 'ok' }
    assert.deepEqual(observed, {
      [a.runtimeRole]: {
        settings: { ...cluster, idle_in_transaction_session_timeout: '10000 database user', lock_timeout: '2000 database user', statement_timeout: '5000 database user', temp_file_limit: '262144 database user', transaction_timeout: '6000 database user' },
        connectionLimit: 8, ...userSettable, ...refusals,
      },
      [a.migrationRole]: {
        settings: { ...cluster, idle_in_transaction_session_timeout: '10000 database user', lock_timeout: '5000 database user', statement_timeout: '30000 database user', temp_file_limit: '1048576 database user', transaction_timeout: '30000 database user' },
        connectionLimit: 2, ...userSettable, ...refusals,
      },
    })
    // Postgres admits a session into the reserved slots only for a role that holds the privileges of
    // pg_use_reserved_connections; the provisioner is NOINHERIT, so its grant must say INHERIT.
    const { rows } = await provisioner.query("SELECT rolname, pg_has_role(oid, 'pg_use_reserved_connections', 'USAGE') AS reserved FROM pg_roles WHERE rolname = ANY($1)",
      [['app_provisioner', a.runtimeRole, a.migrationRole]])
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.rolname, row.reserved])), { app_provisioner: true, [a.runtimeRole]: false, [a.migrationRole]: false })
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

  await t.test('a Project role logs in only through the relay, even with a password it set itself', async (st) => {
    const chosen = 'chosen-by-generated-code-4f9d2c'
    const certificate = { ...relayTls(), rejectUnauthorized: true }
    for (const role of [a.runtimeRole, a.migrationRole]) {
      const session = await loginAs(st, role, database)
      assert.equal(await attempt(session, `ALTER ROLE ${role} PASSWORD '${chosen}'`), 'ok', 'Postgres lets any role change its own password')
      assert.equal(await attempt(session, `ALTER ROLE ${role} VALID UNTIL 'infinity'`), '42501')
      assert.deepEqual({
        passwordToApplicationDatabase: await loginDirectly({ user: role, password: chosen, database }),
        passwordToPostgres: await loginDirectly({ user: role, password: chosen, database: 'postgres' }),
        certificateToPostgres: await loginDirectly({ user: role, database: 'postgres', ssl: certificate }),
      }, {
        passwordToApplicationDatabase: '28000', passwordToPostgres: '28000', certificateToPostgres: '28000',
      }, `pg_hba rejects ${role} everywhere on the Applications cluster but the relay path`)
      // The Hub's cluster does not know the role at all, so neither credential opens the Hub database.
      assert.equal(await loginDirectly({ user: role, password: chosen, database: hubDatabase }, hubCluster), '28P01', `${role} has no Hub cluster login`)
      // Without those pg_hba rules the password is still dead: it expired before it was set.
      assert.equal(await loginWithoutPgHbaRules(role, chosen, database), '28P01', `${role} password is expired`)
      assert.deepEqual((await (await loginAs(st, role, database)).query('SELECT current_user AS who')).rows, [{ who: role }], 'the relay path still admits it')
    }
  })

  await t.test('the Hub cluster holds no Project role and provisioning refuses to create one there', async () => {
    const onHub = new pg.Client({ ...hubCluster, database: hubDatabase })
    await onHub.connect()
    try {
      const projectRoles = [a.runtimeRole, a.migrationRole, b.runtimeRole, b.migrationRole]
      assert.deepEqual((await onHub.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1)', [projectRoles])).rows, [])
      const hubRoles = hubRoleNames({})
      const present = (await onHub.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname', [hubRoles])).rows.map((row) => row.rolname)
      assert.ok(present.length > 0, 'the Hub cluster holds the Hub roles')
      const refused = `conexus_apps_${randomUUID().replaceAll('-', '').slice(0, 12)}`
      assert.deepEqual((await onHub.query("SELECT rolname FROM pg_roles WHERE rolname = 'app_provisioner'")).rows, [], 'no provisioner before the attempt')
      try {
        await assert.rejects(provisionApplicationDatabase({
          cluster: { host: hubCluster.host, port: hubCluster.port }, database: refused, hubRoles,
          installation: { user: hubCluster.user, password: hubCluster.password }, provisionerPassword: randomBytes(18).toString('base64url'),
        }), { message: `APPLICATION_CLUSTER_HOLDS_HUB_ROLES: ${present.join(',')}` })
        assert.deepEqual((await onHub.query("SELECT rolname FROM pg_roles WHERE rolname = 'app_provisioner'")).rows, [])
      } finally {
        // Should provisioning ever succeed here, it must not leave the Hub test cluster holding it.
        await onHub.query(`DROP DATABASE IF EXISTS ${refused} WITH (FORCE)`)
        await onHub.query('DROP ROLE IF EXISTS app_provisioner')
      }
    } finally {
      await onHub.end()
    }
  })

  await t.test('PUBLIC holds no CONNECT on the application or postgres database', async () => {
    const stranger = `app_stranger_${randomUUID().replaceAll('-', '').slice(0, 8)}`
    const password = randomBytes(18).toString('base64url')
    const superuser = new pg.Client({ ...admin, database: 'postgres' })
    await superuser.connect()
    try {
      await superuser.query(`CREATE ROLE ${stranger} LOGIN PASSWORD '${password}'`)
      assert.deepEqual({
        application: await loginDirectly({ user: stranger, password, database }),
        postgres: await loginDirectly({ user: stranger, password, database: 'postgres' }),
      }, { application: '42501', postgres: '42501' })
    } finally {
      await superuser.query(`DROP ROLE IF EXISTS ${stranger}`)
      await superuser.end()
    }
  })

  await t.test('allocations an earlier runner created are brought under the current rules', async (st) => {
    const superuser = new pg.Client({ ...admin, database: 'postgres' })
    await superuser.connect()
    st.after(() => superuser.end())
    const legacy = 'legacy-derived-password-8c1e'
    await superuser.query(`ALTER ROLE ${b.runtimeRole} PASSWORD '${legacy}' VALID UNTIL 'infinity'`)
    assert.equal(await loginWithoutPgHbaRules(b.runtimeRole, legacy, database), 'connected', 'the legacy password works wherever pg_hba allows passwords')
    await provisioner.query(`DROP POLICY migration_session ON ${b.schema}.conexus_migration`)
    assert.deepEqual([...await convergePreviewAllocations(provisioner, database)].sort(), [a.projectId, b.projectId].sort())
    assert.equal(await loginWithoutPgHbaRules(b.runtimeRole, legacy, database), '28P01')
    const { rows } = await provisioner.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = $1 AND policyname = 'migration_session'", [b.schema])
    assert.equal(rows[0].n, 1)
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
      definerDdl: `CREATE FUNCTION add_column() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE 'ALTER TABLE follow_up_note ADD COLUMN x int'; END $$`,
      standardSqlBody: 'CREATE FUNCTION answer() RETURNS int LANGUAGE sql BEGIN ATOMIC SELECT 42; END',
      procedure: "CREATE PROCEDURE sneak() LANGUAGE sql AS $$ CREATE TABLE sneaky (id int) $$",
      doBlock: "DO $$ BEGIN EXECUTE format('ALTER ROLE %I PASSWORD %L', current_user, 'x'); END $$",
    }
    const observed = {}
    for (const [name, sql] of Object.entries(attacks)) observed[name] = await attempt(migratorA, sql)
    assert.deepEqual(observed, {
      createExtension: '42501', foreignDataWrapper: '42501', copyProgram: '42501', copyServerFile: '42501', readServerFile: '42501',
      largeObjectImport: '42501', alterOwnRuntimeRole: '42501', alterForeignRole: '42501', createRole: '42501', createSchema: '42501',
      createInPublic: '42501', createInForeignSchema: '42501', readForeignTable: '42501', writeCatalog: '42501', dropOwnSchema: '42501',
      dropLedger: '42501', rewriteLedger: '42501', setProvisionerRole: '42501',
      securityDefiner: '42501', definerDdl: '42501', standardSqlBody: '42501', procedure: '42501', doBlock: '42501',
      // Owner-only statements that succeed, and must carry nothing across the boundary.
      grantSchemaToForeign: 'ok', grantTableToForeign: 'ok',
    })
    const runtimeB = await loginAs(st, b.runtimeRole, database)
    assert.equal(await attempt(runtimeB, `SELECT * FROM ${a.schema}.follow_up_note`), '42501', 'a table grant without schema USAGE carries no rows')
    const runtimeA = await loginAs(st, a.runtimeRole, database)
    assert.deepEqual({
      callDefiner: await attempt(runtimeA, `SELECT ${a.schema}.whoami()`),
      callDefinerDdl: await attempt(runtimeA, `SELECT ${a.schema}.add_column()`),
      alterTable: await attempt(runtimeA, 'ALTER TABLE follow_up_note ADD COLUMN x int'),
    }, { callDefiner: '42883', callDefinerDdl: '42883', alterTable: '42501' }, 'no routine exists for a runtime call to reach migration authority')
  })

  await t.test('owner-rights views and rules give a runtime handler nothing of the migration ledger', async (st) => {
    const migratorA = await loginAs(st, a.migrationRole, database)
    await migratorA.query('CREATE VIEW ledger_window AS SELECT * FROM conexus_migration')
    await migratorA.query(`CREATE RULE ledger_echo AS ON INSERT TO follow_up_note DO ALSO
      INSERT INTO conexus_migration (position, name, sha256) VALUES (97, 'echo.sql', '${'e'.repeat(64)}')`)
    const runtimeA = await loginAs(st, a.runtimeRole, database)
    try {
      assert.deepEqual({
        readThroughView: (await runtimeA.query('SELECT count(*)::int AS n FROM ledger_window')).rows[0].n,
        appendThroughView: await attempt(runtimeA, `INSERT INTO ledger_window (position, name, sha256) VALUES (98, 'view.sql', '${'f'.repeat(64)}')`),
        appendThroughRule: await attempt(runtimeA, "INSERT INTO follow_up_note (purchase_order_id, note) VALUES ('PO-R', 'rule')"),
      }, { readThroughView: 0, appendThroughView: '42501', appendThroughRule: '42501' })
      assert.equal((await readLedger(provisioner, a)).length, 1)
    } finally {
      await migratorA.query('DROP RULE ledger_echo ON follow_up_note')
      await migratorA.query('DROP VIEW ledger_window')
    }
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
    await ensurePreviewAllocation(provisioner, { allocation: a, database })
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

// Postgres keeps serving after a reload with server TLS it cannot load, then refuses to start on the
// next restart. Confinement refuses such material before it changes the cluster.
test('confinement refuses server TLS material the cluster could not restart with', () => {
  const base = mkdtempSync(join(tmpdir(), 'conexus-confine-'))
  try {
    const authorityDir = join(base, 'authority')
    ensureTlsMaterial({ authorityDir, relayDir: join(base, 'relay') })
    assert.equal(assertServerMaterial(authorityDir), undefined)
    copyFileSync(join(authorityDir, 'server-key.pem'), join(base, 'server-key.pem'))
    copyFileSync(join(authorityDir, 'ca-key.pem'), join(authorityDir, 'server-key.pem'))
    assert.throws(() => assertServerMaterial(authorityDir), { message: 'CONFINE_TLS_MATERIAL_REFUSED: server-key.pem is not the key of server.pem' })
    copyFileSync(join(base, 'server-key.pem'), join(authorityDir, 'server-key.pem'))
    copyFileSync(join(base, 'relay', 'relay.pem'), join(authorityDir, 'ca.pem'))
    assert.throws(() => assertServerMaterial(authorityDir), { message: 'CONFINE_TLS_MATERIAL_REFUSED: server.pem is not signed by ca.pem' })
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
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
})
