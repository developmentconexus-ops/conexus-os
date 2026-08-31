import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import pg from 'pg'
import { assertLinearMigrationOrder, assertMigrationTarget } from './migration-admission.mjs'

const { Pool } = pg
const here = dirname(fileURLToPath(import.meta.url))
const required = name => {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}
const adminPassword = readFileSync(required('R1F_PG_PASSWORD_FILE'), 'utf8').trim()
const host = required('R1F_PG_HOST')
const port = Number(required('R1F_PG_PORT'))
const user = required('R1F_PG_USER')
const atlasPath = required('R1F_ATLAS_PATH')
const iamPassword = randomBytes(24).toString('base64url')
const projectPassword = randomBytes(24).toString('base64url')
const quote = value => `'${value.replaceAll("'", "''")}'`
const admin = database => new Pool({ host, port, database, user, password: adminPassword, max: 2 })
const runtime = (database, role, password) => new Pool({ host, port, database, user: role, password, max: 2 })
const expectConnectionDenied = async (database, role, password) => {
  const pool = runtime(database, role, password)
  try { await assert.rejects(pool.query('SELECT 1'), error => error.code === '42501') }
  finally { await pool.end() }
}
const atlasUrl = database => `postgres://${encodeURIComponent(user)}:${encodeURIComponent(adminPassword)}@${host}:${port}/${database}?sslmode=disable`
const sanitize = value => String(value).replaceAll(adminPassword, '[REDACTED]').replaceAll(encodeURIComponent(adminPassword), '[REDACTED]')
const atlas = (args, cwd) => spawnSync(atlasPath, args, {
  cwd,
  encoding: 'utf8',
  env: { ...process.env, ATLAS_NO_UPDATE_NOTIFIER: 'true' },
})
const expectAtlasPass = (args, cwd) => {
  const result = atlas(args, cwd)
  assert.equal(result.status, 0, sanitize(result.stderr || result.stdout))
  return result
}
const expectAtlasFail = (args, cwd) => {
  const result = atlas(args, cwd)
  assert.notEqual(result.status, 0, 'Atlas negative control unexpectedly passed')
  assert.equal(`${result.stdout}${result.stderr}`.includes(adminPassword), false)
  return sanitize(`${result.stdout}${result.stderr}`)
}

let cluster
let identityAdmin
let projectAdmin
let migrationAdmin
let validationAdmin
let iam
let project

const dropAndCreateDatabase = async (name, owner, grants = []) => {
  await cluster.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  await cluster.query(`CREATE DATABASE ${name} OWNER ${owner}`)
  await cluster.query(`REVOKE CONNECT ON DATABASE ${name} FROM PUBLIC`)
  await cluster.query(`GRANT CONNECT ON DATABASE ${name} TO ${[user, ...grants].join(', ')}`)
}

before(async () => {
  cluster = admin('r1f')
  await cluster.query(`
    CREATE ROLE identity_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE project_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE migration_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE iam_runtime LOGIN PASSWORD ${quote(iamPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE project_runtime LOGIN PASSWORD ${quote(projectPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE migration_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  `)
  await dropAndCreateDatabase('identity_store', 'identity_owner', ['iam_runtime'])
  await dropAndCreateDatabase('project_store', 'project_owner', ['project_runtime'])
  await dropAndCreateDatabase('migration_store', 'migration_owner')
  await dropAndCreateDatabase('migration_validation', 'migration_owner')

  identityAdmin = admin('identity_store')
  projectAdmin = admin('project_store')
  migrationAdmin = admin('migration_store')
  validationAdmin = admin('migration_validation')
  await identityAdmin.query(`
    CREATE SCHEMA iam AUTHORIZATION identity_owner;
    CREATE TABLE iam.sessions(session_id text PRIMARY KEY, value text NOT NULL);
    ALTER TABLE iam.sessions OWNER TO identity_owner;
    REVOKE ALL ON SCHEMA iam FROM PUBLIC;
    REVOKE ALL ON TABLE iam.sessions FROM PUBLIC;
    GRANT USAGE ON SCHEMA iam TO iam_runtime;
    GRANT SELECT, INSERT ON TABLE iam.sessions TO iam_runtime;
  `)
  await projectAdmin.query(`
    CREATE SCHEMA project AUTHORIZATION project_owner;
    CREATE TABLE project.items(item_id text PRIMARY KEY, value text NOT NULL);
    ALTER TABLE project.items OWNER TO project_owner;
    REVOKE ALL ON SCHEMA project FROM PUBLIC;
    REVOKE ALL ON TABLE project.items FROM PUBLIC;
    GRANT USAGE ON SCHEMA project TO project_runtime;
    GRANT SELECT, INSERT ON TABLE project.items TO project_runtime;
  `)
  iam = runtime('identity_store', 'iam_runtime', iamPassword)
  project = runtime('project_store', 'project_runtime', projectPassword)
})

after(async () => {
  await Promise.allSettled([
    iam?.end(), project?.end(), identityAdmin?.end(), projectAdmin?.end(),
    migrationAdmin?.end(), validationAdmin?.end(), cluster?.end(),
  ])
})

