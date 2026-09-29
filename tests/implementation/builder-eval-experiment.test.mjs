import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { InMemoryStore } from '@mastra/core/storage'
import { loadArms } from '../../scripts/builder-eval/experiment.mjs'
import { ARMS, CASES, experimentHarness, SALES_PREVIEW_TEXT } from './builder-eval-fixtures.mjs'

const completed = (experimentId) => ({ experimentId, status: 'completed', settled: 1, total: 1, pending: [] })

const resultsOf = async (mastra, experimentId) => {
  const dataset = await mastra.datasets.get({ id: 'conexus-builder-eval-erp' })
  return (await dataset.listExperimentResults({ experimentId })).results
}

const scoresOf = async (mastra, experimentId) => {
  const { scores } = await (await mastra.getStorage().getStore('scores')).listScoresByRunId({ runId: experimentId, pagination: { page: 0, perPage: 50 } })
  return Object.fromEntries(scores.map(({ scorerId, score }) => [scorerId, score]))
}

test('loadArms reads each arm file in the order asked and refuses a key it does not know', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'builder-eval-arms-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'flash.json'), '{ "model": "m-flash" }')
  writeFileSync(join(dir, 'luna.json'), '{ "model": "m-luna" }')

  assert.deepEqual(loadArms(dir, ['luna', 'flash']), [{ id: 'luna', model: 'm-luna' }, { id: 'flash', model: 'm-flash' }])

  writeFileSync(join(dir, 'luna.json'), '{ "modle": "m-luna" }')
  assert.throws(() => loadArms(dir, ['flash', 'luna']), { message: 'builder-eval: arms/luna.json has unknown key modle' })
})

test('an arm may name the prompt variant its runs use beside the model', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'builder-eval-arms-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'luna-v1.json'), '{ "model": "m-luna", "promptVariant": "v1" }')
  writeFileSync(join(dir, 'luna-blank.json'), '{ "model": "m-luna", "promptVariant": " " }')

  assert.deepEqual(loadArms(dir, ['luna-v1']), [{ id: 'luna-v1', model: 'm-luna', promptVariant: 'v1' }])
  assert.throws(() => loadArms(dir, ['luna-blank']), { message: 'builder-eval: arms/luna-blank.json "promptVariant" must be a non-empty string' })
})

test('two arms, one trial: each experiment runs its case once, is graded and finalizes', async (t) => {
  const { mastra, hub, driver, run } = await experimentHarness(t, new InMemoryStore())

  const summary = await run()

  assert.deepEqual(summary, [completed('be:c1:flash:t0'), completed('be:c1:luna:t0')])
  const dataset = await mastra.datasets.get({ id: 'conexus-builder-eval-erp' })
  const { experiments } = await dataset.listExperiments({ comparisonId: 'c1' })
  assert.deepEqual(experiments.map((experiment) => [experiment.id, experiment.status, experiment.variantId, experiment.trialIndex]).sort(), [
    ['be:c1:flash:t0', 'completed', 'flash', 0],
    ['be:c1:luna:t0', 'completed', 'luna', 0],
  ])
  assert.deepEqual((await resultsOf(mastra, 'be:c1:flash:t0')).map((row) => [row.error, row.traceId]), [[null, 'trace-p-1']])
  assert.deepEqual((await resultsOf(mastra, 'be:c1:luna:t0')).map((row) => [row.error, row.traceId]), [[null, 'trace-p-2']])
  const flashScores = await scoresOf(mastra, 'be:c1:flash:t0')
  assert.deepEqual([flashScores['app-correct'], flashScores['tool-calls'], flashScores['sim-refusals']], [1, 10, 1])
  assert.deepEqual(hub.created.map(({ projectId }) => projectId), ['p-1', 'p-2'])
  assert.deepEqual(hub.bound, ['p-1', 'p-2'])
  assert.match(hub.created[0].name, /^eval-c1-flash-t0-sales-dashboard-\d{6}$/)
  assert.deepEqual(driver.calls[0].case, {
    request: 'Quero um painel de vendas com os dados do nosso Sankhya.',
    checks: [{ action: 'expectText', selector: 'body', text: 'ANA' }, { action: 'expectText', selector: 'body', text: 'BRUNO' }],
    reload: false,
  })
})

