import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { startWebServer } from './web-dev-server.mjs'


const FACTORY_CONTROLLER = '**/api/mastra-factory/agent-controller/code'
// The model and a conversation's own state are the controller's, so the screen reads both from
// the Factory and holds neither. A model with no key on the controller is never offered.
const BUILDER_MODELS = [
  { id: 'anthropic/claude-opus-4-5', provider: 'anthropic', modelName: 'claude-opus-4-5', hasApiKey: true },
  { id: 'anthropic/claude-sonnet-4-5', provider: 'anthropic', modelName: 'claude-sonnet-4-5', hasApiKey: true },
  { id: 'groq/llama-4', provider: 'groq', modelName: 'llama-4', hasApiKey: false },
]
const SELECTED_MODEL = BUILDER_MODELS[0].id
const SELECTED_MODEL_NAME = BUILDER_MODELS[0].modelName
const conversation = (conversationId, title, createdAt = '2026-09-20T12:00:00.000Z') => ({ conversationId, title, createdAt })

const threadIdOf = (url, offsetFromEnd) => decodeURIComponent(new URL(url).pathname.split('/').at(offsetFromEnd))

const trackLegacyRequests = (page) => {
  const legacyRequests = []
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/mastra/')) legacyRequests.push(request.url()) })
  return legacyRequests
}

// Every Project is developed through the Factory mount: the Hub lists and creates its
// conversations, and each conversation is its own session on the Factory's mount, keyed by the
// conversation id and holding one thread of that id.
const routeFactory = async (page, projectId, state) => {
  await page.route(`**/api/control/projects/${projectId}/conversations`, (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: state.conversations }) })
    const { conversationId } = route.request().postDataJSON()
    const created = conversation(conversationId, null, new Date().toISOString())
    state.conversations = [created, ...state.conversations]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ conversation: created }) })
  })
  await page.route('**/api/control/model-accounts/models', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: state.models ?? BUILDER_MODELS }) }))
  await page.route(`${FACTORY_CONTROLLER}/sessions/*`, (route) => {
    const id = threadIdOf(route.request().url(), -1)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelId: state.modelId, modeId: 'build', threadId: id }) })
  })
  await page.route(`${FACTORY_CONTROLLER}/sessions/*/model`, (route) => {
    state.modelId = route.request().postDataJSON().modelId
    state.modelSwitches.push(state.modelId)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`${FACTORY_CONTROLLER}/sessions/*/threads/*/messages*`, (route) => {
    const id = threadIdOf(route.request().url(), -2)
    state.messageReads.push(id)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: state.messages[id] ?? [] }) })
  })
}

const factoryState = (conversations, messages = {}, modelId = SELECTED_MODEL) =>
  ({ conversations, messages, modelId, modelSwitches: [], messageReads: [] })
const assistantMessage = (id, text) => ({ id, role: 'assistant', createdAt: new Date().toISOString(), content: { format: 2, parts: [{ type: 'text', text }] } })
const userMessage = (id, text) => ({ id, role: 'user', createdAt: new Date().toISOString(), content: { format: 2, parts: [{ type: 'text', text }] } })
const sse = (...events) => ({
  status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
})

// The composer names the chosen model on a button whose accessible name starts with "Modelo ",
// which opens a single popover holding the search field and the provider-grouped list directly
// (no nested combobox popup).
const openModelPicker = async (page) => {
  await page.getByRole('button', { name: /^Modelo /, exact: false }).click()
  await page.locator('.cx-model-popover').waitFor()
}
const chooseModel = async (page, modelName) => {
  await openModelPicker(page)
  await page.getByRole('option', { name: modelName }).click()
  await page.locator('.cx-model-popover').waitFor({ state: 'detached' })
}
const messageBox = (page) => page.locator('[aria-label="Mensagem para o agente"]')
const NO_MODEL_PLACEHOLDER = 'Escolha um modelo para começar'
// The chat header's Combobox names the current conversation and lists the others as options. A
// closing popup stays mounted through its exit, so the switcher opens only once no other list is
// on screen, and the titles are read once the expected number of options arrived.
const conversationOptions = async (page) => {
  await page.waitForFunction(() => !document.querySelector('[role="option"]'))
  await page.getByRole('combobox', { name: 'Conversa', exact: true }).click()
  return page.getByRole('option')
}
const readConversationTitles = async (page, expected = 1) => {
  const options = await conversationOptions(page)
  await options.nth(expected - 1).waitFor()
  const titles = await options.allTextContents()
  await page.keyboard.press('Escape')
  return titles
}
const switchConversationTo = async (page, title) => {
  await (await conversationOptions(page)).filter({ hasText: title }).click()
}
// CodeMirror splits a line across syntax-highlighting spans, so the file's content is read from
// the whole .cm-content container rather than matched as one exact text node.
const codeContentIncludes = (page, needle) =>
  page.waitForFunction((text) => document.querySelector('.cx-code .cm-content')?.textContent?.includes(text) ?? false, needle)

