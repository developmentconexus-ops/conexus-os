import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { openHub } from './hub.mjs'
import { DEFAULT_BASE_URL, DEFAULT_MAX_REPAIRS, resolveStatePath, runCase } from './run.mjs'
import { fixtureById, SIM_DEFAULT_PORT } from './sankhya-sim.mjs'
import { createEvalMastra, evalStorage, findTraceIds, scoreRun } from './scorers.mjs'

/** @typedef {Readonly<{ id: string, model: string }>} Arm  id is the file stem; the file admits only "model". */
/** @typedef {Readonly<{ request: string, fixture: string }>} CaseInput  the dataset item's input */
/**
 * The dataset item's groundTruth; figures is the fixture's own answer (SalesFigures for sales-v1).
 * @typedef {Readonly<{ fixture: string, screen: import('./scorers.mjs').ScreenTruth, figures: unknown }>} CaseTruth
 */
/** @typedef {Readonly<{ id: string, input: CaseInput, truth: CaseTruth }>} Case  id is the file stem */
/**
 * @typedef {Readonly<{ builderRunId: string, traceId: string | null, isRepair: boolean, state: string,
 *   failureCategory: string | null, failureCode: string | null }>} RunRecord
 */
/**
 * @typedef {Readonly<{ kind: 'observed', text: string, sourceRevision: string }>
 *   | Readonly<{ kind: 'not-built', reason: 'FINAL_RUN_NOT_BUILT' }>} PreviewResult
 */
/**
 * What the driver submits as `output`. preview is null on a platform error, which is never graded.
 * @typedef {Readonly<{ projectId: string, modelId: string, artifactsDir: string,
 *   runs: readonly RunRecord[], preview: PreviewResult | null, wallTimeToUsablePreviewMs: number | null,
 *   unscored: readonly { scorerId: string, message: string }[] }>} RunOutput
 */
/** @typedef {Readonly<{ kind: 'graded' }> | Readonly<{ kind: 'platform-error', code: string, message: string }>} RunVerdict */
/**
 * @typedef {Readonly<{ experimentId: string, status: string, settled: number, total: number,
 *   pending: readonly { item: string, code: string }[] }>} ExperimentSummary
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ARMS_DIR = join(HERE, 'arms')
const CASES_DIR = join(HERE, 'cases', 'erp')
const DATASET_ID = 'conexus-builder-eval-erp'
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}$/

const usage = [
  'Usage: node scripts/builder-eval/experiment.mjs --comparison <id> [options]',
  '',
  'Runs every arm x trial x case of one comparison as Mastra experiments and prints one JSON line per',
  'experiment. Exits 0 only when every experiment finalized. Rerun the same line to resume.',
  'Reads CONEXUS_EVAL_DATABASE_URL (the Hub database as hub_factory) and the test-operator session',
  '(CONEXUS_STATE or ~/conexus-test-session.sh).',
  '',
  'Options:',
  '  --comparison <id>     Comparison id, lowercase letters, digits and dashes; required',
  '  --arms <a,b>          Arm ids from scripts/builder-eval/arms; default: every arm file',
  '  --trials <n>          Trials per arm; default: 1',
  '  --concurrency <n>     Builder runs at a time; default: 2',
  `  --simulator <origin>  Simulated Sankhya; default: http://127.0.0.1:${SIM_DEFAULT_PORT}`,
  `  --base-url <url>      Hub origin; default: ${DEFAULT_BASE_URL}`,
  `  --out <dir>           Artifacts root; default: ${join(tmpdir(), 'conexus-builder-eval')}`,
  `  --max-repairs <n>     Repair messages after a failed build; default: ${DEFAULT_MAX_REPAIRS}`,
  '  --hub-version <sha>   The running Hub\'s commit, recorded as provenance; default: unknown',
  '  --help                Show this help',
].join('\n')

const fail = (message) => {
  throw new Error(`builder-eval: ${message}`)
}

const readJsonObject = (path, label) => {
  if (!existsSync(path)) fail(`${label} does not exist`)
  let raw
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`)
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail(`${label} must be a JSON object`)
  return raw
}

const refuseUnknownKeys = (raw, allowed, label) => {
  const unknown = Object.keys(raw).find((key) => !allowed.includes(key))
  if (unknown) fail(`${label} has unknown key ${unknown}`)
}

const requireId = (id, what) => {
  if (!ID_PATTERN.test(id)) fail(`${what} ${JSON.stringify(id)} must be lowercase letters, digits and dashes, at most 31`)
}

const jsonStems = (dir) => readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => basename(name, '.json'))

/** @returns {Arm[]} in the order asked; a missing file, a bad id or an unknown key throws */
export function loadArms(dir, ids) {
  return ids.map((id) => {
    requireId(id, 'arm id')
    const label = `arms/${id}.json`
    const raw = readJsonObject(join(dir, `${id}.json`), label)
    refuseUnknownKeys(raw, ['model'], label)
    if (typeof raw.model !== 'string' || !raw.model.trim()) fail(`${label} needs a "model" string`)
    return Object.freeze({ id, model: raw.model })
  })
}

