import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const path = (relative) => resolve(repositoryRoot, relative)

test('S6-P5 real Chromium binds two explicit meanings to Candidate A and re-enters server-issued Candidate B', async (t) => {
  const workspaceId = '20000000-0000-4000-8000-000000000705'
  const projectId = '30000000-0000-4000-8000-000000000705'
  const candidateA = 'a'.repeat(64)
  const candidateB = 'b'.repeat(64)
  const origin = 'http://127.0.0.1:41750'
  const server = await createServer({
    configFile: path('apps/web/vite.config.mjs'), root: path('apps/web'),
    server: { host: '127.0.0.1', port: 41750, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const attempts = []
  let refinementStatus = 503
  let holdSuccess = false
  let releaseSuccess
  let candidateBReads = 0

  await page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      account: { accountId: '10000000-0000-4000-8000-000000000705', displayName: 'S6 Operator' },
      workspaces: [{ workspaceId, name: 'S6 Workspace' }], projects: [],
    }),
  }))
  await page.route(`**/api/control/projects/${projectId}/inception-investigations`, async (route) => {
    attempts.push({
      body: route.request().postDataJSON(),
      idempotencyKey: route.request().headers()['idempotency-key'],
      method: route.request().method(),
    })
    if (refinementStatus === 200 && holdSuccess) {
      await new Promise((resolveSuccess) => {
        releaseSuccess = resolveSuccess
      })
    }
    return route.fulfill({
      status: refinementStatus,
      contentType: 'application/json',
      body: JSON.stringify(refinementStatus === 200 ? {
        candidateBaselineDigest: candidateB,
        sourceRevision: 'untrusted-refinement-response-revision',
        sourceText: 'Uncached PRJ-07 Candidate B response text',
        applicationRuntimeProfile: 'MANAGED',
      } : { title: 'unavailable' }),
    })
  })
  await page.route(`**/api/control/projects/${projectId}/baseline-candidates/${candidateA}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      candidateBaselineDigest: candidateA,
      sourceRevision: 'server-candidate-a-revision',
      sourceText: 'Server Candidate A immutable truth',
      applicationRuntimeProfile: 'MANAGED',
    }),
  }))
  await page.route(`**/api/control/projects/${projectId}/baseline-candidates/${candidateB}`, (route) => {
    candidateBReads += 1
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        candidateBaselineDigest: candidateB,
        sourceRevision: 'server-prj23-candidate-b-revision',
        sourceText: 'Fresh PRJ-23 Candidate B truth',
        applicationRuntimeProfile: 'MANAGED',
      }),
    })
  })
  await page.route(`**/api/control/projects/${projectId}/baseline`, (route) => route.fulfill({
    status: 404, contentType: 'application/json', body: JSON.stringify({ title: 'not found' }),
  }))
  await page.route(`**/api/control/projects/${projectId}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      projectId, workspaceId, name: 'S6 Project', projectRevision: 'revision-s6', archived: false,
    }),
  }))

  await page.goto(`${origin}/projects/${projectId}/baseline-candidates/${candidateA}`)
  await page.getByText('Server Candidate A immutable truth', { exact: true }).waitFor()
  const intent = page.getByLabel('Qual objetivo de negócio deve orientar o próximo Candidate?')
  const feedback = page.getByLabel('O que deve mudar neste Candidate exato?')
  const submit = page.getByRole('button', { name: 'Produzir novo Candidate' })

  await intent.fill('   ')
  await feedback.fill('Explicitar aprovação humana.')
  await submit.click()
  assert.equal(attempts.length, 0)
  assert.equal(await intent.evaluate((element) => element === document.activeElement), true)

  const intentA = 'Reduzir a conciliação para quinze minutos sem escrita automática no ERP.'
  await intent.fill(intentA)
  await feedback.fill('   ')
  await submit.click()
  assert.equal(attempts.length, 0)
  assert.equal(await feedback.evaluate((element) => element === document.activeElement), true)

  const feedbackA = 'Manter a trilha de auditoria e exigir aprovação humana para divergências.'
  await feedback.fill(feedbackA)
  await submit.click()
  await page.getByText('O refinamento está indisponível. Nenhum novo Candidate foi confirmado; reenvie os mesmos dados.').waitFor()
  assert.equal(new URL(page.url()).pathname, `/projects/${projectId}/baseline-candidates/${candidateA}`)
  assert.equal(await intent.inputValue(), intentA)
  assert.equal(await feedback.inputValue(), feedbackA)
  assert.match(attempts[0].idempotencyKey, /^[0-9a-f-]{36}$/)
  assert.deepEqual(attempts[0], {
    body: { intent: intentA, priorCandidateBaselineDigest: candidateA, reviewFeedback: feedbackA },
    idempotencyKey: attempts[0].idempotencyKey,
    method: 'POST',
  })

  await submit.click()
  await page.getByText('O refinamento está indisponível. Nenhum novo Candidate foi confirmado; reenvie os mesmos dados.').waitFor()
  assert.equal(attempts[1].idempotencyKey, attempts[0].idempotencyKey)

  const feedbackB = `${feedbackA} Priorizar também o fluxo mobile.`
  await feedback.fill(feedbackB)
  await submit.click()
  await page.getByText('O refinamento está indisponível. Nenhum novo Candidate foi confirmado; reenvie os mesmos dados.').waitFor()
  assert.notEqual(attempts[2].idempotencyKey, attempts[1].idempotencyKey)

  const intentB = `${intentA} Atender primeiro a operação mobile.`
  await intent.fill(intentB)
  await submit.click()
  await page.getByText('O refinamento está indisponível. Nenhum novo Candidate foi confirmado; reenvie os mesmos dados.').waitFor()
  assert.notEqual(attempts[3].idempotencyKey, attempts[2].idempotencyKey)

  refinementStatus = 200
  holdSuccess = true
  await submit.evaluate((element) => {
    element.click()
    element.click()
  })
  await page.waitForFunction(() => document.querySelector('button[disabled]') !== null)
  assert.equal(attempts.length, 5)
  assert.equal(attempts[4].idempotencyKey, attempts[3].idempotencyKey)
  assert.deepEqual(attempts[4].body, {
    intent: intentB,
    priorCandidateBaselineDigest: candidateA,
    reviewFeedback: feedbackB,
  })
  releaseSuccess()
  releaseSuccess = undefined
  holdSuccess = false

  await page.getByText('Fresh PRJ-23 Candidate B truth', { exact: true }).waitFor()
  assert.equal(new URL(page.url()).pathname, `/projects/${projectId}/baseline-candidates/${candidateB}`)
  assert.equal(candidateBReads, 1)
  assert.equal(await page.getByText('Uncached PRJ-07 Candidate B response text', { exact: true }).count(), 0)
  assert.equal(await intent.inputValue(), '')
  assert.equal(await feedback.inputValue(), '')
  assert.equal(await page.getByText('O refinamento está indisponível.', { exact: false }).count(), 0)
  await page.setViewportSize({ width: 360, height: 800 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
})