test('Project Build uses the Project session, the BuilderRun API and the native Mastra turn', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000001'
  const projectId = '70000000-0000-4000-8000-000000000002'
  const runId = '70000000-0000-4000-8000-000000000003'
  const conversationId = 'conversation-counter'
  const baseSourceRevision = 'a'.repeat(40)
  const sourceRevision = 'b'.repeat(40)
  const artifactRevisionId = '70000000-0000-4000-8000-000000000004'
  const artifactDigest = 'c'.repeat(64)
  let run = null
  let buildCount = 0
  let runFinished = false
  const threadMessages = []
  const requests = []
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)
  // The second send settles as RESPONSE_ONLY: Plan mode is gone, so a response-only outcome is
  // reached by an ordinary BUILD send that changes nothing, not by a separate mode.
  const session = () => ({
    projectId,
    latestBuilderRun: run && runFinished
      ? { ...run, state: 'SUCCEEDED', phase: null, resultSourceRevision: requests.length >= 2 ? null : sourceRevision, resultKind: requests.length >= 2 ? 'RESPONSE_ONLY' : 'SOURCE_CHANGED' }
      : run,
    latestCodeChangingRun: buildCount > 0 ? { baseSourceRevision, resultSourceRevision: sourceRevision, resultKind: 'SOURCE_CHANGED' } : null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: buildCount > 0 ? sourceRevision : null, lastGoodArtifactRevisionId: buildCount > 0 ? artifactRevisionId : null, lastGoodArtifactDigest: buildCount > 0 ? artifactDigest : null },
    mode: run?.mode ?? 'BUILD', runHistory: [],
  })
  const state = factoryState([conversation(conversationId, 'Contador')], { [conversationId]: threadMessages })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeFactory(page, projectId, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Counter', projectRevision: 'revision', archived: false }) }))
  const previewRequests = []
  const forbiddenRequests = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (new RegExp(`/api/control/projects/${projectId}/(?:session/turns|changes(?:/|$)|preview(?:$|-preparations|-launches))`).test(path)) forbiddenRequests.push(request.url())
    if (/\/builder-session\/runs\/[^/]+\/stream$/.test(path)) forbiddenRequests.push(request.url())
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    const body = route.request().postDataJSON()
    requests.push({ body, key: route.request().headers()['idempotency-key'] })
    buildCount += body.mode === 'BUILD' ? 1 : 0
    threadMessages.push(userMessage(`user-${threadMessages.length + 1}`, body.content))
    runFinished = false
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'RUNNING', phase: 'AGENT', mode: body.mode, baseSourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, failureCategory: null, requestText: body.content, createdAt: new Date().toISOString() }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ builderRun: run }) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session()) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, async (route) => {
    previewRequests.push(route.request().postDataJSON())
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ entryUrl: `${origin}/preview-entry`, previewUrl: `${origin}/preview`, entryGrant: 'grant', artifactRevisionId, artifactDigest, expiresAt: new Date(Date.now() + 60_000).toISOString() }) })
  })
  await page.route(`**/api/control/projects/${projectId}/source/tree*`, (route) => {
    const revision = new URL(route.request().url()).searchParams.get('sourceRevision')
    // The tree lists a directory entry too: nest() drops a file whose parent folder was never
    // listed, and the file tree lens is asserted by the treeitem it renders under that folder.
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision: revision, entries: [{ path: 'app', kind: 'DIRECTORY' }, { path: 'app/index.html', kind: 'FILE' }] }) })
  })
  await page.route(`**/api/control/projects/${projectId}/source/file*`, (route) => {
    const revision = new URL(route.request().url()).searchParams.get('sourceRevision')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision: revision, path: 'app/index.html', content: revision === baseSourceRevision ? '<main>Counter</main>' : '<main>Counter v2</main>' }) })
  })
  await page.route(`**/api/control/projects/${projectId}/source/compare*`, (route) => {
    const url = new URL(route.request().url())
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      baseSourceRevision: url.searchParams.get('baseSourceRevision'), resultSourceRevision: url.searchParams.get('resultSourceRevision'),
      files: [{ path: 'app/index.html', status: 'MODIFIED', previousPath: null }],
    }) })
  })
  const streamScopes = []
  await page.route(`${FACTORY_CONTROLLER}/sessions/*/stream*`, (route) => {
    streamScopes.push(new URL(route.request().url()).searchParams.get('sessionScope'))
    const live = assistantMessage('assistant-live-1', 'Aplicando a alteração')
    setTimeout(() => {
      threadMessages.push(assistantMessage('assistant-live-1', 'Aplicando a alteração'), assistantMessage(`assistant-final-${threadMessages.length}`, 'Build concluído'))
      runFinished = true
    }, 300)
    return route.fulfill(sse(
      { type: 'message_start', message: assistantMessage('assistant-live-1', 'Inspecionando o app') },
      { type: 'message_update', message: live },
      { type: 'agent_end', reason: 'complete' },
    ))
  })

  // The old project-detail page and its "Construir com o Conexus" link are gone: a Project opens
  // straight onto its most recent conversation.
  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByLabel('Mensagem para o agente').waitFor()
  const firstSend = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 201)
  await page.getByLabel('Mensagem para o agente').fill('Crie um contador até 100 interativo')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await firstSend
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].body, { content: 'Crie um contador até 100 interativo', mode: 'BUILD', conversationId })
  assert.ok(requests[0].key)
  await page.locator('.cx-messages').getByText('Crie um contador até 100 interativo', { exact: true }).waitFor()
  await page.getByText('Aplicando a alteração', { exact: true }).waitFor()
  assert.deepEqual(streamScopes.slice(0, 1), [`builder:${runId}`])
  await page.getByTitle('Prévia do aplicativo').waitFor()
  assert.deepEqual(previewRequests, [{}])
  await page.locator('.cx-messages').getByText('Build concluído', { exact: true }).waitFor()
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.cx-messages').getByText('Aplicando a alteração', { exact: true }).count(), 1,
    'the live message and its persisted twin share an id and render once')
  assert.equal(await page.locator('.cx-messages .builder-turn-user').count(), 1,
    'a run whose request is already a Mastra message renders one user bubble, not two')
  assert.equal(await page.locator('.cx-messages .builder-turn-reason').count(), 0,
    'a run that succeeded is given no failure reason')
  // The result card closes out the code-changing turn: the Project's own name, its first version,
  // that the build passed, and how many files it touched.
  await page.locator('.cx-result-card').getByText('Counter · versão 1 · Build passou', { exact: true }).waitFor()
  await page.locator('.cx-result-card').getByText('1 arquivo', { exact: true }).waitFor()
  assert.deepEqual(forbiddenRequests, [])
  assert.deepEqual([...new Set(state.messageReads)], [conversationId],
    'the messages read are the selected conversation\'s own thread, never a name derived from the Project')
  const previewBox = await page.locator('.cx-stage').boundingBox()
  const panelBox = await page.locator('.cx-chat').boundingBox()
  assert.ok(previewBox && panelBox && previewBox.width > panelBox.width)
  const frameBox = await page.locator('.cx-frame iframe').boundingBox()
  const frameStackBox = await page.locator('.cx-frame').boundingBox()
  assert.ok(frameBox && frameStackBox && frameBox.width >= frameStackBox.width * 0.95 && frameBox.height >= 384)

  await page.getByRole('tab', { name: 'Código' }).click()
  await page.getByRole('treeitem', { name: 'index.html' }).waitFor()
  await codeContentIncludes(page, '<main>Counter v2</main>')
  await page.getByRole('tab', { name: 'Sobre' }).click()
  await page.getByRole('heading', { name: 'Sobre este pedido' }).waitFor()
  await page.getByRole('tab', { name: 'Alterações' }).click()
  await page.getByText('Alterado', { exact: true }).waitFor()

  // Plan mode is removed from the product: a second BUILD send that settles RESPONSE_ONLY is what
  // used to be exercised by switching into Plan.
  const secondSend = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 201)
  await page.getByLabel('Mensagem para o agente').fill('Explique o contador')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await secondSend
  await page.locator('.cx-messages').getByText('Explique o contador', { exact: true }).waitFor()
  await page.locator('.cx-chat-step', { hasText: 'Respondeu' }).waitFor()

  // The lens is carried in the URL, and the test last selected Alterações; go back to Prévia
  // before reloading so the reload is checked against the lens the assertion actually cares about.
  await page.getByRole('tab', { name: 'Prévia' }).click()
  await page.reload()
  await page.getByText('Crie um contador até 100 interativo', { exact: true }).first().waitFor()
  await page.getByTitle('Prévia do aplicativo').waitFor()
  assert.equal(await page.getByText('BuilderRun', { exact: true }).count(), 0)
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

