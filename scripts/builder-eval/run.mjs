// The lever for every Stage 2 Builder proof: send one product-language request to the real
// Builder, on a fresh Project, through the product UI exactly as a person would, and record
// whether a usable Preview came out the other end. Reruns turn a guidance/starter/skill change
// into a measurement instead of an opinion.
//
// Usage: node scripts/builder-eval/run.mjs --case <file> [--project <id> [--grade-only]] [--model <id>] [--prompt-variant <id>] --out <dir>
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, loadavg } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checksPassed, parseCase, runChecks } from './checks.mjs'
import { compareToOracle, loadOracle } from './oracle.mjs'
import { correctionMessage, createPerson, fillSheet, fillValues, loadValues, parseSheet, slicesRemaining } from './person.mjs'
import { createEvalMastra, evalStorage, findTraceIds, gradeRefusal } from './scorers.mjs'
import { hubTimingFromLog, timingBlock } from './timing.mjs'

export const DEFAULT_BASE_URL = 'https://hub.conexus.localhost:3443'
export const DEFAULT_MAX_REPAIRS = 2
export const DEFAULT_MAX_SLICES = 6
const ARMS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'arms')
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
  '  --arm <id>             The methodology arm: arms/<id>.json when it exists (model, promptVariant), else the prompt variant <id>; sent only in the request context',
  '  --repetition <n>       Repetition number of this case on this arm, recorded in the timing identity; default: 1',
  '  --max-slices <n>       Messages sent to carry a plan on after a version while it lists slices left; default: 6',
  '  --no-correction        Skip the one correction message the scripted person sends from the oracle diff',
  '  --hub-version <sha>    The running Hub\'s commit, recorded in the timing identity',
  '  --project-name <name>  Name for a newly created Project; default: the case\'s person.projectName, else eval-<UTC date>-<time>',
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
  const options = { case: undefined, out: undefined, project: undefined, gradeOnly: false, model: undefined, promptVariant: undefined, arm: undefined, repetition: 1, maxSlices: DEFAULT_MAX_SLICES, noCorrection: false, hubVersion: null, projectName: undefined, maxRepairs: DEFAULT_MAX_REPAIRS, baseUrl: DEFAULT_BASE_URL, maskValues: false, headed: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    switch (flag) {
      case '--case': options.case = valueFor(argv, index++, flag); break
      case '--out': options.out = valueFor(argv, index++, flag); break
      case '--project': options.project = valueFor(argv, index++, flag); break
      case '--grade-only': options.gradeOnly = true; break
      case '--model': options.model = valueFor(argv, index++, flag); break
      case '--prompt-variant': options.promptVariant = valueFor(argv, index++, flag); break
      case '--arm': options.arm = valueFor(argv, index++, flag); break
      case '--repetition': {
        const value = valueFor(argv, index++, flag)
        if (!/^[1-9]\d*$/.test(value)) fail('--repetition must be a positive integer')
        options.repetition = Number(value)
        break
      }
      case '--max-slices': {
        const value = valueFor(argv, index++, flag)
        if (!/^\d+$/.test(value)) fail('--max-slices must be a non-negative integer')
        options.maxSlices = Number(value)
        break
      }
      case '--no-correction': options.noCorrection = true; break
      case '--hub-version': options.hubVersion = valueFor(argv, index++, flag); break
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

/** An arm names the methodology under test. `arms/<id>.json` may set its model and prompt variant; an id with no file is itself the prompt variant, which reaches the Hub only through the request's promptVariant field. */
export function resolveArm(armId, armsDir = ARMS_DIR) {
  if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(armId)) fail(`--arm ${armId} is not a valid arm id`)
  const file = join(armsDir, `${armId}.json`)
  const arm = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  return { promptVariant: arm.promptVariant ?? armId, model: arm.model }
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
async function pollForSettledRun(page, projectId, excludeRunId, answers, person = null) {
  const deadline = Date.now() + RUN_SETTLE_TIMEOUT_MS
  let session = null
  let answering = null
  while (Date.now() < deadline) {
    const answered = answers.length
    answering = await answerPendingCard(page, answers, answering, person)
    if (answers.length > answered) answers.at(-1).answeredAt = new Date().toISOString()
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

/** The options of a question card as the person reads them: the first line of each is its label. */
async function readOptions(question) {
  const inputs = question.locator('input[type=radio], input[type=checkbox]')
  const options = []
  for (let index = 0; index < await inputs.count(); index += 1) {
    const [label = '', ...description] = (await inputs.nth(index).locator('xpath=ancestor::label[1]').innerText()).split('\n').map((line) => line.trim()).filter(Boolean)
    options.push({ label, description: description.join(' ') })
  }
  return { options, multi: options.length > 0 && (await inputs.first().getAttribute('type')) === 'checkbox' }
}

/** The whole plan, from the reader the card's "Ler plano completo" opens; null when the card has none. */
async function readFullPlan(page, plan) {
  const open = plan.getByRole('button', { name: 'Ler plano completo' })
  if (await open.count() === 0) return null
  try {
    await open.click()
    const reader = page.locator('.cx-plan-reader-body')
    await reader.waitFor({ state: 'visible', timeout: 5_000 })
    const text = await reader.innerText()
    await page.getByRole('button', { name: 'Fechar' }).click()
    return text
  } catch {
    await page.keyboard.press('Escape').catch(() => {})
    return null
  }
}

/** Answers the pending card Construir shows while a run waits for the person, the same click a
 * person makes: the plan card is approved (every gate, in the order they come), and a question is
 * answered by `person` (the scripted person of a bakeoff case) or, with none, gets its first
 * (recommended) option or, with no options, a fixed "do the simplest" reply. The web sends
 * Mastra's own respondToToolSuspension; the driver never calls a Hub route of its own. `answering`
 * is the card already answered on an earlier tick, so a card still on screen while its answer
 * travels is not answered twice. Returns the card now on screen (null when none). */
export async function answerPendingCard(page, answers, answering = null, person = null) {
  const plan = page.locator(PLAN_CARD)
  if (await plan.count() > 0) {
    const title = await plan.locator('strong').first().innerText().catch(() => '')
    const shown = await plan.locator('pre, .cx-plan-clamp').first().innerText().catch(() => '')
    const signature = `plan:${title}:${shown}`
    if (signature === answering) return signature
    const text = await readFullPlan(page, plan) ?? shown
    await plan.getByRole('button', { name: 'Aprovar e construir' }).click()
    answers.push({ kind: 'PLAN', title, text, answer: 'Aprovar e construir' })
    return signature
  }
  const question = page.locator(QUESTION_CARD)
  if (await question.count() > 0) {
    const text = (await question.first().innerText()).split('\n')[0].trim()
    const signature = `question:${text}`
    if (signature === answering) return signature
    const { options, multi } = await readOptions(question)
    const decision = person ? await person.answer({ question: text, options, multi }) : null
    let answer
    if (options.length > 0) {
      const labels = decision ? [decision.answer].flat() : [options[0].label]
      for (const label of labels) {
        const index = options.findIndex((option) => option.label === label)
        await question.locator('input[type=radio], input[type=checkbox]').nth(index).click({ force: true })
      }
      if (multi) await question.locator('button').last().click()
      answer = labels.join(', ')
    } else {
      answer = decision ? decision.answer : FALLBACK_ANSWER
      const input = question.locator('input, textarea').first()
      await input.fill(answer)
      await input.press('Enter')
    }
    answers.push({ kind: 'QUESTION', title: text, text, answer, ...(decision ? { via: decision.via, ruleIds: decision.ruleIds } : {}) })
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
  builderRunId: run.builderRunId, isRepair, createdAt: run.createdAt, settledAt: new Date().toISOString(), state: run.state, resultKind: run.resultKind,
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

async function sendMessage(page, message) {
  const composer = page.getByLabel('Mensagem para o agente')
  await composer.fill(message)
  await waitForComposerReady(page)
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
 * Preview and reruns its expectText checks. Returns when the Preview's veil lifted and the Preview's text as read. */
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
  const rawPreviewText = previewText
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
  return { usablePreviewAt, rawPreviewText }
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

  const person = options.person ?? null
  let settled = await pollForSettledRun(page, result.projectId, previousRunId, result.answers, person)
  result.runs.push(recordOf(settled.run, false))
  result.sourceRevisionBefore = settled.run.baseSourceRevision
  settled = await repairUntilBuilt(page, options, result, settled, person)

  // A plan that lists slices carries on after each version: the person sends one short message
  // until the plan says none is left, up to the cap.
  while (person && settled.run.state === 'SUCCEEDED' && result.slicesContinued < options.maxSlices) {
    const messages = await readThreadMessages(page, result.projectId, result.conversationId).catch(() => [])
    const lastPlan = result.answers.findLast((answer) => answer.kind === 'PLAN')
    if (!slicesRemaining(lastPlan?.text, lastAssistantText(messages))) break
    result.slicesContinued += 1
    await sendMessage(page, person.sheet.continueText)
    settled = await pollForSettledRun(page, result.projectId, settled.run.builderRunId, result.answers, person)
    result.runs.push(recordOf(settled.run, false))
    settled = await repairUntilBuilt(page, options, result, settled, person)
  }

  await judgeFinalRun(page, result.projectId, result, result.runs, result.slicesContinued > 0)
  return started.requestSentAt
}

/** Sends "o build falhou, corrija" while the last run's build failed on the source, up to the cap. */
async function repairUntilBuilt(page, options, result, settled, person) {
  let current = settled
  while (needsRepair(current.run) && result.repairIterations < options.maxRepairs) {
    result.repairIterations += 1
    await sendMessage(page, REPAIR_MESSAGE)
    current = await pollForSettledRun(page, result.projectId, current.run.builderRunId, result.answers, person)
    result.runs.push(recordOf(current.run, true))
  }
  return current
}

/** Fills `target` (sourceRevisionAfter, filesChanged, failure) from the final run and waits for the
 * Preview to name its revision. When slices went on, a last reply that changed nothing does not
 * fail the case: the Preview to grade is the newest source the person's messages produced. */
async function judgeFinalRun(page, projectId, target, runs, afterSlices) {
  const finalRun = runs.at(-1)
  const producing = afterSlices && finalRun.resultKind === 'RESPONSE_ONLY'
    ? runs.findLast((run) => run.resultKind === 'SOURCE_CHANGED' || run.resultKind === 'SOURCE_CHANGED_BUILD_FAILED') ?? finalRun
    : finalRun
  target.sourceRevisionAfter = producing.resultSourceRevision ?? producing.baseSourceRevision
  const before = runs[0].baseSourceRevision
  if (target.sourceRevisionAfter && target.sourceRevisionAfter !== before) {
    target.filesChanged = await readDiff(page, projectId, before, target.sourceRevisionAfter)
  }

  // The Hub may still offer an older build's Preview after the final run failed; checking that
  // one would grade a result the request did not produce.
  if (producing.state !== 'SUCCEEDED' || producing.resultKind === 'SOURCE_CHANGED_BUILD_FAILED') {
    target.failure = 'FINAL_RUN_NOT_BUILT'
  } else if (producing.resultKind === 'RESPONSE_ONLY') {
    target.failure = 'NO_SOURCE_CHANGE'
  } else if (!(await pollForPreviewOf(page, projectId, target.sourceRevisionAfter))) {
    target.failure = 'PREVIEW_NOT_FROM_FINAL_RUN'
  }
}

/** The one correction message: the person sends it once after the first Preview, built from the oracle's diff, and the Preview it produces is compared again. */
async function sendCorrection(page, options, result, { oracle, person, planText, rawFirst }) {
  const comparison = compareToOracle(oracle, { previewText: rawFirst, planText })
  result.oracle = { afterFirstPreview: comparison, afterCorrection: null }
  const message = correctionMessage(comparison.defects)
  if (!message || options.noCorrection || !result.projectId) return
  const firstRun = result.runs.length
  const correction = { message: options.maskValues ? digitsMasked(message) : message, sourceRevisionAfter: null, filesChanged: [], failure: null, wallTimeToUsablePreviewMs: null }
  result.correction = correction
  const sentAt = Date.now()
  await sendMessage(page, message)
  let settled = await pollForSettledRun(page, result.projectId, result.runs.at(-1).builderRunId, result.answers, person)
  result.runs.push(recordOf(settled.run, false))
  settled = await repairUntilBuilt(page, options, result, settled, person)
  await judgeFinalRun(page, result.projectId, correction, result.runs.slice(firstRun), false)
  if (correction.failure) return
  const { usablePreviewAt, rawPreviewText } = await readPreview(page, join(options.out, 'preview-after-correction.png'), options.maskValues)
  correction.wallTimeToUsablePreviewMs = usablePreviewAt - sentAt
  result.oracle.afterCorrection = compareToOracle(oracle, { previewText: rawPreviewText, planText })
}

/** The Preview on screen once its veil lifts: its screenshot and its text. */
async function readPreview(page, screenshotPath, maskValues) {
  const usablePreviewAt = await waitForUsablePreview(page)
  const iframe = page.locator(`iframe[title="${PREVIEW_IFRAME_TITLE}"]`)
  const frame = page.frameLocator(`iframe[title="${PREVIEW_IFRAME_TITLE}"]`)
  await iframe.screenshot({ path: screenshotPath, mask: maskValues ? [frame.locator('td, [role=cell]')] : [] }).catch(() => {})
  return { usablePreviewAt, rawPreviewText: await frame.locator('body').innerText({ timeout: 15_000 }).catch(() => '') }
}

const tscProcesses = () => {
  try {
    return Number(execFileSync('pgrep', ['-c', '-x', 'tsc'], { encoding: 'utf8' }).trim())
  } catch {
    return 0
  }
}

/** Counts of what the person had to do, from the driver's own record. */
export const personCounts = (result) => ({
  approvals: result.answers.filter((answer) => answer.kind === 'PLAN').length,
  answers: result.answers.filter((answer) => answer.kind === 'QUESTION').length,
  silentAnswers: result.answers.filter((answer) => answer.via === 'silent').length,
  repairs: result.repairIterations,
  slicesContinued: result.slicesContinued,
  corrections: result.correction ? 1 : 0,
})

/** The timing block of every Builder run of this case. The spans come from the Hub database when CONEXUS_EVAL_DATABASE_URL names it, the Hub's stage times from the log CONEXUS_HUB_LOG names; either one missing leaves that part null and says why. */
async function collectTimings(result, options, env = process.env) {
  const identity = {
    case: options.case, arm: options.arm ?? null, repetition: options.repetition, modelId: result.modelId, promptVariant: result.promptVariant,
    hubVersion: options.hubVersion, machine: { tscProcesses: tscProcesses(), loadAverage1m: loadavg()[0] },
  }
  const timings = { identity, person: personCounts(result), runs: [] }
  const databaseUrl = env.CONEXUS_EVAL_DATABASE_URL
  const logText = env.CONEXUS_HUB_LOG && existsSync(env.CONEXUS_HUB_LOG) ? readFileSync(env.CONEXUS_HUB_LOG, 'utf8') : null
  let storage = null
  let traceIds = []
  let reason = databaseUrl ? null : 'CONEXUS_EVAL_DATABASE_URL is not set'
  if (databaseUrl && result.projectId) {
    try {
      storage = evalStorage(databaseUrl)
      traceIds = await findTraceIds(createEvalMastra({ storage }), { projectId: result.projectId, builderRunIds: result.runs.map((run) => run.builderRunId) })
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error)
    }
  }
  for (const [index, run] of result.runs.entries()) {
    const entry = { builderRunId: run.builderRunId, block: null, reason }
    if (storage && traceIds[index]) {
      try {
        const { spans } = await (await storage.getStore('observability')).getTrace({ traceId: traceIds[index] })
        entry.block = timingBlock({ spans, run: { createdAt: run.createdAt, finishedAt: run.settledAt }, hubStages: logText ? hubTimingFromLog(logText, run.builderRunId) : null })
        entry.reason = null
      } catch (error) {
        entry.reason = error instanceof Error ? error.message : String(error)
      }
    } else if (storage) entry.reason = 'no finished trace for this run'
    timings.runs.push(entry)
  }
  await storage?.close?.()
  return timings
}

export async function runCase(options) {
  const rawCase = JSON.parse(readFileSync(resolve(options.case), 'utf8'))
  const caseFile = parseCase(rawCase)
  const missingSystem = typeof rawCase.missingSystem === 'string' ? rawCase.missingSystem : null
  const values = rawCase.person ? loadValues() : {}
  const sheet = rawCase.person ? fillSheet(parseSheet(rawCase.person), values) : null
  const person = sheet ? createPerson({ sheet, ...(options.personModel ? { model: options.personModel } : {}) }) : null
  const oracle = typeof rawCase.oracle === 'string' ? loadOracle(rawCase.oracle) : null
  const arm = options.arm ? resolveArm(options.arm) : null
  const promptVariant = options.promptVariant ?? arm?.promptVariant
  const modelId = options.model ?? arm?.model
  const runOptions = { ...options, person, model: modelId, promptVariant }
  const sendRequest = sheet ? fillValues(caseFile.request, values) : caseFile.request
  const statePath = options.statePath ?? resolveStatePath(options.baseUrl)
  const browser = await chromium.launch({ headless: !options.headed })
  const context = await browser.newContext({ storageState: statePath, viewport: { width: 1480, height: 920 } })
  const page = await context.newPage()
  // The product UI never names a prompt variant, so the eval adds it to each message the UI sends:
  // the first request, every repair, slice and correction. The Builder sees it in the request
  // context and nowhere else: not in the Project name, the request or the person's words.
  if (promptVariant) {
    await page.route('**/api/control/projects/*/builder-session/messages', (route) => route.continue({
      postData: JSON.stringify({ ...JSON.parse(route.request().postData() ?? '{}'), promptVariant }),
    }))
  }
  const startedAt = new Date().toISOString()
  const result = {
    schema: 'conexus.builder-eval/v1', startedAt, finishedAt: null, outcome: 'ERROR', error: null,
    case: options.case, arm: options.arm ?? null, gradeOnly: options.gradeOnly, request: caseFile.request, baseUrl: options.baseUrl,
    workspaceId: null, projectId: options.project ?? null, projectName: options.project ? null : (options.projectName ?? sheet?.projectName ?? defaultProjectName()),
    conversationId: null, modelId: modelId ?? null, promptVariant: promptVariant ?? null,
    sourceRevisionBefore: null, sourceRevisionAfter: null, filesChanged: [],
    runs: [], answers: [], lastCheckReport: null, lastCheckReportReason: null, refusal: null, repairIterations: 0, slicesContinued: 0, wallTimeToUsablePreviewMs: null, previewUrl: null,
    checks: { initial: [], afterReload: null }, previewText: null, screenshotPath: null, failure: null,
    oracle: null, correction: null, timings: null,
  }
  try {
    let requestSentAt = null
    if (options.gradeOnly) {
      result.request = null
      await openProject(page, options.baseUrl, options.project)
      result.sourceRevisionAfter = previewOf(await readSession(page, options.project))
      if (!result.sourceRevisionAfter) result.failure = 'NO_PREVIEW'
    } else {
      requestSentAt = await sendAndSettle(page, runOptions, { ...caseFile, request: sendRequest }, result)
    }

    mkdirSync(options.out, { recursive: true })
    if (!result.failure) {
      const { usablePreviewAt, rawPreviewText } = await gradePreview(page, { out: options.out, caseFile, result, maskValues: options.maskValues })
      if (requestSentAt !== null) result.wallTimeToUsablePreviewMs = usablePreviewAt - requestSentAt
      if (person && oracle) {
        const planText = result.answers.findLast((answer) => answer.kind === 'PLAN')?.text ?? null
        await sendCorrection(page, runOptions, result, { oracle, person, planText, rawFirst: rawPreviewText })
      }
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
          const reply = lastAssistantText(messages)
          result.refusal = { ...gradeRefusal(output, missingSystem, reply), reply: options.maskValues ? digitsMasked(reply) : reply }
        }
      }
    }

    if (options.maskValues) for (const answer of result.answers) answer.answer = digitsMasked(answer.answer)
    const ranAnyChecks = result.checks.initial.length > 0
    const initialOk = checksPassed(result.checks.initial)
    const reloadOk = result.checks.afterReload === null || checksPassed(result.checks.afterReload)
    // A bakeoff case is graded by the oracle alone; without its file the run is kept but not graded.
    const passed = missingSystem ? result.refusal?.score === 1
      : typeof rawCase.oracle === 'string' ? (oracle ? Boolean(result.oracle?.afterFirstPreview.passed) && !result.failure : null)
        : ranAnyChecks && initialOk && reloadOk
    result.outcome = passed === null ? 'UNGRADED' : passed ? 'PASS' : 'FAIL'
    result.timings = await collectTimings(result, options)
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
  process.stdout.write(`${JSON.stringify({ outcome: result.outcome, arm: result.arm, projectId: result.projectId, runs: result.runs.length, repairIterations: result.repairIterations, slicesContinued: result.slicesContinued, corrected: result.correction !== null, wallTimeToUsablePreviewMs: result.wallTimeToUsablePreviewMs, error: result.error }, null, 2)}\n`)
  return result.outcome === 'PASS' ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
