import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { startWebServer } from './web-dev-server.mjs'

const withServer = async (t) => {
  const origin = await startWebServer(t)
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  // This Hub runs no CLIProxyAPI unless a test says otherwise.
  await page.route('**/api/control/model-accounts/google-ai-pro/**', (route) => route.fulfill({ status: 404 }))
  return { page, origin }
}

const routeAccessContext = (page, account) =>
  page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ account, workspaces: [], projects: [] }),
  }))

const routeInstallation = (page, administrator) =>
  page.route('**/api/control/installation', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ administrator }),
  }))

const problem = (type) => ({ status: 409, contentType: 'application/json', body: JSON.stringify({ type }) })

test('/settings redirects to Minha conta, and a member sees no Instalação group and is refused an installation route', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a1', displayName: 'Pessoa Membro', email: 'membro@example.com' })
  await routeInstallation(page, false)
  await page.goto(`${origin}/settings`)
  await page.waitForURL(`${origin}/settings/account`)
  await page.getByRole('heading', { name: 'Minha conta' }).waitFor()
  await page.getByRole('link', { name: 'Minhas contas de modelo' }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Administradores' }).count(), 0)

  await page.goto(`${origin}/settings/installation/admins`)
  await page.getByText('Esta seção é só para administradores da instalação.').waitFor()
})

test('an administrator sees Administradores as the one installation item in the rail, and the retired ones are gone', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a2', displayName: 'Administradora', email: 'admin@example.com' })
  await routeInstallation(page, true)
  await page.goto(`${origin}/settings/account`)
  await page.getByRole('link', { name: 'Administradores' }).waitFor()
  for (const label of ['GitHub', 'Modelos da empresa', 'Memória']) {
    assert.equal(await page.getByRole('link', { name: label }).count(), 0, `${label} is not a settings item`)
  }
})

test('Administradores shows a danger alert when granting fails', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a8', displayName: 'Administradora', email: 'admin@example.com' })
  await routeInstallation(page, true)
  await page.route('**/api/control/installation/administrators', (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ administrators: [{ accountId: 'a8', displayName: 'Administradora', email: 'admin@example.com', grantedVia: 'OPERATOR_BOOTSTRAP', grantedBy: null, grantedAt: '2026-09-01T00:00:00.000Z' }] }),
    })
  })

  await page.goto(`${origin}/settings/installation/admins`)
  await page.getByRole('heading', { name: 'Administradores' }).waitFor()
  await page.getByLabel('E-mail').fill('alguem@example.com')
  await page.getByRole('button', { name: 'Tornar administrador' }).click()
  const alert = page.getByRole('alert')
  await alert.waitFor()
  assert.equal(await alert.evaluate((element) => element.className), 'cxs-alert')
})

test('Administradores refuses to revoke the last administrator and to grant an unknown e-mail', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a6', displayName: 'Única Admin', email: 'unica@example.com' })
  await routeInstallation(page, true)
  await page.route('**/api/control/installation/administrators', (route) => {
    if (route.request().method() === 'POST') return route.fulfill(problem('account-not-found'))
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ administrators: [{ accountId: 'a6', displayName: 'Única Admin', email: 'unica@example.com', grantedVia: 'OPERATOR_BOOTSTRAP', grantedBy: null, grantedAt: '2026-09-01T00:00:00.000Z' }] }),
    })
  })
  await page.route('**/api/control/installation/administrators/a6', (route) => route.fulfill({ ...problem('last-installation-administrator'), status: 409 }))

  await page.goto(`${origin}/settings/installation/admins`)
  await page.getByRole('heading', { name: 'Administradores' }).waitFor()
  await page.getByText('Única Admin (você)').waitFor()
  await page.getByRole('button', { name: 'Revogar' }).click()
  await page.getByRole('button', { name: 'Revogar', exact: true }).last().click()
  await page.getByText('Não é possível revogar o último administrador. Torne outra pessoa administradora antes.').waitFor()

  await page.getByLabel('E-mail').fill('ninguem@example.com')
  await page.getByRole('button', { name: 'Tornar administrador' }).click()
  await page.getByText('Nenhuma conta ativa usa este e-mail. A pessoa precisa entrar no Conexus uma vez antes.').waitFor()
})

