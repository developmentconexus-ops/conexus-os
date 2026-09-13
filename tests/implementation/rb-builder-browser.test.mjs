import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const openDisclosure = async (page, label) => {
  const details = page.locator('details').filter({ hasText: label })
  if (await details.getAttribute('open') === null) await details.locator('summary').click()
}

test('Project Build creates one Change and reveals Hub progress and exact diff', async (t) => {
  const workspaceId = '70000000-0000-4000-8000-000000000001'
  const projectId = '70000000-0000-4000-8000-000000000002'
  const changeId = '70000000-0000-4000-8000-000000000003'
  const origin = 'http://127.0.0.1:41749'
  let observationResponse
  let observationSequence = 0
  const observe = (event) => observationResponse.write(`data: ${JSON.stringify({ generation: 'browser-proof', sequence: ++observationSequence, event })}\n\n`)
  const serveObservation = (request, response, next) => {
    if (request.url !== `/protocol/projects/${projectId}/builder-changes/${changeId}/stream`) return next()
    observationResponse = response
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
    observe({ kind: 'TEXT_START', blockId: 'first' })
    observe({ kind: 'TEXT_DELTA', blockId: 'first', text: 'Vou analisar os arquivos.' })
    observe({ kind: 'TEXT_END', blockId: 'first' })
    observe({ kind: 'ACTIVITY', activityId: 'read-1', label: 'READ_FILES', state: 'started' })
  }
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'),
    server: { host: '127.0.0.1', port: 41749, strictPort: true },
    plugins: [{ name: 'controlled-builder-observation', configureServer(instance) { instance.middlewares.use(serveObservation) } }],
  })
  t.after(() => observationResponse?.end())
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  let state = 'QUEUED'
  const attempts = []
  const evidenceFetchStates = []
  const sourceReads = []
  const previewReads = []
  let baselineAvailable = false
  const change = () => ({ changeId, projectId, intent: 'Adicionar uma página de saúde', baselineDigest: 'a'.repeat(64), planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', state })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId: workspaceId, displayName: 'Builder Operator' }, workspaces: [{ workspaceId, name: 'Workspace' }], projects: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'Health App', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/preview*`, (route) => {
    const requestedChangeId = new URL(route.request().url()).searchParams.get('changeId')
    previewReads.push(requestedChangeId)
    const candidate = requestedChangeId === changeId
    if (!candidate && !baselineAvailable) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ type: 'about:blank', title: 'Not Found', status: 404 }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      previewId: candidate ? 'preview-candidate' : 'preview-current', subjectKind: candidate ? 'CHANGE_CANDIDATE' : 'CURRENT_PROJECT',
      subjectDigest: candidate ? 'c'.repeat(40) : 'a'.repeat(64), ready: false, verified: candidate && state === 'VERIFIED', live: false,
      ...(candidate ? {} : { workingSourceRevision: 'b'.repeat(40) }),
    }) })
  })
  await page.route(`**/api/control/projects/${projectId}/session`, (route) => {
    if (route.request().method() === 'POST') {
      attempts.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] })
      state = 'RUNNING'
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ threadId: `conexus-builder:${projectId}`, turn: change() }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, threadId: `conexus-builder:${projectId}`, messages: [], activeTurn: attempts.length ? change() : null, workingSourceRevision: 'b'.repeat(40), lastPreviewChangeId: null }) })
  })
  await page.route(`**/api/control/projects/${projectId}/session/turns`, (route) => {
    attempts.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] })
    state = 'RUNNING'
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ threadId: `conexus-builder:${projectId}`, turn: change() }) })
  })
  await page.route(`**/api/control/projects/${projectId}/changes`, (route) => {
    if (route.request().method() === 'POST') {
      attempts.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] })
      state = 'RUNNING'
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(change()) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(attempts.length ? [change()] : []) })
  })
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(change()) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/plan`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', items: [{ itemId: projectId, summary: change().intent, state: ['RESULT_READY', 'VERIFYING', 'VERIFIED'].includes(state) ? 'COMPLETED' : 'RUNNING' }], dependencyEdges: [], acceptanceLinks: [{ itemId: projectId, assertionRef: `change-intent:${'d'.repeat(64)}` }], blockers: [], unknowns: [], progress: state }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/progress`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, items: [], overallState: state }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/diff`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ baseSourceRevision: 'b'.repeat(40), candidateSourceRevision: 'c'.repeat(40), patch: '+health: ok' }) }))
  await page.route(`**/api/control/projects/${projectId}/source/tree*`, (route) => {
    const revision = new URL(route.request().url()).searchParams.get('sourceRevision')
    sourceReads.push(['tree', revision])
    const entries = revision === 'b'.repeat(40)
      ? [{ path: 'README.md', kind: 'FILE' }]
      : [{ path: 'src', kind: 'DIRECTORY' }, { path: 'src/health.ts', kind: 'FILE' }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision: revision, entries }) })
  })
  await page.route(`**/api/control/projects/${projectId}/source/file*`, (route) => {
    const query = new URL(route.request().url()).searchParams
    const sourceRevision = query.get('sourceRevision')
    const path = query.get('path')
    sourceReads.push(['file', sourceRevision, path])
    const content = sourceRevision === 'b'.repeat(40) ? '# Health App\n' : 'export const health = "ok"\n'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision, path, content }) })
  })
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/findings`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/evidence`, (route) => {
    evidenceFetchStates.push(state)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state === 'VERIFIED' ? [{ evidenceId: workspaceId, changeId, claim: 'O candidato satisfaz a intenção aceita do Change.', subjectDigest: 'c'.repeat(40), provenance: [] }] : []) })
  })

  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByRole('link', { name: 'Construir com o Conexus' }).click()
  await page.getByRole('heading', { name: 'Construir com o Conexus' }).waitFor()
  const previewBox = await page.locator('.build-preview-surface').boundingBox()
  const conversationBox = await page.locator('.conexus-panel').boundingBox()
  assert.ok(previewBox.width > conversationBox.width, 'the application remains wider than the conversation on desktop')
  await page.getByRole('heading', { name: 'Converse com o Conexus' }).waitFor()
  await page.getByText('Comece descrevendo o que a aplicação precisa fazer.', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Código', exact: true }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: 'Diff', exact: true }).isDisabled(), true)
  await page.getByText('Não foi possível obter um Preview para este Project.', { exact: true }).waitFor()
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_500))
  assert.deepEqual(previewReads.filter((requestedChangeId) => requestedChangeId === null), [null])
  previewReads.length = 0
  baselineAvailable = true
  await page.reload()
  await page.getByText('Baseline aprovado', { exact: true }).waitFor()
  await page.getByText('a'.repeat(64), { exact: true }).waitFor()
  await page.getByText('Preview ainda não está pronto: não há artefato de aplicação admitido.').waitFor()
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_500))
  assert.deepEqual(previewReads.filter((requestedChangeId) => requestedChangeId === null), [null])
  await page.getByLabel('O que deve mudar neste Project?').fill('Adicionar uma página de saúde')
  await page.getByRole('button', { name: 'Pedir mudança' }).click()
  await page.getByText('Change criado. O Conexus iniciou o trabalho governado.').waitFor()
  await page.getByText('Vou analisar os arquivos.', { exact: true }).waitFor({ timeout: 5_000 })
  assert.equal(state, 'RUNNING')
  assert.equal(await page.getByRole('button', { name: 'Pedir mudança' }).isDisabled(), true)
  observe({ kind: 'ACTIVITY', activityId: 'read-1', label: 'READ_FILES', state: 'succeeded' })
  observe({ kind: 'TEXT_START', blockId: 'second' })
  observe({ kind: 'TEXT_DELTA', blockId: 'second', text: 'Agora vou criar a página.' })
  await page.getByText('Agora vou criar a página.', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-activity-id="read-1"]').count(), 1)
  assert.equal(await page.locator('[data-activity-id="read-1"]').getAttribute('data-state'), 'succeeded')
  observe({ kind: 'TEXT_END', blockId: 'second' })
  observe({ kind: 'OBSERVATION_END' })
  observationResponse.end()
  assert.equal(await page.getByRole('button', { name: 'Pedir mudança' }).isDisabled(), true)
  assert.equal(attempts.length, 1)
  assert.deepEqual(attempts[0].body, { intent: 'Adicionar uma página de saúde', expectedSourceRevision: 'b'.repeat(40) })
  assert.match(attempts[0].key, /^[0-9a-f-]{36}$/)
  await page.getByText('Progresso:').waitFor()
  state = 'VERIFYING'
  await page.getByText('O Conexus está verificando o candidato em uma execução independente.').waitFor({ timeout: 7_000 })
  for (let attempt = 0; attempt < 20 && !evidenceFetchStates.includes('VERIFYING'); attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }
  assert.equal(evidenceFetchStates.includes('VERIFYING'), true)
  state = 'VERIFIED'
  await openDisclosure(page, 'Diff (somente leitura)')
  await page.getByRole('heading', { name: 'Diff do resultado' }).waitFor({ timeout: 7_000 })
  const candidatePreview = page.getByRole('heading', { name: 'Preview do candidato' }).locator('..')
  await candidatePreview.getByText('c'.repeat(40), { exact: true }).waitFor()
  await candidatePreview.getByText('verificado: sim', { exact: false }).waitFor()
  await page.getByText('Resultado verificado.', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Diff', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Diff', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('heading', { name: 'Diff do resultado' }).waitFor()
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Preview', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('heading', { name: 'Verificação' }).waitFor()
  await page.getByText('O candidato satisfaz a intenção aceita do Change.', { exact: false }).waitFor()
  assert.equal(evidenceFetchStates.includes('VERIFIED'), true)
  await openDisclosure(page, 'Diff (somente leitura)')
  await page.getByText('+health: ok', { exact: true }).waitFor()
  await openDisclosure(page, 'Código (somente leitura)')
  await page.locator('details').filter({ hasText: 'Código (somente leitura)' }).getByRole('heading', { name: 'Código' }).waitFor()
  await page.getByRole('button', { name: 'src/health.ts' }).click()
  await page.getByText('export const health = "ok"', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Fonte original' }).click()
  await page.getByRole('button', { name: 'README.md' }).click()
  await page.getByText('# Health App', { exact: true }).waitFor()
  assert.deepEqual(sourceReads.filter(([kind]) => kind === 'file'), [
    ['file', 'c'.repeat(40), 'src/health.ts'], ['file', 'b'.repeat(40), 'README.md'],
  ])
  assert.equal(previewReads.includes(null), true)
  assert.equal(previewReads.includes(changeId), true)
  const candidateReadsBeforeFailure = previewReads.filter((requestedChangeId) => requestedChangeId === changeId).length
  state = 'VERIFICATION_FAILED'
  await page.reload()
  await page.getByText('Verificação reprovada.', { exact: false }).waitFor()
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_500))
  assert.equal(previewReads.filter((requestedChangeId) => requestedChangeId === changeId).length, candidateReadsBeforeFailure)
  await page.setViewportSize({ width: 360, height: 800 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
})

test('Project Build shows one correction and closes a Finding only with current Evidence', async (t) => {
  const workspaceId = '71000000-0000-4000-8000-000000000001'
  const projectId = '71000000-0000-4000-8000-000000000002'
  const changeId = '71000000-0000-4000-8000-000000000003'
  const findingId = '71000000-0000-4000-8000-000000000004'
  const findingRevision = '71000000-0000-4000-8000-000000000005'
  const evidenceId = '71000000-0000-4000-8000-000000000006'
  const origin = 'http://127.0.0.1:41750'
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'),
    server: { host: '127.0.0.1', port: 41750, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  let state = 'VERIFICATION_FAILED'
  let findingState = 'OPEN'
  let candidate = 'b'.repeat(40)
  let closePayload
  const change = () => ({ changeId, projectId, intent: 'Adicionar rota de saúde', baselineDigest: 'a'.repeat(64), planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', state })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId: workspaceId, displayName: 'Builder Operator' }, workspaces: [{ workspaceId, name: 'Workspace' }], projects: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'Health App', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/preview*`, (route) => {
    const requestedChangeId = new URL(route.request().url()).searchParams.get('changeId')
    const isCandidate = requestedChangeId === changeId
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      previewId: isCandidate ? 'preview-candidate' : 'preview-current', subjectKind: isCandidate ? 'CHANGE_CANDIDATE' : 'CURRENT_PROJECT',
      subjectDigest: isCandidate ? candidate : 'a'.repeat(64), ready: false, verified: false, live: false,
    }) })
  })
  await page.route(`**/api/control/projects/${projectId}/changes`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([change()]) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(change()) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/plan`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', items: [{ itemId: projectId, summary: change().intent, state: state === 'RUNNING' ? 'RUNNING' : 'COMPLETED' }], dependencyEdges: [], acceptanceLinks: [], blockers: [], unknowns: [], progress: state }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/progress`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, items: [], overallState: state }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/diff`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ baseSourceRevision: 'b'.repeat(40), candidateSourceRevision: candidate, patch: candidate === 'b'.repeat(40) ? '+broken' : '+health: corrected' }) }))
  await page.route(`**/api/control/projects/${projectId}/source/tree*`, (route) => {
    const sourceRevision = new URL(route.request().url()).searchParams.get('sourceRevision')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision, entries: [{ path: 'src/route.ts', kind: 'FILE' }] }) })
  })
  await page.route(`**/api/control/projects/${projectId}/source/file*`, (route) => {
    const query = new URL(route.request().url()).searchParams
    const sourceRevision = query.get('sourceRevision')
    const path = query.get('path')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision, path, content: `candidate=${sourceRevision}\n` }) })
  })
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/findings`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ findingId, changeId, findingRevision, state: findingState, summary: candidate === 'b'.repeat(40) ? 'A rota de saúde está ausente.' : 'A rota corrigida ainda exige confirmação.' }]) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/evidence`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state === 'UNVERIFIED' || state === 'VERIFIED' ? [{ evidenceId, changeId, claim: 'Candidate satisfies the accepted Change intent.', subjectDigest: candidate, provenance: [] }] : [{ evidenceId: workspaceId, changeId, claim: 'Candidate verification did not establish acceptance.', subjectDigest: candidate, provenance: [] }]) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/findings/${findingId}/commands/close`, (route) => {
    closePayload = route.request().postDataJSON()
    findingState = 'CLOSED'
    state = 'VERIFIED'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ findingId, changeId, findingRevision: workspaceId, state: findingState, summary: 'A rota de saúde está ausente.' }) })
  })

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.getByText('Verificação reprovada.', { exact: false }).waitFor()
  await page.getByText('A rota de saúde está ausente.', { exact: false }).waitFor()
  await openDisclosure(page, 'Código (somente leitura)')
  await page.getByRole('button', { name: 'src/route.ts' }).click()
  await page.getByText(`candidate=${'b'.repeat(40)}`, { exact: true }).waitFor()
  candidate = 'c'.repeat(40)
  state = 'VERIFYING'
  await page.reload()
  await page.getByText('A rota corrigida ainda exige confirmação.', { exact: false }).waitFor({ timeout: 7_000 })
  await openDisclosure(page, 'Diff (somente leitura)')
  await page.getByText('+health: corrected', { exact: true }).waitFor()
  await openDisclosure(page, 'Código (somente leitura)')
  await page.getByRole('button', { name: 'Fonte original' }).click()
  await page.getByRole('button', { name: 'src/route.ts' }).click()
  await page.getByText(`candidate=${'b'.repeat(40)}`, { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Resultado atual' }).click()
  await page.getByRole('button', { name: 'src/route.ts' }).click()
  await page.getByText(`candidate=${'c'.repeat(40)}`, { exact: true }).waitFor()
  await page.getByText('c'.repeat(40), { exact: true }).first().waitFor()
  state = 'UNVERIFIED'
  const closeButton = page.getByRole('button', { name: 'Confirmar resolução verificada' })
  await closeButton.waitFor({ timeout: 7_000 })
  await page.getByText('Correção verificada.', { exact: false }).waitFor()
  await closeButton.click()
  await page.getByText('Ponto resolvido com a verificação do candidato atual.').waitFor()
  await page.getByText('Resultado verificado.', { exact: false }).waitFor({ timeout: 7_000 })
  await openDisclosure(page, 'Diff (somente leitura)')
  assert.deepEqual(closePayload, { expectedFindingRevision: findingRevision, resolutionEvidenceIds: [evidenceId] })
  await page.getByText('+health: corrected', { exact: true }).waitFor()
})

