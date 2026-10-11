import assert from 'node:assert/strict'
import { test } from 'node:test'
import pg from 'pg'
import { assertRoleInvariants } from '../../scripts/hub-catalog.mjs'
import { buildHubDatabase } from './hub-database.mjs'
import { refuseProtectedCluster } from './protected-cluster.mjs'

// Roles belong to the cluster, so a failed assertion must not leave one changed for the next test.
const RESTORE = [
  'ALTER ROLE hub_runtime NOCREATEDB LOGIN NOINHERIT',
  'REVOKE hub_factory FROM hub_runtime',
  'ALTER ROLE hub_runtime RESET role',
  'ALTER ROLE hub_runtime RESET conexus.job',
  'ALTER ROLE hub_runtime RESET work_mem',
  "ALTER ROLE hub_runtime SET lock_timeout = '5s'",
  ...['hub_reader', 'hub_command', 'iam_rls', 'hub_builder_ingress'].map((role) => `DROP ROLE IF EXISTS ${role}`),
]

async function withClient(t, prefix, body) {
  const { connection, onCleanup } = await buildHubDatabase(t, prefix)
  const client = new pg.Client(connection)
  await client.connect()
  onCleanup(() => client.end())
  try {
    await assertRoleInvariants(client)
    await body(client)
  } finally {
    for (const statement of RESTORE) await client.query(statement)
  }
}

test('the role invariants refuse a retired role that exists again, one at a time, with its name', async (t) => {
  await refuseProtectedCluster()
  await withClient(t, 'conexus_role_retired', async (client) => {
    for (const role of ['hub_reader', 'hub_command', 'iam_rls', 'hub_builder_ingress']) {
      await client.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT`)
      await assert.rejects(assertRoleInvariants(client), new RegExp(`^Error: MIGRATION_RETIRED_ROLE_PRESENT:${role}$`), role)
      await client.query(`DROP ROLE ${role}`)
    }
    await assertRoleInvariants(client)
  })
})

test('the role invariants refuse an elevated attribute, a membership, a login role that cannot log in and an inheriting role', async (t) => {
  await refuseProtectedCluster()
  await withClient(t, 'conexus_role_attributes', async (client) => {
    await client.query('ALTER ROLE hub_runtime CREATEDB')
    await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_ATTRIBUTE_REFUSED:hub_runtime/)
    await client.query('ALTER ROLE hub_runtime NOCREATEDB')
    await client.query('GRANT hub_factory TO hub_runtime')
    await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_MEMBERSHIP_REFUSED:hub_runtime in hub_factory/)
    await client.query('REVOKE hub_factory FROM hub_runtime')
    await client.query('ALTER ROLE hub_runtime NOLOGIN')
    await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_LOGIN_REFUSED:hub_runtime/)
    await client.query('ALTER ROLE hub_runtime LOGIN')
    await client.query('ALTER ROLE hub_runtime INHERIT')
    await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_INHERIT_REFUSED:hub_runtime/)
    await client.query('ALTER ROLE hub_runtime NOINHERIT')
    await assertRoleInvariants(client)
  })
})

test('the role invariants fail on a role setting, a conexus setting, an extra setting, a missing timeout and a database wide switch', async (t) => {
  await refuseProtectedCluster()
  await withClient(t, 'conexus_role_settings', async (client) => {
    await client.query("ALTER ROLE hub_runtime SET role = 'hub_factory'")
    await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:hub_runtime role=hub_factory/)
    await client.query('ALTER ROLE hub_runtime RESET role')
    await client.query("ALTER ROLE hub_runtime SET conexus.job = 'project-purge'")
    await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:hub_runtime conexus.job=project-purge/)
    await client.query('ALTER ROLE hub_runtime RESET conexus.job')
    await client.query("ALTER ROLE hub_runtime SET work_mem = '1GB'")
    await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:hub_runtime work_mem=1GB/)
    await client.query('ALTER ROLE hub_runtime RESET work_mem')
    await client.query('ALTER ROLE hub_runtime RESET lock_timeout')
    await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:missing hub_runtime lock_timeout=5s/)
    await client.query("ALTER ROLE hub_runtime SET lock_timeout = '5s'")
    await assertRoleInvariants(client)
    const { rows: [{ name }] } = await client.query('SELECT current_database() AS name')
    const database = `"${name}"`
    await client.query(`ALTER DATABASE ${database} SET work_mem = '8MB'`)
    await client.query(`ALTER DATABASE ${database} SET timezone = 'UTC'`)
    await assertRoleInvariants(client)
    await client.query(`ALTER DATABASE ${database} SET role = 'hub_factory'`)
    await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:all roles role=hub_factory/)
    await client.query(`ALTER DATABASE ${database} RESET role`)
    await client.query(`ALTER DATABASE ${database} SET conexus.job = 'project-purge'`)
    await assert.rejects(assertRoleInvariants(client), /MIGRATION_ROLE_SETTING_REFUSED:all roles conexus.job=project-purge/)
    await client.query(`ALTER DATABASE ${database} RESET ALL`)
    await assertRoleInvariants(client)
  })
})
