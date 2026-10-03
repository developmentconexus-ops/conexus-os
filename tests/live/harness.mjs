// The live harness: one Conexus (PostgreSQL, Keycloak, the real Hub serving the built web) and one
// headless Chromium for the whole suite, one browser context per flow. The model is a scripted
// Gemini behind the Hub's real model routing, and the Builder's sandboxes are directories (see
// local-sandbox.mjs). Run it with
//   node --test --test-isolation=none --test-global-setup=tests/live/harness.mjs tests/live/<flow>.test.mjs
// Boot and teardown are .agents/skills/verify/scripts/control.mjs's, not a second driver.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { chromium, expect } from '@playwright/test'
import { BROWSER_OPTIONS, cleanup, evidence, launch, query, seedModelDefaults, signIn } from '../../.agents/skills/verify/scripts/control.mjs'

/**
 * A flow a person depends on. `id` is `<area>.<flow>`, the shape the flow registry (#419) holds; `nome` is its pt-BR name.
 * @typedef {{ id: string, nome: string }} FlowDeclaration
 */
/**
 * What the scripted model streams for one call. A `thought` is the reasoning Gemini returns, a `call` a tool call.
 * @typedef {{ parts: Array<{ text: string } | { thought: string } | { call: { name: string, args: object } }> }} ModelTurn
 */
/**
 * What one request to the model carried.
 * @typedef {{ model: string, contents: Array<{ role: string, parts: Array<{ text?: string }> }>, declaresTools: boolean }} ModelCall
 */

const FLOW_ID = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/
const THREAD_TITLE = 'Contador simples'
const WORKSPACE_NAME = 'Fluxos ao vivo'

const geminiError = (response, status, message) => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: { code: status, message, status: 'INTERNAL' } }))
}

const partOf = (part) => {
  if ('text' in part) return { text: part.text }
  if ('thought' in part) return { text: part.thought, thought: true }
  return { functionCall: { name: part.call.name, args: part.call.args } }
}

/** Gemini's streamGenerateContent as the Hub's router and Mastra's Google provider read it: one SSE event per part, then the finish. */
const startScriptedModel = () => new Promise((settle, reject) => {
  /** @type {ModelTurn[]} */
  const queue = []
  /** @type {ModelCall[]} */
  const calls = []
  const unanswered = []
  const server = createServer(async (request, response) => {
    const generate = /^\/v1beta\/models\/([^:/]+):(streamGenerateContent|generateContent)$/.exec(new URL(request.url, 'http://model').pathname)
    if (request.method !== 'POST' || !generate) return geminiError(response, 404, 'not found')
    let text = ''
    for await (const piece of request) text += piece
    const body = JSON.parse(text)
    const call = { model: generate[1], contents: body.contents, declaresTools: Array.isArray(body.tools) && body.tools.length > 0 }
    // Not the agent's turn: Mastra names the thread after it with a one-shot `generateContent` on the memory model.
    if (generate[2] === 'generateContent') {
      response.writeHead(200, { 'content-type': 'application/json' })
      return response.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: THREAD_TITLE }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } }))
    }
    calls.push(call)
    const turn = queue.shift()
    if (!turn) {
      unanswered.push(call)
      return geminiError(response, 500, 'LIVE_MODEL_NO_SCRIPTED_TURN')
    }
    // A turn may hold its answer, so a flow can look at the screen while the model "thinks".
    if (turn.delayMs) await new Promise((wake) => { setTimeout(wake, turn.delayMs) })
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    const send = (chunk) => response.write(`data: ${JSON.stringify(chunk)}\r\n\r\n`)
    for (const part of turn.parts) send({ candidates: [{ content: { role: 'model', parts: [partOf(part)] } }] })
    send({ candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 } })
    response.end()
  })
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => settle({
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    /** Queues one reply per model call, streamed in order. */
    script: (...turns) => { queue.push(...turns) },
    pending: () => queue.length,
    unanswered: () => unanswered.length,
    reset: () => { queue.length = 0; calls.length = 0; unanswered.length = 0 },
    close: () => new Promise((done) => { server.closeAllConnections(); server.close(done) }),
  }))
})

/** @type {{ model: Awaited<ReturnType<typeof startScriptedModel>>, state: object, browser: import('@playwright/test').Browser, storageState: object, sandboxRoot: string, workspaceId: string } | undefined} */
let suite
let started
const timing = { launch: 0, setup: 0 }

// The page's console, uncaught errors, failed requests and main-frame navigations, for the evidence directory.
const recordPage = (page, log) => {
  const line = (text) => log.push(`${new Date().toISOString()} ${text}`)
  page.on('console', (message) => line(`console.${message.type()} ${page.url()} ${message.text()}`))
  page.on('pageerror', (error) => line(`pageerror ${page.url()} ${error.stack ?? error.message}`))
  page.on('requestfailed', (request) => line(`requestfailed ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`))
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) line(`navigated ${frame.url()}`) })
}

const connectGoogle = async (page) => {
  await page.goto('/settings/models')
  await page.getByRole('button', { name: 'Conectar com o Google' }).click()
  const link = page.getByRole('link', { name: 'Abrir a entrada do Google' })
  const signInUrl = new URL(await link.getAttribute('href'))
  await page.getByLabel('Endereço da aba que não abriu').fill(`http://localhost:51121/oauth-callback?state=${signInUrl.searchParams.get('state')}&code=verify`)
  await page.getByRole('button', { name: 'Concluir' }).click()
  await expect(page.getByText('Conectado com a sua conta Google.')).toBeVisible({ timeout: 30_000 })
  // The sign-in opened a tab that cannot load Google; the person closes it.
  for (const tab of page.context().pages()) if (tab !== page) await tab.close()
}

