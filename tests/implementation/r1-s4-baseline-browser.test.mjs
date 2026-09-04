import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const path = (relative) => resolve(repositoryRoot, relative)

test('S4-P1 exact-digest route remains present as S4-P2 adds server-bound approval', () => {
  const expected = [
    'apps/web/src/routes/project-baseline-candidate.tsx',
    'apps/web/src/features/project/components/baseline-candidate.tsx',
  ]
  for (const file of expected) assert.equal(existsSync(path(file)), true, file)
  const router = readFileSync(path('apps/web/src/app/router.tsx'), 'utf8')
  const component = readFileSync(path(expected[1]), 'utf8')
  assert.match(router, /projectBaselineCandidateRoute/)
  assert.match(component, /candidateBaselineDigest/)
  assert.match(component, /Candidate Baseline/)
  assert.match(component, /approveBaseline|Aprovar/)
})

test('S4-P1/P2 real Chromium proves refresh, exact approval, honest failures and narrow reflow', async (t) => {
  const projectId = '30000000-0000-4000-8000-000000000082'
  const digest = 'b'.repeat(64)
  const origin = 'http://127.0.0.1:41737'
  const server = await createServer({
    configFile: path('apps/web/vite.config.mjs'), root: path('apps/web'),
    server: { host: '127.0.0.1', port: 41737, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  let status = 200
  let approved = false
  let decisionStatus = 200
  await page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      account: { accountId: '10000000-0000-4000-8000-000000000082', displayName: 'P1 Operator' },
      workspaces: [], projects: [],
    }),
  }))
  await page.route(`**/api/control/projects/${projectId}/baseline-candidates/${digest}`, (route) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify(status === 200 ? {
      candidateBaselineDigest: digest, sourceRevision: 'revision-b',
      sourceText: 'Exact immutable candidate text', applicationRuntimeProfile: 'MANAGED',
    } : { title: 'unavailable' }),
  }))
  await page.route(`**/api/control/projects/${projectId}/baseline`, (route) => route.fulfill({
    status: approved ? 200 : 404,
    contentType: 'application/json',
    body: JSON.stringify(approved ? {
      baselineDigest: digest, sourceRevision: 'revision-b',
      sourceText: 'Exact immutable candidate text', applicationRuntimeProfile: 'MANAGED',
    } : { title: 'not found' }),
  }))
  await page.route(`**/api/control/projects/${projectId}/baseline/decisions`, async (route) => {
    const body = route.request().postDataJSON()
    assert.deepEqual(body, { candidateBaselineDigest: digest })
    if (decisionStatus === 200) approved = true
    return route.fulfill({
      status: decisionStatus,
      contentType: 'application/json',
      body: JSON.stringify(decisionStatus === 200 ? {
        baselineDigest: digest, sourceRevision: 'revision-b',
        sourceText: 'Exact immutable candidate text', applicationRuntimeProfile: 'MANAGED',
      } : { title: 'stale' }),
    })
  })
  const url = `${origin}/projects/${projectId}/baseline-candidates/${digest}`
  await page.goto(url)
  await page.getByRole('heading', { name: 'Candidate Baseline' }).waitFor()
  assert.equal(await page.getByText('Exact immutable candidate text').count(), 1)
  assert.equal(await page.getByText(digest, { exact: true }).count(), 1)
  await page.getByText('Nenhuma Baseline aprovada existe para este Project.').waitFor()
  await page.getByRole('button', { name: 'Aprovar este Candidate' }).click()
  await page.getByText('Baseline aprovada pelo servidor.').waitFor()
  assert.equal(await page.getByText(digest, { exact: true }).count(), 2)
  decisionStatus = 412
  await page.getByRole('button', { name: 'Aprovar este Candidate' }).click()
  await page.getByText('Este Candidate não é mais o atual. Recarregue a verdade do servidor.').waitFor()
  assert.equal(await page.getByText(digest, { exact: true }).count(), 2)
  await page.reload()
  await page.getByRole('heading', { name: 'Candidate Baseline' }).waitFor()
  await page.setViewportSize({ width: 360, height: 800 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  status = 404
  await page.reload()
  await page.getByRole('heading', { name: 'Candidate indisponível' }).waitFor()
  status = 503
  await page.reload()
  await page.getByRole('heading', { name: 'Não foi possível consultar o Candidate' }).waitFor()
})
