import pg from 'pg'

const BLOCKED = `SELECT a.pid, a.wait_event, l.locktype, l.mode FROM pg_stat_activity AS a
  JOIN pg_locks AS l ON l.pid = a.pid AND NOT l.granted
  WHERE a.datname = $1 AND a.wait_event_type = 'Lock' AND a.pid <> pg_backend_pid()`

/**
 * Resolves once `count` backends of the connection's database wait on a lock another transaction holds,
 * and returns what they wait for. It replaces a fixed sleep: a race test that has to prove a
 * transaction waits proves it from pg_stat_activity and pg_locks, and a test of a broken rule fails
 * at the timeout with the activity it saw instead of passing on a slow machine.
 */
export const waitUntilBlocked = async (connection, { count = 1, timeoutMs = 5000 } = {}) => {
  const client = new pg.Client(connection)
  await client.connect()
  try {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const { rows } = await client.query(BLOCKED, [connection.database])
      if (rows.length >= count) return rows
      if (Date.now() > deadline) throw new Error(`WAIT_UNTIL_BLOCKED_TIMEOUT: wanted ${count} blocked backends, saw ${JSON.stringify(rows)}`)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  } finally {
    await client.end()
  }
}
