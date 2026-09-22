// The lever for every Stage 2 Builder proof: send one product-language request to the real
// Builder, on a fresh Project, through the product UI exactly as a person would, and record
// whether a usable Preview came out the other end. Reruns turn a guidance/starter/skill change
// into a measurement instead of an opinion.
//
// Usage: node scripts/builder-eval/run.mjs --case <file> [--project <id>] [--model <id>] --out <dir>
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checksPassed, parseCase, runChecks } from './checks.mjs'

const DEFAULT_BASE_URL = 'https://hub.conexus.localhost:3443'
const DEFAULT_MAX_REPAIRS = 2
const PREVIEW_IFRAME_TITLE = 'Prévia do aplicativo'
const REPAIR_MESSAGE = 'o build falhou, corrija'
const RUN_SETTLE_TIMEOUT_MS = 10 * 60 * 1000
const RUN_POLL_INTERVAL_MS = 4_000
const PREVIEW_READY_TIMEOUT_MS = 3 * 60 * 1000

const usage = [
  'Usage: node scripts/builder-eval/run.mjs --case <file> [--project <id>] [--model <id>] --out <dir>',
  '',
  'Options:',
  '  --case <file>          Case JSON: { request, checks[], reload? }; required',
  '  --out <dir>            Directory to write result.json and preview.png; required',
  '  --project <id>         Reuse an existing Project (new conversation); default: create one',
  '  --model <id>           A model id from GET /api/control/model-accounts/models; default: the first usable one',
  '  --project-name <name>  Name for a newly created Project; default: eval-<UTC date>-<time>',
  '  --max-repairs <n>      Repair messages to send after a failed build; default: 2',
  '  --base-url <url>       Hub origin; default: https://hub.conexus.localhost:3443',
  '  --headed               Launch a visible browser instead of headless',
  '  --help                 Show this help',
].join('\n')

const fail = (message) => {
  throw new Error(`builder-eval: ${message}`)
}

const valueFor = (argv, index, flag) => {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) fail(`${flag} requires a value`)
  return value
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { case: undefined, out: undefined, project: undefined, model: undefined, projectName: undefined, maxRepairs: DEFAULT_MAX_REPAIRS, baseUrl: DEFAULT_BASE_URL, headed: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    switch (flag) {
      case '--case': options.case = valueFor(argv, index++, flag); break
      case '--out': options.out = valueFor(argv, index++, flag); break
      case '--project': options.project = valueFor(argv, index++, flag); break
      case '--model': options.model = valueFor(argv, index++, flag); break
      case '--project-name': options.projectName = valueFor(argv, index++, flag); break
      case '--max-repairs': {
        const value = valueFor(argv, index++, flag)
        if (!/^\d+$/.test(value)) fail('--max-repairs must be a non-negative integer')
        options.maxRepairs = Number(value)
        break
      }
      case '--base-url': options.baseUrl = valueFor(argv, index++, flag); break
      case '--headed': options.headed = true; break
      case '--help': options.help = true; break
      default: fail(`unknown option ${flag}`)
    }
  }
  if (options.help) return options
  if (!options.case) fail('--case <file> is required')
  if (!options.out) fail('--out <dir> is required')
  return options
}

const defaultProjectName = () => `eval-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}`

const resolveStatePath = () => {
  if (process.env.CONEXUS_STATE) return process.env.CONEXUS_STATE
  const helper = join(homedir(), 'conexus-test-session.sh')
  if (!existsSync(helper)) fail(`no CONEXUS_STATE and ${helper} does not exist; establish a test-operator session first`)
  const output = execFileSync(helper, { encoding: 'utf8' }).trim().split('\n')
  const path = output.at(-1)
  if (!path) fail(`${helper} did not print a storage state path`)
  return path
}

const readSession = (page, projectId) => page.evaluate(async (id) => {
  const response = await fetch(`/api/control/projects/${id}/builder-session`, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`builder-session read failed with ${response.status}`)
  return response.json()
}, projectId)