test('a refusal case runs on a Project with no binding and is graded on the unchanged source and the final reply', async (t) => {
  const refusal = { id: 'sankhya-not-connected', input: { request: 'Mostre o pedido de compra 40118 com os dados do Sankhya.' }, truth: { missingSystem: 'Sankhya' } }
  const { mastra, hub, driver, run } = await experimentHarness(t, new InMemoryStore(), {
    replies: { 'sankhya-not-connected': 'Não há uma Conexão com o Sankhya neste Projeto. Vincule uma Conexão em Integrações.' },
  })

  const summary = await run({ arms: [ARMS[0]], cases: [CASES[0], refusal], concurrency: 1 })

  assert.deepEqual(summary, [{ ...completed('be:c1:flash:t0'), settled: 2, total: 2 }])
  assert.deepEqual(hub.created.map(({ projectId, name }) => [projectId, name.split('-').slice(4, -1).join('-')]), [['p-1', 'sales-dashboard'], ['p-2', 'sankhya-not-connected']])
  assert.deepEqual(hub.bound, ['p-1'])
  assert.deepEqual(driver.calls[1].case, { request: 'Mostre o pedido de compra 40118 com os dados do Sankhya.', checks: [], reload: false })
  const rows = await resultsOf(mastra, 'be:c1:flash:t0')
  assert.deepEqual(rows.map((row) => [row.error, row.output.preview]).sort((a, b) => a[1].kind.localeCompare(b[1].kind)), [
    [null, { kind: 'not-built', reason: 'NO_SOURCE_CHANGE' }],
    [null, { kind: 'observed', text: SALES_PREVIEW_TEXT, sourceRevision: 'rev-1' }],
  ])
  const { scores } = await (await mastra.getStorage().getStore('scores')).listScoresByRunId({ runId: 'be:c1:flash:t0', pagination: { page: 0, perPage: 50 } })
  assert.deepEqual(scores.filter((score) => score.scorerId === 'app-correct').map((score) => score.score), [1, 1])
})

test('an arm that breaks its own build is graded 0; a platform failure stays open until a rerun settles it', async (t) => {
  const { mastra, driver, run } = await experimentHarness(t, new InMemoryStore(), {
    failures: { 'm-flash': ['APPLICATION_BUILD_FAILED'], 'm-luna': ['MODEL_RATE_LIMITED'] },
  })

  const first = await run()

  assert.deepEqual(first, [
    completed('be:c1:flash:t0'),
    { experimentId: 'be:c1:luna:t0', status: 'running', settled: 0, total: 1, pending: [{ item: 'sales-dashboard', code: 'MODEL_RATE_LIMITED' }] },
  ])
  assert.deepEqual((await resultsOf(mastra, 'be:c1:flash:t0')).map((row) => [row.error, row.output.preview]), [[null, { kind: 'not-built', reason: 'FINAL_RUN_NOT_BUILT' }]])
  const flashScores = await scoresOf(mastra, 'be:c1:flash:t0')
  assert.deepEqual([flashScores['app-correct'], flashScores['tool-calls']], [0, 10])
  assert.deepEqual((await resultsOf(mastra, 'be:c1:luna:t0')).map((row) => row.error), [
    { code: 'MODEL_RATE_LIMITED', message: 'the last Builder run failed with BUILDER_MODEL_RATE_LIMITED' },
  ])
  assert.deepEqual(await scoresOf(mastra, 'be:c1:luna:t0'), {})

  const second = await run()

  assert.deepEqual(second, [completed('be:c1:flash:t0'), completed('be:c1:luna:t0')])
  assert.deepEqual(driver.calls.map((call) => call.experimentId), ['be:c1:flash:t0', 'be:c1:luna:t0', 'be:c1:luna:t0'])
  assert.deepEqual((await resultsOf(mastra, 'be:c1:luna:t0')).map((row) => [row.error, row.traceId]), [[null, 'trace-p-3']])
  assert.equal((await scoresOf(mastra, 'be:c1:luna:t0'))['app-correct'], 1)

  const third = await run()

  assert.deepEqual(third, [completed('be:c1:flash:t0'), completed('be:c1:luna:t0')])
  assert.equal(driver.calls.length, 3)
  assert.equal((await (await mastra.datasets.get({ id: 'conexus-builder-eval-erp' })).getDetails()).version, 1)
})

