import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')

test('Project Build uses the Project session and BuilderRun API', async (t) => {
  const accountId = '70000000-0000-4000-8000-000000000001'
  const projectId = '70000000-0000-4000-8000-000000000002'
  const runId = '70000000-0000-4000-8000-000000000003'
  const baseSourceRevision = 'a'.repeat(40)
  const sourceRevision = 'b'.repeat(40)
  const artifactRevisionId = '70000000-0000-4000-8000-000000000004'
  const artifactDigest = 'c'.repeat(64)
  const origin = 'http://127.0.0.1:41749'
  let run = null
  let buildCount = 0
  let sessionReads = 0
  let runFinished = false
  const persistedMessages = []
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
    projectId, messages: run && sessionReads > 1 ? persistedMessages.flatMap((item, index) => [item, ...(index < persistedMessages.length - (runFinished ? 0 : 1) ? [{ id: `message-assistant-${index + 1}`, role: 'assistant', text: '**Build concluído**', createdAt: new Date().toISOString() }] : [])]) : [],
    latestBuilderRun: run && sessionReads > 2 && runFinished
      ? { ...run, state: 'SUCCEEDED', resultSourceRevision: run.mode === 'PLAN' ? null : sourceRevision, resultKind: run.mode === 'PLAN' ? 'RESPONSE_ONLY' : 'SOURCE_CHANGED' }
      : run, latestCodeChangingRun: buildCount > 0 ? { baseSourceRevision, resultSourceRevision: sourceRevision, resultKind: 'SOURCE_CHANGED' } : null, preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: buildCount > 0 ? sourceRevision : null, lastGoodArtifactRevisionId: buildCount > 0 ? artifactRevisionId : null, lastGoodArtifactDigest: buildCount > 0 ? artifactDigest : null }, mode: run?.mode ?? 'BUILD',
  })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [], projects: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Counter', projectRevision: 'revision', archived: false }) }))
  const previewRequests = []
  const forbiddenRequests = []
  page.on('request', (request) => {
    if (new RegExp(`/api/control/projects/${projectId}/(?:session/turns|changes(?:/|$)|preview(?:$|-preparations|-launches))`).test(new URL(request.url()).pathname)) forbiddenRequests.push(request.url())
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      requests.push({ url: route.request().url(), body, key: route.request().headers()['idempotency-key'] })
      buildCount += body.mode === 'BUILD' ? 1 : 0
      persistedMessages.push({ id: `message-${persistedMessages.length + 1}`, role: 'user', text: body.content, createdAt: new Date().toISOString() })
      runFinished = false
      run = { builderRunId: runId, projectId, state: 'RUNNING', mode: body.mode, baseSourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ threadId: `conexus-builder:${projectId}`, builderRun: run }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session()) })
  })
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    sessionReads += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session()) })
  })
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
  let liveStreamRequests = 0
  const liveStreamStatuses = []
  await page.route(`**/api/control/projects/${projectId}/builder-session/runs/${runId}/stream`, (route) => {
    liveStreamRequests += 1
    if (liveStreamRequests === 1) {
      liveStreamStatuses.push(410)
      return route.fulfill({ status: 410, contentType: 'application/problem+json', body: '{}' })
    }
    liveStreamStatuses.push(200)
    const snapshot = liveStreamRequests === 2
      ? { running: true, message: { id: 'browser-message-1', text: 'Inspecionando o app' }, activities: [{ id: 'browser-tool', label: 'READ_FILES', detail: 'app/src/main.tsx', state: 'started' }] }
      : { running: true, message: { id: 'browser-message-2', text: 'Aplicando a alteração' }, activities: [{ id: 'browser-tool', label: 'READ_FILES', detail: 'app/src/main.tsx', state: 'succeeded' }] }
    if (liveStreamRequests >= 3) setTimeout(() => { runFinished = true }, 300)
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' }, body: `data: ${JSON.stringify(snapshot)}\n\n` })
  })

  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByRole('link', { name: 'Construir com o Conexus' }).click()
  await page.getByRole('heading', { name: 'Converse com o Conexus' }).waitFor()
  await page.getByLabel('O que o Project precisa fazer?').fill('Crie um contador até 100 interativo')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await page.getByText('Mensagem enviada ao Builder.').waitFor()
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].body, { content: 'Crie um contador até 100 interativo', mode: 'BUILD' })
  assert.ok(requests[0].key)
  await page.getByText('Aplicando a alteração', { exact: true }).waitFor()
  assert.equal(await page.getByText('Lendo arquivos', { exact: true }).count(), 1)
  assert.equal(await page.getByText('app/src/main.tsx', { exact: true }).count(), 1)
  await page.getByText('Último Preview bom disponível.').waitFor()
  await page.getByTitle('Preview do aplicativo').waitFor()
  assert.deepEqual(previewRequests, [{}])
  assert.deepEqual(forbiddenRequests, [])
  await page.getByLabel('Preview').getByText('Build concluído', { exact: true }).waitFor()
  await page.getByText('Build concluído', { exact: true }).last().waitFor()
  assert.equal(await page.getByText('Human request:', { exact: false }).count(), 0)
  const previewBox = await page.locator('.build-preview-surface').boundingBox()
  const panelBox = await page.locator('.conexus-panel').boundingBox()
  assert.ok(previewBox && panelBox && previewBox.width > panelBox.width)
  const frameBox = await page.locator('.preview-frame-stack iframe').boundingBox()
  const frameStackBox = await page.locator('.preview-frame-stack').boundingBox()
  assert.ok(frameBox && frameStackBox && frameBox.width >= frameStackBox.width * 0.95 && frameBox.height >= 384)
  await page.getByLabel('O que o Project precisa fazer?').fill('Crie um contador até 100 interativo')
  await page.getByRole('button', { name: 'Enviar mensagem' }).click()
  await page.getByText('Mensagem enviada ao Builder.').waitFor()
  await page.getByText('Aplicando a alteração', { exact: true }).waitFor()
  assert.equal(await page.getByText('Crie um contador até 100 interativo', { exact: true }).count(), 2)
  await page.getByText('Build concluído', { exact: true }).last().waitFor()
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
  assert.equal(await page.getByText('Human request:', { exact: false }).count(), 0)
  await page.getByText('Último Preview bom disponível.').waitFor()
  await page.getByTitle('Preview do aplicativo').waitFor()
  assert.deepEqual(previewRequests, [{}, {}])
  assert.deepEqual(forbiddenRequests, [])
  await page.getByRole('button', { name: 'Diff' }).click()
  await page.getByText('MODIFIED', { exact: true }).waitFor()
  assert.ok(liveStreamRequests >= 3)
  assert.deepEqual(liveStreamStatuses.slice(0, 3), [410, 200, 200])
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
    projectId, messages: run ? [{ id: 'new-message', role: 'user', text: 'Crie um contador', createdAt: new Date().toISOString() }] : [],
    latestBuilderRun: run, latestCodeChangingRun: null, preview: { workingSourceRevision: sourceRevision, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null },
    mode: 'BUILD',
  })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId, displayName: 'Builder Operator' }, workspaces: [{ workspaceId, name: 'New Workspace' }], projects: [] }) }))
  await page.route(`**/api/control/workspaces/${workspaceId}/projects`, async (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'New Counter', projectRevision: 'created', archived: false }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'New Counter', projectRevision: 'created', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session()) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session/messages`, async (route) => {
    const body = route.request().postDataJSON()
    run = { builderRunId: runId, projectId, state: 'QUEUED', mode: body.mode, baseSourceRevision: sourceRevision, resultSourceRevision: null, resultKind: null, failureCode: null }
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
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Preview continuity', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    const useB = phase === 'B'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, messages: [], latestBuilderRun: null, latestCodeChangingRun: null, mode: 'BUILD',
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
      threadId: `conexus-builder:${projectId}`,
      builderRun: { builderRunId: '70000000-0000-4000-8000-000000000025', projectId, state: 'SUCCEEDED', mode: 'BUILD', baseSourceRevision: sourceA, resultSourceRevision: sourceB, resultKind: 'SOURCE_CHANGED', failureCode: null },
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
  await page.getByText('Preview emitido.', { exact: true }).waitFor()
  assert.equal(previewRequests, 4)
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-b`)
  const reopenRequest = page.waitForRequest((request) => request.url().endsWith('/builder-session/preview') && request.method() === 'POST')
  await page.getByRole('button', { name: 'Reabrir Preview' }).click()
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
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId: accountId, name: 'Preview race', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/builder-session`, (route) => {
    const useB = phase === 'B'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, messages: [], latestBuilderRun: null, latestCodeChangingRun: null, mode: 'BUILD',
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
      threadId: `conexus-builder:${projectId}`,
      builderRun: { builderRunId: '70000000-0000-4000-8000-000000000035', projectId, state: 'SUCCEEDED', mode: 'BUILD', baseSourceRevision: sourceA, resultSourceRevision: sourceB, resultKind: 'SOURCE_CHANGED', failureCode: null },
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
  launchB.resolve({ entryUrl: `${origin}/entry-b`, previewUrl: `${origin}/preview-b`, entryGrant: 'grant-b', artifactRevisionId: artifactB, artifactDigest: digestB, expiresAt: new Date(Date.now() + 60_000).toISOString() })
  await secondPreviewResponse
  await page.getByTitle('Preview do aplicativo').waitFor()
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-b`)
  const firstPreviewResponse = page.waitForResponse((response) => response.url().endsWith('/builder-session/preview') && response.status() === 201)
  launchA.resolve({ entryUrl: `${origin}/entry-a`, previewUrl: `${origin}/preview-a`, entryGrant: 'grant-a', artifactRevisionId: artifactA, artifactDigest: digestA, expiresAt: new Date(Date.now() + 60_000).toISOString() })
  await firstPreviewResponse
  assert.equal(await page.locator('form[method="post"]').getAttribute('action'), `${origin}/entry-b`)
})
