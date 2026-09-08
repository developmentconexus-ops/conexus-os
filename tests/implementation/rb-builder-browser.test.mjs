import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')

test('Project Build creates one Change and reveals Hub progress and exact diff', async (t) => {
  const workspaceId = '70000000-0000-4000-8000-000000000001'
  const projectId = '70000000-0000-4000-8000-000000000002'
  const changeId = '70000000-0000-4000-8000-000000000003'
  const origin = 'http://127.0.0.1:41749'
  const server = await createServer({
    configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'),
    server: { host: '127.0.0.1', port: 41749, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  let state = 'QUEUED'
  const attempts = []
  const evidenceFetchStates = []
  const sourceReads = []
  const change = () => ({ changeId, projectId, intent: 'Adicionar uma página de saúde', baselineDigest: 'a'.repeat(64), planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', state })
  await page.route('**/api/control/access-context', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: { accountId: workspaceId, displayName: 'Builder Operator' }, workspaces: [{ workspaceId, name: 'Workspace' }], projects: [] }) }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projectId, workspaceId, name: 'Health App', projectRevision: 'revision', archived: false }) }))
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
  await page.getByLabel('O que deve mudar neste Project?').fill('Adicionar uma página de saúde')
  await page.getByRole('button', { name: 'Pedir mudança' }).click()
  await page.getByText('Change criado. O Conexus iniciou o trabalho governado.').waitFor()
  assert.equal(attempts.length, 1)
  assert.deepEqual(attempts[0].body, { intent: 'Adicionar uma página de saúde' })
  assert.match(attempts[0].key, /^[0-9a-f-]{36}$/)
  await page.getByText('Progresso:').waitFor()
  state = 'VERIFYING'
  await page.getByText('O Conexus está verificando o candidato em uma execução independente.').waitFor({ timeout: 7_000 })
  for (let attempt = 0; attempt < 20 && !evidenceFetchStates.includes('VERIFYING'); attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }
  assert.equal(evidenceFetchStates.includes('VERIFYING'), true)
  state = 'VERIFIED'
  await page.getByRole('heading', { name: 'Diff do resultado' }).waitFor({ timeout: 7_000 })
  await page.getByText('Resultado verificado.', { exact: false }).waitFor()
  await page.getByRole('heading', { name: 'Verificação' }).waitFor()
  await page.getByText('O candidato satisfaz a intenção aceita do Change.', { exact: false }).waitFor()
  assert.equal(evidenceFetchStates.includes('VERIFIED'), true)
  await page.getByText('+health: ok', { exact: true }).waitFor()
  await page.getByRole('heading', { name: 'Código' }).waitFor()
  await page.getByRole('button', { name: 'src/health.ts' }).click()
  await page.getByText('export const health = "ok"', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Fonte original' }).click()
  await page.getByRole('button', { name: 'README.md' }).click()
  await page.getByText('# Health App', { exact: true }).waitFor()
  assert.deepEqual(sourceReads.filter(([kind]) => kind === 'file'), [
    ['file', 'c'.repeat(40), 'src/health.ts'], ['file', 'b'.repeat(40), 'README.md'],
  ])
  state = 'VERIFICATION_FAILED'
  await page.reload()
  await page.getByText('Verificação reprovada.', { exact: false }).waitFor()
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
  await page.route(`**/api/control/projects/${projectId}/changes`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([change()]) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(change()) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/plan`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', items: [{ itemId: projectId, summary: change().intent, state: state === 'RUNNING' ? 'RUNNING' : 'COMPLETED' }], dependencyEdges: [], acceptanceLinks: [], blockers: [], unknowns: [], progress: state }) }))
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
  await page.getByRole('button', { name: 'src/route.ts' }).click()
  await page.getByText(`candidate=${'b'.repeat(40)}`, { exact: true }).waitFor()
  candidate = 'c'.repeat(40)
  await page.getByText('A rota corrigida ainda exige confirmação.', { exact: false }).waitFor({ timeout: 7_000 })
  await page.getByText('+health: corrected', { exact: true }).waitFor()
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
  assert.deepEqual(closePayload, { expectedFindingRevision: findingRevision, resolutionEvidenceIds: [evidenceId] })
  await page.getByText('+health: corrected', { exact: true }).waitFor()
})
