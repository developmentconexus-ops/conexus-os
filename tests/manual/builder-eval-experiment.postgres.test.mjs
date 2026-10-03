import assert from 'node:assert/strict'
import test from 'node:test'
import { PostgresStore } from '@mastra/pg'
import { createEvalMastra, evalStorage } from '../../scripts/builder-eval/scorers.mjs'
import { experimentHarness } from './builder-eval-fixtures.mjs'
import { createEmptyDatabase, query } from '../implementation/hub-database.mjs'

const completed = (experimentId) => ({ experimentId, status: 'completed', settled: 1, total: 1, pending: [] })

const factoryTableCount = async (connectionString) =>
  Number((await query(connectionString, "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'factory'")).rows[0].n)

test('the eval storage creates nothing in a database without the Hub\'s Mastra tables', async (t) => {
  const fixture = await createEmptyDatabase(t, 'conexus_builder_eval')
  const storage = evalStorage(fixture.connectionString)
  fixture.onCleanup(() => storage.close())

  await assert.rejects(createEvalMastra({ storage }).datasets.list({ page: 0, perPage: 1 }))
  assert.equal(await factoryTableCount(fixture.connectionString), 0)
})

test('over the Hub\'s Postgres Mastra tables a comparison syncs, keeps a platform failure open, resumes and finalizes', async (t) => {
  const fixture = await createEmptyDatabase(t, 'conexus_builder_eval')
  const hubStore = new PostgresStore({ id: 'conexus-factory', connectionString: fixture.connectionString, schemaName: 'factory' })
  await hubStore.init()
  await hubStore.close()
  const tables = await factoryTableCount(fixture.connectionString)
  const storage = evalStorage(fixture.connectionString)
  fixture.onCleanup(() => storage.close())
  const { mastra, driver, run } = await experimentHarness(t, storage, { failures: { 'm-luna': ['MODEL_RATE_LIMITED'] } })

  const first = await run()
  const second = await run()
  const third = await run()

  assert.deepEqual(first, [
    completed('be:c1:flash:t0'),
    { experimentId: 'be:c1:luna:t0', status: 'running', settled: 0, total: 1, pending: [{ item: 'sales-dashboard', code: 'MODEL_RATE_LIMITED' }] },
  ])
  assert.deepEqual(second, [completed('be:c1:flash:t0'), completed('be:c1:luna:t0')])
  assert.deepEqual(third, [completed('be:c1:flash:t0'), completed('be:c1:luna:t0')])
  assert.deepEqual(driver.calls.map((call) => call.experimentId), ['be:c1:flash:t0', 'be:c1:luna:t0', 'be:c1:luna:t0'])
  const dataset = await mastra.datasets.get({ id: 'conexus-builder-eval-erp' })
  assert.equal((await dataset.getDetails()).version, 1)
  const { results } = await dataset.listExperimentResults({ experimentId: 'be:c1:luna:t0' })
  assert.deepEqual(results.map((row) => [row.attempt, row.error, row.traceId]), [[0, null, 'trace-p-3']])
  const { scores } = await (await storage.getStore('scores')).listScoresByRunId({ runId: 'be:c1:luna:t0', pagination: { page: 0, perPage: 50 } })
  assert.deepEqual(Object.fromEntries(scores.map(({ scorerId, score }) => [scorerId, score]))['app-correct'], 1)
  assert.equal(await factoryTableCount(fixture.connectionString), tables)
})
