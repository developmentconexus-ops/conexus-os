import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { z } from 'zod'
import { hubModuleUrl } from './hub-build.mjs'
import { query } from './hub-database.mjs'
import { ID, setupProjects } from './project-fixture.mjs'

const { sql } = await import(hubModuleUrl('platform/db.js'))
const { admitApplication, checkApplication } = await import(hubModuleUrl('identity-access/admission.js'))

const refused = { id: 'APPLICATION_NOT_FOUND' }
const check = (database, accountId, projectId) => database.transaction(accountId, (gate) => checkApplication(gate, projectId))

const seedApplication = (connection, projectId) =>
  query(connection, 'INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, $2, $3)', [projectId, `app-${randomUUID().slice(0, 8)}`, ID.owner])

test('checkApplication admits a member and a grantee, and refuses an outsider, a revoked grant, an archived project, an inactive account and a project in deletion', async (t) => {
  const { connection, database, seedProject } = await setupProjects(t, 'conexus_check_application')
  const projectId = await seedProject('Atlas')
  await assert.rejects(check(database, ID.member, projectId), refused)
  await seedApplication(connection, projectId)
  const member = await check(database, ID.member, projectId)
  assert.deepEqual(member.scope, { kind: 'application', accountId: ID.member, projectId, via: 'membership' })
  await assert.rejects(check(database, ID.outsider, projectId), refused)
  await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, ID.outsider, ID.owner])
  assert.equal((await check(database, ID.outsider, projectId)).scope.via, 'grant')
  await query(connection, 'UPDATE iam.application_grant SET revoked_at = now(), revoked_by = $2 WHERE account_id = $1', [ID.outsider, ID.owner])
  await assert.rejects(check(database, ID.outsider, projectId), refused)
  await query(connection, 'UPDATE iam.account SET active = false WHERE account_id = $1', [ID.member])
  await assert.rejects(check(database, ID.member, projectId), refused)
  await query(connection, 'UPDATE iam.account SET active = true WHERE account_id = $1', [ID.member])
  await query(connection, 'UPDATE project.project SET archived = true WHERE project_id = $1', [projectId])
  await assert.rejects(check(database, ID.member, projectId), refused)
  await query(connection, 'UPDATE project.project SET archived = false WHERE project_id = $1', [projectId])
  await query(connection, "INSERT INTO project.project_deletion(project_id, workspace_id, name, requested_by) VALUES ($1, $2, 'Atlas', $3)", [projectId, ID.workspace, ID.administrator])
  await assert.rejects(check(database, ID.member, projectId), refused)
})

test('a checkApplication holds no row lock and assigns no transaction id, and admitApplication holds both', async (t) => {
  const { connection, database, seedProject, onCleanup } = await setupProjects(t, 'conexus_check_application_locks')
  const projectId = await seedProject('Atlas')
  await seedApplication(connection, projectId)
  await query(connection, 'INSERT INTO iam.application_grant(project_id, account_id, granted_by) VALUES ($1, $2, $3)', [projectId, ID.outsider, ID.owner])
  const Xid = z.object({ xid: z.string().nullable() })
  const xidOf = (tx) => tx.one(Xid, sql`SELECT pg_current_xact_id_if_assigned()::text AS xid`, 'INTERNAL_UNEXPECTED')
  const rowLocks = [
    ['the account', 'SELECT 1 FROM iam.account WHERE account_id = $1', ID.member],
    ['the membership', 'SELECT 1 FROM iam.workspace_membership WHERE account_id = $1', ID.member],
    ['the project', 'SELECT 1 FROM project.project WHERE project_id = $1', projectId],
    ['the grant', 'SELECT 1 FROM iam.application_grant WHERE account_id = $1', ID.outsider],
  ]
  const probe = async () => {
    const client = new pg.Client(connection)
    await client.connect()
    onCleanup(() => client.end().catch(() => undefined))
    const blocked = []
    for (const [label, text, value] of rowLocks) {
      await client.query('BEGIN')
      try { await client.query(`${text} FOR UPDATE NOWAIT`, [value]) } catch (error) { if (error.code !== '55P03') throw error; blocked.push(label) }
      await client.query('ROLLBACK')
    }
    return blocked
  }
  const checked = await database.transaction(ID.member, async (gate) => {
    const proof = await checkApplication(gate, projectId)
    return { xid: (await xidOf(proof.tx)).xid, blocked: await probe() }
  })
  assert.deepEqual(checked, { xid: null, blocked: [] })
  const grantee = await database.transaction(ID.outsider, async (gate) => {
    const proof = await checkApplication(gate, projectId)
    return { xid: (await xidOf(proof.tx)).xid, blocked: await probe() }
  })
  assert.deepEqual(grantee, { xid: null, blocked: [] })
  const admitted = await database.transaction(ID.member, async (gate) => {
    const proof = await admitApplication(gate, projectId)
    return { assigned: (await xidOf(proof.tx)).xid !== null, blocked: await probe() }
  })
  assert.deepEqual(admitted, { assigned: true, blocked: ['the account', 'the membership', 'the project'] })
})