const createWorkspace = async (page) => {
  await page.goto('/workspaces/new')
  await page.getByLabel('Nome do Workspace').fill(WORKSPACE_NAME)
  await page.getByRole('button', { name: 'Criar Workspace' }).click()
  await expect(page.getByRole('heading', { name: 'O que vamos construir?' })).toBeVisible()
  return /\/workspaces\/([^/]+)\/projects/.exec(new URL(page.url()).pathname)[1]
}

export const globalSetup = async () => {
  started = Date.now()
  let state
  let page
  const setupLog = []
  try {
    const model = await startScriptedModel()
    suite = { model, sandboxRoot: mkdtempSync(join(tmpdir(), 'conexus-live-sandboxes-')) }
    state = await launch({ browser: false, scripted: { modelUrl: model.url, sandboxRoot: suite.sandboxRoot }, onState: (run) => { suite.state = run } })
    suite.state = state
    timing.launch = Date.now() - started
    const setupStarted = Date.now()
    const { headless, args, ...contextOptions } = BROWSER_OPTIONS
    suite.contextOptions = { ...contextOptions, baseURL: state.origin }
    suite.browser = await chromium.launch({ headless, args: [...args] })
    const context = await suite.browser.newContext(suite.contextOptions)
    page = await context.newPage()
    recordPage(page, setupLog)
    await signIn(page, state)
    await connectGoogle(page)
    await seedModelDefaults(state)
    suite.workspaceId = await createWorkspace(page)
    suite.storageState = await context.storageState()
    await context.close()
    timing.setup = Date.now() - setupStarted
  } catch (error) {
    if (state) {
      await page?.screenshot({ path: evidence(state, 'live', 'setup.failure.png') }).catch(() => undefined)
      writeFileSync(evidence(state, 'live', 'setup.console.log'), `${setupLog.join('\n')}\n`)
    }
    await globalTeardown()
    throw error
  }
}

// node:test runs globalTeardown only once the event loop is empty, and the Hub, the browser and the
// model server keep it alive: the suite would hang after its last test. So the first flow also
// registers the teardown as a root `after`, which runs when the tests end; globalTeardown stays for a setup that fails.
let teardownRegistered = false

export const globalTeardown = async () => {
  if (!suite) return
  const tearingDown = Date.now()
  const { model, state, browser, sandboxRoot } = suite
  suite = undefined
  await browser?.close().catch(() => undefined)
  await model.close()
  if (state) await cleanup(state)
  rmSync(sandboxRoot, { recursive: true, force: true })
  const seconds = (milliseconds) => (milliseconds / 1000).toFixed(1)
  console.log(`live timing: launch ${seconds(timing.launch)}s, setup ${seconds(timing.setup)}s, flows ${seconds(tearingDown - (started + timing.launch + timing.setup))}s, teardown ${seconds(Date.now() - tearingDown)}s, total ${seconds(Date.now() - started)}s`)
}

/**
 * Registers one flow as a test named `<id>: <nome>`. The body gets a fresh browser context signed in as the
 * suite's person, the scripted model, and the Hub: `hub.db(sql)` reads, `hub.origin`, `hub.workspaceId`, `hub.evidenceDir`
 * (which holds `hub.log`), and `hub.signIn(page)` signs the suite's person in through Keycloak's form when the page holds
 * no Keycloak session. A scripted turn with `delayMs` holds its answer that long.
 * @param {FlowDeclaration} declaration
 * @param {(world: { page: import('@playwright/test').Page, model: Pick<Awaited<ReturnType<typeof startScriptedModel>>, 'script' | 'calls'>, hub: { origin: string, workspaceId: string, evidenceDir: string, db(sql: string): Promise<object[]>, signIn(page: import('@playwright/test').Page): Promise<void> } }) => Promise<void>} body
 */
export const liveFlow = (declaration, body) => {
  assert.match(declaration.id, FLOW_ID, `flow id ${declaration.id} is not <area>.<flow>`)
  if (!teardownRegistered) {
    teardownRegistered = true
    after(globalTeardown)
  }
  return test(`${declaration.id}: ${declaration.nome}`, async () => {
    assert.ok(suite, 'the live harness is not set up: run with --test-global-setup=tests/live/harness.mjs')
    const { model, state, browser, storageState, contextOptions, workspaceId } = suite
    const context = await browser.newContext({ ...contextOptions, storageState })
    const page = await context.newPage()
    const log = []
    const pageErrors = []
    recordPage(page, log)
    page.on('pageerror', (error) => { pageErrors.push(error.message) })
    model.reset()
    try {
      await body({
        page,
        model: { script: model.script, calls: model.calls },
        hub: { origin: state.origin, workspaceId, evidenceDir: state.evidenceDir, db: (sql) => query(state, sql), signIn: (signingIn) => signIn(signingIn, state) },
      })
      assert.deepEqual(pageErrors, [], 'no uncaught error in the page')
      assert.equal(model.unanswered(), 0, 'every model call had a scripted turn')
      assert.equal(model.pending(), 0, 'every scripted turn was streamed')
    } catch (error) {
      await page.screenshot({ path: evidence(state, 'live', `${declaration.id}.failure.png`) }).catch(() => undefined)
      throw error
    } finally {
      writeFileSync(evidence(state, 'live', `${declaration.id}.console.log`), `${log.join('\n')}\n`)
      await context.close()
    }
  })
}
