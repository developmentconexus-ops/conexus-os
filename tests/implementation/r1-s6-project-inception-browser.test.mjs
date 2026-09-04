import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const path = (relative) => resolve(repositoryRoot, relative)

test('S6-P4 real Chromium preserves intent and idempotency until server-issued candidate navigation', async (t) => {
  const workspaceId = '20000000-0000-4000-8000-000000000704'
  const projectId = '30000000-0000-4000-8000-000000000704'
  const digest = 'd'.repeat(64)
  const origin = 'http://127.0.0.1:41740'
  const server = await createServer({
    configFile: path('apps/web/vite.config.mjs'), root: path('apps/web'),
    server: { host: '127.0.0.1', port: 41740, strictPort: true },
  })
  await server.listen()
  t.after(() => server.close())
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const attempts = []
  let inceptionStatus = 503
  let holdSuccess = false
  let releaseSuccess
  let candidateReads = 0
  await page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      account: { accountId: '10000000-0000-4000-8000-000000000704', displayName: 'S6 Operator' },
      workspaces: [{ workspaceId, name: 'S6 Workspace' }], projects: [],
    }),
  }))
  await page.route(`**/api/control/projects/${projectId}/inception-investigations`, async (route) => {
    attempts.push({
      body: route.request().postDataJSON(),
      idempotencyKey: route.request().headers()['idempotency-key'],
      method: route.request().method(),
    })
    if (inceptionStatus === 200 && holdSuccess) {
      await new Promise((resolveSuccess) => {
        releaseSuccess = resolveSuccess
      })
    }
    return route.fulfill({
      status: inceptionStatus,
      contentType: 'application/json',
      body: JSON.stringify(inceptionStatus === 200 ? {
        candidateBaselineDigest: digest,
        sourceRevision: 'server-inception-revision',
        sourceText: 'Uncached PRJ-07 response text',
        applicationRuntimeProfile: 'MANAGED',
      } : { title: 'unavailable' }),
    })
  })
  await page.route(`**/api/control/projects/${projectId}/baseline-candidates/${digest}`, (route) => {
    candidateReads += 1
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        candidateBaselineDigest: digest,
        sourceRevision: 'server-prj23-revision',
        sourceText: 'Fresh PRJ-23 candidate truth',
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

  await page.goto(`${origin}/projects/${projectId}`)
  await page.getByRole('link', { name: 'Iniciar Project Inception' }).click()
  await page.getByRole('heading', { name: 'Project Inception' }).waitFor()
  const intent = page.getByLabel('O que estamos construindo, para quem e sob quais restrições importantes?')
  await intent.fill('   ')
  await page.getByRole('button', { name: 'Executar Inception' }).click()
  assert.equal(attempts.length, 0)
  assert.equal(await intent.evaluate((element) => element === document.activeElement), true)

  const intentA = 'Criar uma aplicação interna para o time comercial.'
  await intent.fill(intentA)
  await page.getByRole('button', { name: 'Executar Inception' }).click()
  await page.getByText('A Inception está indisponível. Nenhum Candidate foi confirmado; tente novamente com o mesmo intent.').waitFor()
  assert.equal(await intent.inputValue(), intentA)
  assert.match(attempts[0].idempotencyKey, /^[0-9a-f-]{36}$/)
  assert.deepEqual(attempts[0].body, { intent: intentA })

  await page.getByRole('button', { name: 'Executar Inception' }).click()
  await page.getByText('A Inception está indisponível. Nenhum Candidate foi confirmado; tente novamente com o mesmo intent.').waitFor()
  assert.equal(attempts[1].idempotencyKey, attempts[0].idempotencyKey)

  const intentB = 'Criar uma aplicação interna auditável para o time comercial.'
  await intent.fill(intentB)
  await page.getByRole('button', { name: 'Executar Inception' }).click()
  await page.getByText('A Inception está indisponível. Nenhum Candidate foi confirmado; tente novamente com o mesmo intent.').waitFor()
  assert.notEqual(attempts[2].idempotencyKey, attempts[0].idempotencyKey)

  inceptionStatus = 200
  holdSuccess = true
  await page.getByRole('button', { name: 'Executar Inception' }).evaluate((element) => {
    element.click()
    element.click()
  })
  await page.waitForFunction(() => document.querySelector('button[disabled]') !== null)
  assert.equal(attempts.length, 4)
  assert.equal(attempts[3].idempotencyKey, attempts[2].idempotencyKey)
  assert.deepEqual(attempts[3], {
    body: { intent: intentB }, idempotencyKey: attempts[2].idempotencyKey, method: 'POST',
  })
  releaseSuccess()
  releaseSuccess = undefined
  holdSuccess = false
  await page.getByRole('heading', { name: 'Candidate Baseline' }).waitFor()
  assert.equal(new URL(page.url()).pathname, `/projects/${projectId}/baseline-candidates/${digest}`)
  await page.getByText('Fresh PRJ-23 candidate truth', { exact: true }).waitFor()
  assert.equal(await page.getByText('Uncached PRJ-07 response text', { exact: true }).count(), 0)
  assert.equal(candidateReads, 1)
  await page.setViewportSize({ width: 360, height: 800 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
})
