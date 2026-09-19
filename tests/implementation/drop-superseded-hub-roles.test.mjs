import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { SUPERSEDED_ROLES } from '../../scripts/generate-hub-baseline.mjs'
import { dropSupersededRoles, surveySupersededRoles } from '../../scripts/drop-superseded-hub-roles.mjs'
import { createEmptyDatabase, query } from './hub-database.mjs'

// The eighteen real names exist on every shared cluster an agent or the pilot ever migrated, and
// dropping them there would take other people's databases with them. The command takes its role
// list as an argument for exactly this reason, and this suite drops only names it invented.
const standIns = (count) => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
  return Array.from({ length: count }, (_, index) => `conexus_standin_${suffix}_${index}`)
}

const createRoles = async (connectionString, roles) => {
  for (const role of roles) await query(connectionString, `CREATE ROLE "${role}" NOLOGIN NOINHERIT`)
}

const rolesOnCluster = async (connectionString, roles) =>
  (await query(connectionString, 'SELECT rolname FROM pg_roles WHERE rolname = ANY($1) ORDER BY 1', [roles])).rows.map((row) => row.rolname)

test('the command ships the eighteen names the replaced history left behind', () => {
  assert.equal(SUPERSEDED_ROLES.length, 18)
  assert.equal(new Set(SUPERSEDED_ROLES).size, 18)
})

test('a dry run reports what it would drop and drops nothing', async (t) => {
  const { admin, connection, connectionString } = await createEmptyDatabase(t, 'conexus_rolecleanup')
  const roles = standIns(3)
  await createRoles(connectionString, roles)
  t.after(async () => {
    for (const role of roles) await admin.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {})
  })

  const result = await dropSupersededRoles({ admin: connection, roles })
  assert.equal(result.verdict, 'DRY_RUN')
  assert.deepEqual(result.wouldDrop, [...roles].sort())
  assert.deepEqual(result.refusals, [])
  assert.deepEqual(await rolesOnCluster(connectionString, roles), [...roles].sort())
})

test('applying removes the roles and the grants they still held', async (t) => {
  const { connection, connectionString } = await createEmptyDatabase(t, 'conexus_rolecleanup')
  const roles = standIns(2)
  await createRoles(connectionString, roles)
  await query(connectionString, 'CREATE SCHEMA leftover')
  for (const role of roles) await query(connectionString, `GRANT USAGE ON SCHEMA leftover TO "${role}"`)

  const result = await dropSupersededRoles({ admin: connection, roles, apply: true })
  assert.equal(result.verdict, 'DROPPED')
  assert.deepEqual(result.dropped, [...roles].sort())
  assert.deepEqual(await rolesOnCluster(connectionString, roles), [])
})

test('a role that still owns an object is refused by name with its database', async (t) => {
  const { admin, connection, connectionString, database } = await createEmptyDatabase(t, 'conexus_rolecleanup')
  const [role] = standIns(1)
  await createRoles(connectionString, [role])
  await query(connectionString, `CREATE SCHEMA owned AUTHORIZATION "${role}"`)
  t.after(async () => {
    await query(connectionString, `DROP SCHEMA owned CASCADE`).catch(() => {})
    await admin.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {})
  })

  await assert.rejects(
    dropSupersededRoles({ admin: connection, roles: [role], apply: true }),
    new RegExp(`SUPERSEDED_ROLE_STILL_OWNS:${role} in ${database} holds`),
  )
  assert.deepEqual(await rolesOnCluster(connectionString, [role]), [role])
})

test('a name that is absent from the cluster is reported, not refused', async (t) => {
  const { connection } = await createEmptyDatabase(t, 'conexus_rolecleanup')
  const roles = standIns(2)
  const survey = await surveySupersededRoles({ admin: connection, roles })
  assert.deepEqual(survey.present, [])
  assert.deepEqual(survey.absent, roles)
  assert.deepEqual(survey.refusals, [])
})
