import assert from 'node:assert/strict'
import { test } from 'node:test'
import pg from 'pg'
import { buildHubDatabase } from './hub-database.mjs'

const { Client } = pg

const query = async (connection, statement, values = []) => {
  const client = new Client(connection)
  await client.connect()
  try {
    return await client.query(statement, values)
  } finally {
    await client.end()
  }
}

test('real PostgreSQL proves the six-function Workspace foundation and its role boundary', async (t) => {
  const { admin, connection: fresh, onCleanup } = await buildHubDatabase(t, 'conexus_s2')
  const liveClients = []
  onCleanup(async () => {
    for (const client of liveClients.reverse()) await client.end().catch(() => {})
    await admin.query('ALTER ROLE hub_workspace_command PASSWORD NULL').catch(() => {})
    await admin.query('ALTER ROLE hub_workspace_read PASSWORD NULL').catch(() => {})
  })

  const commandPassword = 's2-command-test-only'
  const readPassword = 's2-read-test-only'
  await query(fresh, `ALTER ROLE hub_workspace_command PASSWORD '${commandPassword}'`)
  await query(fresh, `ALTER ROLE hub_workspace_read PASSWORD '${readPassword}'`)
  const command = new Client({ ...fresh, user: 'hub_workspace_command', password: commandPassword })
  const read = new Client({ ...fresh, user: 'hub_workspace_read', password: readPassword })
  await command.connect()
  await read.connect()
  liveClients.push(command, read)

  const accountId = '10000000-0000-4000-8000-000000000001'
  const otherAccountId = '10000000-0000-4000-8000-000000000002'
  const workspaceId = '20000000-0000-4000-8000-000000000001'
  const otherWorkspaceId = '20000000-0000-4000-8000-000000000002'
  await query(fresh, `
    INSERT INTO iam.account(account_id, issuer, external_subject, display_name, email)
    VALUES ($1, 'https://issuer.test', 'subject-1', 'Test Account', 'test@example.test'),
      ($2, 'https://issuer.test', 'subject-2', 'Other Account', 'other@example.test')
  `, [accountId, otherAccountId])

  const keyDigest = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const requestDigest = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const responseDigest = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
  await command.query('BEGIN')
  const reservation = await command.query(`SELECT * FROM workspace.reserve_or_replay_create_workspace($1, $2, $3, $4)`, [accountId, keyDigest, requestDigest, workspaceId])
  assert.deepEqual(reservation.rows, [{ state: 'RESERVED', workspace_id: workspaceId, response_status: null, response_body: null }])
  await command.query('SELECT workspace.create_workspace($1, $2, $3)', [workspaceId, 'Workspace One', accountId])
  const responseBody = { workspaceId, name: 'Workspace One' }
  await command.query('SELECT workspace.complete_create_workspace_receipt($1, $2, $3, $4, $5)', [accountId, keyDigest, 201, responseDigest, responseBody])
  await command.query('COMMIT')

  await command.query('BEGIN')
  const replay = await command.query(`SELECT * FROM workspace.reserve_or_replay_create_workspace($1, $2, $3, $4)`, [accountId, keyDigest, requestDigest, otherWorkspaceId])
  assert.deepEqual(replay.rows, [{ state: 'REPLAY', workspace_id: workspaceId, response_status: 201, response_body: responseBody }])
  await command.query('COMMIT')
  await command.query('BEGIN')
  const conflict = await command.query(`SELECT * FROM workspace.reserve_or_replay_create_workspace($1, $2, $3, $4)`, [accountId, keyDigest, 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', otherWorkspaceId])
  assert.deepEqual(conflict.rows, [{ state: 'CONFLICT', workspace_id: workspaceId, response_status: null, response_body: null }])
  await command.query('COMMIT')

  await command.query('BEGIN')
  await command.query(`SELECT * FROM workspace.reserve_or_replay_create_workspace($1, $2, $3, $4)`, [accountId, 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', requestDigest, otherWorkspaceId])
  await assert.rejects(command.query('SELECT workspace.create_workspace($1, $2, $3)', [otherWorkspaceId, '', accountId]), /new row for relation|violates check constraint/)
  await command.query('ROLLBACK')
  const orphan = await query(fresh, `
    SELECT (SELECT count(*)::integer FROM workspace.workspace WHERE workspace_id = $1) AS workspace_count,
      (SELECT count(*)::integer FROM workspace.operation_idempotency WHERE reserved_workspace_id = $1) AS receipt_count
  `, [otherWorkspaceId])
  assert.deepEqual(orphan.rows[0], { workspace_count: 0, receipt_count: 0 })

  // Creating the Workspace is what makes its creator a member; nothing else granted this account
  // access, and the second account was never given any.
  await read.query('BEGIN READ ONLY')
  const visible = await read.query('SELECT workspace_id, name FROM workspace.list_visible_workspace_summaries($1)', [accountId])
  assert.deepEqual(visible.rows, [{ workspace_id: workspaceId, name: 'Workspace One' }])
  const invisible = await read.query('SELECT workspace_id, name FROM workspace.list_visible_workspace_summaries($1)', [otherAccountId])
  assert.deepEqual(invisible.rows, [])
  await read.query('COMMIT')

  await assert.rejects(command.query('SELECT * FROM workspace.workspace'), /permission denied/)
  await assert.rejects(read.query('SELECT * FROM iam.workspace_membership'), /permission denied/)
  await assert.rejects(command.query('SET ROLE workspace_owner'), /permission denied/)
  await assert.rejects(read.query('SET ROLE iam_owner'), /permission denied/)
})