test('a rerun runs only the items that still lack a non-error result', async (t) => {
  const { driver, run } = await experimentHarness(t, new InMemoryStore(), { failures: { 'm-luna': ['MODEL_RATE_LIMITED'] } })
  const cases = [CASES[0], { ...CASES[0], id: 'sales-by-seller' }]

  const first = await run({ arms: [ARMS[1]], cases, concurrency: 1 })
  const second = await run({ arms: [ARMS[1]], cases, concurrency: 1 })

  assert.deepEqual(first, [{ experimentId: 'be:c1:luna:t0', status: 'running', settled: 1, total: 2, pending: [{ item: 'sales-by-seller', code: 'MODEL_RATE_LIMITED' }] }])
  assert.deepEqual(second, [{ experimentId: 'be:c1:luna:t0', status: 'completed', settled: 2, total: 2, pending: [] }])
  assert.deepEqual(driver.calls.map((call) => call.item), ['sales-by-seller', 'sales-dashboard', 'sales-by-seller'])
})

test('a comparison keeps the dataset version it started on after a case changes; a new comparison takes the new one', async (t) => {
  const { mastra, driver, run } = await experimentHarness(t, new InMemoryStore(), { failures: { 'm-luna': ['MODEL_RATE_LIMITED'] } })
  await run()
  const changed = [{ ...CASES[0], input: { ...CASES[0].input, request: 'Quero o painel de vendas por vendedor.' } }]

  await run({ cases: changed })
  await run({ comparisonId: 'c2', arms: [ARMS[0]], cases: changed })

  assert.deepEqual(driver.calls.map((call) => [call.experimentId, call.case.request]), [
    ['be:c1:flash:t0', 'Quero um painel de vendas com os dados do nosso Sankhya.'],
    ['be:c1:luna:t0', 'Quero um painel de vendas com os dados do nosso Sankhya.'],
    ['be:c1:luna:t0', 'Quero um painel de vendas com os dados do nosso Sankhya.'],
    ['be:c2:flash:t0', 'Quero o painel de vendas por vendedor.'],
  ])
  const { experiments } = await (await mastra.datasets.get({ id: 'conexus-builder-eval-erp' })).listExperiments({ perPage: 10 })
  assert.deepEqual(experiments.map((experiment) => [experiment.id, experiment.datasetVersion]).sort(), [
    ['be:c1:flash:t0', 1], ['be:c1:luna:t0', 1], ['be:c2:flash:t0', 2],
  ])
})

test('a case removed from cases/erp leaves the dataset, so a new comparison never runs it again', async (t) => {
  const { mastra, driver, run } = await experimentHarness(t, new InMemoryStore())
  const cases = [CASES[0], { ...CASES[0], id: 'sales-by-seller' }]

  await run({ arms: [ARMS[0]], cases, concurrency: 1 })
  await run({ comparisonId: 'c2', arms: [ARMS[0]], cases: [CASES[0]], concurrency: 1 })

  assert.deepEqual(driver.calls.map((call) => [call.experimentId, call.item]), [
    ['be:c1:flash:t0', 'sales-by-seller'], ['be:c1:flash:t0', 'sales-dashboard'],
    ['be:c2:flash:t0', 'sales-dashboard'],
  ])
  const dataset = await mastra.datasets.get({ id: 'conexus-builder-eval-erp' })
  const current = await dataset.listItems({ page: 0, perPage: 10 })
  assert.deepEqual(current.items.map((item) => item.externalId).sort(), ['sales-dashboard'])
  // Prior history still has the retired item: past experiment results stay readable.
  const v1 = await dataset.listItems({ version: 1, page: 0, perPage: 10 })
  assert.deepEqual(v1.items.map((item) => item.externalId).sort(), ['sales-by-seller', 'sales-dashboard'])
})

