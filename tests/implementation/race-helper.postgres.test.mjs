import assert from 'node:assert/strict'
import { test } from 'node:test'
import pg from 'pg'
import { query } from './hub-database.mjs'
import { buildHubDatabase } from './hub-database.mjs'
import { waitUntilBlocked } from './race.mjs'

test('waitUntilBlocked returns the lock a second backend waits for, and times out when nothing waits', async (t) => {
  const { connection, onCleanup } = await buildHubDatabase(t, 'conexus_race_helper')
  await assert.rejects(waitUntilBlocked(connection, { timeoutMs: 150 }), /WAIT_UNTIL_BLOCKED_TIMEOUT: wanted 1 blocked backends, saw \[\]/)
  await query(connection, "INSERT INTO workspace.workspace(workspace_id, name) VALUES ('20000000-0000-4000-8000-0000000000d1', 'W')")
  const holder = new pg.Client(connection)
  const waiter = new pg.Client(connection)
  await Promise.all([holder.connect(), waiter.connect()])
  onCleanup(() => Promise.all([holder.end(), waiter.end()]).catch(() => undefined))
  await holder.query('BEGIN')
  await holder.query("SELECT 1 FROM workspace.workspace WHERE workspace_id = '20000000-0000-4000-8000-0000000000d1' FOR UPDATE")
  const waiting = waiter.query("UPDATE workspace.workspace SET name = 'X' WHERE workspace_id = '20000000-0000-4000-8000-0000000000d1'")
  const rows = await waitUntilBlocked(connection)
  assert.deepEqual(rows.map((row) => [row.wait_event, row.locktype, row.mode]), [['transactionid', 'transactionid', 'ShareLock']])
  await holder.query('COMMIT')
  await waiting
})
