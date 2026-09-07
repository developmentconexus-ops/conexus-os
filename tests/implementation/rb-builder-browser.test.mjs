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
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/plan`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, planningDepth: 'DIRECT', rigorProfile: 'CONTROLLED', items: [{ itemId: projectId, summary: change().intent, state: state === 'RESULT_READY' ? 'COMPLETED' : 'RUNNING' }], dependencyEdges: [], acceptanceLinks: [], blockers: [], unknowns: [], progress: state }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/progress`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ planRevision: workspaceId, items: [], overallState: state }) }))
  await page.route(`**/api/control/projects/${projectId}/changes/${changeId}/diff`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ baseSourceRevision: 'b'.repeat(40), candidateSourceRevision: 'c'.repeat(40), patch: '+health: ok' }) }))

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
  state = 'RESULT_READY'
  await page.getByRole('heading', { name: 'Diff do resultado' }).waitFor({ timeout: 7_000 })
  await page.getByText('+health: ok', { exact: true }).waitFor()
  await page.setViewportSize({ width: 360, height: 800 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
})
