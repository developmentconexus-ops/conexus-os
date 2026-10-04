import assert from 'node:assert/strict'
import test from 'node:test'
import { shareWebBrowser } from './web-dev-server.mjs'
import { answerPendingCard, createCards } from '../../scripts/builder-eval/run.mjs'
import { humanizeModelName, parseReasoningSuffix } from '../../apps/web/src/features/builder/composer/model-display-name.ts'

const web = shareWebBrowser()

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
  assert.equal(humanizeModelName('claude-haiku-4-5-20251001'), 'Claude Haiku 4.5 2025-10-01')
  assert.equal(humanizeModelName('claude-fable-5-1'), 'Claude Fable 5.1')
  assert.equal(humanizeModelName('gpt-5.1'), 'GPT 5.1')
  assert.equal(humanizeModelName('o1'), 'o1')
  assert.equal(humanizeModelName('gemini-3-flash'), 'Gemini 3 Flash')
  assert.equal(humanizeModelName('gemini-pro-agent'), 'Gemini Pro Agent')
  // The trailing reasoning suffix google-ai-pro/CLIProxy bakes into the id is not part of the name.
  assert.equal(humanizeModelName('gemini-3.8-flash-high'), 'Gemini 3.8 Flash')
  assert.equal(humanizeModelName('gemini-3.1-pro-low'), 'Gemini 3.1 Pro')
})

test('parseReasoningSuffix reads the level suffix Google AI Pro ids carry, and nothing for everyone else', () => {
  assert.deepEqual(parseReasoningSuffix('gemini-3.8-flash-high'), { base: 'gemini-3.8-flash', level: 'high' })
  assert.deepEqual(parseReasoningSuffix('gemini-3.1-pro-low'), { base: 'gemini-3.1-pro', level: 'low' })
  assert.equal(parseReasoningSuffix('claude-opus-4-5'), null)
  assert.equal(parseReasoningSuffix('gemini-pro-agent'), null)
})

import { BUILDER_CONTROLLER, BUILDER_MODELS, SELECTED_MODEL, assistantMessage, builderState, conversation, conversationOf, routeBuilder, sse, userMessage } from './builder-browser-fixtures.mjs'

// Two Google AI Pro models as the Hub offers them: Flash honors three levels, Pro Agent none.
const GOOGLE_AI_PRO_MODELS = [
  { id: 'google-ai-pro/gemini-3-flash', provider: 'google-ai-pro', providerName: 'Google AI Pro', modelName: 'gemini-3-flash', thinkingLevels: ['low', 'medium', 'high'], hasApiKey: true },
  { id: 'google-ai-pro/gemini-pro-agent', provider: 'google-ai-pro', providerName: 'Google AI Pro', modelName: 'gemini-pro-agent', thinkingLevels: [], hasApiKey: true },
]
const SELECTED_MODEL_NAME = humanizeModelName(BUILDER_MODELS[0].modelName)

// The retired mounts: the Conexus one and the Factory's.
const trackLegacyRequests = (page) => {
  const legacyRequests = []
  page.on('request', (request) => { if (/^\/api\/mastra(?:-factory)?\//.test(new URL(request.url()).pathname)) legacyRequests.push(request.url()) })
  return legacyRequests
}

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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)
  // The second send settles as RESPONSE_ONLY: an ordinary send that changes nothing.
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
  // The Hub's first answer is a refusal near its heap limit, which creates no run.
  let capacityFull = true
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    if (capacityFull) {
      capacityFull = false
      return route.fulfill(problem(503, 'BUILDER_CAPACITY_FULL'))
    }
    const body = route.request().postDataJSON()
    requests.push({ body, key: route.request().headers()['idempotency-key'] })
    buildCount += 1
    threadMessages.push(userMessage(`user-${threadMessages.length + 1}`, body.content))
    runFinished = false
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'RUNNING', phase: 'AGENT', baseSourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, requestText: body.content, createdAt: new Date().toISOString() }
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
    // The conversation is followed from the moment it opens; until a run made its session the Hub refuses.
    if (!run || runFinished) return route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ type: 'BUILDER_SESSION_NOT_READY' }) })
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
  const refused = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 503)
  await page.getByLabel('Mensagem para o agente').fill('Crie um contador até 100 interativo')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await refused
  await page.getByText('O Conexus está com muitas execuções abertas agora. Tente novamente mais tarde.', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Mensagem para o agente').inputValue(), 'Crie um contador até 100 interativo', 'the refused words go back to the composer')
  const firstSend = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 201)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await firstSend
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].body, { content: 'Crie um contador até 100 interativo', conversationId })
  assert.ok(requests[0].key)
  await page.locator('.cx-messages').getByText('Crie um contador até 100 interativo', { exact: true }).waitFor()
  await page.getByText('Aplicando a alteração', { exact: true }).waitFor()
  assert.deepEqual(streamScopes.slice(0, 1), [`conversation:${conversationId}`])
  await page.getByTitle('Prévia do aplicativo').waitFor()
  assert.deepEqual(previewRequests, [{}])
  await page.locator('.cx-messages').getByText('Build concluído', { exact: true }).waitFor()
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.cx-messages').getByText('Aplicando a alteração', { exact: true }).count(), 1,
    'the live message and its persisted twin share an id and render once')
  assert.equal(await page.locator('.cx-messages .builder-turn-user').count(), 1,
    'a run whose request is already a Mastra message renders one user bubble, not two')
  assert.equal(await page.locator('.cx-messages .builder-turn-status').count(), 0,
    'a run that succeeded says no failure')
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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
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
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'QUEUED', phase: null, baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
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

test('an untitled conversation shows the title the Hub announces on the run\'s stream while the run is still working', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000021'
  const projectId = '70000000-0000-4000-8000-000000000023'
  const runId = '70000000-0000-4000-8000-000000000024'
  const conversationId = '70000000-0000-4000-8000-000000000025'
  const sourceRevision = 'e'.repeat(40)
  let run = null
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
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
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'RUNNING', phase: 'AGENT', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, requestText: body.content, createdAt: new Date().toISOString() }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ builderRun: run }) })
  })
  // The Hub titles a conversation from its first request and tells the browser on the run's stream, while the run is still working.
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => {
    if (!run) return route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ type: 'BUILDER_SESSION_NOT_READY' }) })
    state.conversations = [conversation(conversationId, 'Crie um contador de visitas')]
    return route.fulfill(sse({ type: 'thread_title_updated', threadId: conversationId, title: 'Crie um contador de visitas' }))
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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })
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

  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByTitle('Prévia do aplicativo').waitFor()
  assert.equal(previewRequests.length, 1)

  assert.equal(await messageBox(page).getAttribute('placeholder'), NO_MODEL_PLACEHOLDER)
  assert.equal(await page.getByRole('button', { name: 'Enviar' }).isDisabled(), true)
  await chooseModel(page, SELECTED_MODEL_NAME)
  // The send button also stays disabled on an empty draft, so a chosen model is proven by the
  // composer's placeholder leaving its "no model" wording, not by the button alone.
  await page.waitForFunction((placeholder) => document.querySelector('[aria-label="Mensagem para o agente"]')?.getAttribute('placeholder') !== placeholder, NO_MODEL_PLACEHOLDER)
  assert.deepEqual(state.modelSwitches, [SELECTED_MODEL], 'the picker sets the conversation\'s one model')

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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })
  const legacyRequests = trackLegacyRequests(page)

  const conversationId = 'conversation-history'
  const settled = (builderRunId, baseSourceRevision, resultSourceRevision) => ({
    builderRunId, projectId, conversationId, state: 'SUCCEEDED', phase: null,
    baseSourceRevision, resultSourceRevision, resultKind: 'SOURCE_CHANGED', failureCode: null,
    requestText: `pedido ${builderRunId}`, createdAt: '2026-09-20T12:00:00.000Z',
  })
  const tracedRuns = []
  let compareQuery = null
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, { ...builderState([conversation(conversationId, 'Histórico')]), models: [...BUILDER_MODELS, ...GOOGLE_AI_PRO_MODELS] })
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'History', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: settled(latestRunId, latestBase, latestResult),
    latestCodeChangingRun: { baseSourceRevision: latestBase, resultSourceRevision: latestResult, resultKind: 'SOURCE_CHANGED' },
    preview: { workingSourceRevision: latestResult, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
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

  await page.goto(`${origin}/projects/${projectId}`)
  // The model the next run uses is the controller's own selection, and the composer shows it.
  await page.getByRole('button', { name: new RegExp(`^Modelo ${SELECTED_MODEL_NAME}, `) }).waitFor()
  await openModelPicker(page)
  await page.getByRole('option', { name: 'Claude Opus 4.5' }).waitFor()
  await page.getByRole('option', { name: 'Claude Sonnet 4.5' }).waitFor()
  assert.equal(await page.getByRole('option').count(), 4, 'a model the controller has no key for is never offered')

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

  // Each model offers the levels it honors: Gemini Flash three, and Gemini Pro Agent, which has none, says so.
  await chooseModel(page, 'Gemini 3 Flash')
  await openModelPicker(page)
  assert.deepEqual([await slider.getAttribute('aria-valuemax'), await slider.getAttribute('aria-valuetext'), await page.locator('.cx-effort-dot').count()], ['2', 'Médio', 3])
  const flashSlider = await slider.boundingBox()
  await page.mouse.click(flashSlider.x + flashSlider.width - 2, flashSlider.y + flashSlider.height / 2)
  for (let wait = 0; wait < 50 && thinkingLevels.at(-1) !== 'high'; wait += 1) await page.waitForTimeout(100)
  assert.equal(thinkingLevels.at(-1), 'high', 'Gemini Flash takes its own top level')
  await page.keyboard.press('Escape')
  await chooseModel(page, 'Gemini Pro Agent')
  await openModelPicker(page)
  await page.getByText('Este modelo não tem nível de raciocínio para escolher.').waitFor()
  assert.equal(await page.getByRole('slider', { name: 'Raciocínio' }).count(), 0)
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'Sobre' }).click()
  await page.getByText('Detalhes técnicos', { exact: true }).click()
  await page.locator('.cx-hash-table code').filter({ hasText: latestRunId.slice(0, 7) }).first().hover()
  await page.getByRole('tooltip').filter({ hasText: latestRunId }).waitFor()
  await page.locator('.cx-run-entry').nth(1).click()
  await page.locator('.cx-hash-table code').filter({ hasText: olderRunId.slice(0, 7) }).first().hover()
  await page.getByRole('tooltip').filter({ hasText: olderRunId }).waitFor()
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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })
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
      body: JSON.stringify({ builderRun: { builderRunId: '70000000-0000-4000-8000-000000000073', projectId, state: 'QUEUED', phase: null, baseSourceRevision: '5'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null } }),
    })
  })

  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByLabel('Mensagem para o agente').fill('Crie um contador')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.getByText('A tela não conseguiu falar com o Conexus agora. Tente novamente mais tarde.', { exact: true }).waitFor()
  const user = page.locator('.cx-messages .builder-turn-user-row')
  await user.getByText('Sem confirmação', { exact: true }).waitFor()
  assert.equal(await user.getByText('Não enviado', { exact: true }).count(), 0, 'a lost response is not a refusal')
  assert.deepEqual(await user.locator('.builder-turn-user').allTextContents(), ['Crie um contador'], 'the unsent message keeps its place and its words')
  assert.equal(await messageBox(page).inputValue(), 'Crie um contador', 'the words go back to the composer')
  const retry = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 201)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await retry
  assert.equal(keys.length, 2)
  assert.equal(keys[0], keys[1], `a resend of the same text issued a second key: ${keys.join(' vs ')}`)
  await user.getByText('Sem confirmação', { exact: true }).waitFor({ state: 'detached' })
  assert.deepEqual(await user.locator('.builder-turn-user').allTextContents(), ['Crie um contador'], 'the resend is the same message, not a second one')
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
})

