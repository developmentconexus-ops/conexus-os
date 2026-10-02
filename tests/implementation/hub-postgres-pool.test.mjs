import assert from 'node:assert/strict'
import { test } from 'node:test'
import pg from 'pg'
import { hubModuleUrl } from './hub-build.mjs'

const { Client } = pg
const { capabilityFor, createPostgresPool } = await import(hubModuleUrl('platform/postgres.js'))

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_TEST_CONFIG_${name}`)
  return value
}

const connection = {
  host: required('CONEXUS_TEST_DB_HOST'),
  port: Number(required('CONEXUS_TEST_DB_PORT')),
  database: required('CONEXUS_TEST_DB_NAME'),
  user: required('CONEXUS_TEST_DB_USER'),
  password: required('CONEXUS_TEST_DB_PASSWORD'),
}

test('idle pooled client termination does not crash the Hub and logs one diagnostic line with pool capability and error code', async (t) => {
  const logs = []
  const write = (line) => { logs.push(line) }

  const pool = createPostgresPool(connection, write)
  const admin = new Client(connection)
  await admin.connect()

  t.after(async () => {
    try {
      await pool.end()
    } finally {
      await admin.end()
    }
  })

  // Acquire a client from the pool to establish a connection, get backend PID, then release back to pool as idle
  const client = await pool.connect()
  const { rows } = await client.query('SELECT pg_backend_pid() AS pid')
  const pid = rows[0].pid
  client.release()

  // Terminate backend for that idle client from admin connection
  const termination = await admin.query('SELECT pg_terminate_backend($1) AS terminated', [pid])
  assert.equal(termination.rows[0].terminated, true)

  // Poll until error listener receives the event
  const expectedCapability = capabilityFor(connection.user)
  const expectedLine = `HUB_POOL_ERROR:${expectedCapability}:57P01\n`

  const start = Date.now()
  while (logs.length === 0 && Date.now() - start < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  assert.deepEqual(logs, [expectedLine])

  // Assert pool is still usable and process stays alive
  const queryResult = await pool.query('SELECT 1 AS alive')
  assert.equal(queryResult.rows[0].alive, 1)
})

test('checked-out pooled client termination fails the in-flight query cleanly, does not crash the Hub, and the pool recovers', async (t) => {
  const logs = []
  const write = (line) => { logs.push(line) }

  const pool = createPostgresPool(connection, write)
  const admin = new Client(connection)
  await admin.connect()

  t.after(async () => {
    try {
      await pool.end()
    } finally {
      await admin.end()
    }
  })

  // Acquire a client and keep it checked out (no release) to hold a query
  const client = await pool.connect()
  const { rows } = await client.query('SELECT pg_backend_pid() AS pid')
  const pid = rows[0].pid

  const inFlight = client.query('SELECT pg_sleep(2)')
  // The termination below can reject the query before the assertion further down attaches its handler.
  inFlight.catch(() => {})

  const activeSince = Date.now()
  for (;;) {
    const { rows: activity } = await admin.query(
      "SELECT state = 'active' AND query LIKE 'SELECT pg_sleep%' AS sleeping FROM pg_stat_activity WHERE pid = $1",
      [pid],
    )
    if (activity[0]?.sleeping) break
    if (Date.now() - activeSince >= 5000) {
      inFlight.catch(() => {})
      client.release(true)
      assert.fail('the sleep query never became active on the server')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  // Terminate backend for that checked-out client from admin connection
  const termination = await admin.query('SELECT pg_terminate_backend($1) AS terminated', [pid])
  assert.equal(termination.rows[0].terminated, true)

  // The FATAL termination error rejects the in-flight query directly; the
  // socket close that follows also fires the client's own 'error' event
  // (a generic, code-less "connection terminated" error), which is what
  // the diagnostic line below comes from.
  await assert.rejects(inFlight)

  // Poll until error listener receives the event
  const expectedCapability = capabilityFor(connection.user)
  const expectedLine = `HUB_POOL_ERROR:${expectedCapability}:\n`

  const start = Date.now()
  while (logs.length === 0 && Date.now() - start < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  // Releasing the broken client must not throw, and must not return it to the pool
  client.release()

  assert.deepEqual(logs, [expectedLine])

  // Assert pool is still usable and process stays alive
  const queryResult = await pool.query('SELECT 1 AS alive')
  assert.equal(queryResult.rows[0].alive, 1)
})

test('checked-out pooled client termination between queries rejects next query cleanly, does not crash the Hub, and the pool recovers', async (t) => {
  const logs = []
  const write = (line) => { logs.push(line) }

  const pool = createPostgresPool(connection, write)
  const admin = new Client(connection)
  await admin.connect()

  t.after(async () => {
    try {
      await pool.end()
    } finally {
      await admin.end()
    }
  })

  // Acquire a client and run an initial query
  const client = await pool.connect()
  const { rows } = await client.query('SELECT pg_backend_pid() AS pid')
  const pid = rows[0].pid

  // Terminate backend for that checked-out client while it is idle between queries
  const termination = await admin.query('SELECT pg_terminate_backend($1) AS terminated', [pid])
  assert.equal(termination.rows[0].terminated, true)

  // Wait for the termination to be delivered to the client
  const expectedCapability = capabilityFor(connection.user)
  const start = Date.now()
  while (logs.length < 2 && Date.now() - start < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  // The client listener logs two lines: the ErrorResponse (57P01) and the socket close
  assert.deepEqual(logs, [
    `HUB_POOL_ERROR:${expectedCapability}:57P01\n`,
    `HUB_POOL_ERROR:${expectedCapability}:\n`,
  ])

  // Subsequent query on the terminated client must reject cleanly
  await assert.rejects(client.query('SELECT 1'))

  // Releasing the broken client must not throw, and must not return it to the pool
  client.release()

  // Pool remains usable: subsequent query on the pool succeeds
  const queryResult = await pool.query('SELECT 1 AS alive')
  assert.equal(queryResult.rows[0].alive, 1)
})