/** @returns {Case[]} every *.json in dir, its truth computed from the fixture, never written by hand */
export function loadCases(dir) {
  return jsonStems(dir).map((id) => {
    requireId(id, 'case id')
    const label = `cases/erp/${id}.json`
    const raw = readJsonObject(join(dir, `${id}.json`), label)
    refuseUnknownKeys(raw, ['fixture', 'request'], label)
    if (typeof raw.request !== 'string' || !raw.request.trim()) fail(`${label} needs a "request" string`)
    if (typeof raw.fixture !== 'string') fail(`${label} needs a "fixture" id`)
    return Object.freeze({ id, input: { request: raw.request.trim(), fixture: raw.fixture }, truth: fixtureById(raw.fixture).truth() })
  })
}

// An unlisted category is the platform's: retried and visible, never charged to the arm.
const FAILURE_OWNER = Object.freeze({
  APPLICATION_BUILD_FAILED: 'arm',
  SOURCE_RESULT_REJECTED: 'arm',
  // Only the Hub's restart recovery settles a run with BUILDER_PREVIEW_NOT_BUILT (factory-runtime.ts).
  PREVIEW_NOT_BUILT: 'platform',
  ENVIRONMENT_PREPARATION_FAILED: 'platform',
  MODEL_CREDENTIAL_REFUSED: 'platform',
  MODEL_RATE_LIMITED: 'platform',
  MODEL_REQUEST_REFUSED: 'platform',
  SOURCE_BASE_MOVED: 'platform',
  RUN_CANCELLED: 'platform',
  RUN_INTERRUPTED: 'platform',
  INTERNAL_ERROR: 'platform',
})

const platformError = (code, message) => ({ kind: 'platform-error', code, message })

/** @returns {RunVerdict} */
function classifyRun(result) {
  if (result.outcome === 'ERROR') return platformError('DRIVER_ERROR', result.error ?? 'run.mjs failed')
  const last = result.runs.at(-1)
  if (!last) return platformError('NO_RUN', 'no Builder run settled')
  if (last.failureCategory && FAILURE_OWNER[last.failureCategory] !== 'arm') {
    return platformError(last.failureCategory, `the last Builder run failed with ${last.failureCode ?? last.failureCategory}`)
  }
  if (result.failure === 'PREVIEW_NOT_FROM_FINAL_RUN') return platformError('PREVIEW_NOT_FROM_FINAL_RUN', "the Preview never showed the final run's revision")
  if (result.failure !== 'FINAL_RUN_NOT_BUILT' && typeof result.previewText !== 'string') return platformError('PREVIEW_UNREADABLE', "the Preview's text could not be read")
  return { kind: 'graded' }
}

/** @returns {PreviewResult} for a graded result only */
const previewOf = (result) => (result.failure === 'FINAL_RUN_NOT_BUILT'
  ? { kind: 'not-built', reason: 'FINAL_RUN_NOT_BUILT' }
  : { kind: 'observed', text: result.previewText, sourceRevision: result.sourceRevisionAfter })

/** @returns {RunOutput} */
const runOutput = (result, artifactsDir, preview, traceIds) => ({
  projectId: result.projectId, modelId: result.modelId, artifactsDir,
  runs: result.runs.map((run, index) => ({
    builderRunId: run.builderRunId, traceId: traceIds[index] ?? null, isRepair: run.isRepair, state: run.state,
    failureCategory: run.failureCategory, failureCode: run.failureCode,
  })),
  preview, wallTimeToUsablePreviewMs: result.wallTimeToUsablePreviewMs, unscored: [],
})

