import assert from 'node:assert/strict'
import test from 'node:test'
import { shareWebBrowser } from './web-dev-server.mjs'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const WORKSPACE = { workspaceId: '20000000-0000-4000-8000-000000000001', name: 'Operações' }
const PROJECT = { projectId: PROJECT_ID, workspaceId: WORKSPACE.workspaceId, name: 'Faturamento', projectRevision: '50000000-0000-4000-8000-000000000001', archived: false, deleting: false }

const GRANT_ID = '12000000-0000-4000-8000-000000000001'
const GRANTEE_ID = '13000000-0000-4000-8000-000000000001'
const INVITATION_ID = '14000000-0000-4000-8000-000000000001'
const NEW_INVITATION_ID = '14000000-0000-4000-8000-000000000002'
const OLD_INVITATION_ID = '14000000-0000-4000-8000-000000000003'

const web = shareWebBrowser()

const withServer = async (t) => {
  const { page, origin } = await web.openPage(t, { viewport: { width: 1200, height: 900 } })
  return { page, origin }
}

const routeSession = (page, account) =>
  page.route('**/api/session', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ account, workspaces: [WORKSPACE], administrator: false }),
  }))

const routeProject = (page) =>
  page.route(`**/api/control/projects/${PROJECT_ID}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(PROJECT),
  }))

test('an Owner sees the application address, grants and invitations', async (t) => {
  const { page, origin } = await withServer(t)
  await routeSession(page, { accountId: '10000000-0000-4000-8000-000000000001', displayName: 'Ana Beatriz Cardoso' })
  await routeProject(page)
  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      address: 'https://faturamento.apps.conexus.example',
      entries: [
        { kind: 'grant', grantId: GRANT_ID, accountId: GRANTEE_ID, displayName: 'Diego Fonseca', email: 'diego@example.com', grantedAt: '2026-09-01T00:00:00.000Z' },
        { kind: 'invitation', invitationId: INVITATION_ID, email: 'convidada@example.com', invitedAt: '2026-09-10T00:00:00.000Z', expiresAt: '2026-10-10T00:00:00.000Z', state: 'PENDING' },
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
  await routeSession(page, { accountId: '10000000-0000-4000-8000-000000000002', displayName: 'Pessoa Membro' })
  await routeProject(page)
  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access`, (route) => route.fulfill({
    status: 403, contentType: 'application/problem+json',
    body: JSON.stringify({ type: 'urn:conexus:problem:APPLICATION_ACCESS_MANAGE_REQUIRED', title: 'APPLICATION_ACCESS_MANAGE_REQUIRED', status: 403, code: 'APPLICATION_ACCESS_MANAGE_REQUIRED' }),
  }))

  await page.goto(`${origin}/projects/${PROJECT_ID}/settings/access`)
  await page.getByText('Você não tem permissão para gerenciar quem acessa este aplicativo. Peça a quem administra o Conexus.').waitFor()
  assert.equal(await page.getByText('Endereço do aplicativo').count(), 0)
})