test('new Project lands directly in Build and can send its first Builder message', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000011'
  const workspaceId = '70000000-0000-4000-8000-000000000012'
  const projectId = '70000000-0000-4000-8000-000000000013'
  const runId = '70000000-0000-4000-8000-000000000014'
  const sourceRevision = 'd'.repeat(40)
  let run = null
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)
  const conversationId = 'conversation-new-project'
  const session = () => ({
    projectId,
    latestBuilderRun: run, latestCodeChangingRun: null, preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    mode: 'BUILD', runHistory: [],
  })
  const conversationMessages = []
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [{ workspaceId, name: 'New Workspace' }], projects: [] }) }))
  await routeFactory(page, projectId, factoryState([conversation(conversationId, 'Primeira conversa')], { [conversationId]: conversationMessages }))
  await page.route(`**/api/control/workspaces/${workspaceId}/projects`, async (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'New Counter', projectRevision: 'created', archived: false }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'New Counter', projectRevision: 'created', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session()) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    const body = route.request().postDataJSON()
    conversationMessages.push(userMessage('new-message', body.content))
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'QUEUED', phase: null, mode: body.mode, baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ builderRun: run }) })
  })
  await page.goto(`${origin}/workspaces/${workspaceId}/projects/new`)
  await page.getByLabel('Nome do Projeto').fill('New Counter')
  await page.getByRole('button', { name: 'Criar Projeto' }).click()
  // Creation opens /projects/:p, which lands on the Project's conversation in Construir.
  await page.waitForURL(`${origin}/projects/${projectId}/c/${conversationId}`)
  await page.getByLabel('Mensagem para o agente').waitFor()
  const firstSend = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 201)
  await page.getByLabel('Mensagem para o agente').fill('Crie um contador')
  await page.getByRole('button', { name: 'Enviar' }).click()
  // Typed while the send is still in flight: there is no success toast any more, so the request
  // reaching the route is what proves the draft field was free to keep taking input.
  await page.getByLabel('Mensagem para o agente').fill('texto digitado depois')
  await firstSend
  assert.equal((await page.getByLabel('Mensagem para o agente').inputValue()), 'texto digitado depois')
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