// Each name check doubles as the wait for the data to load before run.mjs captures the text.
const caseFileOf = (item) => ({
  request: item.input.request,
  checks: item.groundTruth.screen.names.map((name) => ({ action: 'expectText', selector: 'body', text: name })),
  reload: false,
})

const listAll = async (fetchPage, key) => {
  const all = []
  for (let page = 0; ; page += 1) {
    const response = await fetchPage(page)
    all.push(...response[key])
    if (!response.pagination.hasMore) return all
  }
}

const resultsOf = async (dataset, experimentId) => new Map((await listAll(
  (page) => dataset.listExperimentResults({ experimentId, page, perPage: 100 }), 'results',
)).map((row) => [row.itemId, row]))

const isSettled = (row) => row !== undefined && row.error === null

async function requireFixtures(origin, cases) {
  let health
  try {
    const response = await fetch(`${origin}/__sim/health`)
    if (!response.ok) throw new Error(`answered ${response.status}`)
    health = await response.json()
  } catch (error) {
    fail(`the simulator at ${origin} is not answering (${error.message}); start it with node scripts/builder-eval/sankhya-sim.mjs`)
  }
  const missing = [...new Set(cases.map((entry) => entry.input.fixture))].filter((fixture) => !health.fixtures?.includes(fixture))
  if (missing.length > 0) fail(`the simulator at ${origin} does not serve ${missing.join(', ')}`)
}

const asJson = (value) => JSON.parse(JSON.stringify(value ?? null))

async function syncDataset(mastra, cases) {
  const dataset = await mastra.datasets.get({ id: DATASET_ID }).catch((error) => {
    if (error?.id !== 'DATASET_NOT_FOUND') throw error
    return mastra.datasets.create({ id: DATASET_ID, name: DATASET_ID, description: 'Builder eval: ERP cases over the simulated Sankhya' })
  })
  const stored = new Map((await listAll((page) => dataset.listItems({ page, perPage: 100 }), 'items')).map((item) => [item.externalId, item]))
  const payloads = cases.map((entry) => ({ externalId: entry.id, input: entry.input, groundTruth: entry.truth, metadata: { caseFile: `cases/erp/${entry.id}.json` } }))
  const absent = payloads.filter((payload) => !stored.has(payload.externalId))
  if (absent.length > 0) await dataset.addItems({ items: absent })
  for (const { externalId, ...content } of payloads) {
    const item = stored.get(externalId)
    if (item && !Object.keys(content).every((key) => isDeepStrictEqual(asJson(item[key]), asJson(content[key])))) {
      await dataset.updateItem({ itemId: item.id, ...content })
    }
  }
  return dataset
}

async function openExperiment(dataset, { comparisonId, arm, trial, version, baseUrl, hubVersion }) {
  const id = `be:${comparisonId}:${arm.id}:t${trial}`
  await dataset.createExperiment({
    id, name: `${comparisonId} · ${arm.id} · t${trial}`, version, metadata: { arm },
    provenance: { source: 'conexus-builder-eval', sourceId: baseUrl, sourceVersion: hubVersion ?? 'unknown' },
    grouping: { experimentSetId: 'builder-eval', comparisonId, variantId: arm.id, trialIndex: trial },
  })
  const stored = await dataset.getExperiment({ experimentId: id })
  const storedModel = stored.metadata?.arm?.model
  if (storedModel !== arm.model) fail(`${id} ran with model ${storedModel}; arms/${arm.id}.json now says ${arm.model}. Start a new --comparison.`)
  return { id, arm, trial, status: stored.status, rows: await resultsOf(dataset, id) }
}

const hhmmss = () => new Date().toISOString().slice(11, 19).replaceAll(':', '')