test('R1F-P09 runtime roles use only their own database and owned objects', async () => {
  await iam.query("INSERT INTO iam.sessions VALUES ('s1', 'identity')")
  await project.query("INSERT INTO project.items VALUES ('p1', 'project')")
  assert.equal((await iam.query('SELECT value FROM iam.sessions')).rows[0].value, 'identity')
  assert.equal((await project.query('SELECT value FROM project.items')).rows[0].value, 'project')

  await expectConnectionDenied('project_store', 'iam_runtime', iamPassword)
  await expectConnectionDenied('identity_store', 'project_runtime', projectPassword)
})

test('R1F-P09 SET ROLE, object ownership, superuser and BYPASSRLS remain denied', async () => {
  await assert.rejects(iam.query('SET ROLE identity_owner'), error => error.code === '42501')
  await assert.rejects(project.query('SET ROLE project_owner'), error => error.code === '42501')
  await assert.rejects(iam.query('CREATE TABLE iam.rogue(id integer)'), error => error.code === '42501')
  await assert.rejects(project.query('CREATE TABLE project.rogue(id integer)'), error => error.code === '42501')

  const roles = await cluster.query(`
    SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
    FROM pg_roles WHERE rolname IN ('iam_runtime', 'project_runtime') ORDER BY rolname
  `)
  assert.equal(roles.rows.length, 2)
  for (const role of roles.rows) {
    assert.deepEqual(
      [role.rolsuper, role.rolcreatedb, role.rolcreaterole, role.rolinherit, role.rolbypassrls],
      [false, false, false, false, false],
    )
  }
  const identityOwner = await identityAdmin.query(`
    SELECT r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='iam' AND c.relname='sessions'
  `)
  const projectOwner = await projectAdmin.query(`
    SELECT r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='project' AND c.relname='items'
  `)
  assert.equal(identityOwner.rows[0].rolname, 'identity_owner')
  assert.equal(projectOwner.rows[0].rolname, 'project_owner')
})

test('R1F-P09 creates no CR-1 or other SECURITY DEFINER function', async () => {
  for (const pool of [identityAdmin, projectAdmin, migrationAdmin]) {
    const functions = await pool.query(`
      SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    `)
    assert.deepEqual(functions.rows, [])
  }
})

test('R1F-P10 Atlas checksum, order and role/schema drift stop admission', async () => {
  const runRoot = mkdtempSync(resolve(tmpdir(), 'conexus-r1f-pack-e-'))
  try {
    const baseline = resolve(runRoot, 'baseline')
    cpSync(resolve(here, 'migrations'), baseline, { recursive: true })
    const dir = `file://${baseline}`
    expectAtlasPass(['migrate', 'validate', '--dir', dir, '--dev-url', atlasUrl('migration_validation')], runRoot)
    expectAtlasPass(['migrate', 'apply', '--dir', dir, '--url', atlasUrl('migration_store')], runRoot)
    expectAtlasPass(['migrate', 'status', '--dir', dir, '--url', atlasUrl('migration_store')], runRoot)
    await assertLinearMigrationOrder(migrationAdmin, baseline)
    assert.deepEqual(await assertMigrationTarget(migrationAdmin), {
      schemaOwner: 'migration_owner', tableOwner: 'migration_owner',
      columns: [['item_id', 'text', 'NO'], ['name', 'text', 'NO'], ['revision', 'integer', 'NO']],
    })

    const edited = resolve(runRoot, 'edited')
    cpSync(baseline, edited, { recursive: true })
    appendFileSync(resolve(edited, '202608300001_init.sql'), '\n-- edited after hash\n')
    assert.match(expectAtlasFail(['migrate', 'validate', '--dir', `file://${edited}`], runRoot), /checksum|hash|mismatch/i)

    const reordered = resolve(runRoot, 'reordered')
    cpSync(baseline, reordered, { recursive: true })
    writeFileSync(resolve(reordered, '202608290001_out_of_order.sql'), 'SELECT 1;\n')
    expectAtlasPass(['migrate', 'hash', '--dir', `file://${reordered}`], runRoot)
    await assert.rejects(assertLinearMigrationOrder(migrationAdmin, reordered), /OUT_OF_ORDER_MIGRATION/)

    await migrationAdmin.query('ALTER TABLE app.items ADD COLUMN rogue text')
    await assert.rejects(assertMigrationTarget(migrationAdmin), /TABLE_SCHEMA_DRIFT/)
    await migrationAdmin.query('ALTER TABLE app.items DROP COLUMN rogue')

    await migrationAdmin.query(`ALTER TABLE app.items OWNER TO ${user}`)
    await assert.rejects(assertMigrationTarget(migrationAdmin), /TABLE_OWNER_DRIFT/)
    await migrationAdmin.query('ALTER TABLE app.items OWNER TO migration_owner')
    await assertMigrationTarget(migrationAdmin)
  } finally {
    rmSync(runRoot, { recursive: true, force: true })
  }
})