const readUsableModels = (page) => page.evaluate(async () => {
  const response = await fetch('/api/control/model-accounts/models', { credentials: 'same-origin' })
  const status = response.status
  const body = response.ok ? await response.json() : null
  return { status, models: (body?.models ?? []).filter((model) => model.hasApiKey) }
})

/** Mints the same Preview grant the "Recarregar prévia" button mints, only to read back the
 * previewUrl for the record; the browser already holds an equivalent lease from opening the tab. */
const readPreviewUrl = (page, projectId) => page.evaluate(async (id) => {
  const csrf = document.cookie.split('; ').find((entry) => entry.startsWith('__Host-conexus_csrf='))?.split('=').slice(1).join('=')
  const response = await fetch(`/api/control/projects/${id}/builder-session/preview`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-conexus-csrf': decodeURIComponent(csrf ?? '') },
    body: '{}',
  })
  return response.ok ? (await response.json()).previewUrl ?? null : null
}, projectId)

const readDiff = (page, projectId, baseSourceRevision, resultSourceRevision) => page.evaluate(async ({ id, base, result }) => {
  const query = new URLSearchParams({ baseSourceRevision: base, resultSourceRevision: result })
  const response = await fetch(`/api/control/projects/${id}/source/compare?${query}`, { credentials: 'same-origin' })
  if (!response.ok) return []
  return (await response.json()).files
}, { id: projectId, base: baseSourceRevision, result: resultSourceRevision })

/** Waits for a BuilderRun other than `excludeRunId` to leave QUEUED/RUNNING, polling the same API the product polls. */
async function pollForSettledRun(page, projectId, excludeRunId) {
  const deadline = Date.now() + RUN_SETTLE_TIMEOUT_MS
  let session = null
  while (Date.now() < deadline) {
    session = await readSession(page, projectId)
    const run = session.latestBuilderRun
    if (run && run.builderRunId !== excludeRunId && run.state !== 'QUEUED' && run.state !== 'RUNNING') return { session, run }
    await page.waitForTimeout(RUN_POLL_INTERVAL_MS)
  }
  fail(`timed out after ${RUN_SETTLE_TIMEOUT_MS}ms waiting for a BuilderRun to settle; last session: ${JSON.stringify(session)}`)
}

const needsRepair = (run) => run.resultKind === 'SOURCE_CHANGED_BUILD_FAILED' || run.state === 'FAILED' || run.state === 'INTERRUPTED'

const recordOf = (run, isRepair) => ({
  builderRunId: run.builderRunId, isRepair, state: run.state, resultKind: run.resultKind,
  failureCode: run.failureCode, failureCategory: run.failureCategory,
  baseSourceRevision: run.baseSourceRevision, resultSourceRevision: run.resultSourceRevision,
  requestText: run.requestText,
})

/** The send button disables under NO_MODEL, SENDING and an empty draft alike; waiting for it to
 * enable is a single proxy for "the composer actually is ready", instead of tracking each cause. */
async function waitForComposerReady(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('.cx-send-button')
    return Boolean(button) && !button.disabled
  }, undefined, { timeout: 20_000 })
}

async function pickModel(page, modelId) {
  await page.getByRole('button', { name: /^Modelo /u }).click()
  const option = page.locator(`[data-model-id="${modelId}"]`)
  await option.waitFor({ state: 'visible', timeout: 15_000 })
  await option.click()
}

/** Creates a fresh Project from the workspace home: one composer submit carries the name, the
 * model and the first request together, the same as a person filling in the home prompt. */
async function createProjectAndSend(page, { request, modelId, projectName }) {
  const composer = page.getByLabel('Mensagem para o agente')
  await composer.waitFor({ state: 'visible', timeout: 30_000 })
  if (modelId) await pickModel(page, modelId)
  await composer.fill(request)
  await waitForComposerReady(page)
  await page.getByRole('button', { name: 'Enviar' }).click()
  const nameInput = page.getByLabel('Nome do Projeto')
  await nameInput.waitFor({ state: 'visible', timeout: 10_000 })
  await nameInput.fill(projectName)
  const requestSentAt = Date.now()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+/, { timeout: 180_000 })
  const [, , projectId, , conversationId] = new URL(page.url()).pathname.split('/')
  return { projectId, conversationId, requestSentAt }
}

