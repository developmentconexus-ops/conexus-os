import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { startWebServer } from './web-dev-server.mjs'
import { humanizeModelName, parseReasoningSuffix } from '../../apps/web/src/features/builder/composer/model-display-name.ts'

// The formatter has no Mastra field to read a display name from (see model-display-name.ts's own
// comment and the PR description for the file:line citations), so its output is pinned here against
// literal expected values, not just checked for some non-empty string.
test('humanizeModelName turns a bare catalog id into the name a person reads', () => {
  assert.equal(humanizeModelName('claude-opus-4-5'), 'Claude Opus 4.5')
  assert.equal(humanizeModelName('claude-sonnet-4-5'), 'Claude Sonnet 4.5')
  assert.equal(humanizeModelName('llama-4'), 'Llama 4')
  assert.equal(humanizeModelName('gpt-6-astra'), 'GPT 6 Astra')
  assert.equal(humanizeModelName('gpt-6-luna'), 'GPT 6 Luna')
  assert.equal(humanizeModelName('claude-opus-5-5'), 'Claude Opus 5.5')
  assert.equal(humanizeModelName('claude-sonnet-5'), 'Claude Sonnet 5')
  assert.equal(humanizeModelName('gpt-5.3-codex'), 'GPT 5.3 Codex')
  assert.equal(humanizeModelName('gpt-4o-2024-08-06'), 'GPT 4o 2024-08-06')
  assert.equal(humanizeModelName('gpt-5.1'), 'GPT 5.1')
  assert.equal(humanizeModelName('o1'), 'o1')
  assert.equal(humanizeModelName('gemini-3-flash'), 'Gemini 3 Flash')
  assert.equal(humanizeModelName('gemini-pro-agent'), 'Gemini Pro Agent')
  // The trailing reasoning suffix google-ai-pro/CLIProxy bakes into the id is not part of the name.
  assert.equal(humanizeModelName('gemini-3.8-flash-high'), 'Gemini 3.8 Flash')
  assert.equal(humanizeModelName('gemini-3.1-pro-low'), 'Gemini 3.1 Pro')
})

test('parseReasoningSuffix reads the level google-ai-pro/CLIProxy ids bake into the id, and nothing for everyone else', () => {
  assert.deepEqual(parseReasoningSuffix('gemini-3.8-flash-high'), { base: 'gemini-3.8-flash', level: 'high' })
  assert.deepEqual(parseReasoningSuffix('gemini-3.1-pro-low'), { base: 'gemini-3.1-pro', level: 'low' })
  assert.equal(parseReasoningSuffix('claude-opus-4-5'), null)
  assert.equal(parseReasoningSuffix('gemini-pro-agent'), null)
})

const BUILDER_CONTROLLER = '**/api/builder/agent-controller/conexus-builder'
// The model, the mode and a conversation's own state are the controller's, so the screen reads
// them from the Builder's controller and holds none. A model with no key is never offered.
const BUILDER_MODELS = [
  { id: 'anthropic/claude-opus-4-5', provider: 'anthropic', modelName: 'claude-opus-4-5', hasApiKey: true },
  { id: 'anthropic/claude-sonnet-4-5', provider: 'anthropic', modelName: 'claude-sonnet-4-5', hasApiKey: true },
  { id: 'groq/llama-4', provider: 'groq', modelName: 'llama-4', hasApiKey: false },
]
const SELECTED_MODEL = BUILDER_MODELS[0].id
const SELECTED_MODEL_NAME = humanizeModelName(BUILDER_MODELS[0].modelName)
// A Project's conversations are its threads, as the native threads route lists them.
const conversation = (id, title, createdAt = '2026-09-20T12:00:00.000Z') => ({ id, title, createdAt, updatedAt: createdAt })

const threadIdOf = (url, offsetFromEnd) => decodeURIComponent(new URL(url).pathname.split('/').at(offsetFromEnd))
const scopeOf = (url) => new URL(url).searchParams.get('sessionScope') ?? ''
const conversationOf = (url) => scopeOf(url).replace(/^conversation:/, '')

// The retired mounts: the Conexus one and the Factory's.
const trackLegacyRequests = (page) => {
  const legacyRequests = []
  page.on('request', (request) => { if (/^\/api\/mastra(?:-factory)?\//.test(new URL(request.url()).pathname)) legacyRequests.push(request.url()) })
  return legacyRequests
}

// Every Project is developed through the Builder's controller: its conversations are the threads
// of its resource, project:<id>, and each conversation is its own session (conversation:<id>) bound
// to the thread of that id; its runs share the session the Hub keeps for it (builder:<conversationId>)
// on the same thread.
const routeBuilder = async (page, state) => {
  await page.route(`${BUILDER_CONTROLLER}/sessions`, (route) => {
    const { resourceId, sessionScope, threadId } = route.request().postDataJSON()
    state.opened.push([resourceId, sessionScope, threadId])
    if (!state.conversations.some((entry) => entry.id === threadId)) state.conversations = [conversation(threadId, null, new Date().toISOString()), ...state.conversations]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ controllerId: 'conexus-builder', resourceId, threadId }) })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/threads*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ threads: state.conversations }) }))
  await page.route('**/api/control/model-accounts/models', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: state.models ?? BUILDER_MODELS }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelId: state.modelId, modeId: state.modeId, threadId: conversationOf(route.request().url()), ...(state.omProgress ? { omProgress: state.omProgress } : {}) }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/model*`, (route) => {
    state.modelId = route.request().postDataJSON().modelId
    state.modelSwitches.push([state.modelId, route.request().postDataJSON().modeId])
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  // A glob ending in mode* would also take the model route.
  await page.route((url) => url.pathname.startsWith('/api/builder/agent-controller/conexus-builder/sessions/') && url.pathname.endsWith('/mode'), (route) => {
    state.modeId = route.request().postDataJSON().modeId
    state.modeSwitches.push([conversationOf(route.request().url()), state.modeId])
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/threads/*/messages*`, (route) => {
    const id = threadIdOf(route.request().url(), -2)
    state.messageReads.push(id)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: state.messages[id] ?? [] }) })
  })
}

const builderState = (conversations, messages = {}, modelId = SELECTED_MODEL) =>
  ({ conversations, messages, modelId, modeId: 'build', modelSwitches: [], modeSwitches: [], messageReads: [], opened: [] })
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
    runHistory: [],
  })
  const state = builderState([conversation(conversationId, 'Contador')], { [conversationId]: threadMessages })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
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
    buildCount += 1
    threadMessages.push(userMessage(`user-${threadMessages.length + 1}`, body.content))
    runFinished = false
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'BUILD', baseSourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, failureCategory: null, requestText: body.content, createdAt: new Date().toISOString() }
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
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => {
    streamScopes.push(new URL(route.request().url()).searchParams.get('sessionScope'))
    setTimeout(() => {
      threadMessages.push(assistantMessage('assistant-live-1', 'Aplicando a alteração'), assistantMessage(`assistant-final-${threadMessages.length}`, 'Build concluído'))
      runFinished = true
    }, 300)
    return route.fulfill(sse(
      { type: 'message_start', message: assistantMessage('assistant-live-1', 'Inspecionando o app') },
      { type: 'message_update', id: 'assistant-live-1', event: { type: 'part', index: 0, part: { type: 'text', text: 'Aplicando a alteração' } } },
      { type: 'message_end', id: 'assistant-live-1' },
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
  assert.deepEqual(requests[0].body, { content: 'Crie um contador até 100 interativo', conversationId })
  assert.ok(requests[0].key)
  await page.locator('.cx-messages').getByText('Crie um contador até 100 interativo', { exact: true }).waitFor()
  await page.getByText('Aplicando a alteração', { exact: true }).waitFor()
  assert.deepEqual(streamScopes.slice(0, 1), [`builder:${conversationId}`])
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
  // Every agent turn is headed by the Encaixe mark and "Conexus", named apart from the model chip.
  assert.equal(await page.locator('.cx-messages .builder-turn-author').first().innerText(), 'Conexus')
  // The result card already names the outcome; a settled working-state row underneath it would
  // just repeat "Alterou o app" a second time.
  assert.equal(await page.locator('.cx-working').count(), 0,
    'a code-changing run that settled shows only the result card, not a redundant working-state line too')
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
  // Stacked file cards, GitHub-style: a MODIFIED file gets no status chip (only ADDED/REMOVED/
  // RENAMED do), so the card header showing its path is the assertion that the lens rendered it.
  await page.locator('.cx-dfile-head .cx-dfile-path', { hasText: 'app/index.html' }).waitFor()
  await page.locator('.cx-dt tr.cx-dt-add .cx-dt-t', { hasText: 'Counter v2' }).waitFor()

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
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
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
    runHistory: [],
  })
  const conversationMessages = []
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [{ workspaceId, name: 'New Workspace' }], projects: [] }) }))
  await routeBuilder(page, builderState([conversation(conversationId, 'Primeira conversa')], { [conversationId]: conversationMessages }))
  await page.route(`**/api/control/workspaces/${workspaceId}/projects`, async (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'New Counter', projectRevision: 'created', archived: false }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'New Counter', projectRevision: 'created', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session()) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    const body = route.request().postDataJSON()
    conversationMessages.push(userMessage('new-message', body.content))
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'QUEUED', phase: null, mode: 'BUILD', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
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
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
})