test('Minhas contas de modelo signs a person in to Google AI Pro through a pasted Google address, and hides the card where the Hub runs no CLIProxyAPI', async (t) => {
  const { page, origin } = await withServer(t)
  const loginId = '0f0f0f0f-0000-4000-8000-000000000001'
  const signIn = 'https://accounts.google.com/o/oauth2/v2/auth?state=issued-state'
  let connected = false
  let enabled = true
  const writes = []
  await routeAccessContext(page, { accountId: 'a9', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await page.route('**/api/control/model-accounts/google-ai-pro/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/control/model-accounts/google-ai-pro', '')
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (!enabled) return json(404, { type: 'not-found' })
    writes.push([request.method(), path, 'x-conexus-csrf' in request.headers(), request.postDataJSON?.() ?? null])
    if (path === '/connection') return json(200, { mine: connected, shared: false, administrator: false })
    // Held open briefly so the test can observe the "Preparando…" label before the tab navigates.
    if (path === '/login/start') { await new Promise((resolve) => setTimeout(resolve, 200)); return json(200, { loginId, url: signIn }) }
    if (path === '/login/complete') {
      if (!request.postDataJSON().callbackUrl.includes('state=issued-state')) return json(400, { type: 'model-login-callback-refused' })
      connected = true
      return json(200, { state: 'succeeded' })
    }
    if (path === `/login/${loginId}`) return json(200, { state: 'waiting' })
    return json(404, {})
  })
  // The popup navigates the real Google URL; answer it instead of letting the test hit the network.
  await page.context().route('https://accounts.google.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }))

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Google AI Pro' }).waitFor()

  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', { name: 'Conectar com o Google' }).click(),
  ])
  await page.getByText('Preparando a entrada do Google…').waitFor()
  await popup.waitForURL(signIn)
  assert.equal(popup.url(), signIn)
  await page.getByText('Abrimos uma nova aba para você entrar com a sua conta Google.', { exact: false }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Abrir a entrada do Google' }).getAttribute('href'), signIn)
  const pasted = page.getByLabel('Endereço da aba que não abriu')
  await pasted.fill('http://localhost:51121/oauth-callback?state=other&code=x')
  await page.getByRole('button', { name: 'Concluir' }).click()
  await page.getByText('Esse endereço não é o da entrada do Google iniciada aqui.').waitFor()
  await pasted.fill('http://localhost:51121/oauth-callback?state=issued-state&code=good')
  await page.getByRole('button', { name: 'Concluir' }).click()
  await page.getByText('Google AI Pro conectado.').waitFor()
  await page.getByText('Conectado com a sua conta Google.').waitFor()
  assert.deepEqual(writes.filter(([method]) => method === 'POST'), [
    ['POST', '/login/start', true, {}],
    ['POST', '/login/complete', true, { loginId, callbackUrl: 'http://localhost:51121/oauth-callback?state=other&code=x' }],
    ['POST', '/login/complete', true, { loginId, callbackUrl: 'http://localhost:51121/oauth-callback?state=issued-state&code=good' }],
  ])

  enabled = false
  await page.reload()
  await page.getByRole('heading', { name: 'Minhas contas de modelo' }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Google AI Pro' }).count(), 0)
})

test('Minhas contas de modelo falls back to the primary sign-in link when the popup is blocked', async (t) => {
  const { page, origin } = await withServer(t)
  const loginId = '0f0f0f0f-0000-4000-8000-000000000002'
  const signIn = 'https://accounts.google.com/o/oauth2/v2/auth?state=blocked-state'
  await routeAccessContext(page, { accountId: 'a10', displayName: 'Pessoa Bloqueada', email: 'bloqueada@example.com' })
  await routeInstallation(page, false)
  await page.route('**/api/control/model-accounts/google-ai-pro/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/control/model-accounts/google-ai-pro', '')
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/connection') return json(200, { mine: false, shared: false, administrator: false })
    if (path === '/login/start') return json(200, { loginId, url: signIn })
    if (path === `/login/${loginId}`) return json(200, { state: 'waiting' })
    return json(404, {})
  })
  // Simulates a browser popup blocker: window.open runs but returns no handle.
  await page.addInitScript(() => { window.open = () => null })

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Google AI Pro' }).waitFor()
  await page.getByRole('button', { name: 'Conectar com o Google' }).click()
  const link = page.getByRole('link', { name: 'Abrir a entrada do Google' })
  await link.waitFor()
  assert.equal(await link.getAttribute('href'), signIn)
  assert.equal(await link.getAttribute('data-variant'), 'primary')
  await page.getByText('Não conseguimos abrir a aba automaticamente', { exact: false }).waitFor()
})
