import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')

const admittedModelChoices = [{ choiceId: 'builder-coding-primary', label: 'Claude Sonnet 5', providerId: 'anthropic', modelId: 'claude-sonnet-5', capabilities: ['BUILDER_CODING'] }]

const routeModelConnections = (page, accountId) => page.route('**/api/control/me/model-connections', (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  // The connection's provider has to match the selected model's, or the Builder gate refuses it
  // exactly as the database would.
  body: JSON.stringify({
    connections: [{ connectionId: '70000000-0000-4000-8000-0000000000c1', label: 'Conta Anthropic do operador', state: 'ACTIVE', generation: '1', ownerAccountId: accountId, workspaceId: accountId, role: 'OWNER', revokedAt: null, providerId: 'anthropic', credentialKind: 'OAUTH_TOKEN_SET' }],
    providers: ['anthropic'],
  }),
}))

const MASTRA_SESSIONS = (projectId) => `**/api/mastra/agent-controller/conexus-builder-controller/sessions/${projectId}`
const assistantMessage = (id, text) => ({ id, role: 'assistant', createdAt: new Date().toISOString(), content: { format: 2, parts: [{ type: 'text', text }] } })
const userMessage = (id, text) => ({ id, role: 'user', createdAt: new Date().toISOString(), content: { format: 2, parts: [{ type: 'text', text }] } })
const sse = (...events) => ({
  status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
})

