import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { startWebServer } from './web-dev-server.mjs'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const WORKSPACE = { workspaceId: 'w1', name: 'Operações' }
const PROJECT = { projectId: PROJECT_ID, workspaceId: WORKSPACE.workspaceId, name: 'Faturamento', projectRevision: 'r1', archived: false }

const withServer = async (t) => {
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  return { page, origin }
}

const routeAccessContext = (page, account) =>
  page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ account, workspaces: [WORKSPACE], projects: [] }),
  }))

const routeProject = (page) =>
  page.route(`**/api/control/projects/${PROJECT_ID}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(PROJECT),
  }))

test('an Owner sees the application address, grants and invitations', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a1', displayName: 'Ana Beatriz Cardoso', email: 'ana@example.com' })
  await routeProject(page)
  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      address: 'https://faturamento.apps.conexus.example',
      entries: [
        { kind: 'grant', grantId: 'g1', accountId: 'acc-1', displayName: 'Diego Fonseca', email: 'diego@example.com', grantedAt: '2026-09-01T00:00:00.000Z' },
        { kind: 'invitation', invitationId: 'inv-1', email: 'convidada@example.com', invitedAt: '2026-09-10T00:00:00.000Z', expiresAt: '2026-10-10T00:00:00.000Z' },
      ],
    }),
  }))

  await page.goto(`${origin}/projects/${PROJECT_ID}/settings/access`)
  await page.getByRole('heading', { name: 'Acesso ao aplicativo' }).waitFor()
  await page.getByText('https://faturamento.apps.conexus.example').waitFor()
  await page.getByText('Diego Fonseca').waitFor()
  await page.getByText('convidada@example.com').waitFor()
  await page.getByText('Quem é membro do Workspace já usa o aplicativo sem precisar estar nesta lista.').waitFor()
})

test('a non-Owner is told only Owners manage application access', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a2', displayName: 'Pessoa Membro', email: 'membro@example.com' })
  await routeProject(page)
  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access`, (route) => route.fulfill({
    status: 403, contentType: 'application/problem+json',
    body: JSON.stringify({ type: 'urn:conexus:problem:application-access-manage-required', title: 'Application access administration denied' }),
  }))

  await page.goto(`${origin}/projects/${PROJECT_ID}/settings/access`)
  await page.getByText('Só Owners do Workspace decidem quem usa este aplicativo.').waitFor()
  assert.equal(await page.getByText('Endereço do aplicativo').count(), 0)
})

test('granting access shows the new invitation, and revoking a grant removes it', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a3', displayName: 'Ana Beatriz Cardoso', email: 'ana@example.com' })
  await routeProject(page)
  let entries = [
    { kind: 'grant', grantId: 'g1', accountId: 'acc-1', displayName: 'Diego Fonseca', email: 'diego@example.com', grantedAt: '2026-09-01T00:00:00.000Z' },
  ]
  let grantSubmitted = false
  let holdRefresh
  const refreshStarted = new Promise((resolve) => { holdRefresh = resolve })
  let releaseRefresh
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve })
  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access`, async (route) => {
    if (route.request().method() === 'POST') {
      grantSubmitted = true
      const invitation = { kind: 'invitation', invitationId: 'inv-2', email: route.request().postDataJSON().email, invitedAt: '2026-09-20T00:00:00.000Z', expiresAt: '2026-10-20T00:00:00.000Z' }
      entries = [...entries, invitation]
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(invitation) })
    }
    if (grantSubmitted && holdRefresh) {
      holdRefresh()
      holdRefresh = null
      await refreshGate
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ address: 'https://faturamento.apps.conexus.example', entries }) })
  })

  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access/grant/g1`, (route) => {
    entries = entries.filter((entry) => entry.kind !== 'grant' || entry.grantId !== 'g1')
    return route.fulfill({ status: 204 })
  })

  await page.goto(`${origin}/projects/${PROJECT_ID}/settings/access`)
  await page.getByText('Diego Fonseca').waitFor()
  await page.getByLabel('Email').fill('nova.pessoa@example.com')
  await page.getByRole('button', { name: 'Convidar' }).click()
  await refreshStarted
  assert.equal(await page.getByText('Convite criado para nova.pessoa@example.com.').count(), 0)
  assert.equal(await page.getByText('nova.pessoa@example.com', { exact: true }).count(), 0)
  releaseRefresh()
  await page.getByText('Convite criado para nova.pessoa@example.com.').waitFor()
  await page.getByText('nova.pessoa@example.com', { exact: true }).waitFor()

  await page.getByRole('button', { name: 'Remover' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remover' }).click()
  await page.getByRole('alertdialog').waitFor({ state: 'detached' })
  await page.getByText('Diego Fonseca').waitFor({ state: 'detached' })
})
