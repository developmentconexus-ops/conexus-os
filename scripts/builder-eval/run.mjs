// The lever for every Stage 2 Builder proof: send one product-language request to the real
// Builder, on a fresh Project, through the product UI exactly as a person would, and record
// whether a usable Preview came out the other end. Reruns turn a guidance/starter/skill change
// into a measurement instead of an opinion.
//
// Usage: node scripts/builder-eval/run.mjs --case <file> [--project <id> [--grade-only]] [--model <id>] [--prompt-variant <id>] --out <dir>
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checksPassed, parseCase, runChecks } from './checks.mjs'
import { gradeRefusal } from './scorers.mjs'

export const DEFAULT_BASE_URL = 'https://hub.conexus.localhost:3443'
export const DEFAULT_MAX_REPAIRS = 2
const PREVIEW_IFRAME_TITLE = 'Prévia do aplicativo'
const REPAIR_MESSAGE = 'o build falhou, corrija'
// Pilot runs take 3 to 12 minutes; 10 minutes clipped valid runs.
const RUN_SETTLE_TIMEOUT_MS = 30 * 60 * 1000
const RUN_POLL_INTERVAL_MS = 4_000
const PREVIEW_READY_TIMEOUT_MS = 3 * 60 * 1000

const usage = [
  'Usage: node scripts/builder-eval/run.mjs --case <file> [--project <id> [--grade-only]] [--model <id>] [--prompt-variant <id>] --out <dir>',
  '',
  'Options:',
  '  --case <file>          Case JSON: { request, checks[], reload? }; required',
  '  --out <dir>            Directory to write result.json and preview.png; required',
  '  --project <id>         Reuse an existing Project (new conversation); default: create one',
  '  --grade-only           With --project: send nothing, grade the Project\'s current Preview',
  '  --model <id>           A model id from GET /api/control/model-accounts/models; default: the first usable one',
  '  --prompt-variant <id>  The Builder prompt variant every run of this case uses (such as v2); default: the Hub\'s',
  '  --project-name <name>  Name for a newly created Project; default: eval-<UTC date>-<time>',
  '  --max-repairs <n>      Repair messages to send after a failed build; default: 2',
  '  --base-url <url>       Hub origin; default: https://hub.conexus.localhost:3443 (any other origin needs CONEXUS_STATE)',
  '  --mask-values          Hide business values in the saved evidence: mask table cells in screenshots and replace digits in previewText',
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
  const options = { case: undefined, out: undefined, project: undefined, gradeOnly: false, model: undefined, promptVariant: undefined, projectName: undefined, maxRepairs: DEFAULT_MAX_REPAIRS, baseUrl: DEFAULT_BASE_URL, maskValues: false, headed: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    switch (flag) {
      case '--case': options.case = valueFor(argv, index++, flag); break
      case '--out': options.out = valueFor(argv, index++, flag); break
      case '--project': options.project = valueFor(argv, index++, flag); break
      case '--grade-only': options.gradeOnly = true; break
      case '--model': options.model = valueFor(argv, index++, flag); break
      case '--prompt-variant': options.promptVariant = valueFor(argv, index++, flag); break
      case '--project-name': options.projectName = valueFor(argv, index++, flag); break
      case '--max-repairs': {
        const value = valueFor(argv, index++, flag)
        if (!/^\d+$/.test(value)) fail('--max-repairs must be a non-negative integer')
        options.maxRepairs = Number(value)
        break
      }
      case '--base-url': options.baseUrl = valueFor(argv, index++, flag); break
      case '--mask-values': options.maskValues = true; break
      case '--headed': options.headed = true; break
      case '--help': options.help = true; break
      default: fail(`unknown option ${flag}`)
    }
  }
  if (options.help) return options
  if (!options.case) fail('--case <file> is required')
  if (!options.out) fail('--out <dir> is required')
  if (options.gradeOnly && !options.project) fail('--grade-only requires --project <id>')
  return options
}

const defaultProjectName = () => `eval-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}`