test('a send the Hub refused reads Não enviado and takes a fresh key on a resend', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000081'
  const projectId = '70000000-0000-4000-8000-000000000082'
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })
  const legacyRequests = trackLegacyRequests(page)

  const keys = []
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, builderState([conversation('conversation-refused', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Idempotency', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: null, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  // The Hub answers the first attempt with a refusal, so the message certainly did not take.
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, (route) => {
    keys.push(route.request().headers()['idempotency-key'])
    return keys.length === 1 ? route.fulfill(problem(500, 'INTERNAL_UNEXPECTED')) : route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ builderRun: { builderRunId: '70000000-0000-4000-8000-000000000083', projectId, state: 'QUEUED', phase: null, baseSourceRevision: '5'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode: null } }),
    })
  })

  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByLabel('Mensagem para o agente').fill('Crie um contador')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await page.getByText('O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.', { exact: true }).waitFor()
  const user = page.locator('.cx-messages .builder-turn-user-row')
  await user.getByText('Não enviado', { exact: true }).waitFor()
  assert.equal(await user.getByText('Sem confirmação', { exact: true }).count(), 0)
  assert.deepEqual(await user.locator('.builder-turn-user').allTextContents(), ['Crie um contador'], 'the unsent message keeps its place and its words')
  assert.equal(await messageBox(page).inputValue(), 'Crie um contador', 'the words go back to the composer')
  const retry = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 201)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await retry
  assert.equal(keys.length, 2)
  assert.notEqual(keys[0], keys[1], 'a refusal took no effect, so its key is not reused')
  await user.getByText('Não enviado', { exact: true }).waitFor({ state: 'detached' })
  assert.deepEqual(await user.locator('.builder-turn-user').allTextContents(), ['Crie um contador'], 'the resend is the same message, not a second one')
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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
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
      builderRun: { builderRunId: '70000000-0000-4000-8000-000000000025', projectId, state: 'SUCCEEDED', phase: null, baseSourceRevision: sourceA, resultSourceRevision: sourceB, resultKind: 'SOURCE_CHANGED', failureCode: null },
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
  await page.goto(`${origin}/projects/${projectId}`)
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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)
  // Nothing reached Mastra: the run failed while the sandbox was being prepared, so the thread is
  // empty and the row is the only record of what the operator asked for.
  const conversationId = 'conversation-pre-agent-failure'
  const failedRun = {
    builderRunId: runId, projectId, conversationId, state: 'FAILED', phase: null,
    baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
    failureCode: 'BUILDER_STARTER_ROOT_REFUSED',
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
  await page.goto(`${origin}/projects/${projectId}`)
  await page.locator('.cx-messages').getByText('Crie um contador até 100 interativo', { exact: true }).waitFor()
  await page.locator('.cx-messages .builder-turn-status').getByText('O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.', { exact: true }).waitFor()
  assert.equal(await page.locator('.cx-messages .builder-turn-user').count(), 1,
    'the run appears once although it is both the latest run and a history entry')
  assert.equal(await page.locator('.cx-messages .builder-turn-status').count(), 1)
  await page.locator('.cx-messages .builder-turn-reference').getByText('Referência: 70000000.', { exact: true }).waitFor()
  // The failure code may now live only inside a closed <details>, so it must not be visible rather
  // than simply absent.
  assert.equal(await page.getByText('BUILDER_STARTER_ROOT_REFUSED', { exact: true }).isVisible(), false,
    'the internal code is never the sentence the operator reads')
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
})

test('each failed run ends its own turn with its failure said once, and the stored error part and the Hub notices say nothing of it', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000051'
  const projectId = '70000000-0000-4000-8000-000000000052'
  const conversationId = 'conversation-two-runs'
  const sourceRevision = '8'.repeat(40)
  const failure = 'O provedor do modelo recusou ou interrompeu o pedido. Escolha outro modelo.'
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
  const at = (minute) => `2026-09-20T12:0${minute}:00.000Z`
  const stored = (id, minute, role, parts, metadata) => ({ id, role, createdAt: at(minute), content: { format: 2, parts, ...(metadata ? { metadata } : {}) } })
  const notification = (id, minute, run, outcome, contents) => stored(id, minute, 'signal', [{ type: 'text', text: contents }], { signal: { type: 'notification', attributes: { source: 'conexus', outcome, run } } })
  const failedRun = {
    builderRunId: '70000000-0000-4000-8000-000000000053', projectId, conversationId, state: 'FAILED', phase: null, baseSourceRevision: sourceRevision,
    resultSourceRevision: null, resultKind: null, failureCode: 'BUILDER_MODEL_STREAM_FAILED', requestText: 'Primeiro pedido', createdAt: at(0),
  }
  const answeredRun = {
    builderRunId: '70000000-0000-4000-8000-000000000054', projectId, conversationId, state: 'SUCCEEDED', phase: null, baseSourceRevision: sourceRevision,
    resultSourceRevision: null, resultKind: 'RESPONSE_ONLY', failureCode: null, requestText: 'Segundo pedido', createdAt: at(2),
  }
  const threadMessages = [
    stored('user-1', 0, 'user', [{ type: 'text', text: 'Primeiro pedido' }]),
    stored('assistant-1', 0, 'assistant', [{ type: 'error', error: 'sandbox sbx-42: upstream 500 at frame 7' }]),
    notification('note-1', 1, failedRun.builderRunId, 'RUN_NOT_FINISHED', 'A execução não terminou e nada dela foi aplicado. Diagnóstico seguro: BUILDER_MODEL_STREAM_FAILED.'),
    stored('user-2', 2, 'user', [{ type: 'text', text: 'Segundo pedido' }]),
    stored('assistant-2', 2, 'assistant', [{ type: 'text', text: 'Respondido.' }]),
    notification('note-2', 3, answeredRun.builderRunId, 'BOOT_PROBLEMS', 'A execução foi aplicada. Detalhe: BOOT_CONSOLE_ERROR Failed to load notes.'),
    notification('note-3', 3, answeredRun.builderRunId, 'PREVIEW_DATA_RESET', 'A execução mudou migrações que já tinham sido aplicadas.'),
  ]
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, builderState([conversation(conversationId, 'Duas execuções')], { [conversationId]: threadMessages }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Duas execuções', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: answeredRun, latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [answeredRun, failedRun],
  }) }))
  await page.goto(`${origin}/projects/${projectId}`)
  const messages = page.locator('.cx-messages')
  await messages.getByText('Respondido.', { exact: true }).waitFor()
  await messages.getByText('O app abriu, mas com problemas. Peça ao Builder para corrigir.', { exact: true }).waitFor()
  await messages.getByText('Os dados da Prévia foram apagados porque migrações já aplicadas mudaram.', { exact: true }).waitFor()
  const text = await messages.innerText()
  assert.equal(text.split(failure).length - 1, 1, 'the failure is said once')
  assert.ok(text.indexOf('Primeiro pedido') < text.indexOf(failure) && text.indexOf(failure) < text.indexOf('Segundo pedido'), 'the failure ends the turn of the run that failed')
  assert.ok(text.includes('Referência: 70000000.'))
  for (const unsaid of ['sbx-42', 'Diagnóstico seguro', 'BUILDER_MODEL_STREAM_FAILED', 'BOOT_CONSOLE_ERROR', 'não terminou']) {
    assert.equal(text.includes(unsaid), false, `${unsaid} is never drawn`)
  }
  assert.equal(await page.getByRole('alert').count(), 1)
})