test('a Project holds several conversations, and switching between them leaves the source and the last good Preview alone', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000081'
  const projectId = '70000000-0000-4000-8000-000000000082'
  const sourceRevision = '8'.repeat(40)
  const artifactRevisionId = '70000000-0000-4000-8000-000000000083'
  const counter = conversation('conversation-counter', 'Contador')
  const clock = conversation('conversation-clock', 'Relógio')
  // The session arrives with no model chosen, which is the state a Project that has never built is in.
  const state = factoryState([counter, clock], {
    [counter.conversationId]: [userMessage('counter-1', 'Crie um contador'), assistantMessage('counter-2', 'Contador pronto')],
    [clock.conversationId]: [userMessage('clock-1', 'Crie um relógio'), assistantMessage('clock-2', 'Relógio pronto')],
  }, '')
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const legacyRequests = trackLegacyRequests(page)

  const previewRequests = []
  const sourceReads = []
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeFactory(page, projectId, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Conversas', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: sourceRevision, lastGoodArtifactRevisionId: artifactRevisionId, lastGoodArtifactDigest: 'f'.repeat(64) },
    mode: 'BUILD', runHistory: [],
  }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, (route) => {
    previewRequests.push(route.request().url())
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ entryUrl: `${origin}/preview-entry`, previewUrl: `${origin}/preview`, entryGrant: 'grant', artifactRevisionId, artifactDigest: 'f'.repeat(64), expiresAt: new Date(Date.now() + 60_000).toISOString() }) })
  })
  await page.route(`**/api/control/projects/${projectId}/source/tree*`, (route) => {
    sourceReads.push(new URL(route.request().url()).searchParams.get('sourceRevision'))
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision, entries: [{ path: 'app/index.html', kind: 'FILE' }] }) })
  })
  await page.route(`**/api/control/projects/${projectId}/source/file*`, (route) => {
    sourceReads.push(new URL(route.request().url()).searchParams.get('sourceRevision'))
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision, path: 'app/index.html', content: '<main>Contador</main>' }) })
  })

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.getByTitle('Prévia do aplicativo').waitFor()
  assert.equal(previewRequests.length, 1)

  assert.equal(await messageBox(page).getAttribute('placeholder'), NO_MODEL_PLACEHOLDER)
  assert.equal(await page.getByRole('button', { name: 'Enviar' }).isDisabled(), true)
  await chooseModel(page, SELECTED_MODEL_NAME)
  // The send button also stays disabled on an empty draft, so a chosen model is proven by the
  // composer's placeholder leaving its "no model" wording, not by the button alone.
  await page.waitForFunction((placeholder) => document.querySelector('[aria-label="Mensagem para o agente"]')?.getAttribute('placeholder') !== placeholder, NO_MODEL_PLACEHOLDER)
  assert.deepEqual(state.modelSwitches, [SELECTED_MODEL])

  assert.deepEqual(await readConversationTitles(page, 2), ['Contador', 'Relógio'])
  await page.locator('.cx-messages').getByText('Contador pronto', { exact: true }).waitFor()
  assert.equal(await page.locator('.cx-messages').getByText('Relógio pronto', { exact: true }).count(), 0)

  await switchConversationTo(page, 'Relógio')
  await page.locator('.cx-messages').getByText('Relógio pronto', { exact: true }).waitFor()
  assert.equal(await page.locator('.cx-messages').getByText('Contador pronto', { exact: true }).count(), 0)
  assert.equal((await page.getByRole('combobox', { name: 'Conversa', exact: true }).innerText()).trim(), 'Relógio')
  // The conversation is the chat's. The Preview belongs to the Project and is not relaunched.
  assert.equal(previewRequests.length, 1)
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/preview-entry`)

  await page.getByRole('tab', { name: 'Código' }).click()
  await page.getByText('<main>Contador</main>', { exact: true }).waitFor()
  const readsBeforeSwitch = [...sourceReads]
  await switchConversationTo(page, 'Contador')
  await page.locator('.cx-messages').getByText('Contador pronto', { exact: true }).waitFor()
  assert.equal(await page.getByText('<main>Contador</main>', { exact: true }).count(), 1)
  assert.deepEqual(sourceReads, readsBeforeSwitch,
    'switching conversation re-read the source, which belongs to the Project and not to the conversation')
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

test('selecting a past run moves Details and Diff onto that run, and the composer names the chosen model', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000061'
  const projectId = '70000000-0000-4000-8000-000000000062'
  const olderRunId = '70000000-0000-4000-8000-000000000063'
  const latestRunId = '70000000-0000-4000-8000-000000000064'
  const olderBase = '1'.repeat(40)
  const olderResult = '2'.repeat(40)
  const latestBase = '3'.repeat(40)
  const latestResult = '4'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const legacyRequests = trackLegacyRequests(page)

  const conversationId = 'conversation-history'
  const settled = (builderRunId, baseSourceRevision, resultSourceRevision) => ({
    builderRunId, projectId, conversationId, state: 'SUCCEEDED', phase: null, mode: 'BUILD',
    baseSourceRevision, resultSourceRevision, resultKind: 'SOURCE_CHANGED', failureCode: null, failureCategory: null,
    requestText: `pedido ${builderRunId}`, createdAt: '2026-09-20T12:00:00.000Z',
  })
  const tracedRuns = []
  let compareQuery = null
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeFactory(page, projectId, factoryState([conversation(conversationId, 'Histórico')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'History', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: settled(latestRunId, latestBase, latestResult),
    latestCodeChangingRun: { baseSourceRevision: latestBase, resultSourceRevision: latestResult, resultKind: 'SOURCE_CHANGED' },
    preview: { workingSourceRevision: latestResult, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    mode: 'BUILD',
    runHistory: [settled(latestRunId, latestBase, latestResult), settled(olderRunId, olderBase, olderResult)],
  }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/runs/*/trace`, (route) => {
    tracedRuns.push(route.request().url().split('/runs/')[1].split('/')[0])
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inferences: [], sandboxCommands: [] }) })
  })
  // The compare route belongs to the Diff lens now (source/tree was the pre-Diff mechanism); the
  // query it receives is what proves Diff followed the selected run, not the latest one.
  await page.route(`**/api/control/projects/${projectId}/source/compare*`, (route) => {
    const url = new URL(route.request().url())
    compareQuery = { baseSourceRevision: url.searchParams.get('baseSourceRevision'), resultSourceRevision: url.searchParams.get('resultSourceRevision') }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...compareQuery, files: [] }) })
  })

  await page.goto(`${origin}/projects/${projectId}/build`)
  // The model the next run uses is the controller's own selection, and the composer shows it.
  await page.getByRole('button', { name: new RegExp(`^Modelo ${SELECTED_MODEL_NAME}, `) }).waitFor()
  await openModelPicker(page)
  await page.getByRole('option', { name: 'claude-opus-4-5' }).waitFor()
  await page.getByRole('option', { name: 'claude-sonnet-4-5' }).waitFor()
  assert.equal(await page.getByRole('option').count(), 2, 'a model the controller has no key for is never offered')
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'Sobre' }).click()
  await page.getByText('Detalhes técnicos', { exact: true }).click()
  await page.locator('.cx-hash-table').getByTitle(latestRunId).waitFor()
  await page.locator('.cx-run-entry').nth(1).click()
  await page.locator('.cx-hash-table').getByTitle(olderRunId).waitFor()
  assert.equal(tracedRuns.at(-1), olderRunId, `the trace followed ${tracedRuns.at(-1)} instead of the selected run`)

  await page.getByRole('tab', { name: 'Alterações' }).click()
  await page.getByText('Esta execução não mudou nenhum arquivo.', { exact: true }).waitFor()
  assert.deepEqual(compareQuery, { baseSourceRevision: olderBase, resultSourceRevision: olderResult },
    `the Diff read ${JSON.stringify(compareQuery)} instead of the selected run's own revisions`)
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