// The helper below signs in on the pilot (3443), so a run aimed anywhere else must name its own
// storage state and can never fall back to it.
export const resolveStatePath = (baseUrl = DEFAULT_BASE_URL) => {
  if (process.env.CONEXUS_STATE) return process.env.CONEXUS_STATE
  if (baseUrl !== DEFAULT_BASE_URL) fail(`--base-url ${baseUrl} is not the default Hub, so CONEXUS_STATE must name a storage state for it; the pilot session helper is never used`)
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
async function pollForSettledRun(page, projectId, excludeRunId, answers) {
  const deadline = Date.now() + RUN_SETTLE_TIMEOUT_MS
  let session = null
  let answering = null
  while (Date.now() < deadline) {
    answering = await answerPendingCard(page, answers, answering)
    session = await readSession(page, projectId)
    const run = session.latestBuilderRun
    if (run && run.builderRunId !== excludeRunId && run.state !== 'QUEUED' && run.state !== 'RUNNING') return { session, run }
    await page.waitForTimeout(RUN_POLL_INTERVAL_MS)
  }
  fail(`timed out after ${RUN_SETTLE_TIMEOUT_MS}ms waiting for a BuilderRun to settle; last session: ${JSON.stringify(session)}`)
}

const PLAN_CARD = 'section[aria-label="Plano para aprovar"]'
const QUESTION_CARD = '[aria-label="Pergunta do agente"]'
const FALLBACK_ANSWER = 'Pode seguir com o que achar mais simples.'

/** Answers the pending card Construir shows while a run waits for the person, the same click a
 * person makes: the plan card is approved, a question gets its first (recommended) option or,
 * with no options, a fixed "do the simplest" reply. The web sends Mastra's own
 * respondToToolSuspension; the driver never calls a Hub route of its own. `answering` is the card
 * already answered on an earlier tick, so a card still on screen while its answer travels is not
 * answered twice. Returns the card now on screen (null when none). */
export async function answerPendingCard(page, answers, answering = null) {
  const plan = page.locator(PLAN_CARD)
  if (await plan.count() > 0) {
    const title = await plan.locator('strong').first().innerText().catch(() => '')
    const text = await plan.locator('pre').first().innerText().catch(() => '')
    const signature = `plan:${title}:${text}`
    if (signature === answering) return signature
    await plan.getByRole('button', { name: 'Aprovar e construir' }).click()
    answers.push({ kind: 'PLAN', title, text, answer: 'Aprovar e construir' })
    return signature
  }
  const question = page.locator(QUESTION_CARD)
  if (await question.count() > 0) {
    const text = (await question.first().innerText()).split('\n')[0].trim()
    const signature = `question:${text}`
    if (signature === answering) return signature
    const option = question.locator('input[type=radio], input[type=checkbox]').first()
    let answer
    if (await option.count() > 0) {
      answer = (await option.locator('xpath=ancestor::label[1]').innerText()).split('\n')[0].trim()
      const multi = (await option.getAttribute('type')) === 'checkbox'
      await option.click({ force: true })
      if (multi) await question.locator('button').last().click()
    } else {
      answer = FALLBACK_ANSWER
      const input = question.locator('input, textarea').first()
      await input.fill(answer)
      await input.press('Enter')
    }
    answers.push({ kind: 'QUESTION', title: text, text, answer })
    return signature
  }
  return null
}

const digitsMasked = (text) => text?.replace(/\d/g, '#') ?? null
export const maskDigits = digitsMasked

const messageParts = (message) => message?.content?.parts ?? []

/** Pure. The last conexus_check report the agent got in the conversation, read from the thread's
 * messages (a tool call's result is the report itself), or null with the reason. */
export function lastCheckReport(messages) {
  const reports = [...messages]
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .flatMap((message) => messageParts(message))
    .filter((part) => part.type === 'tool-invocation' && part.toolInvocation?.toolName === 'conexus_check' && part.toolInvocation.state === 'result')
    .map((part) => part.toolInvocation.result)
  const report = reports.at(-1)
  return report === undefined ? { report: null, reason: 'no conexus_check result in the conversation' } : { report, reason: null }
}

/** Pure. The text of the conversation's last assistant message. */
export const lastAssistantText = (messages) => {
  const last = [...messages].filter((message) => message.role === 'assistant')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1)
  return messageParts(last).filter((part) => part.type === 'text').map((part) => part.text).join('\n')
}

const readThreadMessages = (page, projectId, conversationId) => page.evaluate(async ({ id, thread }) => {
  const response = await fetch(`/api/builder/agent-controller/conexus-builder/sessions/project:${id}/threads/${thread}/messages?perPage=false`, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`thread messages read failed with ${response.status}`)
  return (await response.json()).messages ?? []
}, { id: projectId, thread: conversationId })

const previewOf = (session) => session.preview.lastGoodArtifactRevisionId ? session.preview.lastGoodSourceRevision : null

/** The builder-session read is two statements, so one read can show the run settled next to the
 * Preview the settle transaction replaced. Polling until the Preview names the run's revision
 * grades what the store actually committed instead of that torn read. */