test('granting access shows the new invitation, and revoking a grant removes it', async (t) => {
  const { page, origin } = await withServer(t)
  await routeSession(page, { accountId: '10000000-0000-4000-8000-000000000003', displayName: 'Ana Beatriz Cardoso' })
  await routeProject(page)
  let entries = [
    { kind: 'grant', grantId: GRANT_ID, accountId: GRANTEE_ID, displayName: 'Diego Fonseca', email: 'diego@example.com', grantedAt: '2026-09-01T00:00:00.000Z' },
  ]
  let grantSubmitted = false
  let holdRefresh
  const refreshStarted = new Promise((resolve) => { holdRefresh = resolve })
  let releaseRefresh
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve })
  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access`, async (route) => {
    if (route.request().method() === 'POST') {
      grantSubmitted = true
      const invitation = { kind: 'invitation', invitationId: NEW_INVITATION_ID, email: route.request().postDataJSON().email, invitedAt: '2026-09-20T00:00:00.000Z', expiresAt: '2026-10-20T00:00:00.000Z', state: 'PENDING' }
      entries = [...entries, invitation]
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(invitation) })
    }
    if (grantSubmitted && holdRefresh) {
      holdRefresh()
      holdRefresh = null
      await refreshGate
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ address: 'https://faturamento.apps.conexus.example', entries }) })
  })

  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access/grants/${GRANT_ID}`, (route) => {
    entries = entries.filter((entry) => entry.kind !== 'grant' || entry.grantId !== GRANT_ID)
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

test('an expired invitation shows Vencido, and Convidar de novo shows the renewed invitation the server answered', async (t) => {
  const { page, origin } = await withServer(t)
  await routeSession(page, { accountId: '10000000-0000-4000-8000-000000000004', displayName: 'Ana Beatriz Cardoso' })
  await routeProject(page)
  let entries = [{ kind: 'invitation', invitationId: OLD_INVITATION_ID, email: 'antiga@example.com', invitedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-15T00:00:00.000Z', state: 'EXPIRED' }]
  const posts = []
  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access`, (route) => {
    if (route.request().method() === 'POST') {
      const { email } = route.request().postDataJSON()
      posts.push({ email, key: route.request().headers()['idempotency-key'] })
      const renewed = { kind: 'invitation', invitationId: OLD_INVITATION_ID, email, invitedAt: '2026-09-20T00:00:00.000Z', expiresAt: '2026-10-20T00:00:00.000Z', state: 'PENDING' }
      entries = [renewed]
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(renewed) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ address: 'https://faturamento.apps.conexus.example', entries }) })
  })

  await page.goto(`${origin}/projects/${PROJECT_ID}/settings/access`)
  await page.getByRole('heading', { name: 'Convites 1' }).waitFor()
  const old = page.locator('.cx-person', { hasText: 'antiga@example.com' })
  await old.getByText('Vencido', { exact: true }).waitFor()
  assert.match(await old.locator('.cx-person-who span').innerText(), /^Venceu em /)
  await old.getByRole('button', { name: 'Convidar de novo' }).click()
  await old.getByText('Pendente', { exact: true }).waitFor()
  await page.getByText('Convite criado para antiga@example.com.').waitFor()
  assert.match(await old.locator('.cx-person-who span').innerText(), /^Vale até /)
  assert.equal(await old.getByRole('button', { name: 'Convidar de novo' }).count(), 0)
  assert.equal(posts.length, 1)
  assert.equal(posts[0].email, 'antiga@example.com')
  assert.match(posts[0].key, /^[0-9a-f-]{36}$/)
})

test('an email the Hub would refuse is refused on the page before any request', async (t) => {
  const { page, origin } = await withServer(t)
  await routeSession(page, { accountId: '10000000-0000-4000-8000-000000000005', displayName: 'Ana Beatriz Cardoso' })
  await routeProject(page)
  let posted = false
  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access`, (route) => {
    if (route.request().method() === 'POST') posted = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [] }) })
  })

  await page.goto(`${origin}/projects/${PROJECT_ID}/settings/access`)
  await page.getByLabel('Email').fill('sem-arroba')
  await page.getByRole('button', { name: 'Convidar' }).click()
  await page.getByText('Esse e-mail não é válido.').waitFor()
  assert.equal(posted, false)
})

test('a 4xx refusal drops the attempt key and an unreachable Hub keeps it', async (t) => {
  const { page, origin } = await withServer(t)
  await routeSession(page, { accountId: '10000000-0000-4000-8000-000000000006', displayName: 'Ana Beatriz Cardoso' })
  await routeProject(page)
  const keys = []
  const answers = [
    (route) => route.fulfill({ status: 400, contentType: 'application/problem+json', body: JSON.stringify({ type: 'urn:conexus:problem:EMAIL_INVALID', title: 'EMAIL_INVALID', status: 400, code: 'EMAIL_INVALID' }) }),
    (route) => route.abort('connectionreset'),
    (route) => route.abort('connectionreset'),
  ]
  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access`, (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [] }) })
    keys.push(route.request().headers()['idempotency-key'])
    return answers[keys.length - 1](route)
  })
  await page.goto(`${origin}/projects/${PROJECT_ID}/settings/access`)
  await page.getByLabel('Email').fill('nova.pessoa@example.com')
  for (const sent of [1, 2, 3]) {
    await page.getByRole('button', { name: 'Convidar' }).click()
    while (keys.length < sent) await page.waitForTimeout(50)
  }
  assert.notEqual(keys[0], keys[1], 'a 4xx refusal starts the next attempt fresh')
  assert.equal(keys[1], keys[2], 'an unreachable Hub keeps the key for the identical retry')
})