test('a send whose outcome is unknown reuses its idempotency key on an identical resend', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000071'
  const projectId = '70000000-0000-4000-8000-000000000072'
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const legacyRequests = trackLegacyRequests(page)

  const keys = []
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeFactory(page, projectId, factoryState([conversation('conversation-idempotency', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Idempotency', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: null, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    mode: 'BUILD', runHistory: [],
  }) }))
  // The first attempt dies on the wire, so the browser never learns whether the server acted.
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, (route) => {
    keys.push(route.request().headers()['idempotency-key'])
    return keys.length === 1 ? route.abort('connectionreset') : route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ builderRun: { builderRunId: '70000000-0000-4000-8000-000000000073', projectId, state: 'QUEUED', phase: null, mode: 'BUILD', baseSourceRevision: '5'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null, failureCategory: null } }),
    })
  })

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.getByLabel('Mensagem para o agente').fill('Crie um contador')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.getByText('Não foi possível enviar o pedido. Tente de novo.', { exact: true }).waitFor()
  const retry = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 201)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await retry
  assert.equal(keys.length, 2)
  assert.equal(keys[0], keys[1], `a resend of the same text issued a second key: ${keys.join(' vs ')}`)
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

test('Preview launch failure is terminal for its key until explicit retry and keeps the last good frame', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000021'
  const projectId = '70000000-0000-4000-8000-000000000022'
  const sourceA = 'a'.repeat(40)
  const sourceB = 'b'.repeat(40)
  const artifactA = '70000000-0000-4000-8000-000000000023'
  const artifactB = '70000000-0000-4000-8000-000000000024'
  const digestA = 'c'.repeat(64)
  const digestB = 'd'.repeat(64)
  let phase = 'A'
  let previewRequests = 0
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeFactory(page, projectId, factoryState([conversation('conversation-preview-continuity', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Preview continuity', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    const useB = phase === 'B'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, latestBuilderRun: null, latestCodeChangingRun: null, mode: 'BUILD', runHistory: [],
      preview: {
        workingSourceRevision: useB ? sourceB : sourceA,
        lastGoodSourceRevision: useB ? sourceB : sourceA,
        lastGoodArtifactRevisionId: useB ? artifactB : artifactA,
        lastGoodArtifactDigest: useB ? digestB : digestA,
      },
    }) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    phase = 'B'
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      builderRun: { builderRunId: '70000000-0000-4000-8000-000000000025', projectId, state: 'SUCCEEDED', phase: null, mode: 'BUILD', baseSourceRevision: sourceA, resultSourceRevision: sourceB, resultKind: 'SOURCE_CHANGED', failureCode: null },
    }) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, async (route) => {
    previewRequests += 1
    if (previewRequests === 2) return route.fulfill({ status: 503, contentType: 'application/problem+json', body: '{}' })
    const useB = previewRequests >= 3
    const mismatched = previewRequests === 3
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      entryUrl: `${origin}/${useB ? 'entry-b' : 'entry-a'}`, previewUrl: `${origin}/${useB ? 'preview-b' : 'preview-a'}`,
      entryGrant: useB ? 'grant-b' : 'grant-a', artifactRevisionId: mismatched ? artifactA : useB ? artifactB : artifactA,
      artifactDigest: mismatched ? digestA : useB ? digestB : digestA, expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }) })
  })
  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.getByTitle('Prévia do aplicativo').waitFor()
  assert.equal(previewRequests, 1)
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-a`)

  await page.getByLabel('Mensagem para o agente').fill('Atualize o contador')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.getByText('Não foi possível abrir a prévia atual.', { exact: true }).waitFor()
  assert.equal(previewRequests, 2)
  assert.equal(await page.getByTitle('Prévia do aplicativo').count(), 1)
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-a`)
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  assert.equal(previewRequests, 3)
  await page.getByText('Não foi possível abrir a prévia atual.', { exact: true }).waitFor()
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-a`)
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await page.locator(`form[method="post"][action="${origin}/entry-b"]`).waitFor({ state: 'attached' })
  assert.equal(previewRequests, 4)
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-b`)
  const reopenRequest = page.waitForRequest((request) => request.url().endsWith('/builder-session/preview') && request.method() === 'POST')
  await page.getByRole('button', { name: 'Recarregar prévia' }).click()
  await reopenRequest
  assert.equal(previewRequests, 5)
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