test('the slider and /raciocinio offer exactly the levels of the selected model, named in Portuguese', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000091'
  const projectId = '70000000-0000-4000-8000-000000000092'
  const conversationId = 'conversation-levels'
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
  const models = [
    { id: 'anthropic/claude-opus-5-5', provider: 'anthropic', providerName: 'Anthropic (Claude)', modelName: 'claude-opus-5-5', thinkingLevels: ['off', 'low', 'medium', 'high', 'xhigh', 'max'], hasApiKey: true },
    { id: 'google-ai-pro/gemini-3-flash', provider: 'google-ai-pro', providerName: 'Google AI Pro', modelName: 'gemini-3-flash', thinkingLevels: ['low', 'medium', 'high'], hasApiKey: true },
    { id: 'google-ai-pro/gemini-pro-agent', provider: 'google-ai-pro', providerName: 'Google AI Pro', modelName: 'gemini-pro-agent', thinkingLevels: [], hasApiKey: true },
  ]
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, { ...builderState([conversation(conversationId, 'Conversa')], {}, 'anthropic/claude-opus-5-5'), models, defaultThinkingLevel: 'high' })
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Níveis', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: null, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  const chosen = []
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/state*`, (route) => {
    const level = route.request().postDataJSON()?.state?.thinkingLevel
    if (level) chosen.push(level)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.goto(`${origin}/projects/${projectId}`)
  await messageBox(page).waitFor()

  const commandLevels = async () => {
    await page.locator('.cx-model-popover').waitFor({ state: 'detached' })
    await messageBox(page).fill('/raciocinio ')
    const options = page.getByRole('option')
    await options.first().waitFor()
    const labels = await options.allTextContents()
    await messageBox(page).fill('')
    return labels
  }
  await openModelPicker(page)
  const slider = page.getByRole('slider', { name: 'Raciocínio' })
  assert.deepEqual([await slider.getAttribute('aria-valuemax'), await slider.getAttribute('aria-valuetext'), await page.locator('.cx-effort-dot').count()], ['5', 'Alto', 6], 'a conversation with no level of its own runs at the level the Hub sends')
  const sliderBox = await slider.boundingBox()
  await page.mouse.click(sliderBox.x + sliderBox.width - 2, sliderBox.y + sliderBox.height / 2)
  for (let wait = 0; wait < 50 && chosen.at(-1) !== 'max'; wait += 1) await page.waitForTimeout(100)
  assert.equal(chosen.at(-1), 'max', 'the top stop is Máximo')
  await page.keyboard.press('Escape')
  assert.deepEqual(await commandLevels(), ['Desligado', 'Baixo', 'Médio', 'Alto', 'Muito alto', 'Máximo'])

  await chooseModel(page, 'Gemini 3 Flash')
  assert.deepEqual(await commandLevels(), ['Baixo', 'Médio', 'Alto'])
  await messageBox(page).fill('/raciocinio high')
  await messageBox(page).press('Enter')
  for (let wait = 0; wait < 50 && chosen.at(-1) !== 'high'; wait += 1) await page.waitForTimeout(100)
  assert.equal(chosen.at(-1), 'high')
  await messageBox(page).fill('/raciocinio  LOW ')
  await messageBox(page).press('Enter')
  for (let wait = 0; wait < 50 && chosen.at(-1) !== 'low'; wait += 1) await page.waitForTimeout(100)
  assert.equal(chosen.at(-1), 'low', "Mastra Code's own parse ignores case and spacing")

  await chooseModel(page, 'Gemini Pro Agent')
  await page.locator('.cx-model-popover').waitFor({ state: 'detached' })
  await messageBox(page).fill('/raci')
  assert.equal(await page.getByRole('option').count(), 0, 'a model with no reasoning level has no /raciocinio command')
})

test('a run notice the Hub signalled into the thread reads as a notice, apart from the Builder\'s own turn', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000081'
  const projectId = '70000000-0000-4000-8000-000000000082'
  const conversationId = 'conversation-run-notice'
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
  const notice = {
    id: 'notice-1', role: 'signal', createdAt: new Date().toISOString(),
    content: { format: 2, parts: [{ type: 'text', text: 'A execução r1 foi aplicada, mas ao abrir o app o Conexus viu problemas. Detalhe: BOOT_CONSOLE_ERROR.' }], metadata: { signal: { id: 'notice-1', type: 'notification', attributes: { source: 'conexus', outcome: 'BOOT_PROBLEMS', run: 'r1' } } } },
  }
  const state = builderState([conversation(conversationId, 'Conversa')], { [conversationId]: [userMessage('user-1', 'Crie uma agenda'), assistantMessage('assistant-1', 'Comecei pela lista.'), notice] })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Agenda', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId, latestBuilderRun: null, latestCodeChangingRun: null,
    preview: { workingSourceRevision: null, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.goto(`${origin}/projects/${projectId}`)
  const shown = page.locator('.cx-messages .builder-turn-notice')
  await shown.waitFor()
  assert.deepEqual(await shown.allTextContents(), ['O app abriu, mas com problemas. Peça ao Builder para corrigir.'])
  assert.equal(await shown.getAttribute('role'), 'note')
  await page.locator('.cx-messages .builder-turn-assistant .builder-turn-body', { hasText: 'Comecei pela lista.' }).waitFor()
  assert.deepEqual(await page.locator('.cx-messages .builder-turn-assistant .builder-turn-body').allTextContents(), ['Comecei pela lista.'],
    'the notice is not inside the Builder\'s turn')
})

test('an agent that spoke once and then works in silence still reads as working, with its elapsed time and a way to stop', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000071'
  const projectId = '70000000-0000-4000-8000-000000000072'
  const runId = '70000000-0000-4000-8000-000000000073'
  const sourceRevision = '7'.repeat(40)
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
  const legacyRequests = trackLegacyRequests(page)
  const working = 'conversation-working'
  const other = 'conversation-other'
  const baseRun = {
    builderRunId: runId, projectId, conversationId: working, state: 'RUNNING', phase: 'AGENT',
    baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null,
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

  await page.goto(`${origin}/projects/${projectId}`)
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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
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

  await page.goto(`${origin}/projects/${projectId}`)
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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
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

  await page.goto(`${origin}/projects/${projectId}`)
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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
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
      builderRun: { builderRunId: '70000000-0000-4000-8000-000000000035', projectId, state: 'SUCCEEDED', phase: null, baseSourceRevision: sourceA, resultSourceRevision: sourceB, resultKind: 'SOURCE_CHANGED', failureCode: null },
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
  await page.goto(`${origin}/projects/${projectId}`)
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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })

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
    run = { builderRunId: runId, projectId, conversationId: body.conversationId, state: 'RUNNING', phase: 'AGENT', baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null, requestText: body.content, createdAt: new Date().toISOString() }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ builderRun: run }) })
  })
  await page.route('**/api/control/model-accounts/models', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: BUILDER_MODELS, defaultThinkingLevel: 'medium' }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*`, (route) => {
    const id = conversationOf(route.request().url())
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelId: models[id] ?? '', threadId: id }) })
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

  await page.goto(`${origin}/projects/${projectId}`)
  await page.locator('.cx-messages').getByText('Contador pronto', { exact: true }).waitFor()
  assert.deepEqual(await readConversationTitles(page, 2), ['Contador', 'Relógio'])
  assert.equal(await page.getByRole('button', { name: 'Renomear' }).count(), 0, 'the Builder has no conversation rename feature')
  assert.deepEqual(messageReads.at(0), [`project:${projectId}`, counterId], 'the messages come from the conversation\'s own thread under its Project')

  await chooseModel(page, SELECTED_MODEL_NAME)
  // The send button also stays disabled on an empty draft, so a chosen model is proven by the
  // composer's placeholder leaving its "no model" wording, not by the button alone.
  await page.waitForFunction((placeholder) => document.querySelector('[aria-label="Mensagem para o agente"]')?.getAttribute('placeholder') !== placeholder, NO_MODEL_PLACEHOLDER)
  assert.deepEqual(modelWrites, [[counterId, SELECTED_MODEL]], 'one write for the conversation')

  const createConversation = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/builder/agent-controller/conexus-builder/sessions' && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await createConversation
  assert.equal(opened.length, 1)
  const [[resourceId, sessionScope, threadId]] = opened
  assert.equal(resourceId, `project:${projectId}`)
  assert.match(threadId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(sessionScope, `conversation:${threadId}`, 'a conversation is opened as its own session on the thread of the same id')
  assert.equal((await readConversationTitles(page, 3)).length, 3)
  assert.deepEqual(modelWrites, [[counterId, SELECTED_MODEL]], 'a model chosen in one conversation is not written onto another')

  await switchConversationTo(page, 'Contador')
  await page.locator('.cx-messages').getByText('Contador pronto', { exact: true }).waitFor()
  await page.getByLabel('Mensagem para o agente').fill('Mostre UNIT1-browser')
  const sendResponse = page.waitForResponse((response) => response.url().endsWith('/builder-session/messages') && response.status() === 201)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await sendResponse
  await page.getByText('Trabalhando no repositório', { exact: true }).waitFor()
  assert.deepEqual(streams.at(0), [`project:${projectId}`, `conversation:${counterId}`])
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
})