test('Project Build keeps an open source revision pinned while the candidate advances', async (t) => {
  const workspaceId = '72000000-0000-4000-8000-000000000001'
  const projectId = '72000000-0000-4000-8000-000000000002'
  const changeId = '72000000-0000-4000-8000-000000000003'
  const findingId = '72000000-0000-4000-8000-000000000004'
  const findingRevision = '72000000-0000-4000-8000-000000000005'
  const origin = 'http://127.0.0.1:41751'
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'),
    server: { host: '127.0.0.1', port: 41751, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  let state = 'VERIFYING'
  let candidate = 'b'.repeat(40)
  const change = () => ({ changeId, projectId, intent: 'Adicionar rota de saúde', baselineDigest: 'a'.repeat(64), planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', state })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId: workspaceId, displayName: 'Builder Operator' }, workspaces: [{ workspaceId, name: 'Workspace' }], projects: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'Health App', projectRevision: 'revision', archived: false }) }))
  await page.route(`**/api/control/projects/${projectId}/preview*`, (route) => {
    const requestedChangeId = new URL(route.request().url()).searchParams.get('changeId')
    const isCandidate = requestedChangeId === changeId
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      previewId: isCandidate ? 'preview-candidate' : 'preview-current', subjectKind: isCandidate ? 'CHANGE_CANDIDATE' : 'CURRENT_PROJECT',
      subjectDigest: isCandidate ? candidate : 'a'.repeat(64), ready: false, verified: false, live: false,
    }) })
  })
  await page.route(`**/api/control/projects/${projectId}/changes`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([change()]) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(change()) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/plan`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', items: [{ itemId: projectId, summary: change().intent, state: 'COMPLETED' }], dependencyEdges: [], acceptanceLinks: [], blockers: [], unknowns: [], progress: state }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/progress`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, items: [], overallState: state }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/diff`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ baseSourceRevision: 'a'.repeat(40), candidateSourceRevision: candidate, patch: candidate === 'b'.repeat(40) ? '+broken' : '+health: corrected' }) }))
  await page.route(`**/api/control/projects/${projectId}/source/tree*`, (route) => {
    const sourceRevision = new URL(route.request().url()).searchParams.get('sourceRevision')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision, entries: [{ path: 'src/route.ts', kind: 'FILE' }] }) })
  })
  await page.route(`**/api/control/projects/${projectId}/source/file*`, (route) => {
    const query = new URL(route.request().url()).searchParams
    const sourceRevision = query.get('sourceRevision')
    const path = query.get('path')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sourceRevision, path, content: `candidate=${sourceRevision}\n` }) })
  })
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/findings`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ findingId, changeId, findingRevision, state: 'OPEN', summary: candidate === 'b'.repeat(40) ? 'A rota de saúde está ausente.' : 'A rota corrigida ainda exige confirmação.' }]) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/evidence`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))

  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.getByText('O Conexus está verificando o candidato em uma execução independente.', { exact: false }).waitFor()
  await openDisclosure(page, 'Código (somente leitura)')
  await page.getByRole('button', { name: 'src/route.ts' }).click()
  await page.getByText(`candidate=${'b'.repeat(40)}`, { exact: true }).waitFor()
  candidate = 'c'.repeat(40)
  state = 'UNVERIFIED'
  await page.getByText('A rota corrigida ainda exige confirmação.', { exact: false }).waitFor({ timeout: 7_000 })
  await openDisclosure(page, 'Diff (somente leitura)')
  await page.getByText('+health: corrected', { exact: true }).waitFor()
  await openDisclosure(page, 'Código (somente leitura)')
  await page.getByText(`candidate=${'b'.repeat(40)}`, { exact: true }).waitFor()
})

test('Project Build explicitly prepares and opens the exact candidate in iframe and clean new tab', async (t) => {
  const workspaceId = '73000000-0000-4000-8000-000000000001'
  const projectId = '73000000-0000-4000-8000-000000000002'
  const changeId = '73000000-0000-4000-8000-000000000003'
  const attemptId = '73000000-0000-4000-8000-000000000004'
  const artifactRevisionId = '73000000-0000-4000-8000-000000000005'
  const origin = 'http://127.0.0.1:41752'
  const subjectDigest = 'c'.repeat(40)
  const artifactDigest = 'd'.repeat(64)
  let headAllowed = true
  let previewGets = 0
  let previewHeads = 0
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'),
    server: { host: '127.0.0.1', port: 41752, strictPort: true },
  })
  const previewMiddleware = (request, response, next) => {
    if (request.url !== '/__test-preview-entry' || request.method !== 'POST') {
      if (request.url !== '/__test-preview/' || !['GET', 'HEAD'].includes(request.method ?? '')) return next()
      if (request.method === 'HEAD') {
        previewHeads += 1
        response.statusCode = headAllowed ? 200 : 403
        response.end()
        return
      }
      previewGets += 1
      response.statusCode = 200
      response.setHeader('Content-Type', 'text/html')
      response.end('<!doctype html><title>Generated app</title><main>Generated app is running</main><button id="counter" type="button">Count: <span id="count">0</span></button><script>document.querySelector("#counter").addEventListener("click", () => { const count = document.querySelector("#count"); count.textContent = String(Number(count.textContent) + 1) })</script>')
      return
    }
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      assert.equal(Buffer.concat(chunks).toString(), 'entryGrant=grant-secret')
      entryPosts += 1
      response.statusCode = 303
      response.setHeader('Location', '/__test-preview/')
      response.end()
    })
  }
  server.middlewares.use(previewMiddleware)
  server.middlewares.stack.unshift(server.middlewares.stack.pop())
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  await page.addInitScript(() => {
    let releaseHead
    const headReleased = new Promise((resolve) => { releaseHead = resolve })
    window.__releasePreviewHead = () => releaseHead()
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      if (window.top === window && init?.method === 'HEAD' && String(input).endsWith('/__test-preview/')) await headReleased
      return originalFetch(input, init)
    }
  })
  const releaseFirstHead = () => page.evaluate(() => window.__releasePreviewHead())
  let preparationStarted = false
  let preparationPolls = 0
  let launchBody
  let entryPosts = 0
  const change = () => ({ changeId, projectId, intent: 'Adicionar uma página de saúde', baselineDigest: 'a'.repeat(64), planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', state: 'VERIFIED' })
  const preview = (preparation) => ({
    previewId: 'preview-candidate', subjectKind: 'CHANGE_CANDIDATE', subjectDigest,
    ready: false, verified: true, live: false, ...(preparation ? { preparation } : {}),
  })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId: workspaceId, displayName: 'Builder Operator' }, workspaces: [{ workspaceId, name: 'Workspace' }], projects: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'Health App', projectRevision: 'revision', archived: false }) }))
  await page.route((url) => new URL(url).pathname === `/api/control/projects/${projectId}/preview`, (route) => {
    const preparation = preparationStarted
      ? preparationPolls++ === 0
        ? { changeId, subjectDigest, attemptId, state: 'PREPARING', expiresAt: new Date(Date.now() + 120_000).toISOString() }
        : { changeId, subjectDigest, attemptId, state: 'PREPARED', artifactRevisionId, artifactDigest, expiresAt: new Date(Date.now() + 120_000).toISOString() }
      : undefined
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preview(preparation)) })
  })
  await page.route(`**/api/control/projects/${projectId}/preview-preparations`, (route) => {
    assert.equal(route.request().method(), 'POST')
    assert.deepEqual(route.request().postDataJSON(), { changeId, subjectDigest })
    preparationStarted = true
    return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ changeId, subjectDigest, attemptId, state: 'PREPARING', expiresAt: new Date(Date.now() + 120_000).toISOString() }) })
  })
  await page.route(`**/api/control/projects/${projectId}/preview-launches`, (route) => {
    assert.equal(route.request().method(), 'POST')
    launchBody = route.request().postDataJSON()
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      entryUrl: `${origin}/__test-preview-entry`, previewUrl: `${origin}/__test-preview/`, entryGrant: 'grant-secret',
      artifactRevisionId, artifactDigest, expiresAt: new Date(Date.now() + 900_000).toISOString(),
    }) })
  })
  await page.route(`**/api/control/projects/${projectId}/changes`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([change()]) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(change()) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/plan`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', items: [], dependencyEdges: [], acceptanceLinks: [], blockers: [], unknowns: [], progress: 'VERIFIED' }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/progress`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, items: [], overallState: 'VERIFIED' }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/diff`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ baseSourceRevision: 'b'.repeat(40), candidateSourceRevision: subjectDigest, patch: '+health: ok' }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/findings`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/evidence`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto(`${origin}/projects/${projectId}/build`)
  await page.getByRole('heading', { name: 'Preview' }).waitFor()
  await page.getByRole('button', { name: 'Preparar Preview' }).click()
  await page.getByRole('status').filter({ hasText: 'Preparando Preview' }).first().waitFor()
  await page.getByRole('button', { name: 'Abrir Preview' }).click()
  await page.waitForTimeout(1_000)
  assert.deepEqual(launchBody, { changeId, subjectDigest, attemptId, artifactRevisionId, artifactDigest })
  assert.equal(entryPosts, 1)
  assert.equal(await page.locator('iframe[title="Preview do aplicativo"]').count(), 1)
  assert.equal(await page.locator('iframe[title="Preview do aplicativo"]').first().getAttribute('src'), 'about:blank')
  const frame = page.frameLocator('iframe[title="Preview do aplicativo"]')
  await frame.getByText('Generated app is running', { exact: true }).waitFor({ timeout: 7_000 })
  await frame.getByRole('button', { name: 'Count: 0' }).click()
  await frame.getByRole('button', { name: 'Count: 1' }).waitFor()
  assert.equal(previewGets, 1)
  await releaseFirstHead()
  for (let attempt = 0; attempt < 100 && previewHeads === 0; attempt += 1) await page.waitForTimeout(10)
  assert.equal(previewHeads, 1)
  await page.getByRole('status').filter({ hasText: 'Preview carregando no endereço autorizado.' }).waitFor()
  assert.equal(previewGets, 1)
  await page.frameLocator('iframe[title="Preview do aplicativo"]').getByRole('button', { name: 'Count: 1' }).waitFor()
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Abrir em nova aba' }).click()
  const popup = await popupPromise
  await popup.waitForLoadState()
  assert.equal(popup.url(), `${origin}/__test-preview/`)
  await popup.getByText('Generated app is running', { exact: true }).waitFor()

  headAllowed = false
  await page.getByRole('button', { name: 'Abrir Preview' }).click()
  await page.getByRole('status').filter({ hasText: 'não confirmou uma entrada autorizada' }).waitFor()
  const retainedFrame = page.frameLocator('iframe[title="Preview do aplicativo"]')
  await retainedFrame.getByText('Generated app is running', { exact: true }).waitFor()
  await retainedFrame.getByRole('button', { name: 'Count: 1' }).waitFor()

  headAllowed = true
  await page.reload()
  await page.getByRole('button', { name: 'Abrir Preview' }).click()
  await page.frameLocator('iframe[title="Preview do aplicativo"]').getByText('Generated app is running', { exact: true }).waitFor({ timeout: 7_000 })
  assert.equal(entryPosts, 3)
  const codeDisclosure = page.locator('details').filter({ has: page.getByText('Código (somente leitura)', { exact: true }) })
  await page.getByText('Código (somente leitura)', { exact: true }).click()
  assert.equal(await codeDisclosure.getAttribute('open'), '')
  await page.getByText('Código (somente leitura)', { exact: true }).click()
  assert.equal(await codeDisclosure.getAttribute('open'), null)
})
