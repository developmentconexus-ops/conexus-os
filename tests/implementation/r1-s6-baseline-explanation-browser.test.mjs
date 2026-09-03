import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const path = (relative) => resolve(repositoryRoot, relative)

test('S6-P3 real Chromium consumes exact PRJ-24 without context or cross-candidate state', async (t) => {
  const projectId = '30000000-0000-4000-8000-000000000624'
  const digestA = 'a'.repeat(64)
  const digestB = 'b'.repeat(64)
  const sourceRevision = 'c'.repeat(40)
  const origin = 'http://127.0.0.1:41739'
  const server = await createServer({
    configFile: path('apps/web/vite.config.mjs'), root: path('apps/web'),
    server: { host: '127.0.0.1', port: 41739, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const requests = []
  let explanationStatus = 200
  let releaseExplanation
  await page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      account: { accountId: '10000000-0000-4000-8000-000000000624', displayName: 'S6 Operator' },
      workspaces: [{ workspaceId: '20000000-0000-4000-8000-000000000624', name: 'S6 Workspace' }],
      projects: [],
    }),
  }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, workspaceId: '20000000-0000-4000-8000-000000000624',
      name: 'S6 Project', projectRevision: 'revision-s6', archived: false,
    }),
  }))
  await page.route(`**/api/control/projects/${projectId}/baseline-candidates/*/assistant/queries`, async (route) => {
    const request = route.request()
    const body = request.postDataJSON()
    const digest = new URL(request.url()).pathname.split('/').at(-3)
    requests.push({ body, digest, method: request.method() })
    if (explanationStatus === 200 && releaseExplanation) {
      await new Promise((resolveExplanation) => {
        releaseExplanation = resolveExplanation
      })
    }
    return route.fulfill({
      status: explanationStatus,
      contentType: 'application/json',
      body: JSON.stringify(explanationStatus === 200 ? {
        candidateBaselineDigest: digest,
        answer: 'O runtime MANAGED mantém a operação dentro do perfil aprovado.',
        provenanceRefs: [digest, sourceRevision],
      } : { title: 'refused' }),
    })
  })
  await page.route(`**/api/control/projects/${projectId}/baseline-candidates/*`, (route) => {
    const digest = new URL(route.request().url()).pathname.split('/').at(-1)
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        candidateBaselineDigest: digest,
        sourceRevision,
        sourceText: digest === digestA ? 'Candidate A exact truth' : 'Candidate B exact truth',
        applicationRuntimeProfile: 'MANAGED',
      }),
    })
  })
  await page.route(`**/api/control/projects/${projectId}/baseline`, (route) => route.fulfill({
    status: 404, contentType: 'application/json', body: JSON.stringify({ title: 'not found' }),
  }))

  await page.goto(`${origin}/projects/${projectId}/baseline-candidates/${digestA}`)
  await page.getByRole('heading', { name: 'Candidate Baseline' }).waitFor()
  const question = page.getByLabel('Pergunta sobre este Candidate exato')
  await question.fill('   ')
  await page.getByRole('button', { name: 'Perguntar ao Conexus' }).click()
  await page.waitForTimeout(50)
  assert.equal(requests.length, 0)

  await question.fill('Por que o runtime é MANAGED?')
  releaseExplanation = true
  await page.getByRole('button', { name: 'Perguntar ao Conexus' }).evaluate((element) => {
    element.click()
    element.click()
  })
  await page.waitForFunction(() => document.querySelector('button[disabled]') !== null)
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0], {
    body: { question: 'Por que o runtime é MANAGED?' },
    digest: digestA,
    method: 'POST',
  })
  releaseExplanation()
  releaseExplanation = undefined
  await page.getByText('O runtime MANAGED mantém a operação dentro do perfil aprovado.').waitFor()
  await page.getByText(digestA, { exact: true }).last().waitFor()
  await page.getByText(sourceRevision, { exact: true }).last().waitFor()

  explanationStatus = 422
  await question.fill('Pergunta que o servidor recusará')
  await page.getByRole('button', { name: 'Perguntar ao Conexus' }).click()
  await page.getByText('A explicação foi recusada. Revise a pergunta; nenhuma verdade foi alterada.').waitFor()
  assert.equal(await question.inputValue(), 'Pergunta que o servidor recusará')
  assert.equal(await page.getByText('O runtime MANAGED mantém a operação dentro do perfil aprovado.').count(), 0)

  explanationStatus = 200
  await page.goto(`${origin}/projects/${projectId}/baseline-candidates/${digestB}`)
  await page.getByText('Candidate B exact truth', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Pergunta sobre este Candidate exato').inputValue(), '')
  assert.equal(await page.getByText('O runtime MANAGED mantém a operação dentro do perfil aprovado.').count(), 0)
  await page.setViewportSize({ width: 360, height: 800 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
})
