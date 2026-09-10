import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

import { getConstructionPlans, PgBoss } from 'pg-boss'
import pg from 'pg'

const connectionString = process.env.CONEXUS_R3_MANAGED_DATABASE_URL
const requireScratchDatabase = (value) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('R3_MANAGED_DATABASE_URL_REQUIRED')
  const url = new URL(value)
  if (url.hostname !== '127.0.0.1' || url.port !== '55434' || url.pathname !== '/conexus_r3_managed') {
    throw new Error('R3_MANAGED_SCRATCH_DATABASE_REQUIRED')
  }
  return value
}

const databaseUrl = requireScratchDatabase(connectionString)
const pool = new pg.Pool({ connectionString: databaseUrl, max: 8, application_name: 'conexus-r3-managed-qualification' })
const require = createRequire(import.meta.url)
const pgVersion = require('pg/package.json').version
const pgBossVersion = require('pg-boss/package.json').version
const runtime = Object.freeze({
  schema: 'mar',
  createSchema: false,
  migrate: false,
  schedule: false,
  supervise: false,
  useListenNotify: false,
  retryLimit: 0,
})
const queueName = 'dt1-root-tuple-projection'
const vendorSql = getConstructionPlans(runtime.schema)
const vendorDdlSha256 = createHash('sha256').update(vendorSql).digest('hex')

const occurrence = (key) => ({
  id: randomUUID(),
  logicalOccurrenceKey: key,
  releaseRef: 'release-r3-fixture',
  jobRevisionRef: 'job-r3-fixture',
})

const transactionDb = (client) => ({ executeSql: (text, values = []) => client.query(text, values) })
const insertOwner = async (client, input) => (await client.query(`
  INSERT INTO mar.dt1_owner_job_run (id, logical_occurrence_key, release_ref, job_revision_ref)
  VALUES ($1, $2, $3, $4)
  RETURNING id, logical_occurrence_key, release_ref, job_revision_ref
`, [input.id, input.logicalOccurrenceKey, input.releaseRef, input.jobRevisionRef])).rows[0]
const count = async (table, key) => (await pool.query(`SELECT count(*)::int AS count FROM mar.${table} WHERE logical_occurrence_key = $1`, [key])).rows[0].count
const projectionCount = async (ownerId) => (await pool.query(`
  SELECT count(*)::int AS count FROM mar.job_common
  WHERE name = $1 AND data->>'ownerJobRunId' = $2
`, [queueName, ownerId])).rows[0].count
const withTransaction = async (work) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const value = await work(client)
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

let boss
try {
  const identity = (await pool.query(`SELECT version() AS server_version, current_setting('server_version_num') AS server_version_num`)).rows[0]
  assert.match(identity.server_version, /^PostgreSQL 17\.10 /)
  await pool.query('DROP SCHEMA IF EXISTS mar CASCADE')
  await pool.query('CREATE SCHEMA mar')
  await pool.query(vendorSql)
  await pool.query(`
    CREATE TABLE mar.dt1_owner_job_run (
      id uuid PRIMARY KEY,
      logical_occurrence_key text NOT NULL UNIQUE,
      release_ref text NOT NULL,
      job_revision_ref text NOT NULL
    );
    CREATE TABLE mar.dt1_owner_without_unique (
      id uuid PRIMARY KEY,
      logical_occurrence_key text NOT NULL,
      release_ref text NOT NULL,
      job_revision_ref text NOT NULL
    );
  `)

  boss = new PgBoss({
    connectionString: databaseUrl,
    schema: runtime.schema,
    createSchema: runtime.createSchema,
    migrate: runtime.migrate,
    schedule: runtime.schedule,
    supervise: runtime.supervise,
    useListenNotify: runtime.useListenNotify,
  })
  await boss.start()
  await boss.createQueue(queueName, { retryLimit: runtime.retryLimit })
  const queue = await boss.getQueue(queueName)
  assert.equal(queue.retryLimit, runtime.retryLimit)

  const firstInput = occurrence('root-tuple|atomic|p1')
  const first = await withTransaction(async (client) => {
    const owner = await insertOwner(client, firstInput)
    const queueJobId = await boss.send(queueName, {
      ownerJobRunId: owner.id,
      releaseRef: firstInput.releaseRef,
      jobRevisionRef: firstInput.jobRevisionRef,
    }, { db: transactionDb(client), retryLimit: runtime.retryLimit })
    assert.ok(queueJobId)
    return { owner, queueJobId }
  })
  assert.equal(await count('dt1_owner_job_run', firstInput.logicalOccurrenceKey), 1)
  assert.equal(await projectionCount(first.owner.id), 1)

  const rollbackInput = occurrence('root-tuple|atomic|p2')
  await assert.rejects(
    withTransaction(async (client) => {
      const owner = await insertOwner(client, rollbackInput)
      const queueJobId = await boss.send(queueName, { ownerJobRunId: owner.id }, {
        db: transactionDb(client), retryLimit: runtime.retryLimit,
      })
      assert.ok(queueJobId)
      throw new Error('R3_FORCED_ROLLBACK')
    }),
    /R3_FORCED_ROLLBACK/,
  )
  assert.equal(await count('dt1_owner_job_run', rollbackInput.logicalOccurrenceKey), 0)
  assert.equal(await projectionCount(rollbackInput.id), 0)

  const concurrentKey = 'root-tuple|atomic|p3'
  const concurrent = await Promise.allSettled([
    withTransaction(async (client) => {
      const input = occurrence(concurrentKey)
      const owner = await insertOwner(client, input)
      const queueJobId = await boss.send(queueName, { ownerJobRunId: owner.id }, {
        db: transactionDb(client), retryLimit: runtime.retryLimit,
      })
      assert.ok(queueJobId)
      return owner
    }),
    withTransaction(async (client) => {
      const input = occurrence(concurrentKey)
      const owner = await insertOwner(client, input)
      const queueJobId = await boss.send(queueName, { ownerJobRunId: owner.id }, {
        db: transactionDb(client), retryLimit: runtime.retryLimit,
      })
      assert.ok(queueJobId)
      return owner
    }),
  ])
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(concurrent.filter((result) => result.status === 'rejected').length, 1)
  assert.equal(await count('dt1_owner_job_run', concurrentKey), 1)

  const productJobRunRelation = (await pool.query(`SELECT to_regclass('mar.job_run') AS relation`)).rows[0].relation
  assert.equal(productJobRunRelation, null)
  console.log(JSON.stringify({
    verdict: 'PASS',
    tuple: { node: process.versions.node, pg: pgVersion, pgBoss: pgBossVersion, postgres: identity.server_version, serverVersionNum: identity.server_version_num },
    runtime,
    vendorDdlSha256,
    syntheticFixture: { ownerTable: 'mar.dt1_owner_job_run', queue: queueName, productJobRunRelation, productJobRunRowsObserved: 0 },
    falsifiers: {
      atomicOwnerAndProjection: 'PASS',
      rollbackRemovesBoth: 'PASS',
      concurrentUniqueAdmission: 'PASS',
      noProductJobRun: 'PASS',
      externalCalls: { provider: 0, model: 0, e2b: 0, sankhya: 0, realEffects: 0 },
    },
  }, null, 2))
} finally {
  await boss?.stop({ graceful: false }).catch(() => {})
  await pool.end()
}
