import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { assertRoleInvariants } from '../../scripts/hub-catalog.mjs'
import { loadCurrentHubMigrationFiles, runCurrentHubMigrations, runSelectedHubMigrations } from '../../scripts/run-hub-migrations.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}
const admin = {
  host: required('CONEXUS_TEST_DB_HOST'), port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'), user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}
const query = async (connection, sql, parameters = []) => {
  const client = new pg.Client(connection)
  await client.connect()
  try { return await client.query(sql, parameters) } finally { await client.end() }
}
const connectionStringFor = (connection) => {
  const url = new URL('postgresql://localhost')
  url.hostname = connection.host
  url.port = String(connection.port)
  url.pathname = `/${connection.database}`
  url.username = connection.user
  url.password = connection.password
  return url.toString()
}
const freshDatabase = async (t, label) => {
  await refuseProtectedCluster()
  const database = `conexus_roles_${label}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  await query(admin, `CREATE DATABASE "${database}"`)
  t.after(() => query(admin, `DROP DATABASE "${database}" WITH (FORCE)`))
  return { ...admin, database }
}

const RETIRED = [
  'hub_ws01_command', 'hub_s2_read', 'hub_s3_read', 'hub_prj03_command',
  'hub_rb_ingress', 'hub_rb_executor', 'hub_r2_connections', 'claude_connection_owner',
]
const RENAMED = [
  ['hub_ws01_command', 'hub_workspace_command'],
  ['hub_s2_read', 'hub_workspace_read'],
  ['hub_s3_read', 'hub_project_read'],
  ['hub_prj03_command', 'hub_project_command'],
  ['hub_rb_ingress', 'hub_builder_ingress'],
  ['hub_rb_executor', 'hub_builder_executor'],
  ['hub_r2_connections', 'hub_model_connection'],
  ['claude_connection_owner', 'model_connection_owner'],
]
const retiredList = RETIRED.map(name => `'${name}'`).join(',')

// One row per (role, object, privilege) and one per owned object, so a privilege that landed on
// the wrong object is a difference rather than an equal count. The owner's own entry in an ACL is
// excluded: ALTER ... OWNER TO rewrites it, and it is carried by ownership, not by a grant.
const heldBy = async (connection, roles) => (await query(connection, `
  SELECT a.grantee::regrole::text AS role, 'database' AS kind, d.datname AS object, a.privilege_type AS privilege
    FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
    WHERE d.datname = current_database() AND a.grantee::regrole::text = ANY($1)
  UNION ALL
  SELECT a.grantee::regrole::text, 'schema', n.nspname, a.privilege_type
    FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
    WHERE a.grantee::regrole::text = ANY($1) AND a.grantee <> n.nspowner
  UNION ALL
  SELECT a.grantee::regrole::text, 'relation', n.nspname || '.' || c.relname, a.privilege_type
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE a.grantee::regrole::text = ANY($1) AND a.grantee <> c.relowner
  UNION ALL
  SELECT a.grantee::regrole::text, 'column', n.nspname || '.' || c.relname || '.' || att.attname, a.privilege_type
    FROM pg_attribute att JOIN pg_class c ON c.oid = att.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(att.attacl) a
    WHERE a.grantee::regrole::text = ANY($1)
  UNION ALL
  SELECT a.grantee::regrole::text, 'routine', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', a.privilege_type
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE a.grantee::regrole::text = ANY($1) AND a.grantee <> p.proowner
  UNION ALL
  SELECT a.grantee::regrole::text, 'default_acl', coalesce(n.nspname,'') || ':' || d.defaclobjtype::text, a.privilege_type
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE a.grantee::regrole::text = ANY($1)
`, [roles])).rows

const ownedBy = async (connection, roles) => (await query(connection, `
  SELECT n.nspowner::regrole::text AS role, 'schema' AS kind, n.nspname AS object
    FROM pg_namespace n WHERE n.nspowner::regrole::text = ANY($1)
  UNION ALL
  SELECT c.relowner::regrole::text, 'relation', n.nspname || '.' || c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relowner::regrole::text = ANY($1)
  UNION ALL
  SELECT p.proowner::regrole::text, 'routine', n.nspname || '.' || p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proowner::regrole::text = ANY($1)
  UNION ALL
  SELECT t.typowner::regrole::text, 'type', n.nspname || '.' || t.typname
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typowner::regrole::text = ANY($1)
`, [roles])).rows

const entries = (rows, role) =>
  new Set(rows.filter(row => row.role === role).map(row => `${row.kind} ${row.object} ${row.privilege ?? ''}`))

const migrations = () => loadCurrentHubMigrationFiles()
const upToPrevious = () => migrations().filter(file => file.version < '059')

// A pilot-shaped row in every schema 059 touches: one Account, one Workspace, one Project and one
// model connection past its first generation, so the migration is proved against data rather than
// against an empty catalog.
const seedPilotShape = async (connection) => {
  const accountId = randomUUID(); const workspaceId = randomUUID(); const connectionId = randomUUID()
  await query(connection, `INSERT INTO iam.account(account_id, issuer, external_subject, display_name)
    VALUES ($1, 'https://roles-by-capability.test', $2, 'Pilot')`, [accountId, accountId])
  await query(connection, 'INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, $2)', [workspaceId, 'Pilot'])
  await query(connection, `INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')`, [accountId, workspaceId])
  await query(connection, `INSERT INTO model_connection.connection
    (connection_id, owner_account_id, label, state, current_generation, provider_id, credential_kind)
    VALUES ($1, $2, 'Conta do piloto', 'ACTIVE', 4, 'anthropic', 'OAUTH_TOKEN_SET')`, [connectionId, accountId])
  return { accountId, workspaceId, connectionId }
}

test('059 moves every privilege to the capability-named role and leaves the old names holding nothing', async (t) => {
  const connection = await freshDatabase(t, 'transfer')
  const connectionString = connectionStringFor(connection)
  await runSelectedHubMigrations({ connectionString, migrations: upToPrevious(), recognizedMigrations: migrations(), catalogSnapshot: null })
  const seeded = await seedPilotShape(connection)

  const heldBefore = await heldBy(connection, RETIRED)
  const ownedBefore = await ownedBy(connection, RETIRED)
  assert.ok(heldBefore.length > 0, 'the fixture has to start with privileges to transfer')

  await runCurrentHubMigrations({ connectionString })

  const heldAfter = await heldBy(connection, [...RETIRED, ...RENAMED.map(([, next]) => next)])
  const ownedAfter = await ownedBy(connection, [...RETIRED, ...RENAMED.map(([, next]) => next)])

  for (const [previous, next] of RENAMED) {
    assert.deepEqual([...entries(heldAfter, next)].sort(), [...entries(heldBefore, previous)].sort(), `${next} holds what ${previous} held`)
    assert.deepEqual([...entries(ownedAfter, next)].sort(), [...entries(ownedBefore, previous)].sort(), `${next} owns what ${previous} owned`)
    assert.deepEqual([...entries(heldAfter, previous)], [], `${previous} still holds privileges`)
    assert.deepEqual([...entries(ownedAfter, previous)], [], `${previous} still owns objects`)
  }

  // The data the migration ran over is the data that is there afterwards.
  assert.deepEqual((await query(connection,
    'SELECT connection_id, current_generation, provider_id FROM model_connection.connection')).rows,
    [{ connection_id: seeded.connectionId, current_generation: '4', provider_id: 'anthropic' }])
  assert.equal((await query(connection, 'SELECT count(*)::int AS n FROM iam.workspace_membership')).rows[0].n, 1)
})

test('the retired names are inert rather than dropped, and the invariants hold at the new head', async (t) => {
  const connection = await freshDatabase(t, 'inert')
  await runCurrentHubMigrations({ connectionString: connectionStringFor(connection) })

  // 055 left its roles this way: still in the cluster, because a role is cluster-global and
  // DROP ROLE answers 2BP01 while another database still grants to it, and holding nothing here.
  const present = (await query(connection,
    `SELECT rolname FROM pg_roles WHERE rolname IN (${retiredList}) ORDER BY 1`)).rows.map(row => row.rolname)
  assert.deepEqual(present.sort(), [...RETIRED].sort())
  assert.deepEqual(await heldBy(connection, RETIRED), [])
  assert.deepEqual(await ownedBy(connection, RETIRED), [])

  const client = new pg.Client(connection)
  await client.connect()
  try { await assertRoleInvariants(client, '059') } finally { await client.end() }
})

test('the history replays from zero, and two databases on one cluster replay in either order', async (t) => {
  const first = await freshDatabase(t, 'ordera')
  const second = await freshDatabase(t, 'orderb')

  // The old migrations re-create the old role names in the second database; 059 empties them there
  // too. A rename or a drop would fail here, which is why this file exists.
  const firstRun = await runCurrentHubMigrations({ connectionString: connectionStringFor(first) })
  assert.equal(firstRun.verdict, 'PASS')
  assert.equal(firstRun.versions.at(-1), '059')

  const secondRun = await runCurrentHubMigrations({ connectionString: connectionStringFor(second) })
  assert.equal(secondRun.verdict, 'PASS')
  assert.equal(secondRun.versions.at(-1), '059')

  for (const connection of [second, first]) {
    assert.deepEqual(await heldBy(connection, RETIRED), [])
    assert.deepEqual(await ownedBy(connection, RETIRED), [])
    assert.deepEqual((await runCurrentHubMigrations({ connectionString: connectionStringFor(connection) })).appliedNow, [])
  }
})