test('an untitled conversation shows the title its first request gives it while the run is still working', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000021'
  const projectId = '70000000-0000-4000-8000-000000000023'
  const runId = '70000000-0000-4000-8000-000000000024'
  const conversationId = '70000000-0000-4000-8000-000000000025'
  const sourceRevision = 'e'.repeat(40)
  let run = null
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const state = builderState([conversation(conversationId, null)], { [conversationId]: [] })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Counter', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: run, latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, (route) => {
    const body = route.request().postDataJSON()
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'BUILD', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, failureCategory: null, requestText: body.content, createdAt: new Date().toISOString() }
    // The Hub titles a conversation from its first request once the run has saved it.
    state.conversations = [conversation(conversationId, 'Crie um contador de visitas')]
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ builderRun: run }) })
  })
  await page.goto(`${origin}/projects/${projectId}/c/${conversationId}`)
  const switcher = page.getByRole('combobox', { name: 'Conversa', exact: true })
  await page.getByLabel('Mensagem para o agente').waitFor()
  assert.equal((await switcher.innerText()).trim(), 'Conversa sem título')
  await page.getByLabel('Mensagem para o agente').fill('Crie um contador de visitas')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.waitForFunction(() => document.querySelector('[aria-label="Conversa"][role="combobox"]')?.textContent?.includes('Crie um contador de visitas'), null, { timeout: 8_000 })
  assert.equal(run.state, 'RUNNING', 'the title arrived before the run settled')
})