test('a comparison refuses to continue after an arm changed its model', async (t) => {
  const { driver, simulator, run } = await experimentHarness(t, new InMemoryStore())
  await run()

  await assert.rejects(run({ arms: [ARMS[0], { id: 'luna', model: 'm-other' }] }), {
    message: 'builder-eval: be:c1:luna:t0 ran with a different setup '
      + `({"baseUrl":"https://hub.test","hubVersion":"unknown","simulatorOrigin":"${simulator.origin}","maxRepairs":2,"model":"m-luna"}); `
      + `this run wants {"baseUrl":"https://hub.test","hubVersion":"unknown","simulatorOrigin":"${simulator.origin}","maxRepairs":2,"model":"m-other"}. `
      + 'Start a new --comparison.',
  })
  assert.equal(driver.calls.length, 2)
})

test('a comparison refuses to resume after a non-arm setup value changed mid-run, so results are never mixed', async (t) => {
  const { mastra, driver, run } = await experimentHarness(t, new InMemoryStore(), { failures: { 'm-luna': ['MODEL_RATE_LIMITED'] } })
  const cases = [CASES[0], { ...CASES[0], id: 'sales-by-seller' }]

  const first = await run({ arms: [ARMS[1]], cases, concurrency: 1, hubVersion: 'sha-1' })
  assert.equal(first[0].status, 'running')

  await assert.rejects(run({ arms: [ARMS[1]], cases, concurrency: 1, hubVersion: 'sha-2' }), {
    message: /^builder-eval: be:c1:luna:t0 ran with a different setup/,
  })

  assert.equal(driver.calls.length, 2)
  const rows = (await resultsOf(mastra, 'be:c1:luna:t0'))
  assert.deepEqual(rows.map((row) => row.error?.code ?? null).sort(), ['MODEL_RATE_LIMITED', null])
})

test('two arms, two trials run trial by trial, two Builder runs at a time', async (t) => {
  const { driver, run } = await experimentHarness(t, new InMemoryStore())

  const summary = await run({ trials: 2 })

  assert.deepEqual(driver.calls.map((call) => call.experimentId), ['be:c1:flash:t0', 'be:c1:luna:t0', 'be:c1:flash:t1', 'be:c1:luna:t1'])
  assert.equal(driver.maxInFlight(), 2)
  assert.deepEqual(summary, ['be:c1:flash:t0', 'be:c1:luna:t0', 'be:c1:flash:t1', 'be:c1:luna:t1'].map(completed))
})

test('the preflight refuses an unusable model or a fixture the simulator lacks before writing anything', async (t) => {
  const { mastra, driver, simulator, run } = await experimentHarness(t, new InMemoryStore())

  await assert.rejects(run({ arms: [{ id: 'luna', model: 'm-gone' }] }), {
    message: 'builder-eval: arm luna model m-gone is not usable; available: m-flash, m-luna, m-other',
  })
  await assert.rejects(run({ cases: [{ ...CASES[0], input: { ...CASES[0].input, fixture: 'stock-v1' } }] }), {
    message: `builder-eval: the simulator at ${simulator.origin} does not serve stock-v1`,
  })
  await assert.rejects(mastra.datasets.get({ id: 'conexus-builder-eval-erp' }), { id: 'DATASET_NOT_FOUND' })
  assert.equal(driver.calls.length, 0)
})
