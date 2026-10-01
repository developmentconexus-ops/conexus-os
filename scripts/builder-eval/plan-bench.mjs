// The frozen measurement of the interview and plan of a new app: for each case, N fresh Projects,
// each run up to the plan card (`run.mjs --stop-at-plan`) and scored by plan-score.mjs. Prints one
// line per run and, last, the median per case and the overall score (the mean of the case medians).
//
// Usage: node scripts/builder-eval/plan-bench.mjs --set train|heldout|<case.json,...> --n 2 --out <dir>
// Needs CONEXUS_STATE (storage state for the Hub), the workspace id (--workspace or CONEXUS_WORKSPACE_ID), the ERP
// Connection id for the cases that read it (--erp-connection or CONEXUS_ERP_CONNECTION_ID) and a signed-in Chromium on CDP, which creates the
// Projects through the Hub API and binds the ERP Conexão to the cases that read it.
import { chromium } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rejectionOf, scoreRunDir } from './plan-score.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ERP_NAME = 'erp'

/** The case sets; `erp` says whether the Project gets the ERP Conexão bound before the request. */
export const SETS = Object.freeze({
  train: [{ file: 'cases/bakeoff/h1.json', erp: true }, { file: 'cases/b/b1-new-app.json', erp: false }],
  heldout: [{ file: 'cases/bakeoff/h2.json', erp: true }, { file: 'cases/bakeoff/h3.json', erp: true }],
})

const DEFAULTS = Object.freeze({
  n: 2,
  model: 'anthropic/claude-opus-5-5',
  baseUrl: 'https://hub.conexus.localhost:4443',
  cdp: 'http://127.0.0.1:9334',
})

export const median = (values) => {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3))
}

/** Pure. The per-case medians and spreads of the scored lines, and the overall score. */
export function summarize(lines) {
  const byCase = Map.groupBy(lines, (line) => line.case)
  const cases = [...byCase].map(([name, runs]) => {
    const scored = runs.filter((run) => typeof run.primary === 'number')
    const primaries = scored.map((run) => run.primary)
    return {
      case: name,
      runs: runs.length,
      scored: scored.length,
      primary: median(primaries),
      primaryStrict: median(scored.map((run) => run.primaryStrict).filter((value) => typeof value === 'number')),
      spread: primaries.length ? Number((Math.max(...primaries) - Math.min(...primaries)).toFixed(3)) : null,
      rubricPassed: median(scored.map((run) => run.rubricPassed)),
      assumedWithoutAsking: median(scored.map((run) => run.assumedWithoutAsking)),
      contrary: median(scored.map((run) => run.contrary)),
      questions: median(scored.map((run) => run.questions)),
      cards: median(scored.map((run) => run.cards)),
      appFilesBeforePlan: Math.max(0, ...scored.map((run) => run.appFilesBeforePlan ?? 0)),
    }
  })
  const medians = cases.map((entry) => entry.primary).filter((value) => value !== null)
  return { overall: medians.length ? Number((medians.reduce((sum, value) => sum + value, 0) / medians.length).toFixed(3)) : null, cases }
}

async function hubPage(options) {
  const browser = await chromium.connectOverCDP(options.cdp)
  const context = browser.contexts()[0]
  const page = context.pages().find((open) => open.url().startsWith(options.baseUrl)) ?? await context.newPage()
  if (!page.url().startsWith(options.baseUrl)) await page.goto(`${options.baseUrl}/`)
  return { browser, page }
}