test('a Project holds several conversations, and switching between them leaves the source and the last good Preview alone', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000081'
  const projectId = '70000000-0000-4000-8000-000000000082'
  const sourceRevision = '8'.repeat(40)
  const artifactRevisionId = '70000000-0000-4000-8000-000000000083'
  const counter = conversation('conversation-counter', 'Contador')
  const clock = conversation('conversation-clock', 'Relógio')
  // The session arrives with no model chosen, which is the state a Project that has never built is in.
  const state = builderState([counter, clock], {
    [counter.id]: [userMessage('counter-1', 'Crie um contador'), assistantMessage('counter-2', 'Contador pronto')],
    [clock.id]: [userMessage('clock-1', 'Crie um relógio'), assistantMessage('clock-2', 'Relógio pronto')],
  }, '')
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const legacyRequests = trackLegacyRequests(page)

  const previewRequests = []
  const sourceReads = []
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Conversas', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: sourceRevision, lastGoodArtifactRevisionId: artifactRevisionId, lastGoodArtifactDigest: 'f'.repeat(64) },
    runHistory: [],
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
  assert.deepEqual(state.modelSwitches, [[SELECTED_MODEL, 'plan'], [SELECTED_MODEL, 'build']], 'the picker sets the conversation\'s model for both modes')

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
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
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
  await routeBuilder(page, builderState([conversation(conversationId, 'Histórico')]))
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

  const thinkingLevels = []
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/state*`, (route) => {
    const level = route.request().postDataJSON()?.state?.thinkingLevel
    if (level) thinkingLevels.push(level)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto(`${origin}/projects/${projectId}/build`)
  // The model the next run uses is the controller's own selection, and the composer shows it.
  await page.getByRole('button', { name: new RegExp(`^Modelo ${SELECTED_MODEL_NAME}, `) }).waitFor()
  await openModelPicker(page)
  await page.getByRole('option', { name: 'Claude Opus 4.5' }).waitFor()
  await page.getByRole('option', { name: 'Claude Sonnet 4.5' }).waitFor()
  assert.equal(await page.getByRole('option').count(), 2, 'a model the controller has no key for is never offered')

  // The reasoning slider follows a drag, not only a click, and names each level capitalized.
  const slider = page.getByRole('slider', { name: 'Raciocínio' })
  assert.equal(await slider.getAttribute('aria-valuetext'), 'Médio')
  const box = await slider.boundingBox()
  await page.mouse.move(box.x + 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 40, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  for (let wait = 0; wait < 50 && thinkingLevels.at(-1) !== 'xhigh'; wait += 1) await page.waitForTimeout(100)
  assert.equal(thinkingLevels.at(-1), 'xhigh', `the drag ended at the high end: ${JSON.stringify(thinkingLevels)}`)
  assert.ok(thinkingLevels.includes('low'), `the drag started at the low end: ${JSON.stringify(thinkingLevels)}`)
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
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
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
  await routeBuilder(page, builderState([conversation('conversation-idempotency', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Idempotency', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: null, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
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
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
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
  await routeBuilder(page, builderState([conversation('conversation-preview-continuity', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Preview continuity', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    const useB = phase === 'B'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, latestBuilderRun: null, latestCodeChangingRun: null, runHistory: [],
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
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
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
  await routeBuilder(page, builderState([conversation(conversationId, 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Pre-agent failure', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: failedRun, latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [failedRun],
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
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
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
  await routeBuilder(page, builderState(
    [conversation(working, 'Cadastro'), conversation(other, 'Outra')],
    { [working]: [userMessage('request', 'Crie um cadastro de clientes')] },
  ))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Clientes', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    const run = { ...baseRun, cancellationRequested: cancelled }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, latestBuilderRun: run, latestCodeChangingRun: null,
      preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
      runHistory: [run],
    }) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/runs/${runId}/cancel`, (route) => {
    cancelled = true
    cancels.push(runId)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ builderRun: { ...baseRun, cancellationRequested: true } }) })
  })
  // The agent says what it is about to do, then works through tools without saying anything else.
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
    { type: 'message_start', message: assistantMessage('assistant-plan', 'Vou estruturar a interface de cadastro.') },
  )))

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.locator('.cx-messages').getByText('Vou estruturar a interface de cadastro.', { exact: true }).waitFor()
  const status = page.locator('.cx-chat-step')
  await status.waitFor()
  assert.match(await status.innerText(), /Agente trabalhando/)
  assert.match(await status.innerText(), /há 1 min \d\d s/)
  const cancelRequest = page.waitForRequest((request) => request.url().endsWith(`/runs/${runId}/cancel`) && request.method() === 'POST')
  await page.getByRole('button', { name: 'Parar', exact: true }).click()
  await cancelRequest
  await page.getByRole('button', { name: 'Parando' }).waitFor()
  assert.deepEqual(cancels, [runId])

  await switchConversationTo(page, 'Outra')
  assert.match(await status.innerText(), /em outra conversa/, 'the Project stays busy while another conversation is shown')
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
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
  await routeBuilder(page, builderState([conversation('conversation-preview-truth', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Preview truth', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: sourceRevision, lastGoodArtifactRevisionId: artifactRevisionId, lastGoodArtifactDigest: 'd'.repeat(64) },
    runHistory: [],
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
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
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
  await routeBuilder(page, builderState([conversation('conversation-source-ahead', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Source ahead', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: 'e'.repeat(40), lastGoodSourceRevision: 'd'.repeat(40), lastGoodArtifactRevisionId: artifactRevisionId, lastGoodArtifactDigest: 'd'.repeat(64) },
    runHistory: [],
  }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.locator('.cx-preview-toolbar .cx-chip').getByText(NEXT_SOURCE_UNCOMPILED).waitFor()
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
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
  await routeBuilder(page, builderState([conversation('conversation-preview-race', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Preview race', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    const useB = phase === 'B'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, latestBuilderRun: null, latestCodeChangingRun: null, runHistory: [],
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
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
})

test('a Project lists its conversations as the threads of its resource, and each conversation is its own session on the Builder controller', async (t) => {
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
    { id: counterId, title: 'Contador', createdAt: '2026-09-21T12:01:00.000Z', updatedAt: '2026-09-21T12:01:00.000Z' },
    { id: clockId, title: 'Relógio', createdAt: '2026-09-21T12:00:00.000Z', updatedAt: '2026-09-21T12:00:00.000Z' },
  ]
  const models = {}
  const modelWrites = []
  const messageReads = []
  const streams = []
  const opened = []
  const legacyRequests = trackLegacyRequests(page)
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Contadores', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: run, latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions`, (route) => {
    const { resourceId, sessionScope, threadId } = route.request().postDataJSON()
    opened.push([resourceId, sessionScope, threadId])
    conversations.unshift({ id: threadId, title: null, createdAt: '2026-09-21T12:02:00.000Z', updatedAt: '2026-09-21T12:02:00.000Z' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ controllerId: 'conexus-builder', resourceId, threadId }) })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/threads*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ threads: conversations }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, (route) => {
    const body = route.request().postDataJSON()
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'BUILD', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, failureCategory: null, requestText: body.content, createdAt: new Date().toISOString() }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ builderRun: run }) })
  })
  await page.route('**/api/control/model-accounts/models', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: BUILDER_MODELS }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*`, (route) => {
    const id = conversationOf(route.request().url())
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelId: models[id] ?? '', modeId: 'build', threadId: id }) })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/model*`, (route) => {
    const id = conversationOf(route.request().url())
    models[id] = route.request().postDataJSON().modelId
    modelWrites.push([id, models[id]])
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/threads/*/messages*`, (route) => {
    const segments = new URL(route.request().url()).pathname.split('/')
    const [resourceId, threadId] = [decodeURIComponent(segments.at(-4)), decodeURIComponent(segments.at(-2))]
    messageReads.push([resourceId, threadId])
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: threadId === counterId ? [assistantMessage('counter-1', 'Contador pronto')] : [] }) })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => {
    const url = new URL(route.request().url())
    streams.push([decodeURIComponent(url.pathname.split('/').at(-2)), url.searchParams.get('sessionScope')])
    return route.fulfill(sse({ type: 'message_start', message: assistantMessage('live-1', 'Trabalhando no repositório') }))
  })

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.locator('.cx-messages').getByText('Contador pronto', { exact: true }).waitFor()
  assert.deepEqual(await readConversationTitles(page, 2), ['Contador', 'Relógio'])
  assert.equal(await page.getByRole('button', { name: 'Renomear' }).count(), 0, 'the Builder has no conversation rename feature')
  assert.deepEqual(messageReads.at(0), [`project:${projectId}`, counterId], 'the messages come from the conversation\'s own thread under its Project')

  await chooseModel(page, SELECTED_MODEL_NAME)
  // The send button also stays disabled on an empty draft, so a chosen model is proven by the
  // composer's placeholder leaving its "no model" wording, not by the button alone.
  await page.waitForFunction((placeholder) => document.querySelector('[aria-label="Mensagem para o agente"]')?.getAttribute('placeholder') !== placeholder, NO_MODEL_PLACEHOLDER)
  assert.deepEqual(modelWrites, [[counterId, SELECTED_MODEL], [counterId, SELECTED_MODEL]], 'one write for each mode')

  const createConversation = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/builder/agent-controller/conexus-builder/sessions' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await createConversation
  assert.equal(opened.length, 1)
  const [[resourceId, sessionScope, threadId]] = opened
  assert.equal(resourceId, `project:${projectId}`)
  assert.match(threadId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(sessionScope, `conversation:${threadId}`, 'a conversation is opened as its own session on the thread of the same id')
  assert.equal((await readConversationTitles(page, 3)).length, 3)
  assert.deepEqual(modelWrites, [[counterId, SELECTED_MODEL], [counterId, SELECTED_MODEL]], 'a model chosen in one conversation is not written onto another')

  await switchConversationTo(page, 'Contador')
  await page.locator('.cx-messages').getByText('Contador pronto', { exact: true }).waitFor()
  await page.getByLabel('Mensagem para o agente').fill('Mostre UNIT1-browser')
  const sendResponse = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 201)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await sendResponse
  await page.getByText('Trabalhando no repositório', { exact: true }).waitFor()
  assert.deepEqual(streams.at(0), [`project:${projectId}`, `builder:${counterId}`])
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
})

test('a reply the controller finalizes under a different id than its live stream is not shown twice', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000101'
  const projectId = '70000000-0000-4000-8000-000000000102'
  const runId = '70000000-0000-4000-8000-000000000103'
  const conversationId = 'conversation-dedup'
  const sourceRevision = 'e'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const legacyRequests = trackLegacyRequests(page)

  // The live stream and the persisted thread can name the same reply under different message ids
  // (the controller finalizes the tool loop under its own id once the run settles), and the persisted
  // copy carries the run's full tool history, not just what the live stream had captured so far.
  const finalText = 'Concluído: atualizei o texto em destaque.'
  const toolPart = (id, toolName) => ({ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName, state: 'result', args: {}, result: 'ok' } })
  const liveReply = {
    id: 'live-1', role: 'assistant', createdAt: new Date().toISOString(),
    content: { format: 2, parts: [
      toolPart('live-tool-0', 'read_file'), toolPart('live-tool-1', 'edit_file'), toolPart('live-tool-2', 'execute_command'),
      { type: 'text', text: finalText },
    ] },
  }
  const persistedReply = {
    id: 'persisted-1', role: 'assistant', createdAt: new Date().toISOString(),
    content: { format: 2, parts: [
      toolPart('persisted-tool-0', 'read_file'), toolPart('persisted-tool-1', 'edit_file'), toolPart('persisted-tool-2', 'execute_command'),
      toolPart('persisted-tool-3', 'read_file'), toolPart('persisted-tool-4', 'edit_file'), toolPart('persisted-tool-5', 'execute_command'),
      { type: 'text', text: finalText },
    ] },
  }

  let runFinished = false
  const threadMessages = [userMessage('user-1', 'Atualize o texto em destaque')]
  const state = builderState([conversation(conversationId, 'Destaque')], { [conversationId]: threadMessages })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Destaque', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: runFinished ? 'SUCCEEDED' : 'RUNNING', phase: runFinished ? null : 'AGENT', mode: 'BUILD',
      baseSourceRevision: sourceRevision, resultSourceRevision: runFinished ? sourceRevision : null, resultKind: runFinished ? 'SOURCE_CHANGED' : null,
      failureCode: null, failureCategory: null, requestText: 'Atualize o texto em destaque', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: runFinished ? { baseSourceRevision: sourceRevision, resultSourceRevision: sourceRevision, resultKind: 'SOURCE_CHANGED' } : null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: runFinished ? sourceRevision : null, lastGoodArtifactRevisionId: runFinished ? 'artifact' : null, lastGoodArtifactDigest: runFinished ? 'd'.repeat(64) : null },
    runHistory: [],
  }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ entryUrl: `${origin}/preview-entry`, previewUrl: `${origin}/preview`, entryGrant: 'grant', artifactRevisionId: 'artifact', artifactDigest: 'd'.repeat(64), expiresAt: new Date(Date.now() + 60_000).toISOString() }) }))
  await page.route(`${origin}/preview-entry`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title><main>ok</main>' }))
  await page.route(`**/api/control/projects/${projectId}/source/compare*`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ baseSourceRevision: sourceRevision, resultSourceRevision: sourceRevision, files: [{ path: 'app/main.tsx', status: 'MODIFIED', previousPath: null }] }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => {
    setTimeout(() => {
      threadMessages.length = 1
      threadMessages.push(persistedReply)
      runFinished = true
    }, 300)
    return route.fulfill(sse(
      { type: 'message_start', message: liveReply },
      { type: 'agent_end', reason: 'complete' },
    ))
  })

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.locator('.cx-messages').getByText('Atualize o texto em destaque', { exact: true }).waitFor()
  await page.getByTitle('Prévia do aplicativo').waitFor()
  await page.waitForTimeout(600)

  assert.equal(await page.locator('.cx-messages').getByText(finalText, { exact: true }).count(), 1,
    'the persisted reply renders once, not once per message id it happened to carry')
  assert.equal(await page.locator('.builder-turn-body button').count(), 1,
    'the stale live-stream copy of the reply is dropped once the persisted, fuller copy of the same reply arrives')
  await page.getByRole('button', { name: 'Leu 2 arquivos, editou 2 arquivos, executou 2 comandos', exact: true }).waitFor()
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
})

// Regression for two problems the operator hit in the same real run: an ask_user suspension
// rendered as a hand-made textarea that ignored the agent's own options/selectionMode, and every
// task_write/task_update call rendered as its own row (one of them mislabeled "Perguntou a você").
// This exercises both through the same native primitives: playground-ui's AskUser for the
// suspension, and the AgentController's own display-state tasks for the pinned checklist.
test('a suspended ask_user with options renders the options and submits the chosen one, and the task list drives a pinned checklist instead of conversation rows', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000201'
  const projectId = '70000000-0000-4000-8000-000000000202'
  const runId = '70000000-0000-4000-8000-000000000203'
  const conversationId = 'conversation-ask-user'
  const sourceRevision = 'f'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })

  const question = 'Qual cor você prefere para o destaque?'
  const options = [{ label: 'Azul' }, { label: 'Verde' }]
  const taskWritePart = { type: 'tool-invocation', toolInvocation: { toolCallId: 'tool-task-write-1', toolName: 'task_write', state: 'result', args: { tasks: [] }, result: 'ok' } }
  const liveMessage = { id: 'live-ask-1', role: 'assistant', createdAt: new Date().toISOString(), content: { format: 2, parts: [taskWritePart] } }
  const tasks = [
    { id: 'task_palette', content: 'Descobrir a paleta', status: 'completed', activeForm: 'Descobrindo a paleta' },
    { id: 'task_apply', content: 'Aplicar a cor escolhida', status: 'in_progress', activeForm: 'Aplicando a cor escolhida' },
    { id: 'task_verify', content: 'Conferir o resultado no preview', status: 'pending', activeForm: 'Conferindo o resultado no preview' },
  ]

  const threadMessages = [userMessage('user-1', 'Destaque o título com uma cor')]
  const state = builderState([conversation(conversationId, 'Destaque colorido')], { [conversationId]: threadMessages })
  const suspensionRequests = []
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Destaque colorido', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'BUILD',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, failureCategory: null, requestText: 'Destaque o título com uma cor', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => {
    suspensionRequests.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
    { type: 'message_start', message: liveMessage },
    { type: 'display_state_changed', displayState: { activeTools: {}, tasks } },
    { type: 'tool_suspended', toolCallId: 'tool-ask-1', toolName: 'ask_user', args: { question, options, selectionMode: 'single_select' }, suspendPayload: { question, options, selectionMode: 'single_select' } },
  )))

  await page.goto(`${origin}/projects/${projectId}/build`)

  // The task list is the AgentController's own display state, not a parsed tool-call row: the
  // task_write call above never shows as a conversation row, and the checklist counts and names
  // the in-progress task by its activeForm.
  await page.getByText('Tarefas · 1 de 3', { exact: true }).waitFor()
  await page.getByTestId('task-list').getByText('Aplicando a cor escolhida', { exact: true }).waitFor()
  assert.equal(await page.locator('.builder-turn-body button').count(), 0, 'task_write drives the checklist, not a conversation row')

  // AskUser renders the agent's own options as radio controls (single_select), not the old
  // hand-made free-text textarea (that one lived in .cx-pending, gone with the swap; the
  // composer keeps its own separate textarea, so the assertion is scoped past it).
  await page.getByText(question, { exact: true }).waitFor()
  const blue = page.getByRole('radio', { name: 'Azul' })
  await blue.waitFor()
  await page.getByRole('radio', { name: 'Verde' }).waitFor()
  assert.equal(await page.locator('.cx-pending').count(), 0, 'the old hand-made pending-question card is gone')

  const suspensionSent = page.waitForResponse((response) => response.url().includes('/tool-suspension'))
  await blue.click()
  await suspensionSent
  assert.deepEqual(suspensionRequests, [{ toolCallId: 'tool-ask-1', resumeData: 'Azul' }],
    'the chosen option label is sent as respondToToolSuspension\'s resumeData, unchanged')

  // playground-ui's TaskList/AskUser hard-code their labels in English (no labels prop exists), so
  // the Construir screen composes its own pt-BR wrappers around the same primitives; this pins the
  // three task-list statuses the fixture now exercises plus the container/progress aria-labels.
  assert.equal(await page.getByTestId('task-list').locator('[aria-label="Concluída"]').count(), 1, 'the completed task carries the pt-BR status icon label')
  assert.equal(await page.getByTestId('task-list').locator('[aria-label="Em andamento"]').count(), 1, 'the in-progress task carries the pt-BR status icon label')
  assert.equal(await page.getByTestId('task-list').locator('[aria-label="Pendente"]').count(), 1, 'the pending task carries the pt-BR status icon label')
  await page.locator('[aria-label="Lista de tarefas"]').waitFor()
  await page.getByRole('progressbar', { name: 'Progresso das tarefas' }).waitFor()
})

// A Project whose run stays in AGENT, streaming only the given controller events: nothing reaches the
// persisted thread, so whatever the turn shows came from those events.
const openLiveTurn = async (t, events) => {
  const accountId = '70000000-0000-4000-8000-000000000221'
  const projectId = '70000000-0000-4000-8000-000000000222'
  const runId = '70000000-0000-4000-8000-000000000223'
  const conversationId = 'conversation-live-deltas'
  const sourceRevision = 'c'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })

  const threadMessages = [userMessage('user-1', 'Mude o título')]
  const state = builderState([conversation(conversationId, 'Título')], { [conversationId]: threadMessages })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Título', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'BUILD',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, failureCategory: null, requestText: 'Mude o título', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(...events)))
  await page.goto(`${origin}/projects/${projectId}/build`)
  return page
}

test('a live reply streamed as deltas renders whole while the run is still working', async (t) => {
  const page = await openLiveTurn(t, [
    { type: 'message_start', message: assistantMessage('live-delta-1', 'Vou trocar') },
    { type: 'message_update', id: 'live-delta-1', event: { type: 'text-delta', delta: ' o título' } },
    { type: 'message_update', id: 'live-delta-1', event: { type: 'text-delta', delta: ' agora.' } },
    { type: 'message_update', id: 'unknown-message', event: { type: 'text-delta', delta: ' perdido' } },
    { type: 'message_end', id: 'live-delta-1' },
  ])
  await page.locator('.cx-messages').getByText('Vou trocar o título agora.', { exact: true }).waitFor()
  assert.equal(await page.locator('.cx-messages').getByText('perdido').count(), 0,
    'a delta for a message that never started is dropped')
})

const reasoningPart = { type: 'reasoning', reasoning: 'Planning schema validation', details: [{ type: 'text', text: 'Planning schema validation' }] }

test('a reasoning part still streaming is one "Pensando…" line and never the provider\'s own summary', async (t) => {
  const page = await openLiveTurn(t, [
    { type: 'message_start', message: assistantMessage('live-reasoning-1', 'Certo.') },
    { type: 'message_update', id: 'live-reasoning-1', event: { type: 'part', index: 1, part: reasoningPart } },
  ])
  await page.getByText('Pensando…', { exact: true }).waitFor()
  assert.equal(await page.getByText('Planning schema validation').count(), 0, 'the English summary is not on screen')
})

test('a reasoning part that settled leaves nothing in the thread', async (t) => {
  const page = await openLiveTurn(t, [
    { type: 'message_start', message: assistantMessage('live-reasoning-2', 'Certo.') },
    { type: 'message_update', id: 'live-reasoning-2', event: { type: 'part', index: 1, part: reasoningPart } },
    { type: 'message_update', id: 'live-reasoning-2', event: { type: 'part', index: 2, part: { type: 'text', text: 'Pronto.' } } },
  ])
  await page.locator('.cx-messages').getByText('Pronto.', { exact: true }).waitFor()
  assert.equal(await page.getByText('Pensando…').count(), 0)
  assert.equal(await page.getByText('Planning schema validation').count(), 0)
})

const toolPart = (id, toolName, args, state = 'result', result = 'ok') => ({ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName, state, args, result } })
const streamParts = (id, parts) => [
  { type: 'message_start', message: assistantMessage(id, 'Vou trabalhar.') },
  ...parts.map((part, index) => ({ type: 'message_update', id, event: { type: 'part', index: index + 1, part } })),
]

test('one or two tool calls are plain rows and three or more fold into one line that says what they did', async (t) => {
  const two = await openLiveTurn(t, streamParts('rows-two', [
    toolPart('a', 'edit_file', { path: 'app/src/a.ts', old_str: 'x', new_str: 'y' }),
    toolPart('b', 'read_file', { path: 'app/src/b.ts' }),
  ]))
  await two.getByRole('button', { name: 'Editou um arquivo app/src/a.ts' }).waitFor()
  await two.getByRole('button', { name: 'Leu um arquivo app/src/b.ts' }).waitFor()

  const four = await openLiveTurn(t, streamParts('rows-four', [
    toolPart('a', 'edit_file', { path: 'app/src/a.ts', old_str: 'x', new_str: 'y' }),
    toolPart('b', 'edit_file', { path: 'app/src/b.ts', old_str: 'x', new_str: 'y' }),
    toolPart('c', 'edit_file', { path: 'app/src/c.ts', old_str: 'x', new_str: 'y' }),
    toolPart('d', 'execute_command', { command: 'npm test' }),
  ]))
  await four.getByRole('button', { name: 'Editou 3 arquivos, executou 1 comando', exact: true }).waitFor()
  assert.equal(await four.locator('.builder-turn-body button').count(), 1, 'the four calls are one line until it is opened')
})

test('a running group names the call in progress and how many are done', async (t) => {
  const page = await openLiveTurn(t, streamParts('rows-running', [
    toolPart('a', 'read_file', { path: 'app/src/a.ts' }),
    toolPart('b', 'read_file', { path: 'app/src/b.ts' }),
    toolPart('c', 'read_file', { path: 'app/src/c.ts' }),
    toolPart('d', 'edit_file', { path: 'app/src/lib/format.ts', old_str: 'x', new_str: 'y' }, 'call'),
  ]))
  const header = page.getByRole('button', { name: /Editando um arquivo/ })
  await header.waitFor()
  assert.equal((await header.textContent()).replace(/\s+/g, ' ').trim(), 'Editando um arquivoapp/src/lib/format.ts3/4')
})

// Mastra's ToolCall trigger takes its border and padding from Tailwind's reset. styles.css puts a
// default on every bare <button> in the same cascade layer, after it, so it landed on the row and made
// it a bordered card about 50 px tall.
// The message shapes a real run produced: the suspended ask_user call as a part still open, the controller
// marking it "error" once the run ended as suspended, and the resolved call appended later as a second
// part with no arguments and the answer as its result.
const ASK_ARGS = { options: null, question: 'Qual número de orçamento podemos usar?', selectionMode: null }
const askParts = (answered) => [
  { type: 'text', text: 'Preciso de um número.' },
  { type: 'tool-invocation', toolInvocation: { toolCallId: 'call_ask', toolName: 'ask_user', state: 'call', args: ASK_ARGS } },
  ...(answered ? [{ type: 'tool-invocation', toolInvocation: { toolCallId: 'call_ask', toolName: 'ask_user', state: 'result', args: {}, result: { content: 'User answered: 144118. O markup é 1.45 × custo.', isError: false } } }] : []),
]
const askEvents = (answered) => [
  { type: 'message_start', message: { ...assistantMessage('ask-live', ''), content: { format: 2, parts: askParts(false) } } },
  { type: 'tool_suspended', toolCallId: 'call_ask', toolName: 'ask_user', args: ASK_ARGS, suspendPayload: { question: ASK_ARGS.question } },
  { type: 'display_state_changed', displayState: { activeTools: { call_ask: { name: 'ask_user', args: ASK_ARGS, status: 'error' } }, tasks: [] } },
  ...(answered ? [
    { type: 'message_update', id: 'ask-live', event: { type: 'part', index: 2, part: askParts(true)[2] } },
    { type: 'tool_end', toolCallId: 'call_ask', result: { content: 'User answered: 144118. O markup é 1.45 × custo.', isError: false }, isError: false },
  ] : []),
]

test('a question waiting for the person is a card, not a failed tool row', async (t) => {
  const page = await openLiveTurn(t, askEvents(false))
  await page.getByText(ASK_ARGS.question, { exact: true }).waitFor()
  assert.equal(await page.getByText(ASK_ARGS.question, { exact: true }).count(), 1, 'one card for the question')
  assert.equal(await page.locator('.builder-turn-body button').count(), 0, 'no tool row for a call that has not been answered')
  assert.equal(await page.getByText('Tool call failed').count(), 0)
})

test('an answered question is one row that shows the question and the answer, and never a failure', async (t) => {
  const page = await openLiveTurn(t, askEvents(true))
  const row = page.getByRole('button', { name: 'Perguntou a você' })
  await row.waitFor()
  assert.equal(await page.locator('.builder-turn-body button').count(), 1, 'one row for the question, not one per snapshot of the call')
  assert.equal(await page.getByText('Tool call failed').count(), 0)
  assert.equal(await page.locator('[data-status="error"]').count(), 0)
  await row.click()
  const asked = page.locator('.cx-asked')
  assert.equal((await asked.textContent()).trim(), `${ASK_ARGS.question}144118. O markup é 1.45 × custo.`)
})

// The plain-button look (border, padding, fill) is the default of a <button> with no class. A part of
// Mastra's carries classes, so it takes its look from the library, with no override of ours.
test('a Mastra tool row takes no border or padding from the app, and only a classless button gets the plain look', async (t) => {
  const page = await openLiveTurn(t, streamParts('rows-default', [toolPart('a', 'read_file', { path: 'app/src/a.ts' })]))
  const row = page.getByRole('button', { name: 'Leu um arquivo app/src/a.ts' })
  await row.waitFor()
  const looks = await page.evaluate(() => {
    const look = (node) => { const cs = getComputedStyle(node); return { border: cs.borderTopWidth, padding: cs.paddingTop, radius: cs.borderTopLeftRadius, fill: cs.backgroundColor } }
    const row = document.querySelector('.builder-turn-body button')
    const plain = document.body.appendChild(document.createElement('button'))
    const classed = document.body.appendChild(document.createElement('button'))
    classed.className = 'anything'
    return { row: look(row), rowClasses: [...row.classList].filter((name) => name.startsWith('cx-')), plain: look(plain), classed: look(classed) }
  })
  assert.deepEqual(looks, {
    row: { border: '0px', padding: '0px', radius: '6px', fill: 'rgba(0, 0, 0, 0)' },
    rowClasses: [],
    plain: { border: '1px', padding: '11.2px', radius: '8.8px', fill: 'rgb(255, 255, 255)' },
    classed: { border: '0px', padding: '0px', radius: '0px', fill: 'rgba(0, 0, 0, 0)' },
  })
})

test('an opened tool row is a borderless line, and its body is the diff or the command with a short output', async (t) => {
  const longOutput = 'linha '.repeat(400)
  const page = await openLiveTurn(t, streamParts('rows-open', [
    toolPart('a', 'edit_file', { path: 'app/src/a.ts', old_str: 'antigo', new_str: 'novo' }, 'result', 'Editado com sucesso e o arquivo inteiro de volta'),
    toolPart('b', 'execute_command', { command: 'npm test' }, 'result', longOutput),
  ]))
  const edit = page.getByRole('button', { name: 'Editou um arquivo app/src/a.ts' })
  await edit.click()
  const box = await edit.evaluate((node) => ({ height: node.getBoundingClientRect().height, border: getComputedStyle(node).borderTopWidth, padding: getComputedStyle(node).paddingTop }))
  assert.deepEqual(box, { height: 26, border: '0px', padding: '0px' })
  assert.equal(await page.getByText('Editado com sucesso').count(), 0, 'an edit shows its diff, not the result echoed back')

  await page.getByRole('button', { name: 'Executou um comando npm test' }).click()
  const output = await page.locator('pre').filter({ hasText: 'linha linha' }).textContent()
  assert.equal(output.length, 801, 'a command shows 800 characters of its output and an ellipsis')
})

// @mastra/core 1.71 announces a text span that opens after a tool call as its own empty part before
// any delta for it, so the delta lands in that new part, after the tool.
test('text streamed after a tool call renders after it, not appended to the text before it', async (t) => {
  const tool = { type: 'tool-invocation', toolInvocation: { toolCallId: 'live-tool-1', toolName: 'read_file', state: 'result', args: {}, result: 'ok' } }
  const page = await openLiveTurn(t, [
    { type: 'message_start', message: assistantMessage('live-order-1', 'Antes') },
    { type: 'message_update', id: 'live-order-1', event: { type: 'part', index: 1, part: tool } },
    { type: 'message_update', id: 'live-order-1', event: { type: 'part', index: 2, part: { type: 'text', text: '' } } },
    { type: 'message_update', id: 'live-order-1', event: { type: 'text-delta', delta: 'Depois' } },
  ])
  const body = page.locator('.cx-messages .builder-turn-assistant .builder-turn-body')
  await body.getByText('Depois', { exact: true }).waitFor()
  assert.deepEqual(await body.evaluate((node) => [...node.children].map((child) => child.matches('.cx-tool-rows') ? 'tool' : child.textContent.trim())),
    ['Antes', 'tool', 'Depois'])
})

// A free-text ask_user (no options on the suspend payload) drives AskUserPt's other branch: the
// same pt-BR placeholder and submit label the fixture above never exercises.
test('a suspended ask_user with no options renders the pt-BR free-text form', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000211'
  const projectId = '70000000-0000-4000-8000-000000000212'
  const runId = '70000000-0000-4000-8000-000000000213'
  const conversationId = 'conversation-ask-user-freetext'
  const sourceRevision = 'e'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })

  const question = 'Qual nome você quer para o app?'
  const threadMessages = [userMessage('user-1', 'Crie um app de lista de tarefas')]
  const state = builderState([conversation(conversationId, 'Lista de tarefas')], { [conversationId]: threadMessages })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Lista de tarefas', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'BUILD',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, failureCategory: null, requestText: 'Crie um app de lista de tarefas', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
    { type: 'tool_suspended', toolCallId: 'tool-ask-2', toolName: 'ask_user', args: { question }, suspendPayload: { question } },
  )))

  await page.goto(`${origin}/projects/${projectId}/build`)

  await page.getByPlaceholder('Digite sua resposta…').waitFor()
  await page.getByRole('button', { name: 'Enviar resposta' }).waitFor()
})


// A conversation of Project "Agenda" whose latest run, when given, is working in Planejar.
const openAgenda = async (t, { accountId, projectId, conversationId, runId = null, stream = [], omProgress = null, viewport = { width: 1100, height: 900 } }) => {
  const sourceRevision = 'a'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport })
  const state = builderState([conversation(conversationId, 'Agenda')], { [conversationId]: runId ? [userMessage('user-1', 'Crie uma agenda')] : [] })
  state.modeId = 'plan'
  state.omProgress = omProgress
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Agenda', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: runId ? {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'PLAN',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, failureCategory: null, requestText: 'Crie uma agenda', createdAt: new Date().toISOString(),
    } : null,
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  if (runId) await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(...stream)))
  await page.goto(`${origin}/projects/${projectId}/build`)
  return { page, state }
}
const OM_IDLE = {
  status: 'idle', pendingTokens: 12_400, threshold: 30_000, thresholdPercent: 41.3, observationTokens: 3_100, reflectionThreshold: 40_000, reflectionThresholdPercent: 7.75,
  projectedMessageRemoval: 0, projectedReflectionSavings: 0,
}

test('an idle conversation switches between Planejar and Construir from the mode chip and with Shift+Tab, on its own session', async (t) => {
  const conversationId = 'conversation-mode'
  const { page, state } = await openAgenda(t, { accountId: '70000000-0000-4000-8000-000000000221', projectId: '70000000-0000-4000-8000-000000000222', conversationId })
  const legacyRequests = trackLegacyRequests(page)

  const chip = page.getByRole('button', { name: /^Modo: / })
  await page.getByRole('button', { name: 'Modo: Planejar', exact: true }).waitFor()
  await chip.click()
  assert.deepEqual(await page.getByRole('menuitemradio').allInnerTexts(), [
    'Planejar\nLê o app e propõe um plano antes de mudar qualquer arquivo',
    'Construir\nMuda o app e publica a prévia',
  ])
  await page.getByRole('menuitemradio', { name: /^Construir/ }).click()
  await page.getByRole('button', { name: 'Modo: Construir', exact: true }).waitFor()

  await messageBox(page).focus()
  await page.keyboard.press('Shift+Tab')
  await page.getByRole('button', { name: 'Modo: Planejar', exact: true }).waitFor()
  assert.deepEqual(state.modeSwitches, [[conversationId, 'build'], [conversationId, 'plan']])
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Mensagem para o agente', 'Shift+Tab keeps the cursor in the message')
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
})

test('while a run works the mode chip stays readable, says why it cannot change, and Shift+Tab says so too', async (t) => {
  const conversationId = 'conversation-mode-running'
  const { page, state } = await openAgenda(t, {
    accountId: '70000000-0000-4000-8000-000000000224', projectId: '70000000-0000-4000-8000-000000000225', conversationId,
    runId: '70000000-0000-4000-8000-000000000226',
  })

  const chip = page.getByRole('button', { name: 'Modo: Planejar. O modo muda quando o Builder parar.', exact: true })
  await chip.waitFor()
  await chip.click()
  await page.getByText('O modo muda quando o Builder parar.', { exact: true }).waitFor()
  assert.equal(await page.getByRole('menuitemradio').count(), 0, 'no mode is offered while the run works')
  await page.keyboard.press('Escape')

  await messageBox(page).focus()
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.getByRole('status').filter({ hasText: 'O modo muda quando o Builder parar.' }).count(), 1)
  assert.deepEqual(state.modeSwitches, [])
})

test('the memory rings under the composer read the conversation\'s memory, then the run\'s live one', async (t) => {
  const meters = async (page) => page.locator('.cx-memory-status [role="meter"]').evaluateAll((nodes) => nodes.map((node) => [node.getAttribute('aria-label'), node.getAttribute('aria-valuetext')]))
  const idle = await openAgenda(t, { accountId: '70000000-0000-4000-8000-000000000227', projectId: '70000000-0000-4000-8000-000000000228', conversationId: 'conversation-memory', omProgress: OM_IDLE })
  const trigger = idle.page.getByRole('button', { name: /^Memória da conversa/ })
  await trigger.waitFor()
  assert.equal(await trigger.getAttribute('aria-label'), 'Memória da conversa: Mensagens até a próxima observação, 12,4 de 30 mil tokens. Observações até a próxima reflexão, 3,1 de 40 mil tokens')
  assert.deepEqual(await meters(idle.page), [['Mensagens até a próxima observação', '12.4/30k'], ['Observações até a próxima reflexão', '3.1/40k']])
  await trigger.click()
  await idle.page.getByText('Quando encher, o Builder resume a conversa para lembrar do que importa', { exact: true }).waitFor()

  const live = await openAgenda(t, {
    accountId: '70000000-0000-4000-8000-000000000229', projectId: '70000000-0000-4000-8000-00000000022a', conversationId: 'conversation-memory-live',
    runId: '70000000-0000-4000-8000-00000000022b', omProgress: OM_IDLE,
    stream: [{ type: 'display_state_changed', displayState: { activeTools: {}, tasks: [], omProgress: { ...OM_IDLE, status: 'observing', pendingTokens: 29_000, observationTokens: 0 }, bufferingMessages: false, bufferingObservations: false } }],
  })
  await live.page.locator('.cx-memory-status [role="meter"][aria-valuetext="29/30k"]').waitFor()
  assert.deepEqual(await meters(live.page), [['Guardando as mensagens na memória', '29/30k']], 'an empty observation budget is not drawn, as in the Factory')
})

test('at a 420px chat panel the mode chip, the model name and the send button share one row without overlapping', async (t) => {
  const { page } = await openAgenda(t, {
    accountId: '70000000-0000-4000-8000-00000000022c', projectId: '70000000-0000-4000-8000-00000000022d', conversationId: 'conversation-420',
    omProgress: OM_IDLE, viewport: { width: 1440, height: 900 },
  })
  const chat = page.locator('.cx-chat')
  await page.getByRole('button', { name: 'Modo: Planejar', exact: true }).waitFor()
  const separator = await page.locator('[data-separator]').boundingBox()
  const width = (await chat.boundingBox()).width
  await page.mouse.move(separator.x + separator.width / 2, separator.y + separator.height / 2)
  await page.mouse.down()
  await page.mouse.move(separator.x + separator.width / 2 - (420 - width), separator.y + separator.height / 2, { steps: 8 })
  await page.mouse.up()

  const measured = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect()
    const chip = box('.cx-mode-chip')
    const model = box('.cx-model-button')
    const send = box('.cx-send-button')
    const name = document.querySelector('.cx-model-name')
    return {
      chat: Math.round(box('.cx-chat').width),
      chipBeforeModel: chip.right <= model.left,
      modelBeforeSend: model.right <= send.left,
      oneRow: Math.abs(chip.top + chip.height / 2 - (model.top + model.height / 2)) < 2,
      modelNameWhole: name.scrollWidth <= name.clientWidth,
    }
  })
  assert.deepEqual(measured, { chat: 420, chipBeforeModel: true, modelBeforeSend: true, oneRow: true, modelNameWhole: true })
})

test('a narrow chat panel keeps the model name whole and shrinks the mode chip to its icon, a wide one shows the label', async (t) => {
  const { page } = await openAgenda(t, {
    accountId: '70000000-0000-4000-8000-00000000023a', projectId: '70000000-0000-4000-8000-00000000023b', conversationId: 'conversation-fit',
    omProgress: OM_IDLE, viewport: { width: 1440, height: 900 },
  })
  await page.getByRole('button', { name: 'Modo: Planejar', exact: true }).waitFor()
  const resizeChatTo = async (target) => {
    const separator = await page.locator('[data-separator]').boundingBox()
    const width = (await page.locator('.cx-chat').boundingBox()).width
    await page.mouse.move(separator.x + separator.width / 2, separator.y + separator.height / 2)
    await page.mouse.down()
    await page.mouse.move(separator.x + separator.width / 2 - (target - width), separator.y + separator.height / 2, { steps: 8 })
    await page.mouse.up()
  }
  const measure = () => page.evaluate(() => {
    const name = document.querySelector('.cx-model-name')
    const chip = document.querySelector('.cx-mode-chip')
    return { modelNameWhole: name.scrollWidth <= name.clientWidth, chipLabelShown: chip.querySelector('.cx-mode-label').getBoundingClientRect().width > 0, chipWidth: Math.round(chip.getBoundingClientRect().width) }
  })
  await resizeChatTo(340)
  assert.deepEqual(await measure(), { modelNameWhole: true, chipLabelShown: false, chipWidth: 28 })
  await resizeChatTo(700)
  const wide = await measure()
  assert.deepEqual({ modelNameWhole: wide.modelNameWhole, chipLabelShown: wide.chipLabelShown }, { modelNameWhole: true, chipLabelShown: true })
})

test('a plan the agent submits is sent back with feedback from its card, on the run\'s own session', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000231'
  const projectId = '70000000-0000-4000-8000-000000000232'
  const runId = '70000000-0000-4000-8000-000000000233'
  const conversationId = 'conversation-plan'
  const sourceRevision = 'b'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const legacyRequests = trackLegacyRequests(page)

  const state = builderState([conversation(conversationId, 'Agenda')], { [conversationId]: [userMessage('user-1', 'Crie uma agenda')] })
  state.modeId = 'plan'
  const answers = []
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Agenda', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'PLAN',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, failureCategory: null, requestText: 'Crie uma agenda', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => {
    const url = new URL(route.request().url())
    answers.push([decodeURIComponent(url.pathname.split('/').at(-2)), url.searchParams.get('sessionScope'), route.request().postDataJSON()])
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
    { type: 'tool_suspended', toolCallId: 'plan-1', toolName: 'submit_plan', args: { title: 'Agenda semanal', plan: '1. Tela da semana' }, suspendPayload: { title: 'Agenda semanal', plan: '1. Tela da semana' } },
    { type: 'agent_end', reason: 'suspended' },
  )))

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.getByText('Agenda semanal', { exact: true }).waitFor()
  const planCard = page.getByRole('region', { name: 'Plano para aprovar' })
  await planCard.locator('.cx-plan-clamp li', { hasText: 'Tela da semana' }).waitFor()
  assert.equal(await planCard.evaluate((card) => card.querySelector('.cx-plan-clamp').compareDocumentPosition(card.querySelector('.cx-pending-actions')) === Node.DOCUMENT_POSITION_FOLLOWING), true, 'the plan comes before the buttons')
  const askChanges = page.getByRole('button', { name: 'Pedir ajustes' })
  assert.equal(await askChanges.isDisabled(), true, 'feedback is required to send a plan back')
  await page.getByLabel('O que mudar no plano').fill('Inclua os fins de semana')
  const answered = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/tool-suspension'))
  await askChanges.click()
  await answered
  assert.deepEqual(answers, [[`project:${projectId}`, `builder:${conversationId}`, { toolCallId: 'plan-1', resumeData: { action: 'rejected', feedback: 'Inclua os fins de semana' } }]])
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
})

test('approving a submitted plan answers it with the approval the controller moves on to Construir with', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000241'
  const projectId = '70000000-0000-4000-8000-000000000242'
  const runId = '70000000-0000-4000-8000-000000000243'
  const conversationId = 'conversation-plan-approve'
  const sourceRevision = 'c'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })

  const state = builderState([conversation(conversationId, 'Agenda')], { [conversationId]: [userMessage('user-1', 'Crie uma agenda')] })
  const answers = []
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Agenda', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'PLAN',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, failureCategory: null, requestText: 'Crie uma agenda', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => {
    answers.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
    { type: 'tool_suspended', toolCallId: 'plan-2', toolName: 'submit_plan', args: { title: 'Agenda semanal' }, suspendPayload: { title: 'Agenda semanal' } },
  )))

  await page.goto(`${origin}/projects/${projectId}/build`)
  const answered = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/tool-suspension'))
  await page.getByRole('button', { name: 'Aprovar e construir' }).click()
  await answered
  assert.deepEqual(answers, [{ toolCallId: 'plan-2', resumeData: { action: 'approved' } }])
})

const PLAN_TEXT = [
  '## Para a pessoa', '', 'Uma tela com **Compras** do mês e um botão para exportar.', '',
  '## Para Construir', '', '- Rota `/pedidos` com a operação `listarPedidos`',
].join('\n')

// A Project whose Planejar run is waiting on the person's approval of PLAN_TEXT.
const openPlanCard = async (t, answers) => {
  const accountId = '70000000-0000-4000-8000-000000000271'
  const projectId = '70000000-0000-4000-8000-000000000272'
  const runId = '70000000-0000-4000-8000-000000000273'
  const conversationId = 'conversation-plan-reader'
  const sourceRevision = 'd'.repeat(40)
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const state = builderState([conversation(conversationId, 'Compras')], { [conversationId]: [userMessage('user-1', 'Crie uma tela de compras')] })
  state.modeId = 'plan'
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Compras', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'PLAN',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, failureCategory: null, requestText: 'Crie uma tela de compras', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => {
    answers.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
    { type: 'tool_suspended', toolCallId: 'plan-r', toolName: 'submit_plan', args: { title: 'Compras do mês', plan: PLAN_TEXT }, suspendPayload: { title: 'Compras do mês', plan: PLAN_TEXT } },
  )))
  await page.goto(`${origin}/projects/${projectId}/build`)
  return page.getByRole('region', { name: 'Plano para aprovar' })
}

test('the plan card renders the Markdown of the person\'s part and leaves the technical part for the reader', async (t) => {
  const card = await openPlanCard(t, [])
  await card.getByRole('heading', { name: 'Para a pessoa' }).waitFor()
  assert.equal(await card.locator('.cx-plan-clamp strong', { hasText: 'Compras' }).count(), 1, 'the bold marks render instead of showing as asterisks')
  assert.equal(await card.getByText('listarPedidos').count(), 0, 'the technical part is not on the card')
  assert.equal(await card.locator('pre').count(), 0, 'the plan is not a monospace block')
})

test('Ler plano completo opens the whole plan over the screen, Esc closes it, and approving from it answers the plan and closes it', async (t) => {
  const answers = []
  const card = await openPlanCard(t, answers)
  const page = card.page()
  await card.getByRole('button', { name: 'Ler plano completo' }).click()
  const reader = page.getByRole('alertdialog', { name: 'Compras do mês' })
  await reader.getByText('listarPedidos').waitFor()
  await reader.getByRole('heading', { name: 'Para Construir' }).waitFor()

  await page.keyboard.press('Escape')
  await reader.waitFor({ state: 'detached' })

  await card.getByRole('button', { name: 'Ler plano completo' }).click()
  const answered = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/tool-suspension'))
  await reader.getByRole('button', { name: 'Aprovar e construir' }).click()
  await answered
  assert.deepEqual(answers, [{ toolCallId: 'plan-r', resumeData: { action: 'approved' } }])
  await reader.waitFor({ state: 'detached' })
})

test('while the first version does not exist the Preview names the phase, the tasks and the time', async (t) => {
  const tasks = [
    { id: 'task_data', content: 'Criar armazenamento', status: 'completed', activeForm: 'Criando armazenamento' },
    { id: 'task_ui', content: 'Montar a lista', status: 'in_progress', activeForm: 'Montando a lista' },
    { id: 'task_check', content: 'Verificar a Prévia', status: 'pending', activeForm: 'Verificando a Prévia' },
  ]
  const page = await openLiveTurn(t, [
    { type: 'message_start', message: assistantMessage('wait-1', 'Vou construir.') },
    { type: 'display_state_changed', displayState: { activeTools: {}, tasks } },
  ])
  const wait = page.locator('.cx-preview-wait')
  await wait.getByText('Construindo o app', { exact: true }).waitFor()
  await wait.getByText('Tarefa 2 de 3: Montando a lista', { exact: true }).waitFor()
  assert.deepEqual(await wait.locator('li').allTextContents(), ['Criar armazenamento', 'Montando a lista', 'Verificar a Prévia'])
  assert.match(await wait.locator('.cx-preview-wait-time').textContent(), /^Há \d+ s · a prévia aparece quando a primeira versão compilar$/)
})

for (const width of [1536, 1700]) {
  test(`the conversation panel fits its column at ${width}px with a long plan card and long tool rows`, async (t) => {
    const accountId = '70000000-0000-4000-8000-000000000251'
    const projectId = '70000000-0000-4000-8000-000000000252'
    const runId = '70000000-0000-4000-8000-000000000253'
    const conversationId = 'conversation-chat-width'
    const sourceRevision = 'c'.repeat(40)
    const origin = await startWebServer(t)
    const browser = await chromium.launch({ headless: true })
    t.after(() => browser.close())
    const page = await browser.newPage({ viewport: { width, height: 900 } })

    const longPath = `apps/web/src/features/${'agenda-semanal-com-nome-muito-comprido/'.repeat(4)}componente.tsx`
    const plan = ['1. Criar a tela', `2. Editar \`${longPath}\``, `3. Rodar npm run test -- ${longPath} --reporter=verbose --coverage`, `4. ${'a'.repeat(160)}`].join('\n')
    const toolPart = (id, toolName, args) => ({ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName, state: 'result', args, result: 'ok' } })
    const reply = { id: 'assistant-long', role: 'assistant', createdAt: new Date().toISOString(), content: { format: 2, parts: [
      toolPart('long-1', 'read_file', { path: longPath }),
      toolPart('long-2', 'execute_command', { command: `npm run test -- ${longPath} --reporter=verbose --coverage` }),
      { type: 'text', text: 'Li os arquivos.' },
    ] } }
    const title = 'Quero uma agenda semanal que permita marcar reuniões e enviar pedidos de aprovação'
    const state = builderState([conversation(conversationId, title)], { [conversationId]: [userMessage('user-1', 'Crie uma agenda'), reply] })
    await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
    await routeBuilder(page, state)
    await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Agenda', projectRevision: 'revision', archived: false }) }))
    await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId,
      latestBuilderRun: {
        builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT', mode: 'PLAN',
        baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
        failureCode: null, failureCategory: null, requestText: 'Crie uma agenda', createdAt: new Date().toISOString(),
      },
      latestCodeChangingRun: null,
      preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
      runHistory: [],
    }) }))
    await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
      { type: 'tool_suspended', toolCallId: 'plan-w', toolName: 'submit_plan', args: { title: 'Agenda semanal', plan }, suspendPayload: { title: 'Agenda semanal', plan } },
    )))

    await page.goto(`${origin}/projects/${projectId}/build`)
    await page.getByRole('button', { name: 'Aprovar e construir' }).waitFor()
    if (process.env.CHATWIDTH_SHOT) await page.screenshot({ path: process.env.CHATWIDTH_SHOT })
    const measured = await page.evaluate(() => {
      const chat = document.querySelector('.cx-chat')
      const composer = document.querySelector('.cx-composer')
      return {
        viewport: window.innerWidth,
        chatOverflow: chat.scrollWidth - chat.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        composerRight: Math.ceil(composer.getBoundingClientRect().right),
        chipsOverlap: document.querySelector('.cx-mode-chip').getBoundingClientRect().right > document.querySelector('.cx-model-button').getBoundingClientRect().left,
        chatRight: Math.floor(chat.getBoundingClientRect().right),
      }
    })
    assert.deepEqual(
      { chatOverflow: measured.chatOverflow, pageOverflow: measured.pageOverflow, composerInside: measured.composerRight <= measured.chatRight && measured.chatRight <= measured.viewport, chipsOverlap: measured.chipsOverlap },
      { chatOverflow: 0, pageOverflow: 0, composerInside: true, chipsOverlap: false },
      JSON.stringify(measured),
    )
  })
}