async function pollForPreviewOf(page, projectId, sourceRevision) {
  const deadline = Date.now() + PREVIEW_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (previewOf(await readSession(page, projectId)) === sourceRevision) return true
    await page.waitForTimeout(RUN_POLL_INTERVAL_MS)
  }
  return false
}

// Only a build the source broke is the author's to repair. A platform fault (runner down, Hub
// restart) sent as "corrija" teaches the model to delete correct code until the fault goes away.
const needsRepair = (run) => run.failureCategory === 'APPLICATION_BUILD_FAILED'

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

async function openProject(page, baseUrl, projectId) {
  await page.goto(`${baseUrl}/projects/${projectId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+/, { timeout: 60_000 })
}

/** Runs the case's checks against the Preview on screen, then, when the case asks, reloads the
 * Preview and reruns its expectText checks. Returns when the Preview's veil lifted. */
async function gradePreview(page, { out, caseFile, result, maskValues }) {
  const usablePreviewAt = await waitForUsablePreview(page)
  result.previewUrl = await readPreviewUrl(page, result.projectId).catch(() => null)
  const iframe = page.locator(`iframe[title="${PREVIEW_IFRAME_TITLE}"]`)
  result.screenshotPath = 'preview.png'
  const frame = page.frameLocator(`iframe[title="${PREVIEW_IFRAME_TITLE}"]`)
  const mask = maskValues ? [frame.locator('td, [role=cell]')] : []
  await iframe.screenshot({ path: join(out, result.screenshotPath), mask }).catch(async () => {
    await page.screenshot({ path: join(out, result.screenshotPath), mask })
  })
  result.checks.initial = await runChecks(frame, caseFile.checks)
  const previewText = await frame.locator('body').innerText({ timeout: 15_000 }).catch(() => null)
  result.previewText = maskValues ? digitsMasked(previewText) : previewText
  if (caseFile.reload && checksPassed(result.checks.initial)) {
    // The Preview is cross-origin, so its window cannot be reloaded from the Hub page; the
    // frame is navigated to its own URL instead, which reuses the Preview cookie. Its browser
    // storage is cleared first: data that only lives in this browser is not saved data.
    const previewFrame = await (await iframe.elementHandle()).contentFrame()
    await previewFrame.evaluate(async () => {
      localStorage.clear()
      sessionStorage.clear()
      for (const database of await indexedDB.databases?.() ?? []) if (database.name) indexedDB.deleteDatabase(database.name)
    })
    await previewFrame.goto(previewFrame.url(), { waitUntil: 'load' })
    await previewFrame.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, undefined, { timeout: 15_000 })
    const frameAfterReload = page.frameLocator(`iframe[title="${PREVIEW_IFRAME_TITLE}"]`)
    result.checks.afterReload = await runChecks(frameAfterReload, caseFile.checks.filter((step) => step.action === 'expectText' || step.action === 'expectNoText'))
    await iframe.screenshot({ path: join(out, 'preview-after-reload.png'), mask }).catch(() => {})
  }
  return usablePreviewAt
}

/** Sends the case's request (and repairs) through the product UI and waits for the final run to
 * settle and for the Preview to name that run's revision. Returns when the request was sent. */
async function sendAndSettle(page, options, caseFile, result) {
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

  const previousRunId = options.project
    ? (await readSession(page, options.project)).latestBuilderRun?.builderRunId ?? null
    : null
  const started = options.project
    ? await openConversationAndSend(page, { baseUrl: options.baseUrl, projectId: options.project, request: caseFile.request, modelId: options.model })
    : await createProjectAndSend(page, { request: caseFile.request, modelId: options.model, projectName: result.projectName })
  result.projectId = started.projectId
  result.conversationId = started.conversationId

  let settled = await pollForSettledRun(page, result.projectId, previousRunId, result.answers)
  result.runs.push(recordOf(settled.run, false))
  result.sourceRevisionBefore = settled.run.baseSourceRevision
  while (needsRepair(settled.run) && result.repairIterations < options.maxRepairs) {
    result.repairIterations += 1
    await sendRepairMessage(page)
    const previousRunId = settled.run.builderRunId
    settled = await pollForSettledRun(page, result.projectId, previousRunId, result.answers)
    result.runs.push(recordOf(settled.run, true))
  }

  const finalRun = settled.run
  result.sourceRevisionAfter = finalRun.resultSourceRevision ?? finalRun.baseSourceRevision
  if (result.sourceRevisionAfter && result.sourceRevisionAfter !== result.sourceRevisionBefore) {
    result.filesChanged = await readDiff(page, result.projectId, result.sourceRevisionBefore, result.sourceRevisionAfter)
  }

  // The Hub may still offer an older build's Preview after the final run failed; checking that
  // one would grade a result the request did not produce.
  if (finalRun.state !== 'SUCCEEDED' || finalRun.resultKind === 'SOURCE_CHANGED_BUILD_FAILED') {
    result.failure = 'FINAL_RUN_NOT_BUILT'
  } else if (finalRun.resultKind === 'RESPONSE_ONLY') {
    result.failure = 'NO_SOURCE_CHANGE'
  } else if (!(await pollForPreviewOf(page, result.projectId, result.sourceRevisionAfter))) {
    result.failure = 'PREVIEW_NOT_FROM_FINAL_RUN'
  }
  return started.requestSentAt
}

export async function runCase(options) {
  const rawCase = JSON.parse(readFileSync(resolve(options.case), 'utf8'))
  const caseFile = parseCase(rawCase)
  const missingSystem = typeof rawCase.missingSystem === 'string' ? rawCase.missingSystem : null
  const statePath = options.statePath ?? resolveStatePath(options.baseUrl)
  const browser = await chromium.launch({ headless: !options.headed })
  const context = await browser.newContext({ storageState: statePath, viewport: { width: 1480, height: 920 } })
  const page = await context.newPage()
  // The product UI never names a prompt variant, so the eval adds it to each message the UI sends:
  // the first request and every repair.
  if (options.promptVariant) {
    await page.route('**/api/control/projects/*/builder-session/messages', (route) => route.continue({
      postData: JSON.stringify({ ...JSON.parse(route.request().postData() ?? '{}'), promptVariant: options.promptVariant }),
    }))
  }
  const startedAt = new Date().toISOString()
  const result = {
    schema: 'conexus.builder-eval/v1', startedAt, finishedAt: null, outcome: 'ERROR', error: null,
    case: options.case, gradeOnly: options.gradeOnly, request: caseFile.request, baseUrl: options.baseUrl,
    workspaceId: null, projectId: options.project ?? null, projectName: options.project ? null : (options.projectName ?? defaultProjectName()),
    conversationId: null, modelId: options.model ?? null, promptVariant: options.promptVariant ?? null,
    sourceRevisionBefore: null, sourceRevisionAfter: null, filesChanged: [],
    runs: [], answers: [], lastCheckReport: null, lastCheckReportReason: null, refusal: null, repairIterations: 0, wallTimeToUsablePreviewMs: null, previewUrl: null,
    checks: { initial: [], afterReload: null }, previewText: null, screenshotPath: null, failure: null,
  }
  try {
    let requestSentAt = null
    if (options.gradeOnly) {
      result.request = null
      await openProject(page, options.baseUrl, options.project)
      result.sourceRevisionAfter = previewOf(await readSession(page, options.project))
      if (!result.sourceRevisionAfter) result.failure = 'NO_PREVIEW'
    } else {
      requestSentAt = await sendAndSettle(page, options, caseFile, result)
    }

    mkdirSync(options.out, { recursive: true })
    if (!result.failure) {
      const usablePreviewAt = await gradePreview(page, { out: options.out, caseFile, result, maskValues: options.maskValues })
      if (requestSentAt !== null) result.wallTimeToUsablePreviewMs = usablePreviewAt - requestSentAt
    }

    if (result.projectId && result.conversationId) {
      const messages = await readThreadMessages(page, result.projectId, result.conversationId).catch(() => null)
      if (messages === null) result.lastCheckReportReason = 'thread messages could not be read'
      else {
        const { report, reason } = lastCheckReport(messages)
        result.lastCheckReport = report
        result.lastCheckReportReason = reason
        if (missingSystem) {
          const output = { preview: result.failure ? { kind: 'not-built', reason: result.failure } : { kind: 'observed' } }
          result.refusal = gradeRefusal(output, missingSystem, lastAssistantText(messages))
        }
      }
    }

    const ranAnyChecks = result.checks.initial.length > 0
    const initialOk = checksPassed(result.checks.initial)
    const reloadOk = result.checks.afterReload === null || checksPassed(result.checks.afterReload)
    const passed = missingSystem ? result.refusal?.score === 1 : ranAnyChecks && initialOk && reloadOk
    result.outcome = passed ? 'PASS' : 'FAIL'
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