/** Opens a fresh conversation on an existing Project and sends the request through Construir's
 * own composer, the same box the create-Project flow uses. */
async function openConversationAndSend(page, { baseUrl, projectId, request, modelId }) {
  await page.goto(`${baseUrl}/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+/, { timeout: 60_000 })
  const previousUrl = page.url()
  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await page.waitForURL((url) => url.href !== previousUrl && /\/projects\/[^/]+\/c\/[^/]+/.test(url.pathname), { timeout: 30_000 })
  const conversationId = new URL(page.url()).pathname.split('/')[4]
  const composer = page.getByLabel('Mensagem para o agente')
  await composer.waitFor({ state: 'visible', timeout: 30_000 })
  if (modelId) await pickModel(page, modelId)
  await composer.fill(request)
  await waitForComposerReady(page)
  const requestSentAt = Date.now()
  await page.getByRole('button', { name: 'Enviar' }).click()
  return { projectId, conversationId, requestSentAt }
}

async function sendRepairMessage(page) {
  const composer = page.getByLabel('Mensagem para o agente')
  await composer.fill(REPAIR_MESSAGE)
  await page.getByRole('button', { name: 'Enviar' }).click()
}

/** Waits for the Preview's own veil to lift, the same signal the product shows the person. */
async function waitForUsablePreview(page) {
  await page.locator('.cx-frame-veil').waitFor({ state: 'detached', timeout: PREVIEW_READY_TIMEOUT_MS })
  return Date.now()
}

export async function runCase(options) {
  const caseFile = parseCase(JSON.parse(readFileSync(resolve(options.case), 'utf8')))
  const statePath = resolveStatePath()
  const browser = await chromium.launch({ headless: !options.headed })
  const context = await browser.newContext({ storageState: statePath, viewport: { width: 1480, height: 920 } })
  const page = await context.newPage()
  const startedAt = new Date().toISOString()
  const result = {
    schema: 'conexus.builder-eval/v1', startedAt, finishedAt: null, outcome: 'ERROR', error: null,
    case: options.case, request: caseFile.request, baseUrl: options.baseUrl,
    workspaceId: null, projectId: options.project ?? null, projectName: options.project ? null : (options.projectName ?? defaultProjectName()),
    conversationId: null, modelId: options.model ?? null,
    sourceRevisionBefore: null, sourceRevisionAfter: null, filesChanged: [],
    runs: [], repairIterations: 0, wallTimeToUsablePreviewMs: null, previewUrl: null,
    checks: { initial: [], afterReload: null }, screenshotPath: null, failure: null,
  }
  try {
    await page.goto(`${options.baseUrl}/`, { waitUntil: 'domcontentloaded' })
    if (!options.project) {
      await page.waitForURL(/\/workspaces\/[^/]+\/projects$/, { timeout: 30_000 })
      result.workspaceId = new URL(page.url()).pathname.split('/')[2]
    }

    const usable = await readUsableModels(page)
    if (usable.models.length === 0) {
      fail(`STOP: the test operator has no usable Factory model account (models endpoint status ${usable.status}). Leandro must connect or share one.`)
    }
    if (options.model && !usable.models.some((model) => model.id === options.model)) {
      fail(`--model ${options.model} is not usable; available: ${usable.models.map((model) => model.id).join(', ')}`)
    }
    result.modelId = options.model ?? usable.models[0].id

    const started = options.project
      ? await openConversationAndSend(page, { baseUrl: options.baseUrl, projectId: options.project, request: caseFile.request, modelId: options.model })
      : await createProjectAndSend(page, { request: caseFile.request, modelId: options.model, projectName: result.projectName })
    result.projectId = started.projectId
    result.conversationId = started.conversationId
    const requestSentAt = started.requestSentAt

    let settled = await pollForSettledRun(page, result.projectId, null)
    result.runs.push(recordOf(settled.run, false))
    result.sourceRevisionBefore = settled.run.baseSourceRevision
    while (needsRepair(settled.run) && result.repairIterations < options.maxRepairs) {
      result.repairIterations += 1
      await sendRepairMessage(page)
      const previousRunId = settled.run.builderRunId
      settled = await pollForSettledRun(page, result.projectId, previousRunId)
      result.runs.push(recordOf(settled.run, true))
    }

    const finalRun = settled.run
    result.sourceRevisionAfter = finalRun.resultSourceRevision ?? finalRun.baseSourceRevision
    if (result.sourceRevisionAfter && result.sourceRevisionAfter !== result.sourceRevisionBefore) {
      result.filesChanged = await readDiff(page, result.projectId, result.sourceRevisionBefore, result.sourceRevisionAfter)
    }

    // The Hub may still offer an older build's Preview after the final run failed; checking that
    // one would grade a result the request did not produce.
    const previewRevision = settled.session.preview.lastGoodSourceRevision
    if (finalRun.state !== 'SUCCEEDED' || finalRun.resultKind === 'SOURCE_CHANGED_BUILD_FAILED') {
      result.failure = 'FINAL_RUN_NOT_BUILT'
    } else if (!settled.session.preview.lastGoodArtifactRevisionId || previewRevision !== result.sourceRevisionAfter) {
      result.failure = 'PREVIEW_NOT_FROM_FINAL_RUN'
    }

    mkdirSync(options.out, { recursive: true })
    if (!result.failure) {
      const usablePreviewAt = await waitForUsablePreview(page)
      result.wallTimeToUsablePreviewMs = usablePreviewAt - requestSentAt
      result.previewUrl = await readPreviewUrl(page, result.projectId).catch(() => null)
      const iframe = page.locator(`iframe[title="${PREVIEW_IFRAME_TITLE}"]`)
      result.screenshotPath = 'preview.png'
      await iframe.screenshot({ path: join(options.out, result.screenshotPath) }).catch(async () => {
        await page.screenshot({ path: join(options.out, result.screenshotPath) })
      })
      const frame = page.frameLocator(`iframe[title="${PREVIEW_IFRAME_TITLE}"]`)
      result.checks.initial = await runChecks(frame, caseFile.checks)
      if (caseFile.reload && checksPassed(result.checks.initial)) {
        // The Preview is cross-origin, so its window cannot be reloaded from the Hub page; the
        // frame is navigated to its own URL instead, which reuses the Preview cookie.
        const previewFrame = await (await iframe.elementHandle()).contentFrame()
        await previewFrame.goto(previewFrame.url(), { waitUntil: 'load' })
        await previewFrame.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, undefined, { timeout: 15_000 })
        const frameAfterReload = page.frameLocator(`iframe[title="${PREVIEW_IFRAME_TITLE}"]`)
        result.checks.afterReload = await runChecks(frameAfterReload, caseFile.checks.filter((step) => step.action === 'expectText'))
      }
    }

    const ranAnyChecks = result.checks.initial.length > 0
    const initialOk = checksPassed(result.checks.initial)
    const reloadOk = result.checks.afterReload === null || checksPassed(result.checks.afterReload)
    result.outcome = ranAnyChecks && initialOk && reloadOk ? 'PASS' : 'FAIL'
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    result.outcome = 'ERROR'
    mkdirSync(options.out, { recursive: true })
    await page.screenshot({ path: join(options.out, 'failure.png') }).catch(() => {})
  } finally {
    result.finishedAt = new Date().toISOString()
    await browser.close()
  }
  mkdirSync(options.out, { recursive: true })
  writeFileSync(join(options.out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  return result
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(`${usage}\n`)
    return 0
  }
  const result = await runCase(options)
  process.stdout.write(`${JSON.stringify({ outcome: result.outcome, projectId: result.projectId, runs: result.runs.length, repairIterations: result.repairIterations, wallTimeToUsablePreviewMs: result.wallTimeToUsablePreviewMs, error: result.error }, null, 2)}\n`)
  return result.outcome === 'PASS' ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