// Never throws: a failure becomes an error row that the next invocation retries.
async function runJob({ experiment, item }, { mastra, hub, runCase, binding, dataset, options, log }) {
  const label = `${experiment.id} ${item.externalId}`
  const startedAt = new Date()
  const submit = (fields) => dataset.submitExperimentResult({ experimentId: experiment.id, itemId: item.id, startedAt, completedAt: new Date(), ...fields })
  try {
    const out = join(options.outRoot, options.comparisonId, experiment.id, item.externalId)
    mkdirSync(out, { recursive: true })
    const { projectId } = await hub.createProject({ name: `eval-${options.comparisonId}-${experiment.arm.id}-t${experiment.trial}-${item.externalId}-${hhmmss()}` })
    await binding.bindProject(projectId)
    const casePath = join(out, 'case.json')
    writeFileSync(casePath, `${JSON.stringify(caseFileOf(item), null, 2)}\n`, 'utf8')
    log(`${label}: running on Project ${projectId}, artifacts in ${out}`)
    const result = await runCase({
      case: casePath, out, project: projectId, model: experiment.arm.model, statePath: options.statePath,
      baseUrl: options.baseUrl, maxRepairs: options.maxRepairs, gradeOnly: false, headed: false,
    })
    const verdict = classifyRun(result)
    if (verdict.kind === 'platform-error') {
      await submit({ output: runOutput(result, out, null, []), error: { code: verdict.code, message: verdict.message } })
      log(`${label}: ${verdict.code}, left open for the next invocation`)
      return
    }
    const traceIds = await findTraceIds(mastra, { projectId, builderRunIds: result.runs.map((run) => run.builderRunId) })
    const output = runOutput(result, out, previewOf(result), traceIds)
    const { scores, unscored } = await scoreRun(mastra, { output, groundTruth: item.groundTruth })
    await submit({ output: { ...output, unscored }, traceId: traceIds[0] ?? undefined, scores })
    log(`${label}: graded, app-correct ${scores.find((score) => score.scorerId === 'app-correct')?.score ?? 'unscored'}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`${label}: DRIVER_ERROR ${message}`)
    await submit({ error: { code: 'DRIVER_ERROR', message } }).catch((submitError) => log(`${label}: result not recorded: ${submitError.message}`))
  }
}

async function forEachConcurrently(items, concurrency, work) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await work(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

/** @returns {Promise<ExperimentSummary>} */
async function closeExperiment(dataset, experiment, items) {
  const rows = await resultsOf(dataset, experiment.id)
  const pending = items.filter((item) => !isSettled(rows.get(item.id)))
    .map((item) => ({ item: item.externalId, code: rows.get(item.id)?.error?.code ?? 'NO_RESULT' }))
  const status = pending.length === 0 && experiment.status !== 'completed'
    ? (await dataset.finalizeExperiment({ experimentId: experiment.id })).status
    : experiment.status
  return { experimentId: experiment.id, status, settled: items.length - pending.length, total: items.length, pending }
}

/**
 * The whole invocation. Never throws for one job; throws for a broken preflight or a changed arm,
 * before any Builder run starts.
 * @param {{ mastra: import('@mastra/core').Mastra, hub: import('./hub.mjs').Hub, runCase: typeof runCase,
 *   simulatorOrigin: string, log?: (line: string) => void }} deps
 * @param {{ comparisonId: string, arms: readonly Arm[], cases: readonly Case[], trials: number, concurrency: number,
 *   outRoot: string, statePath: string, baseUrl: string, maxRepairs: number, hubVersion?: string }} options
 * @returns {Promise<ExperimentSummary[]>}
 */
export async function runExperiment(deps, options) {
  const { mastra, hub, simulatorOrigin, log = (line) => process.stderr.write(`${line}\n`) } = deps
  const { comparisonId, arms, cases, trials } = options

  const usable = await hub.usableModelIds()
  for (const arm of arms) {
    if (!usable.includes(arm.model)) fail(`arm ${arm.id} model ${arm.model} is not usable; available: ${usable.join(', ') || 'none'}`)
  }
  await requireFixtures(simulatorOrigin, cases)
  const binding = await hub.openSimulatorBinding()

  const dataset = await syncDataset(mastra, cases)
  // Every arm of a comparison is scored over the dataset version its first experiment pinned.
  const version = (await dataset.listExperiments({ comparisonId, page: 0, perPage: 1 })).experiments[0]?.datasetVersion
    ?? (await dataset.getDetails()).version
  // Storage lists items in no stable order; case order makes every invocation plan the same jobs.
  const items = (await listAll((page) => dataset.listItems({ version, page, perPage: 100 }), 'items'))
    .sort((a, b) => (a.externalId < b.externalId ? -1 : 1))

  const experiments = []
  for (let trial = 0; trial < trials; trial += 1) {
    for (const arm of arms) experiments.push(await openExperiment(dataset, { comparisonId, arm, trial, version, baseUrl: options.baseUrl, hubVersion: options.hubVersion }))
  }
  // Trial, then item, then arm: one trial's arms run side by side under the same load.
  const jobs = []
  for (let trial = 0; trial < trials; trial += 1) {
    const ofTrial = experiments.filter((experiment) => experiment.trial === trial && experiment.status !== 'completed')
    for (const item of items) {
      for (const experiment of ofTrial) if (!isSettled(experiment.rows.get(item.id))) jobs.push({ experiment, item })
    }
  }
  const context = { mastra, hub, runCase: deps.runCase, binding, dataset, options, log }
  await forEachConcurrently(jobs, options.concurrency, (job) => runJob(job, context))

  const summary = []
  for (const experiment of experiments) summary.push(await closeExperiment(dataset, experiment, items))
  return summary
}

const valueFor = (argv, index, flag) => {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) fail(`${flag} requires a value`)
  return value
}

const integerFor = (argv, index, flag, min) => {
  const value = valueFor(argv, index, flag)
  if (!/^\d+$/.test(value) || Number(value) < min) fail(`${flag} must be an integer of at least ${min}`)
  return Number(value)
}

function parseArgs(argv) {
  const options = {
    comparison: undefined, arms: undefined, trials: 1, concurrency: 2, simulator: `http://127.0.0.1:${SIM_DEFAULT_PORT}`,
    baseUrl: DEFAULT_BASE_URL, out: join(tmpdir(), 'conexus-builder-eval'), maxRepairs: DEFAULT_MAX_REPAIRS, hubVersion: undefined, help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    switch (flag) {
      case '--comparison': options.comparison = valueFor(argv, index++, flag); break
      case '--arms': options.arms = valueFor(argv, index++, flag).split(',').filter(Boolean); break
      case '--trials': options.trials = integerFor(argv, index++, flag, 1); break
      case '--concurrency': options.concurrency = integerFor(argv, index++, flag, 1); break
      case '--simulator': options.simulator = valueFor(argv, index++, flag); break
      case '--base-url': options.baseUrl = valueFor(argv, index++, flag); break
      case '--out': options.out = valueFor(argv, index++, flag); break
      case '--max-repairs': options.maxRepairs = integerFor(argv, index++, flag, 0); break
      case '--hub-version': options.hubVersion = valueFor(argv, index++, flag); break
      case '--help': options.help = true; break
      default: fail(`unknown option ${flag}`)
    }
  }
  if (options.help) return options
  if (!options.comparison) fail('--comparison <id> is required')
  requireId(options.comparison, '--comparison')
  return options
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(`${usage}\n`)
    return 0
  }
  const databaseUrl = process.env.CONEXUS_EVAL_DATABASE_URL
  if (!databaseUrl) fail('CONEXUS_EVAL_DATABASE_URL is not set; set it to the Hub database URL as hub_factory (docs/development/builder-eval.md shows how)')
  const arms = loadArms(ARMS_DIR, options.arms ?? jsonStems(ARMS_DIR))
  const cases = loadCases(CASES_DIR)
  const statePath = resolveStatePath()
  const storage = evalStorage(databaseUrl)
  const hub = await openHub({ baseUrl: options.baseUrl, statePath })
  try {
    const summary = await runExperiment(
      { mastra: createEvalMastra({ storage }), hub, runCase, simulatorOrigin: options.simulator },
      {
        comparisonId: options.comparison, arms, cases, trials: options.trials, concurrency: options.concurrency,
        outRoot: resolve(options.out), statePath, baseUrl: options.baseUrl, maxRepairs: options.maxRepairs, hubVersion: options.hubVersion,
      },
    )
    for (const line of summary) process.stdout.write(`${JSON.stringify(line)}\n`)
    return summary.every((line) => line.status === 'completed') ? 0 : 1
  } finally {
    await hub.close()
    await storage.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