test('a run that failed before the agent still shows the request and names why it failed', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000041'
  const projectId = '70000000-0000-4000-8000-000000000042'
  const runId = '70000000-0000-4000-8000-000000000043'
  const sourceRevision = '9'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)
  // Nothing reached Mastra: the run failed while the sandbox was being prepared, so the thread is
  // empty and the row is the only record of what the operator asked for.
  const conversationId = 'conversation-pre-agent-failure'
  const failedRun = {
    builderRunId: runId, projectId, conversationId, state: 'FAILED', phase: null, mode: 'BUILD',
    baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
    failureCode: 'BUILDER_SOURCE_MATERIALIZATION_REFUSED', failureCategory: 'ENVIRONMENT_PREPARATION_FAILED',
    requestText: 'Crie um contador até 100 interativo', createdAt: '2026-09-20T12:00:00.000Z',
  }
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeFactory(page, projectId, factoryState([conversation(conversationId, 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Pre-agent failure', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: failedRun, latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    mode: 'BUILD', runHistory: [failedRun],
  }) }))
  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.locator('.cx-messages').getByText('Crie um contador até 100 interativo', { exact: true }).waitFor()
  await page.locator('.cx-messages .builder-turn-reason').getByText('Não foi possível preparar o ambiente de código. Tente enviar o pedido novamente.', { exact: true }).waitFor()
  assert.equal(await page.locator('.cx-messages .builder-turn-user').count(), 1,
    'the run appears once although it is both the latest run and a history entry')
  assert.equal(await page.locator('.cx-messages .builder-turn-reason').count(), 1)
  // The failure code may now live only inside a closed <details>, so it must not be visible rather
  // than simply absent.
  assert.equal(await page.getByText('BUILDER_SOURCE_MATERIALIZATION_REFUSED', { exact: true }).isVisible(), false,
    'the internal code is never the sentence the operator reads')
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

test('an agent that spoke once and then works in silence still reads as working, with its elapsed time and a way to stop', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000071'
  const projectId = '70000000-0000-4000-8000-000000000072'
  const runId = '70000000-0000-4000-8000-000000000073'
  const sourceRevision = '7'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)
  const working = 'conversation-working'
  const other = 'conversation-other'
  const baseRun = {
    builderRunId: runId, projectId, conversationId: working, state: 'RUNNING', phase: 'AGENT', mode: 'BUILD',
    baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, failureCategory: null,
    requestText: 'Crie um cadastro de clientes', createdAt: new Date(Date.now() - 75_000).toISOString(),
  }
  const cancels = []
  let cancelled = false
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeFactory(page, projectId, factoryState(
    [conversation(working, 'Cadastro'), conversation(other, 'Outra')],
    { [working]: [userMessage('request', 'Crie um cadastro de clientes')] },
  ))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Clientes', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    const run = { ...baseRun, cancellationRequested: cancelled }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, latestBuilderRun: run, latestCodeChangingRun: null,
      preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
      mode: 'BUILD', runHistory: [run],
    }) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/runs/${runId}/cancel`, (route) => {
    cancelled = true
    cancels.push(runId)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ builderRun: { ...baseRun, cancellationRequested: true } }) })
  })
  // The agent says what it is about to do, then works through tools without saying anything else.
  await page.route(`${FACTORY_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
    { type: 'message_start', message: assistantMessage('assistant-plan', 'Vou estruturar a interface de cadastro.') },
  )))

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.locator('.cx-messages').getByText('Vou estruturar a interface de cadastro.', { exact: true }).waitFor()
  const status = page.locator('.cx-chat-step')
  await status.waitFor()
  assert.match(await status.innerText(), /Agente trabalhando/)
  assert.match(await status.innerText(), /há 1 min \d\d s/)
  const cancelRequest = page.waitForRequest((request) => request.url().endsWith(`/runs/${runId}/cancel`) && request.method() === 'POST')
  await page.getByRole('button', { name: 'Parar' }).click()
  await cancelRequest
  await page.getByRole('button', { name: 'Parando' }).waitFor()
  assert.deepEqual(cancels, [runId])

  await switchConversationTo(page, 'Outra')
  assert.match(await status.innerText(), /em outra conversa/, 'the Project stays busy while another conversation is shown')
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

const NEXT_SOURCE_UNCOMPILED = 'código sem prévia ainda'