test('Project Build uses the Project session, the BuilderRun API and the native Mastra turn', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000001'
  const projectId = '70000000-0000-4000-8000-000000000002'
  const runId = '70000000-0000-4000-8000-000000000003'
  const threadId = `conexus-builder:${projectId}`
  const baseSourceRevision = 'a'.repeat(40)
  const sourceRevision = 'b'.repeat(40)
  const artifactRevisionId = '70000000-0000-4000-8000-000000000004'
  const artifactDigest = 'c'.repeat(64)
  const origin = 'http://127.0.0.1:41749'
  let run = null
  let buildCount = 0
  let runFinished = false
  const threadMessages = []
  const requests = []
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'),
    server: { host: '127.0.0.1', port: 41749, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const session = () => ({
    projectId, threadId,
    latestBuilderRun: run && runFinished
      ? { ...run, state: 'SUCCEEDED', phase: null, resultSourceRevision: run.mode === 'PLAN' ? null : sourceRevision, resultKind: run.mode === 'PLAN' ? 'RESPONSE_ONLY' : 'SOURCE_CHANGED' }
      : run,
    latestCodeChangingRun: buildCount > 0 ? { baseSourceRevision, resultSourceRevision: sourceRevision, resultKind: 'SOURCE_CHANGED' } : null,
    preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: buildCount > 0 ? sourceRevision : null, lastGoodArtifactRevisionId: buildCount > 0 ? artifactRevisionId : null, lastGoodArtifactDigest: buildCount > 0 ? artifactDigest : null },
    mode: run?.mode ?? 'BUILD', modelChoices: admittedModelChoices, runHistory: [],
  })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeModelConnections(page, accountId)
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
    run = { builderRunId: runId, projectId, state: 'RUNNING', phase: 'AGENT', mode: body.mode, baseSourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
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
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision: revision, entries: [{ path: 'app/index.html', kind: 'FILE' }] }) })
  })
  await page.route(`**/api/control/projects/${projectId}/source/file*`, (route) => {
    const revision = new URL(route.request().url()).searchParams.get('sourceRevision')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision: revision, path: 'app/index.html', content: revision === baseSourceRevision ? '<main>Counter</main>' : '<main>Counter v2</main>' }) })
  })
  const threadReads = []
  await page.route(`${MASTRA_SESSIONS(projectId)}/threads/*/messages*`, (route) => {
    threadReads.push(new URL(route.request().url()).pathname)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: threadMessages }) })
  })
  const streamScopes = []
  await page.route(`${MASTRA_SESSIONS(projectId)}/stream*`, (route) => {
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

  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByRole('link', { name: 'Construir com o Conexus' }).click()
  await page.getByRole('heading', { name: 'Converse com o Conexus' }).waitFor()
  await page.getByLabel('O que o Project precisa fazer?').fill('Crie um contador até 100 interativo')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await page.getByText('Mensagem enviada ao Builder.').waitFor()
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].body, { content: 'Crie um contador até 100 interativo', mode: 'BUILD', modelChoiceId: 'builder-coding-primary' })
  assert.ok(requests[0].key)
  await page.getByText('Aplicando a alteração', { exact: true }).waitFor()
  assert.deepEqual(streamScopes.slice(0, 1), [`builder:${runId}`])
  await page.getByTitle('Preview do aplicativo').waitFor()
  assert.deepEqual(previewRequests, [{}])
  await page.locator('.builder-conversation').getByText('Build concluído', { exact: true }).waitFor()
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.builder-conversation').getByText('Aplicando a alteração', { exact: true }).count(), 1,
    'the live message and its persisted twin share an id and render once')
  assert.deepEqual(forbiddenRequests, [])
  assert.ok(threadReads.every((path) => path.includes(encodeURIComponent(threadId))))
  const previewBox = await page.locator('.build-preview-surface').boundingBox()
  const panelBox = await page.locator('.conexus-panel').boundingBox()
  assert.ok(previewBox && panelBox && previewBox.width > panelBox.width)
  const frameBox = await page.locator('.preview-frame-stack iframe').boundingBox()
  const frameStackBox = await page.locator('.preview-frame-stack').boundingBox()
  assert.ok(frameBox && frameStackBox && frameBox.width >= frameStackBox.width * 0.95 && frameBox.height >= 384)

  await page.getByRole('button', { name: 'Código' }).click()
  await page.getByRole('button', { name: 'app/index.html' }).waitFor()
  await page.getByText('<main>Counter v2</main>', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Detalhes' }).click()
  await page.getByRole('heading', { name: 'Detalhes do Build' }).waitFor()
  await page.getByRole('button', { name: 'Diff' }).click()
  await page.getByText('MODIFIED', { exact: true }).waitFor()

  await page.getByRole('button', { name: 'Plan' }).click()
  await page.getByRole('button', { name: 'Plan' }).evaluate((button) => { if (button.getAttribute('aria-pressed') !== 'true' || !button.classList.contains('builder-mode-selected')) throw new Error('Plan selection is not visible') })
  await page.getByRole('button', { name: 'Build', exact: true }).evaluate((button) => { if (button.getAttribute('aria-pressed') !== 'false') throw new Error('Build remained selected') })
  await page.getByLabel('O que o Project precisa fazer?').fill('Explique o contador')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await page.getByText('Mensagem enviada ao Builder.').waitFor()
  await page.getByText('Resposta somente', { exact: true }).waitFor()

  await page.reload()
  await page.getByText('Crie um contador até 100 interativo', { exact: true }).first().waitFor()
  await page.getByTitle('Preview do aplicativo').waitFor()
  assert.equal(await page.getByText('BuilderRun', { exact: true }).count(), 0)
})

test('new Project lands directly in Build and can send its first Builder message', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000011'
  const workspaceId = '70000000-0000-4000-8000-000000000012'
  const projectId = '70000000-0000-4000-8000-000000000013'
  const runId = '70000000-0000-4000-8000-000000000014'
  const sourceRevision = 'd'.repeat(40)
  const origin = 'http://127.0.0.1:41750'
  let run = null
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'),
    server: { host: '127.0.0.1', port: 41750, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const session = () => ({
    projectId, threadId: `conexus-builder:${projectId}`,
    latestBuilderRun: run, latestCodeChangingRun: null, preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    mode: 'BUILD', modelChoices: admittedModelChoices, runHistory: [],
  })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [{ workspaceId, name: 'New Workspace' }], projects: [] }) }))
  await routeModelConnections(page, accountId)
  await page.route(`${MASTRA_SESSIONS(projectId)}/threads/*/messages*`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: run ? [userMessage('new-message', 'Crie um contador')] : [] }) }))
  await page.route(`**/api/control/workspaces/${workspaceId}/projects`, async (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'New Counter', projectRevision: 'created', archived: false }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'New Counter', projectRevision: 'created', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session()) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    const body = route.request().postDataJSON()
    run = { builderRunId: runId, projectId, state: 'QUEUED', phase: null, mode: body.mode, baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ builderRun: run }) })
  })
  await page.goto(`${origin}/workspaces/${workspaceId}/projects/new`)
  await page.getByLabel('Nome do Project').fill('New Counter')
  await page.getByRole('button', { name: 'Criar Project' }).click()
  await page.getByRole('heading', { name: 'Converse com o Conexus' }).waitFor()
  await page.getByLabel('O que o Project precisa fazer?').fill('Crie um contador')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await page.getByLabel('O que o Project precisa fazer?').fill('texto digitado depois')
  await page.getByText('Mensagem enviada ao Builder.').waitFor()
  assert.equal((await page.getByLabel('O que o Project precisa fazer?').inputValue()), 'texto digitado depois')
})

