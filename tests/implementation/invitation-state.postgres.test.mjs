import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { buildHubDatabase, query } from './hub-database.mjs'

const DAY = 86_400_000

const seeded = async (t, name) => {
  const database = await buildHubDatabase(t, name)
  const { connectionString } = database
  const owner = randomUUID()
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  await query(connectionString, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name) VALUES ($1, 'https://invitation.test', $2, 'Owner')", [owner, owner])
  await query(connectionString, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ($1, 'Invitations')", [workspaceId])
  await query(connectionString, "INSERT INTO iam.workspace_membership(account_id, workspace_id, role) VALUES ($1, $2, 'owner')", [owner, workspaceId])
  await query(connectionString, "INSERT INTO project.project(project_id, workspace_id, name, source_mode, source_revision, project_revision) VALUES ($1, $2, 'p', 'NEW', $3, 'p')", [projectId, workspaceId, 'a'.repeat(40)])
  await query(connectionString, "INSERT INTO iam.application(project_id, slug, created_by) VALUES ($1, 'invitation-app', $2)", [projectId, owner])
  return { ...database, owner, workspaceId, projectId }
}

const sinceEpoch = (row) => Number(row.since_epoch)

test('the workspace roster says PENDING or EXPIRED by the database clock, and a member row says nothing', async (t) => {
  const { connectionString, owner, workspaceId } = await seeded(t, 'conexus_invitation_roster')
  const invite = (email, role, expiresAt) => query(connectionString, 'SELECT iam.invite_workspace_member($1,$2,$3,$4,$5,$6) AS id', [owner, workspaceId, randomUUID(), email, role, expiresAt])
  await invite('Ana@Example.test', 'member', new Date(Date.now() - 2 * DAY))
  await invite('live@example.test', 'owner', new Date(Date.now() + 5 * DAY))
  const roster = (await query(connectionString, 'SELECT kind, email, state FROM iam.list_workspace_roster($1,$2) ORDER BY kind, email', [owner, workspaceId])).rows
  assert.deepEqual(roster.filter((row) => row.kind === 'invitation').map((row) => [row.email, row.state]), [['ana@example.test', 'EXPIRED'], ['live@example.test', 'PENDING']])
  assert.deepEqual(roster.filter((row) => row.kind === 'member').map((row) => row.state), [null])
})

test('an expired workspace invitation cannot be claimed, and inviting the same person again renews the same row with a new deadline and a new invited date', async (t) => {
  const { connectionString, owner, workspaceId } = await seeded(t, 'conexus_invitation_reinvite')
  const invite = async (role, expiresAt) => (await query(connectionString, 'SELECT iam.invite_workspace_member($1,$2,$3,$4,$5,$6) AS id', [owner, workspaceId, randomUUID(), 'ana@example.test', role, expiresAt])).rows[0].id
  const first = await invite('member', new Date(Date.now() - 2 * DAY))
  await query(connectionString, "UPDATE iam.workspace_invitation SET created_at = clock_timestamp() - interval '16 days' WHERE invitation_id = $1", [first])
  const read = async () => (await query(connectionString, "SELECT email, state, extract(epoch FROM since) AS since_epoch FROM iam.list_workspace_roster($1,$2) WHERE kind = 'invitation'", [owner, workspaceId])).rows[0]
  const before = await read()
  assert.equal((await query(connectionString, 'SELECT iam.claim_invitations($1,$2) AS n', [randomUUID(), 'ana@example.test'])).rows[0].n, 0, 'an expired invitation cannot be claimed')

  assert.equal(await invite('member', new Date(Date.now() + 14 * DAY)), first, 'the same invitation')
  const after = await read()
  assert.equal(after.state, 'PENDING')
  assert.ok(sinceEpoch(after) > sinceEpoch(before) + 15 * 86_400, 'the invited date is the latest invitation')
})

test('application access lists an invitation as PENDING or EXPIRED, a grant and the application with no state, and granting the same email again renews the same invitation', async (t) => {
  const { connectionString, owner, projectId } = await seeded(t, 'conexus_invitation_application')
  const grant = async (email) => (await query(connectionString, 'SELECT * FROM iam.grant_application_access($1,$2,$3,$4,$5)', [owner, projectId, randomUUID(), email, new Date(Date.now() + 14 * DAY)])).rows[0]
  await grant('Bia@Example.test')
  await query(connectionString, "UPDATE iam.application_invitation SET created_at = clock_timestamp() - interval '20 days', expires_at = clock_timestamp() - interval '6 days'")
  const holder = randomUUID()
  await query(connectionString, "INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email) VALUES ($1, 'https://invitation.test', $2, 'Holder', 'holder@example.test')", [holder, holder])
  await query(connectionString, 'INSERT INTO iam.application_grant(grant_id, project_id, account_id, granted_by, granted_at) VALUES ($1, $2, $3, $4, clock_timestamp())', [randomUUID(), projectId, holder, owner])
  const list = async () => (await query(connectionString, 'SELECT kind, entry_id, state, extract(epoch FROM since) AS since_epoch FROM iam.list_application_access($1,$2) ORDER BY kind', [owner, projectId])).rows
  const before = await list()
  assert.deepEqual(before.map((row) => [row.kind, row.state]), [['application', null], ['grant', null], ['invitation', 'EXPIRED']])

  const renewed = await grant('bia@example.test')
  assert.deepEqual([renewed.kind, renewed.entry_id], ['invitation', before[2].entry_id], 'the same invitation')
  const after = (await list())[2]
  assert.equal(after.state, 'PENDING')
  assert.ok(sinceEpoch(after) > sinceEpoch(before[2]) + 19 * 86_400, 'the invited date is the latest invitation')
})

test('an expired invitation can still be cancelled', async (t) => {
  const { connectionString, owner, workspaceId } = await seeded(t, 'conexus_invitation_cancel')
  const id = (await query(connectionString, 'SELECT iam.invite_workspace_member($1,$2,$3,$4,$5,$6) AS id', [owner, workspaceId, randomUUID(), 'old@example.test', 'member', new Date(Date.now() - DAY)])).rows[0].id
  const invitations = async () => (await query(connectionString, "SELECT invitation_id, state FROM iam.list_workspace_roster($1,$2) WHERE kind = 'invitation'", [owner, workspaceId])).rows
  assert.deepEqual(await invitations(), [{ invitation_id: id, state: 'EXPIRED' }])
  await query(connectionString, 'SELECT iam.cancel_workspace_invitation($1,$2)', [owner, id])
  assert.deepEqual(await invitations(), [])
})