test('the Preview names the grant and the navigation, and never claims the application loaded', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000051'
  const projectId = '70000000-0000-4000-8000-000000000052'
  const sourceRevision = '7'.repeat(40)
  const artifactRevisionId = '70000000-0000-4000-8000-000000000053'
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)

  let releaseEntry
  const entryHeld = new Promise((resolve) => { releaseEntry = resolve })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeFactory(page, projectId, factoryState([conversation('conversation-preview-truth', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Preview truth', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: sourceRevision, lastGoodArtifactRevisionId: artifactRevisionId, lastGoodArtifactDigest: 'd'.repeat(64) },
    mode: 'BUILD', runHistory: [],
  }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, (route) => route.fulfill({
    status: 201, contentType: 'application/json',
    body: JSON.stringify({ entryUrl: `${origin}/preview-entry`, previewUrl: `${origin}/preview`, entryGrant: 'grant', artifactRevisionId, artifactDigest: 'd'.repeat(64) }),
  }))
  // The entry is held open, so the frame is still on about:blank while the grant already resolved.
  await page.route(`${origin}/preview-entry`, async (route) => {
    await entryHeld
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title><main>ok</main>' })
  })

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.getByText('Acesso autorizado. Abrindo a prévia…', { exact: true }).waitFor()
  assert.equal(await page.getByText('Prévia aberta. Se a área ficar vazia, o aplicativo não desenhou nada.', { exact: true }).count(), 0,
    'about:blank fires its own load, which must not count as the application navigating')
  assert.equal((await page.locator('.cx-preview-toolbar').innerText()).includes(NEXT_SOURCE_UNCOMPILED), false, 'a Preview built from the current source is not behind it')

  releaseEntry()
  await page.getByText('Prévia aberta. Se a área ficar vazia, o aplicativo não desenhou nada.', { exact: true }).waitFor()
  const text = await page.locator('.cx-stage').innerText()
  assert.equal(/carregad|funcionando|pronto para uso/i.test(text), false, `the Preview claimed more than it observed: ${text}`)
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

test('the Build screen says when the current source is ahead of the last good Preview', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000061'
  const projectId = '70000000-0000-4000-8000-000000000062'
  const artifactRevisionId = '70000000-0000-4000-8000-000000000063'
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeFactory(page, projectId, factoryState([conversation('conversation-source-ahead', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Source ahead', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: 'e'.repeat(40), lastGoodSourceRevision: 'd'.repeat(40), lastGoodArtifactRevisionId: artifactRevisionId, lastGoodArtifactDigest: 'd'.repeat(64) },
    mode: 'BUILD', runHistory: [],
  }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.locator('.cx-preview-toolbar .cx-chip').getByText(NEXT_SOURCE_UNCOMPILED).waitFor()
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

test('Preview ignores an older launch completion after the artifact key changes', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000031'
  const projectId = '70000000-0000-4000-8000-000000000032'
  const sourceA = 'e'.repeat(40)
  const sourceB = 'f'.repeat(40)
  const artifactA = '70000000-0000-4000-8000-000000000033'
  const artifactB = '70000000-0000-4000-8000-000000000034'
  const digestA = '1'.repeat(64)
  const digestB = '2'.repeat(64)
  let phase = 'A'
  let previewRequests = 0
  const deferred = () => {
    let resolve
    const promise = new Promise((release) => { resolve = release })
    return { promise, resolve }
  }
  const launchA = deferred()
  const launchB = deferred()
  const firstLaunchStarted = deferred()
  const secondLaunchStarted = deferred()
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeFactory(page, projectId, factoryState([conversation('conversation-preview-race', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Preview race', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    const useB = phase === 'B'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, latestBuilderRun: null, latestCodeChangingRun: null, mode: 'BUILD', runHistory: [],
      preview: {
        workingSourceRevision: useB ? sourceB : sourceA,
        lastGoodSourceRevision: useB ? sourceB : sourceA,
        lastGoodArtifactRevisionId: useB ? artifactB : artifactA,
        lastGoodArtifactDigest: useB ? digestB : digestA,
      },
    }) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    phase = 'B'
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      builderRun: { builderRunId: '70000000-0000-4000-8000-000000000035', projectId, state: 'SUCCEEDED', phase: null, mode: 'BUILD', baseSourceRevision: sourceA, resultSourceRevision: sourceB, resultKind: 'SOURCE_CHANGED', failureCode: null },
    }) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, async (route) => {
    previewRequests += 1
    const useB = previewRequests > 1
    if (useB) secondLaunchStarted.resolve()
    else firstLaunchStarted.resolve()
    const launch = useB ? launchB : launchA
    await launch.promise
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      entryUrl: `${origin}/${useB ? 'entry-b' : 'entry-a'}`, previewUrl: `${origin}/${useB ? 'preview-b' : 'preview-a'}`,
      entryGrant: useB ? 'grant-b' : 'grant-a', artifactRevisionId: useB ? artifactB : artifactA,
      artifactDigest: useB ? digestB : digestA, expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }) })
  })
  await page.goto(`${origin}/projects/${projectId}/build`)
  await firstLaunchStarted.promise
  assert.equal(previewRequests, 1)
  assert.equal(await page.getByTitle('Prévia do aplicativo').count(), 0)
  await page.getByLabel('Mensagem para o agente').fill('Troque o contador')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await secondLaunchStarted.promise
  assert.equal(previewRequests, 2)
  const secondPreviewResponse = page.waitForResponse((response) => response.url().endsWith('/builder-session/preview') && response.status() === 201)
  launchB.resolve()
  await secondPreviewResponse
  await page.getByTitle('Prévia do aplicativo').waitFor()
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-b`)
  const firstPreviewResponse = page.waitForResponse((response) => response.url().endsWith('/builder-session/preview') && response.status() === 201)
  launchA.resolve()
  await firstPreviewResponse
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-b`)
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

test('a Factory-hosted Project reads its conversations from the Hub and each conversation from its own session on the Factory mount', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000091'
  const projectId = '70000000-0000-4000-8000-000000000092'
  const runId = '70000000-0000-4000-8000-000000000093'
  const counterId = '70000000-0000-4000-8000-000000000094'
  const clockId = '70000000-0000-4000-8000-000000000095'
  const sourceRevision = '7'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })

  let run = null
  const conversations = [
    { conversationId: counterId, title: 'Contador', createdAt: '2026-09-21T12:01:00.000Z' },
    { conversationId: clockId, title: 'Relógio', createdAt: '2026-09-21T12:00:00.000Z' },
  ]
  const models = {}
  const modelWrites = []
  const messageReads = []
  const streams = []
  const created = []
  const legacyRequests = trackLegacyRequests(page)
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Factory', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: run, latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    mode: 'BUILD', runHistory: [],
  }) }))
  await page.route(`**/api/control/projects/${projectId}/conversations`, (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations }) })
    const { conversationId } = route.request().postDataJSON()
    created.push(conversationId)
    // The Hub opens a new conversation's thread on the person's default models.
    models[conversationId] = SELECTED_MODEL
    const conversation = { conversationId, title: null, createdAt: '2026-09-21T12:02:00.000Z' }
    conversations.unshift(conversation)
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ conversation }) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, (route) => {
    const body = route.request().postDataJSON()
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'RUNNING', phase: 'AGENT', mode: body.mode, baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, failureCategory: null, requestText: body.content, createdAt: new Date().toISOString() }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ builderRun: run }) })
  })
  await page.route('**/api/control/model-accounts/models', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: BUILDER_MODELS }) }))
  await page.route(`${FACTORY_CONTROLLER}/sessions/*`, (route) => {
    const id = threadIdOf(route.request().url(), -1)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelId: models[id] ?? '', modeId: 'build', threadId: id }) })
  })
  await page.route(`${FACTORY_CONTROLLER}/sessions/*/model`, (route) => {
    const id = threadIdOf(route.request().url(), -2)
    models[id] = route.request().postDataJSON().modelId
    modelWrites.push([id, models[id]])
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`${FACTORY_CONTROLLER}/sessions/*/threads/*/messages*`, (route) => {
    const segments = new URL(route.request().url()).pathname.split('/')
    const [resourceId, threadId] = [decodeURIComponent(segments.at(-4)), decodeURIComponent(segments.at(-2))]
    messageReads.push([resourceId, threadId])
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: threadId === counterId ? [assistantMessage('counter-1', 'Contador pronto')] : [] }) })
  })
  await page.route(`${FACTORY_CONTROLLER}/sessions/*/stream*`, (route) => {
    const url = new URL(route.request().url())
    streams.push([decodeURIComponent(url.pathname.split('/').at(-2)), url.searchParams.get('sessionScope')])
    return route.fulfill(sse({ type: 'message_start', message: assistantMessage('live-1', 'Trabalhando no repositório') }))
  })

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.locator('.cx-messages').getByText('Contador pronto', { exact: true }).waitFor()
  assert.deepEqual(await readConversationTitles(page, 2), ['Contador', 'Relógio'])
  assert.equal(await page.getByRole('button', { name: 'Renomear' }).count(), 0, 'the Builder has no conversation rename feature')
  assert.deepEqual(messageReads.at(0), [counterId, counterId], 'the messages come from the conversation session and thread of the same id')

  await chooseModel(page, SELECTED_MODEL_NAME)
  // The send button also stays disabled on an empty draft, so a chosen model is proven by the
  // composer's placeholder leaving its "no model" wording, not by the button alone.
  await page.waitForFunction((placeholder) => document.querySelector('[aria-label="Mensagem para o agente"]')?.getAttribute('placeholder') !== placeholder, NO_MODEL_PLACEHOLDER)
  assert.deepEqual(modelWrites, [[counterId, SELECTED_MODEL]])

  const createConversation = page.waitForResponse((response) => response.url().endsWith(`/api/control/projects/${projectId}/conversations`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await createConversation
  assert.equal(created.length, 1)
  assert.match(created[0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal((await readConversationTitles(page, 3)).length, 3)
  // The Hub opens the new conversation on the person's default model, so it is ready to send.
  assert.notEqual(await messageBox(page).getAttribute('placeholder'), NO_MODEL_PLACEHOLDER)
  assert.deepEqual(modelWrites, [[counterId, SELECTED_MODEL]], 'a model chosen in one conversation is not written onto another')

  await switchConversationTo(page, 'Contador')
  await page.locator('.cx-messages').getByText('Contador pronto', { exact: true }).waitFor()
  await page.getByLabel('Mensagem para o agente').fill('Mostre UNIT1-browser')
  const sendResponse = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 201)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await sendResponse
  await page.getByText('Trabalhando no repositório', { exact: true }).waitFor()
  assert.deepEqual(streams.at(0), [counterId, `builder:${runId}`])
  assert.deepEqual(legacyRequests, [], 'a Factory-hosted Project never reaches the Conexus mount')
})