test('Preview launch failure is terminal for its key until explicit retry and keeps the last good frame', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000021'
  const projectId = '70000000-0000-4000-8000-000000000022'
  const origin = 'http://127.0.0.1:41751'
  const sourceA = 'a'.repeat(40)
  const sourceB = 'b'.repeat(40)
  const artifactA = '70000000-0000-4000-8000-000000000023'
  const artifactB = '70000000-0000-4000-8000-000000000024'
  const digestA = 'c'.repeat(64)
  const digestB = 'd'.repeat(64)
  let phase = 'A'
  let previewRequests = 0
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'),
    server: { host: '127.0.0.1', port: 41751, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeModelConnections(page, accountId)
  await page.route(`${MASTRA_SESSIONS(projectId)}/threads/*/messages*`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Preview continuity', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    const useB = phase === 'B'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, threadId: `conexus-builder:${projectId}`, latestBuilderRun: null, latestCodeChangingRun: null, mode: 'BUILD', modelChoices: admittedModelChoices, runHistory: [],
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
  await page.getByTitle('Preview do aplicativo').waitFor()
  assert.equal(previewRequests, 1)
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-a`)

  await page.getByLabel('O que o Project precisa fazer?').fill('Atualize o contador')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await page.getByText('Não foi possível abrir o Preview atual.', { exact: true }).waitFor()
  assert.equal(previewRequests, 2)
  assert.equal(await page.getByTitle('Preview do aplicativo').count(), 1)
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-a`)
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  assert.equal(previewRequests, 3)
  await page.getByText('Não foi possível abrir o Preview atual.', { exact: true }).waitFor()
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-a`)
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await page.getByText('Preview emitido', { exact: false }).waitFor()
  assert.equal(previewRequests, 4)
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-b`)
  const reopenRequest = page.waitForRequest((request) => request.url().endsWith('/builder-session/preview') && request.method() === 'POST')
  await page.getByRole('button', { name: 'Reabrir' }).click()
  await reopenRequest
  assert.equal(previewRequests, 5)
})

test('Preview ignores an older launch completion after the artifact key changes', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000031'
  const projectId = '70000000-0000-4000-8000-000000000032'
  const origin = 'http://127.0.0.1:41752'
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
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'),
    server: { host: '127.0.0.1', port: 41752, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await routeModelConnections(page, accountId)
  await page.route(`${MASTRA_SESSIONS(projectId)}/threads/*/messages*`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Preview race', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    const useB = phase === 'B'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, threadId: `conexus-builder:${projectId}`, latestBuilderRun: null, latestCodeChangingRun: null, mode: 'BUILD', modelChoices: admittedModelChoices, runHistory: [],
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
  assert.equal(await page.getByTitle('Preview do aplicativo').count(), 0)
  await page.getByLabel('O que o Project precisa fazer?').fill('Troque o contador')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await secondLaunchStarted.promise
  assert.equal(previewRequests, 2)
  const secondPreviewResponse = page.waitForResponse((response) => response.url().endsWith('/builder-session/preview') && response.status() === 201)
  launchB.resolve()
  await secondPreviewResponse
  await page.getByTitle('Preview do aplicativo').waitFor()
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-b`)
  const firstPreviewResponse = page.waitForResponse((response) => response.url().endsWith('/builder-session/preview') && response.status() === 201)
  launchA.resolve()
  await firstPreviewResponse
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-b`)
})