test('a turn the stream delivered only in part is completed from the thread, and drawn once', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000101'
  const projectId = '70000000-0000-4000-8000-000000000102'
  const runId = '70000000-0000-4000-8000-000000000103'
  const conversationId = 'conversation-dedup'
  const sourceRevision = 'e'.repeat(40)
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })
  const legacyRequests = trackLegacyRequests(page)

  // The controller stores a turn under the message and call ids its stream used, with a step-start
  // part at each step the stream never sends. The stream here ends after three calls; the thread
  // holds the whole turn: three more calls and the reply.
  const finalText = 'Concluído: atualizei o texto em destaque.'
  const toolPart = (id, toolName) => ({ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName, state: 'result', args: {}, result: 'ok' } })
  const tools = ['read_file', 'edit_file', 'execute_command', 'read_file', 'edit_file', 'execute_command'].map((name, index) => toolPart(`tool-${index}`, name))
  const liveReply = { id: 'turn-1', role: 'assistant', createdAt: new Date().toISOString(), content: { format: 2, parts: tools.slice(0, 3) } }
  const persistedReply = {
    id: 'turn-1', role: 'assistant', createdAt: new Date().toISOString(),
    content: { format: 2, parts: [...tools.slice(0, 3), { type: 'step-start' }, ...tools.slice(3), { type: 'step-start' }, { type: 'text', text: finalText }] },
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
      builderRunId: runId, projectId, conversationId, state: runFinished ? 'SUCCEEDED' : 'RUNNING', phase: runFinished ? null : 'AGENT',
      baseSourceRevision: sourceRevision, resultSourceRevision: runFinished ? sourceRevision : null, resultKind: runFinished ? 'SOURCE_CHANGED' : null,
      failureCode: null, requestText: 'Atualize o texto em destaque', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: runFinished ? { baseSourceRevision: sourceRevision, resultSourceRevision: sourceRevision, resultKind: 'SOURCE_CHANGED' } : null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: runFinished ? sourceRevision : null, lastGoodArtifactRevisionId: runFinished ? 'artifact' : null, lastGoodArtifactDigest: runFinished ? 'd'.repeat(64) : null },
    runHistory: [],
  }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/preview`, (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ entryUrl: `${origin}/preview-entry`, previewUrl: `${origin}/preview`, entryGrant: 'grant', artifactRevisionId: 'artifact', artifactDigest: 'd'.repeat(64), expiresAt: new Date(Date.now() + 60_000).toISOString() }) }))
  await page.route(`${origin}/preview-entry`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title><main>ok</main>' }))
  await page.route(`**/api/control/projects/${projectId}/source/compare*`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ baseSourceRevision: sourceRevision, resultSourceRevision: sourceRevision, files: [{ path: 'app/main.tsx', status: 'MODIFIED', previousPath: null }] }) }))
  // A stream replays nothing: the events reach the first subscription only.
  let streamed = false
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => {
    if (streamed) return route.fulfill(sse())
    streamed = true
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

  await page.goto(`${origin}/projects/${projectId}`)
  await page.locator('.cx-messages').getByText('Atualize o texto em destaque', { exact: true }).waitFor()
  await page.getByTitle('Prévia do aplicativo').waitFor()
  await page.waitForTimeout(600)

  await page.locator('.cx-messages').getByText(finalText, { exact: true }).waitFor()
  assert.equal(await page.locator('.cx-messages').getByText(finalText, { exact: true }).count(), 1,
    'the reply the stream never delivered is drawn once, from the thread')
  assert.equal(await page.locator('.builder-turn-body button').count(), 1,
    'the streamed calls and the stored ones are one turn, not a second copy of it')
  await page.getByRole('button', { name: 'Leu 2 arquivos, editou 2 arquivos, executou 2 comandos', exact: true }).waitFor()
  assert.deepEqual(legacyRequests, [], 'a Project never reaches a retired mount')
})

test('a page opened while the run is parked shows the question card once from the thread alone, and answering takes the run out of WAITING', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000301'
  const projectId = '70000000-0000-4000-8000-000000000302'
  const runId = '70000000-0000-4000-8000-000000000303'
  const conversationId = 'conversation-parked-reload'
  const sourceRevision = 'a'.repeat(40)
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })

  const question = 'Qual status um pedido pode ter?'
  const ask = { questions: [{ question, options: [{ label: 'Aberto' }, { label: 'Pago' }] }] }
  // The thread as Mastra stores it while parked: the open call, and its suspension in the metadata.
  const asking = {
    id: 'asking-1', role: 'assistant', createdAt: new Date().toISOString(),
    content: { format: 2, parts: [{ type: 'text', text: 'Preciso saber uma coisa.' }, { type: 'tool-invocation', toolInvocation: { toolCallId: 'ask-1', toolName: 'ask_user', state: 'call', args: ask } }],
      metadata: { suspendedTools: { ask_user: { toolCallId: 'ask-1', toolName: 'ask_user', args: ask, suspendPayload: ask, runId: 'agent-run-1' } } } },
  }
  const state = builderState([conversation(conversationId, 'Pedidos')], { [conversationId]: [userMessage('user-1', 'Crie um controle de pedidos'), asking] })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Pedidos', projectRevision: 'revision', archived: false }) }))
  let answered = false
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: answered ? 'AGENT' : 'WAITING',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, requestText: 'Crie um controle de pedidos', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  // The stream sends nothing on subscribe, the way Mastra's does.
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse()))
  const answers = []
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => {
    answers.push(route.request().postDataJSON())
    answered = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByText(question, { exact: true }).waitFor()
  await page.getByRole('radio', { name: 'Pago' }).waitFor()
  assert.equal(await page.getByText(question, { exact: true }).count(), 1, 'one card for the question')
  assert.equal(await page.locator('.builder-turn-body button').count(), 0, 'no tool row for the call the card answers')
  await page.locator('.cx-chat-step', { hasText: 'Aguardando você' }).waitFor()
  await page.getByText('Esperando a sua resposta').first().waitFor()
  const sent = page.waitForResponse((response) => response.url().includes('/tool-suspension'))
  await page.getByRole('radio', { name: 'Pago' }).click()
  await page.getByRole('button', { name: 'Enviar resposta' }).click()
  await sent
  assert.deepEqual(answers, [{ toolCallId: 'ask-1', resumeData: ['Pago'] }])
  await page.waitForFunction(() => !document.body.innerText.includes('Esperando a sua resposta'), null, { timeout: 15000 })
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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })

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
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, requestText: 'Destaque o título com uma cor', createdAt: new Date().toISOString(),
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
    { type: 'tool_suspended', toolCallId: 'tool-ask-1', toolName: 'ask_user', args: { questions: [{ question, options }] }, suspendPayload: { questions: [{ question, options }] } },
  )))

  await page.goto(`${origin}/projects/${projectId}`)

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
  await page.getByRole('button', { name: 'Enviar resposta' }).click()
  await suspensionSent
  assert.deepEqual(suspensionRequests, [{ toolCallId: 'tool-ask-1', resumeData: ['Azul'] }],
    'the chosen option label is sent as respondToToolSuspension\'s resumeData, one answer per question')

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
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })

  const threadMessages = [userMessage('user-1', 'Mude o título')]
  const state = builderState([conversation(conversationId, 'Título')], { [conversationId]: threadMessages })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Título', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, requestText: 'Mude o título', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(...events)))
  await page.goto(`${origin}/projects/${projectId}`)
  return page
}

test('the run the Hub publishes into the stream moves the status line without another builder-session read', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000311'
  const projectId = '70000000-0000-4000-8000-000000000312'
  const runId = '70000000-0000-4000-8000-000000000313'
  const conversationId = 'conversation-streamed-phase'
  const sourceRevision = 'b'.repeat(40)
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })
  const run = {
    builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT',
    baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
    failureCode: null, requestText: 'Mude o título', createdAt: new Date().toISOString(),
  }
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, builderState([conversation(conversationId, 'Título')], { [conversationId]: [userMessage('user-1', 'Mude o título')] }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Título', projectRevision: 'revision', archived: false }) }))
  // Only the first read is answered: whatever the screen learns after it comes from the stream.
  let reads = 0
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    reads += 1
    if (reads > 1) return undefined
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, latestBuilderRun: run, latestCodeChangingRun: null,
      preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
      runHistory: [],
    }) })
  })
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
    { type: 'state_changed', state: { yolo: true, conexusRun: { ...run, phase: 'COMPILING' } }, changedKeys: ['conexusRun'] },
  )))
  await page.goto(`${origin}/projects/${projectId}`)
  await page.locator('.cx-chat-step', { hasText: 'Verificando o app' }).waitFor()
})

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

test('a long reply that arrives at once is laid down word by word, and ends whole', async (t) => {
  const reply = Array.from({ length: 80 }, (_, index) => `palavra${index}`).join(' ')
  const page = await openLiveTurn(t, [{ type: 'message_start', message: assistantMessage('live-reveal-1', reply) }])
  const shown = page.locator('.cx-messages').getByText(/palavra0/)
  await shown.waitFor()
  const first = (await shown.innerText()).split(/\s+/).length
  assert.ok(first < 80, `the reply starts partly laid down, not whole (${first} of 80 words)`)
  await page.locator('.cx-messages').getByText(reply, { exact: true }).waitFor({ timeout: 15_000 })
})

test('a model call the controller is retrying reads as a retry in progress, not as a failure, and the next reply clears it', async (t) => {
  const retryError = { type: 'error', error: { message: 'Service Unavailable' }, retryable: true, retryAttempt: 2, maxRetries: 10 }
  const retrying = await openLiveTurn(t, [retryError])
  await retrying.getByRole('status').getByText('O modelo não respondeu. Tentando de novo (2 de 10).', { exact: true }).waitFor()
  assert.equal(await retrying.getByRole('alert').count(), 0, 'a retry is not a failure')
  const recovered = await openLiveTurn(t, [retryError, { type: 'message_start', message: assistantMessage('live-retry-1', 'Voltei.') }])
  await recovered.locator('.cx-messages').getByText('Voltei.', { exact: true }).waitFor()
  assert.equal(await recovered.getByText('Tentando de novo', { exact: false }).count(), 0)
  assert.equal(await recovered.getByRole('alert').count(), 0)
})

test("a model error the controller gives up on adds no card to the thread, and never shows the provider's words", async (t) => {
  const page = await openLiveTurn(t, [{ type: 'error', error: { message: 'sandbox sbx-42: upstream 500 at frame 7' }, retryable: false }])
  await page.locator('.cx-messages').waitFor()
  assert.equal(await page.getByRole('alert').count(), 0)
  assert.equal(await page.getByText('sbx-42', { exact: false }).count(), 0)
  assert.equal(await page.getByText('parou com um erro', { exact: false }).count(), 0)
})

const reasoningPart = { type: 'reasoning', reasoning: 'Planning schema validation', details: [{ type: 'text', text: 'Planning schema validation' }] }

test('a reasoning part still streaming is one "Pensando…" line and not yet a "Pensou" row', async (t) => {
  const page = await openLiveTurn(t, [
    { type: 'message_start', message: assistantMessage('live-reasoning-1', 'Certo.') },
    { type: 'message_update', id: 'live-reasoning-1', event: { type: 'part', index: 1, part: reasoningPart } },
  ])
  await page.getByText('Pensando…', { exact: true }).waitFor()
  assert.equal(await page.getByText('Pensou', { exact: true }).count(), 0, 'the thought is not settled yet')
})

test('a reasoning part that settled is a collapsed "Pensou" row that opens to its text', async (t) => {
  const page = await openLiveTurn(t, [
    { type: 'message_start', message: assistantMessage('live-reasoning-2', 'Certo.') },
    { type: 'message_update', id: 'live-reasoning-2', event: { type: 'part', index: 1, part: reasoningPart } },
    { type: 'message_update', id: 'live-reasoning-2', event: { type: 'part', index: 2, part: { type: 'text', text: 'Pronto.' } } },
  ])
  await page.locator('.cx-messages').getByText('Pronto.', { exact: true }).waitFor()
  assert.equal(await page.getByText('Pensando…').count(), 0)
  assert.equal(await page.getByText('Planning schema validation').count(), 0, 'collapsed, the text is not on screen')
  await page.getByText('Pensou', { exact: true }).click()
  await page.getByText('Planning schema validation').waitFor()
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
const ASK_ARGS = { questions: [{ question: 'Qual número de orçamento podemos usar?', options: null }] }
const ASK_QUESTION = ASK_ARGS.questions[0].question
const askParts = (answered) => [
  { type: 'text', text: 'Preciso de um número.' },
  { type: 'tool-invocation', toolInvocation: { toolCallId: 'call_ask', toolName: 'ask_user', state: 'call', args: ASK_ARGS } },
  ...(answered ? [{ type: 'tool-invocation', toolInvocation: { toolCallId: 'call_ask', toolName: 'ask_user', state: 'result', args: {}, result: { content: 'User answered:\nQual número de orçamento podemos usar?: 144118. O markup é 1.45 × custo.', isError: false } } }] : []),
]
const askEvents = (answered) => [
  { type: 'message_start', message: { ...assistantMessage('ask-live', ''), content: { format: 2, parts: askParts(false) } } },
  { type: 'tool_suspended', toolCallId: 'call_ask', toolName: 'ask_user', args: ASK_ARGS, suspendPayload: ASK_ARGS },
  { type: 'display_state_changed', displayState: { activeTools: { call_ask: { name: 'ask_user', args: ASK_ARGS, status: 'error' } }, tasks: [] } },
  ...(answered ? [
    { type: 'message_update', id: 'ask-live', event: { type: 'part', index: 2, part: askParts(true)[2] } },
    { type: 'tool_end', toolCallId: 'call_ask', result: { content: 'User answered:\nQual número de orçamento podemos usar?: 144118. O markup é 1.45 × custo.', isError: false }, isError: false },
  ] : []),
]

test('a question waiting for the person is a card, not a failed tool row', async (t) => {
  const page = await openLiveTurn(t, askEvents(false))
  await page.getByText(ASK_QUESTION, { exact: true }).waitFor()
  assert.equal(await page.getByText(ASK_QUESTION, { exact: true }).count(), 1, 'one card for the question')
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
  assert.equal((await asked.textContent()).trim(), `${ASK_QUESTION}144118. O markup é 1.45 × custo.`)
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

// The eval driver answers the real multi-question card: a pick by option label (also one spelled without
// the "(recomendado)" suffix the agent adds), an own answer typed into "Outra resposta", and a fallback to
// the first option when the person's answer matches nothing usable.
test('the eval driver answers every question of the real multi-question ask_user card', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000231'
  const projectId = '70000000-0000-4000-8000-000000000232'
  const runId = '70000000-0000-4000-8000-000000000233'
  const conversationId = 'conversation-ask-user-many'
  const sourceRevision = 'd'.repeat(40)
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })

  const questions = [
    { question: 'Contar provisórios?', multiSelect: false, options: [{ label: 'Sim, contar também os provisórios', description: 'Inclui rascunhos' }, { label: 'Não' }] },
    { question: 'O que excluir?', multiSelect: true, options: [{ label: 'Cancelados' }, { label: 'Estornados' }] },
    { question: 'Qual período?', multiSelect: false, options: [{ label: 'Mês atual' }, { label: 'Ano' }] },
    { question: 'Qual valor usar?', multiSelect: false, options: [{ label: 'Valor original do título (recomendado)', description: 'Sem juros' }, { label: 'Valor líquido' }] },
  ]
  const suspensionRequests = []
  const state = builderState([conversation(conversationId, 'Cartão')], { [conversationId]: [userMessage('user-1', 'Crie um painel')] })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Cartão', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, requestText: 'Crie um painel', createdAt: new Date().toISOString(),
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
    { type: 'tool_suspended', toolCallId: 'tool-ask-many', toolName: 'ask_user', args: { questions }, suspendPayload: { questions } },
  )))
  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByText('Contar provisórios?', { exact: true }).waitFor()

  const scripted = {
    'Contar provisórios?': ['Sim, contar também os provisórios'],
    'O que excluir?': ['Excluir cartão e marketplace'],
    'Qual período?': ['Mês atual'],
    'Qual valor usar?': ['Valor original do título'],
  }
  const person = { answer: async ({ question }) => ({ answer: scripted[question], via: 'case', ruleIds: [] }) }
  const cards = createCards({ person })
  const suspensionSent = page.waitForResponse((response) => response.url().includes('/tool-suspension'))
  await answerPendingCard(page, cards, null)
  await suspensionSent
  assert.deepEqual(suspensionRequests, [{ toolCallId: 'tool-ask-many', resumeData: [
    'Sim, contar também os provisórios',
    ['Excluir cartão e marketplace'],
    'Mês atual',
    'Valor original do título (recomendado)',
  ] }])
})

// A free-text ask_user (no options on the suspend payload) drives AskUserPt's other branch: the
// same pt-BR placeholder and submit label the fixture above never exercises.
test('a suspended ask_user with no options renders the pt-BR free-text form', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000211'
  const projectId = '70000000-0000-4000-8000-000000000212'
  const runId = '70000000-0000-4000-8000-000000000213'
  const conversationId = 'conversation-ask-user-freetext'
  const sourceRevision = 'e'.repeat(40)
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 900 } })

  const question = 'Qual nome você quer para o app?'
  const threadMessages = [userMessage('user-1', 'Crie um app de lista de tarefas')]
  const state = builderState([conversation(conversationId, 'Lista de tarefas')], { [conversationId]: threadMessages })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Lista de tarefas', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, requestText: 'Crie um app de lista de tarefas', createdAt: new Date().toISOString(),
    },
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
    { type: 'tool_suspended', toolCallId: 'tool-ask-2', toolName: 'ask_user', args: { questions: [{ question }] }, suspendPayload: { questions: [{ question }] } },
  )))

  await page.goto(`${origin}/projects/${projectId}`)

  await page.getByPlaceholder('Digite sua resposta…').waitFor()
  await page.getByRole('button', { name: 'Enviar resposta' }).waitFor()
})


// A conversation of Project "Agenda" whose latest run, when given, is working.
const openAgenda = async (t, { accountId, projectId, conversationId, runId = null, stream = [], omProgress = null, viewport = { width: 1100, height: 900 } }) => {
  const sourceRevision = 'a'.repeat(40)
  const { page, origin } = await web.openPage(t, { viewport })
  const state = builderState([conversation(conversationId, 'Agenda')], { [conversationId]: runId ? [userMessage('user-1', 'Crie uma agenda')] : [] })
  state.omProgress = omProgress
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, state)
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Agenda', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    projectId,
    latestBuilderRun: runId ? {
      builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT',
      baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
      failureCode: null, requestText: 'Crie uma agenda', createdAt: new Date().toISOString(),
    } : null,
    latestCodeChangingRun: null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    runHistory: [],
  }) }))
  if (runId) await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(...stream)))
  await page.goto(`${origin}/projects/${projectId}`)
  return { page, state }
}
const OM_IDLE = {
  status: 'idle', pendingTokens: 12_400, threshold: 30_000, thresholdPercent: 41.3, observationTokens: 3_100, reflectionThreshold: 40_000, reflectionThresholdPercent: 7.75,
  projectedMessageRemoval: 0, projectedReflectionSavings: 0,
}



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



test('a soon button shows the design system Tooltip, never a native title', async (t) => {
  const { page } = await openAgenda(t, {
    accountId: '70000000-0000-4000-8000-00000000023c', projectId: '70000000-0000-4000-8000-00000000023d', conversationId: 'conversation-tooltip',
    omProgress: OM_IDLE, viewport: { width: 1440, height: 900 },
  })
  const attach = page.getByRole('button', { name: 'Anexar arquivo', exact: true })
  await attach.hover()
  await page.getByRole('tooltip').filter({ hasText: 'Anexar arquivo chega em breve' }).waitFor()
  assert.equal(await attach.getAttribute('title'), null)
})

test('while a run works the model control is disabled, so the model never changes during a turn', async (t) => {
  const { page, state } = await openAgenda(t, {
    accountId: '70000000-0000-4000-8000-000000000224', projectId: '70000000-0000-4000-8000-000000000225', conversationId: 'conversation-model-running',
    runId: '70000000-0000-4000-8000-000000000226',
  })
  await openModelPicker(page)
  assert.equal(await page.getByRole('option').first().isDisabled(), true)
  assert.deepEqual(state.modelSwitches, [])
})

const APPROVAL_ASK = { questions: [{ question: 'Posso construir assim?', options: [{ label: 'Aprovar e construir' }, { label: 'Pedir ajustes' }] }] }

test('the approval of a plan is a question with two options, and the chosen label is the answer', async (t) => {
  const page = await openLiveTurn(t, [
    { type: 'tool_suspended', toolCallId: 'approval-1', toolName: 'ask_user', args: APPROVAL_ASK, suspendPayload: APPROVAL_ASK },
  ])
  const answers = []
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => {
    answers.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.getByText('Posso construir assim?', { exact: true }).waitFor()
  await page.getByRole('radio', { name: 'Pedir ajustes' }).waitFor()
  const sent = page.waitForResponse((response) => response.url().includes('/tool-suspension'))
  await page.getByRole('radio', { name: 'Aprovar e construir' }).click()
  await page.getByRole('button', { name: 'Enviar resposta' }).click()
  await sent
  assert.deepEqual(answers, [{ toolCallId: 'approval-1', resumeData: ['Aprovar e construir'] }])
})

const threeQuestions = { questions: [
  { question: 'Qual cor?', header: 'Cor', options: [{ label: 'Azul (recomendado)', description: 'Combina com a marca' }, { label: 'Verde' }] },
  { question: 'Quais telas?', multiSelect: true, options: [{ label: 'Lista' }, { label: 'Detalhe' }, { label: 'Resumo' }] },
  { question: 'Algo mais que devo saber?' },
] }

const openThreeQuestions = async (t, toolCallId, replies) => {
  const page = await openLiveTurn(t, [{ type: 'tool_suspended', toolCallId, toolName: 'ask_user', args: threeQuestions, suspendPayload: threeQuestions }])
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => {
    replies.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  const card = page.getByLabel('Pergunta do agente')
  await card.getByText('Qual cor?', { exact: true }).waitFor()
  return { page, card }
}

test('a card with three questions shows one at a time, reviews the answers, and sends them in one reply', async (t) => {
  const replies = []
  const { page, card } = await openThreeQuestions(t, 'ask-3', replies)
  assert.equal(await card.locator('[data-ask-question]').count(), 1)
  assert.deepEqual(await card.getByRole('tab').allInnerTexts(), ['Cor', 'Pergunta 2', 'Pergunta 3', 'Revisar'])
  assert.equal(await card.getByRole('tab', { name: 'Revisar' }).isDisabled(), true, 'the review waits for every answer')
  assert.equal(await card.getByRole('button', { name: 'Enviar respostas' }).count(), 0, 'nothing is sent before the review')

  await card.getByRole('radio', { name: /Azul/ }).click()
  await card.getByText('Quais telas?', { exact: true }).waitFor()
  assert.equal(await card.getByText('Qual cor?', { exact: true }).count(), 0, 'a single choice moves to the next question')
  assert.equal(await card.getByRole('tab', { name: /Cor/ }).innerText(), '✓ Cor')

  const next = card.getByRole('button', { name: 'Próxima', exact: true })
  assert.equal(await next.isDisabled(), true, 'a multi-select question waits for a choice')
  await card.getByRole('checkbox', { name: 'Lista' }).click()
  await card.getByRole('checkbox', { name: 'Resumo' }).click()
  await card.getByLabel('Outra resposta: Quais telas?').fill('Calendário')
  await next.click()

  await card.getByText('Algo mais que devo saber?', { exact: true }).waitFor()
  assert.equal(await next.isDisabled(), true, 'a typed answer is still missing')
  await card.getByPlaceholder('Digite sua resposta…').fill('Sem pressa')
  await next.click()

  await card.locator('[data-ask-review]').waitFor()
  assert.equal(await card.locator('[data-ask-question]').count(), 0)
  assert.deepEqual(await card.locator('[data-ask-review] dd').allInnerTexts(), ['Azul (recomendado)', 'Lista, Resumo, Calendário', 'Sem pressa'])

  await card.getByRole('tab', { name: /Cor/ }).click()
  await card.getByRole('radio', { name: 'Verde' }).click()
  await card.getByRole('tab', { name: 'Revisar' }).click()
  assert.deepEqual(await card.locator('[data-ask-review] dd').allInnerTexts(), ['Verde', 'Lista, Resumo, Calendário', 'Sem pressa'], 'an earlier answer can be changed')
  const sent = page.waitForResponse((response) => response.url().includes('/tool-suspension'))
  await card.getByRole('button', { name: 'Enviar respostas' }).click()
  await sent
  assert.deepEqual(replies, [{ toolCallId: 'ask-3', resumeData: ['Verde', ['Lista', 'Resumo', 'Calendário'], 'Sem pressa'] }])
})

test('the arrow keys move through the options of a question and Enter confirms the chosen one', async (t) => {
  const replies = []
  const { page, card } = await openThreeQuestions(t, 'ask-keys', replies)
  await card.getByRole('radio', { name: /Azul/ }).focus()
  await page.keyboard.press('ArrowDown')
  assert.equal(await card.getByText('Qual cor?', { exact: true }).count(), 1, 'the arrow key only moves the choice')
  assert.equal(await card.getByRole('radio', { name: 'Verde' }).isChecked(), true)
  await page.keyboard.press('Enter')
  await card.getByText('Quais telas?', { exact: true }).waitFor()
  await page.keyboard.press('Space')
  await page.keyboard.press('Enter')
  await card.getByText('Algo mais que devo saber?', { exact: true }).waitFor()
  await page.keyboard.type('Sim')
  await page.keyboard.press('Enter')
  await card.locator('[data-ask-review]').waitFor()
  const sent = page.waitForResponse((response) => response.url().includes('/tool-suspension'))
  await page.keyboard.press('Enter')
  await sent
  assert.deepEqual(replies, [{ toolCallId: 'ask-keys', resumeData: ['Verde', ['Lista'], 'Sim'] }])
})

test('a header longer than twelve characters stays on one line inside the card, alone and as a step tab', async (t) => {
  const header = 'Um cabeçalho bem mais comprido do que o cartão tem de largura para mostrar inteiro'
  const asks = [
    { questions: [{ question: 'Qual o próximo passo?', header, options: [{ label: 'Seguir' }, { label: 'Parar' }] }] },
    { questions: [{ question: 'Qual cor?', header, options: [{ label: 'Azul' }, { label: 'Verde' }] }, { question: 'Algo mais?' }] },
  ]
  for (const [index, ask] of asks.entries()) {
    const page = await openLiveTurn(t, [{ type: 'tool_suspended', toolCallId: `ask-long-${index}`, toolName: 'ask_user', args: ask, suspendPayload: ask }])
    const card = page.getByLabel('Pergunta do agente')
    await card.getByText(ask.questions[0].question, { exact: true }).waitFor()
    const shown = card.getByText(header, { exact: true }).first()
    await shown.waitFor()
    const fits = await shown.evaluate((node) => {
      const box = node.getBoundingClientRect()
      const parent = node.parentElement.getBoundingClientRect()
      const style = getComputedStyle(node)
      const oneLine = box.height <= parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) + 1
      return { oneLine, inside: box.right <= parent.right + 1 }
    })
    assert.deepEqual(fits, { oneLine: true, inside: true }, `the long header fits the card (${index})`)
  }
})

test('a typed answer replaces the chosen option of a single-select question', async (t) => {
  const ask = { questions: [{ question: 'Qual cor?', options: [{ label: 'Azul' }, { label: 'Verde' }] }] }
  const page = await openLiveTurn(t, [{ type: 'tool_suspended', toolCallId: 'ask-own', toolName: 'ask_user', args: ask, suspendPayload: ask }])
  const replies = []
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => {
    replies.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  const card = page.getByLabel('Pergunta do agente')
  await card.getByRole('radio', { name: 'Azul' }).click()
  await card.getByLabel('Outra resposta: Qual cor?').fill('Laranja')
  const sent = page.waitForResponse((response) => response.url().includes('/tool-suspension'))
  await card.getByRole('button', { name: 'Enviar resposta' }).click()
  await sent
  assert.deepEqual(replies, [{ toolCallId: 'ask-own', resumeData: ['Laranja'] }])
})

const PLAN_TEXT = [
  '## Para a pessoa', '', 'Uma tela com **Compras** do mês e um botão para exportar.', '',
  '## Para construir', '', '- Rota `/pedidos` com a operação `listarPedidos`',
].join('\n')

// The Hub suspends submit_plan with the path, and the title and plan it read from .conexus/plan.md.
const openPlanCard = async (t, answers, plan = PLAN_TEXT) => {
  const payload = { toolId: 'submit_plan', path: '.conexus/plan.md', title: 'Compras do mês', plan }
  const page = await openLiveTurn(t, [{ type: 'tool_suspended', toolCallId: 'plan-r', toolName: 'submit_plan', args: { path: '.conexus/plan.md' }, suspendPayload: payload }])
  await page.route(`${BUILDER_CONTROLLER}/sessions/*/tool-suspension*`, (route) => {
    answers.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  return page.getByRole('region', { name: 'Plano para aprovar' })
}

test('the plan card shows only the person\'s part, with the Markdown rendered, and leaves the technical part for the reader', async (t) => {
  const card = await openPlanCard(t, [])
  await card.getByRole('heading', { name: 'Para a pessoa' }).waitFor()
  assert.equal(await card.locator('[data-slot="plan-content"] strong', { hasText: 'Compras' }).count(), 1, 'the bold marks render instead of showing as asterisks')
  assert.equal(await card.getByText('listarPedidos').count(), 0, 'the technical part is not on the card')
})

test('Ler plano completo opens the whole plan, Esc closes it, and approving from it answers submit_plan and closes it', async (t) => {
  const answers = []
  const card = await openPlanCard(t, answers)
  const page = card.page()
  await card.getByRole('button', { name: 'Ler plano completo' }).click()
  const reader = page.getByRole('alertdialog', { name: 'Compras do mês' })
  await reader.getByText('listarPedidos').waitFor()
  await reader.getByRole('heading', { name: 'Para construir' }).waitFor()
  await page.keyboard.press('Escape')
  await reader.waitFor({ state: 'detached' })

  await card.getByRole('button', { name: 'Ler plano completo' }).click()
  const answered = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/tool-suspension'))
  await reader.getByRole('button', { name: 'Aprovar e construir' }).click()
  await answered
  assert.deepEqual(answers, [{ toolCallId: 'plan-r', resumeData: { action: 'approved' } }])
  await reader.waitFor({ state: 'detached' })
})

test('Pedir ajustes needs the person\'s words and sends them with the rejection', async (t) => {
  const answers = []
  const card = await openPlanCard(t, answers)
  const askChanges = card.getByRole('button', { name: 'Pedir ajustes' })
  assert.equal(await askChanges.isDisabled(), true, 'feedback is required to send a plan back')
  await card.getByLabel('O que mudar no plano').fill('Inclua os fins de semana')
  const answered = card.page().waitForRequest((request) => new URL(request.url()).pathname.endsWith('/tool-suspension'))
  await askChanges.click()
  await answered
  assert.deepEqual(answers, [{ toolCallId: 'plan-r', resumeData: { action: 'rejected', feedback: 'Inclua os fins de semana' } }])
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
  test(`the conversation panel fits its column at ${width}px with a long question card and long tool rows`, async (t) => {
    const accountId = '70000000-0000-4000-8000-000000000251'
    const projectId = '70000000-0000-4000-8000-000000000252'
    const runId = '70000000-0000-4000-8000-000000000253'
    const conversationId = 'conversation-chat-width'
    const sourceRevision = 'c'.repeat(40)
    const { page, origin } = await web.openPage(t, { viewport: { width, height: 900 } })

    const longPath = `apps/web/src/features/${'agenda-semanal-com-nome-muito-comprido/'.repeat(4)}componente.tsx`
    const question = ['Posso construir assim?', `Vou editar \`${longPath}\``, `e rodar npm run test -- ${longPath} --reporter=verbose --coverage`, 'a'.repeat(160)].join(' ')
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
        builderRunId: runId, projectId, conversationId, state: 'RUNNING', phase: 'AGENT',
        baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null,
        failureCode: null, requestText: 'Crie uma agenda', createdAt: new Date().toISOString(),
      },
      latestCodeChangingRun: null,
      preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
      runHistory: [],
    }) }))
    await page.route(`${BUILDER_CONTROLLER}/sessions/*/stream*`, (route) => route.fulfill(sse(
      { type: 'tool_suspended', toolCallId: 'ask-w', toolName: 'ask_user', args: { questions: [{ question }] }, suspendPayload: { questions: [{ question, options: [{ label: 'Aprovar e construir' }, { label: 'Pedir ajustes' }] }] } },
    )))

    await page.goto(`${origin}/projects/${projectId}`)
    await page.getByRole('radio', { name: 'Aprovar e construir' }).waitFor()
    if (process.env.CHATWIDTH_SHOT) await page.screenshot({ path: process.env.CHATWIDTH_SHOT })
    const measured = await page.evaluate(() => {
      const chat = document.querySelector('.cx-chat')
      const composer = document.querySelector('.cx-composer')
      return {
        viewport: window.innerWidth,
        chatOverflow: chat.scrollWidth - chat.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        composerRight: Math.ceil(composer.getBoundingClientRect().right),
        chatRight: Math.floor(chat.getBoundingClientRect().right),
      }
    })
    assert.deepEqual(
      { chatOverflow: measured.chatOverflow, pageOverflow: measured.pageOverflow, composerInside: measured.composerRight <= measured.chatRight && measured.chatRight <= measured.viewport },
      { chatOverflow: 0, pageOverflow: 0, composerInside: true },
      JSON.stringify(measured),
    )
  })
}

const MODELS_FAILED = 'Não foi possível carregar os modelos'
const modelsAlert = (page) => page.getByRole('alert').filter({ hasText: MODELS_FAILED })
const sendButton = (page) => page.getByRole('button', { name: 'Enviar', exact: true })

test('the composer says models are loading, and keeps Send off until they arrive', async (t) => {
  const { page } = await openAgenda(t, {
    accountId: '70000000-0000-4000-8000-000000000230', projectId: '70000000-0000-4000-8000-000000000231', conversationId: 'conversation-models-loading',
  })
  let release
  const gate = new Promise((resolve) => { release = resolve })
  await page.route('**/api/control/model-accounts/models', async (route) => {
    await gate
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: BUILDER_MODELS, defaultThinkingLevel: 'medium' }) })
  })
  await page.reload()
  await messageBox(page).waitFor()
  assert.equal(await messageBox(page).getAttribute('placeholder'), 'Carregando modelos…')
  await messageBox(page).fill('Crie uma agenda')
  assert.equal(await sendButton(page).isDisabled(), true)
  assert.equal(await modelsAlert(page).count(), 0)
  release()
  await page.waitForFunction(() => document.querySelector('[aria-label="Mensagem para o agente"]')?.getAttribute('placeholder') !== 'Carregando modelos…')
  assert.equal(await sendButton(page).isDisabled(), false)
})

test('a list with no usable model stays "choose a model", with no failure alert and no retry', async (t) => {
  const { page } = await openAgenda(t, {
    accountId: '70000000-0000-4000-8000-000000000232', projectId: '70000000-0000-4000-8000-000000000233', conversationId: 'conversation-models-empty',
  })
  await page.route('**/api/control/model-accounts/models', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [BUILDER_MODELS[2]], defaultThinkingLevel: 'medium' }) }))
  await page.reload()
  await messageBox(page).waitFor()
  await page.waitForFunction((placeholder) => document.querySelector('[aria-label="Mensagem para o agente"]')?.getAttribute('placeholder') === placeholder, NO_MODEL_PLACEHOLDER)
  await messageBox(page).fill('Crie uma agenda')
  assert.equal(await sendButton(page).isDisabled(), true)
  assert.equal(await modelsAlert(page).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Tentar novamente' }).count(), 0)
})

test('a failed model list is said so and retried on request, then Send works', async (t) => {
  const { page } = await openAgenda(t, {
    accountId: '70000000-0000-4000-8000-000000000234', projectId: '70000000-0000-4000-8000-000000000235', conversationId: 'conversation-models-failing',
  })
  let failing = true
  let reads = 0
  await page.route('**/api/control/model-accounts/models', (route) => {
    reads += 1
    return failing
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ type: 'unavailable' }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: BUILDER_MODELS, defaultThinkingLevel: 'medium' }) })
  })
  await page.reload()
  await messageBox(page).waitFor()
  await modelsAlert(page).waitFor({ timeout: 30_000 })
  assert.equal(await messageBox(page).getAttribute('placeholder'), MODELS_FAILED)
  await messageBox(page).fill('Crie uma agenda')
  assert.equal(await sendButton(page).isDisabled(), true)
  failing = false
  const before = reads
  await page.getByRole('button', { name: 'Tentar novamente' }).first().click()
  await modelsAlert(page).waitFor({ state: 'detached' })
  assert.ok(reads > before)
  assert.equal(await sendButton(page).isDisabled(), false)
})

test('a failed read of the conversation\'s own model is said so too, and retried', async (t) => {
  const { page } = await openAgenda(t, {
    accountId: '70000000-0000-4000-8000-000000000236', projectId: '70000000-0000-4000-8000-000000000237', conversationId: 'conversation-session-model-failing',
  })
  let failing = true
  await page.route(`${BUILDER_CONTROLLER}/sessions/*`, (route) => failing
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelId: SELECTED_MODEL, threadId: 'conversation-session-model-failing' }) }))
  await page.reload()
  await messageBox(page).waitFor()
  await modelsAlert(page).waitFor({ timeout: 30_000 })
  failing = false
  await page.getByRole('button', { name: 'Tentar novamente' }).first().click()
  await modelsAlert(page).waitFor({ state: 'detached' })
})

const sessionOf = (projectId) => ({ projectId, latestBuilderRun: null, latestCodeChangingRun: null, preview: null, runHistory: [] })
// A refusal as the Hub sends it: problem+json that names its row by code.
const problem = (status, code) => ({ status, contentType: 'application/problem+json', body: JSON.stringify({ type: `urn:conexus:problem:${code}`, title: code, status, code }) })
const stubSessionReads = async (page, accountId, projectId, answer) => {
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeBuilder(page, builderState([conversation('conversation-poll', 'Conversa')]))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Poll', projectRevision: 'revision', archived: false }) }))
  let answered
  const firstRead = new Promise((resolve) => { answered = resolve })
  await page.route(`**/api/control/projects/${projectId}/builder-session`, async (route) => {
    const status = answer()
    await route.fulfill(status === 200
      ? { status, contentType: 'application/json', body: JSON.stringify(sessionOf(projectId)) }
      : problem(status, { 401: 'AUTHENTICATION_REQUIRED', 403: 'PROJECT_BUILD_DENIED' }[status] ?? 'INTERNAL_UNEXPECTED'))
    answered()
  })
  return { firstRead }
}
// The session is polled again whenever the page regains focus, which makes a poll deterministic. The
// event bubbles, as the browser's does: the query client listens on the window, so an event that stops
// at the document would leave the test waiting for the 10 s interval.
const pollNow = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })))
// A poll that fires while the first session read is in flight joins it and never asks again, so a test
// must see that read answered before it changes what the stub says.
const openAfterFirstSessionRead = async (page, origin, projectId, firstRead) => {
  await page.goto(`${origin}/projects/${projectId}`)
  await firstRead
  await messageBox(page).waitFor()
}

test('failed background polls keep the chat and show a note until a poll succeeds', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000071'
  const projectId = '70000000-0000-4000-8000-000000000072'
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
  let status = 200
  const { firstRead } = await stubSessionReads(page, accountId, projectId, () => status)

  await openAfterFirstSessionRead(page, origin, projectId, firstRead)
  const note = page.getByText('O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.')
  assert.equal(await note.count(), 0)

  status = 503
  await pollNow(page)
  await note.waitFor()
  assert.equal(await page.getByText('Não foi possível abrir o Construir').count(), 0)
  assert.equal(await messageBox(page).count(), 1, 'the composer stays')

  status = 200
  await pollNow(page)
  await note.waitFor({ state: 'detached' })
  assert.equal(await messageBox(page).count(), 1)
})

test('a 403 poll after a good load shows the denied screen', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000075'
  const projectId = '70000000-0000-4000-8000-000000000076'
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
  let status = 200
  const { firstRead } = await stubSessionReads(page, accountId, projectId, () => status)

  await openAfterFirstSessionRead(page, origin, projectId, firstRead)

  status = 403
  await pollNow(page)
  await page.getByText('Você não pode construir neste Project').waitFor()
  await messageBox(page).waitFor({ state: 'detached' })
})

test('a 401 poll after a good load signs the user out', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000077'
  const projectId = '70000000-0000-4000-8000-000000000078'
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
  let status = 200
  const { firstRead } = await stubSessionReads(page, accountId, projectId, () => status)

  await openAfterFirstSessionRead(page, origin, projectId, firstRead)

  status = 401
  await pollNow(page)
  await page.getByText('Sessão encerrada').waitFor()
  await messageBox(page).waitFor({ state: 'detached' })
})

test('a first load that fails still shows the error page', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000073'
  const projectId = '70000000-0000-4000-8000-000000000074'
  const { page, origin } = await web.openPage(t, { viewport: { width: 1100, height: 850 } })
  await stubSessionReads(page, accountId, projectId, () => 503)

  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByText('Não foi possível abrir o Construir').waitFor()
  assert.equal(await messageBox(page).count(), 0)
})