/** Creates a Project through the Hub API, the signed-in browser's own session, and binds the ERP when asked. */
const createProject = (page, { workspace, name, erp }) => page.evaluate(async ({ workspace, name, erp }) => {
  const csrf = decodeURIComponent(document.cookie.split('; ').find((entry) => entry.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=') ?? '')
  const headers = { 'content-type': 'application/json', 'x-conexus-csrf': csrf }
  const created = await fetch(`/api/control/workspaces/${workspace}/projects`, { method: 'POST', credentials: 'same-origin', headers: { ...headers, 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ name, sourceBootstrap: { mode: 'NEW' } }) })
  const body = await created.json().catch(() => ({}))
  const projectId = body.projectId ?? body.project?.projectId ?? body.id ?? null
  if (!created.ok || !projectId) return { projectId: null, error: `project create ${created.status}` }
  if (!erp) return { projectId, error: null }
  const bound = await fetch(`/api/control/projects/${projectId}/connection-bindings`, { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(erp) })
  return { projectId, error: bound.ok ? null : `erp binding ${bound.status}` }
}, { workspace, name, erp })

function parseArgs(argv) {
  const options = { ...DEFAULTS, set: undefined, out: undefined, workspace: process.env.CONEXUS_WORKSPACE_ID, erpConnection: process.env.CONEXUS_ERP_CONNECTION_ID }
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]]
    if (value === undefined) throw new Error(`plan-bench: ${flag} needs a value`)
    const key = { '--set': 'set', '--n': 'n', '--out': 'out', '--model': 'model', '--base-url': 'baseUrl', '--cdp': 'cdp', '--workspace': 'workspace', '--erp-connection': 'erpConnection' }[flag]
    if (!key) throw new Error(`plan-bench: unknown option ${flag}`)
    options[key] = key === 'n' ? Number(value) : value
  }
  if (!options.workspace) throw new Error('plan-bench: the workspace id is required (--workspace or CONEXUS_WORKSPACE_ID)')
  if (!options.set || !options.out) throw new Error('plan-bench: --set and --out are required')
  if (!Number.isInteger(options.n) || options.n < 1) throw new Error('plan-bench: --n must be a positive integer')
  if (!process.env.CONEXUS_STATE) throw new Error('plan-bench: CONEXUS_STATE must name the storage state for the Hub')
  return options
}

const casesOf = (set) => SETS[set] ?? set.split(',').map((file) => ({ file, erp: /bakeoff\/h\d/.test(file) }))

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const out = resolve(options.out)
  mkdirSync(out, { recursive: true })
  const log = join(out, 'bench.jsonl')
  const lines = []
  // The CDP browser is the operator's own signed-in Chromium: the bench only borrows a tab and never closes it.
  const cases = casesOf(options.set)
  if (cases.some((entry) => entry.erp) && !options.erpConnection) throw new Error('plan-bench: the ERP Connection id is required (--erp-connection or CONEXUS_ERP_CONNECTION_ID)')
  const { page } = await hubPage(options)
  {
    for (const entry of cases) {
      const casePath = resolve(HERE, entry.file)
      const caseId = entry.file.replace(/^cases\//, '').replace(/\.json$/, '').replaceAll('/', '-')
      const name = JSON.parse(readFileSync(casePath, 'utf8')).person.projectName
      for (let repetition = 1; repetition <= options.n; repetition += 1) {
        const dir = join(out, `${caseId}-${repetition}`)
        const resultFile = join(dir, 'result.json')
        const reusable = existsSync(join(dir, 'plan-score.json')) && existsSync(resultFile) && rejectionOf(JSON.parse(readFileSync(resultFile, 'utf8'))) === null
        if (reusable) {
          lines.push({ case: casePath, ...JSON.parse(readFileSync(join(dir, 'plan-score.json'), 'utf8')) })
          continue
        }
        const project = await createProject(page, { workspace: options.workspace, name, erp: entry.erp ? { connectionId: options.erpConnection, name: ERP_NAME } : null })
        if (project.error) throw new Error(`plan-bench: ${caseId} #${repetition}: ${project.error}`)
        const started = Date.now()
        const run = spawnSync(process.execPath, [join(HERE, 'run.mjs'), '--case', casePath, '--project', project.projectId, '--stop-at-plan', '--model', options.model,
          '--base-url', options.baseUrl, '--repetition', String(repetition), '--mask-values', '--out', dir], { stdio: ['ignore', 'ignore', 'inherit'], env: process.env })
        const rejected = existsSync(resultFile) ? rejectionOf(JSON.parse(readFileSync(resultFile, 'utf8'))) : 'the run wrote no result.json'
        const scored = rejected ? { case: casePath, rejected } : await scoreRunDir(dir, { casePath })
        const line = { ...scored, repetition, projectId: project.projectId, wallMs: Date.now() - started, runExit: run.status }
        lines.push(line)
        appendFileSync(log, `${JSON.stringify(line)}\n`)
        process.stdout.write(`${JSON.stringify({ case: caseId, repetition, primary: line.primary, primaryStrict: line.primaryStrict, discovered: line.discovered, discoveredStrict: line.discoveredStrict, total: line.total, questions: line.questions, cards: line.cards, rubricPassed: line.rubricPassed, assumedWithoutAsking: line.assumedWithoutAsking, contrary: line.contrary, appFilesBeforePlan: line.appFilesBeforePlan, planSubmitted: line.planSubmitted, rejected: line.rejected, wallMs: line.wallMs })}\n`)
      }
    }
  }
  const summary = summarize(lines)
  appendFileSync(log, `${JSON.stringify({ summary })}\n`)
  process.stdout.write(`${JSON.stringify({ summary })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0), (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
