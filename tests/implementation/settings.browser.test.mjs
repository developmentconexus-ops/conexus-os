import assert from 'node:assert/strict'
import test from 'node:test'
import { shareWebBrowser } from './web-dev-server.mjs'

const web = shareWebBrowser()

const withServer = async (t) => {
  const { page, origin } = await web.openPage(t, { viewport: { width: 1200, height: 900 } })
  // This Hub runs no CLIProxyAPI unless a test says otherwise.
  await page.route('**/api/control/model-accounts/google-ai-pro/**', (route) => route.fulfill(notFound))
  await page.route('**/api/control/model-accounts', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ administrator: false, accounts: [{ provider: 'openai-codex', providerName: 'OpenAI (ChatGPT)', mine: false, shared: false }] }),
  }))
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

const notFound = { status: 404, contentType: 'application/problem+json', body: JSON.stringify({ type: 'urn:conexus:problem:NOT_FOUND', title: 'NOT_FOUND', status: 404, code: 'NOT_FOUND' }) }
const problem = (code, status = 409) => ({ status, contentType: 'application/problem+json', body: JSON.stringify({ type: `urn:conexus:problem:${code}`, title: code, status, code }) })

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
    assert.equal(await page.getByRole('link', { name: label, exact: true }).count(), 0, `${label} is not a settings item`)
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
    if (route.request().method() === 'POST') return route.fulfill(problem('ACCOUNT_NOT_FOUND'))
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ administrators: [{ accountId: 'a6', displayName: 'Única Admin', email: 'unica@example.com', grantedVia: 'OPERATOR_BOOTSTRAP', grantedBy: null, grantedAt: '2026-09-01T00:00:00.000Z' }] }),
    })
  })
  await page.route('**/api/control/installation/administrators/a6', (route) => route.fulfill({ ...problem('LAST_INSTALLATION_ADMINISTRATOR'), status: 409 }))

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
    if (!enabled) return route.fulfill(notFound)
    writes.push([request.method(), path, request.postDataJSON?.() ?? null])
    if (path === '/connection') return json(200, { mine: connected, shared: false, administrator: false })
    // Held open briefly so the test can observe the "Preparando…" label before the tab navigates.
    if (path === '/login/start') { await new Promise((resolve) => setTimeout(resolve, 200)); return json(200, { loginId, url: signIn }) }
    if (path === '/login/complete') {
      if (!request.postDataJSON().callbackUrl.includes('state=issued-state')) return route.fulfill(problem('MODEL_LOGIN_CALLBACK_REFUSED', 400))
      connected = true
      return json(200, { state: 'succeeded' })
    }
    if (path === `/login/${loginId}`) return json(200, { state: 'waiting' })
    return route.fulfill(notFound)
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
  await page.getByText('O Conexus não aceitou esse endereço de retorno da entrada.').waitFor()
  await pasted.fill('http://localhost:51121/oauth-callback?state=issued-state&code=good')
  await page.getByRole('button', { name: 'Concluir' }).click()
  await page.getByText('Google AI Pro conectado.').waitFor()
  await page.getByText('Conectado com a sua conta Google.').waitFor()
  assert.deepEqual(writes.filter(([method, path]) => method === 'POST' && path !== `/login/${loginId}`), [
    ['POST', '/login/start', {}],
    ['POST', '/login/complete', { loginId, callbackUrl: 'http://localhost:51121/oauth-callback?state=other&code=x' }],
    ['POST', '/login/complete', { loginId, callbackUrl: 'http://localhost:51121/oauth-callback?state=issued-state&code=good' }],
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
    return route.fulfill(notFound)
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

test('Minhas contas de modelo signs a person in to ChatGPT with a device code, and the page never holds a token', async (t) => {
  const { page, origin } = await withServer(t)
  const loginId = '0f0f0f0f-0000-4000-8000-000000000002'
  const deviceUrl = 'https://auth.openai.com/codex/device'
  let connected = false
  let polls = 0
  const calls = []
  await routeAccessContext(page, { accountId: 'a9', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await page.route('**/api/control/model-accounts', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ administrator: false, accounts: [{ provider: 'openai-codex', providerName: 'OpenAI (ChatGPT)', mine: connected, shared: false }] }),
  }))
  await page.route('**/api/control/model-accounts/openai-codex/oauth/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    calls.push([request.method(), url.pathname.replace('/api/control/model-accounts/openai-codex/oauth', '')])
    if (url.pathname.endsWith('/start')) return json({ loginId, url: deviceUrl, userCode: 'ABCD-1234', intervalMs: 0, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() })
    if (url.pathname.endsWith('/poll')) {
      assert.equal(url.searchParams.get('loginId'), loginId)
      polls += 1
      if (polls < 2) return json({ state: 'waiting' })
      connected = true
      return json({ state: 'succeeded' })
    }
    return route.fulfill(notFound)
  })
  await page.context().route('https://auth.openai.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }))

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'ChatGPT' }).waitFor()
  await page.getByRole('button', { name: 'Conectar com o ChatGPT' }).click()
  await page.getByText('ABCD-1234').waitFor()
  await page.getByText('O código expira em', { exact: false }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'abra a página de entrada da OpenAI' }).getAttribute('href'), deviceUrl)
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', { name: 'Copiar código e abrir o ChatGPT' }).click(),
  ])
  await popup.waitForURL(deviceUrl)
  await page.getByText('ChatGPT conectado.').waitFor()
  await page.getByText('Conectado com a sua conta do ChatGPT.').waitFor()
  assert.deepEqual(calls, [['POST', '/start'], ['POST', '/poll'], ['POST', '/poll']], 'the poll is a POST with no body')
  assert.equal(await page.evaluate(() => document.body.innerText.includes('access')), false)
})

test('Minhas contas de modelo saves an Anthropic key and signs in with a Claude subscription by pasted code, and the page never shows the key again', async (t) => {
  const { page, origin } = await withServer(t)
  const fakeKey = `sk-ant-api03-${'x'.repeat(40)}`
  const loginId = '0f0f0f0f-0000-4000-8000-000000000003'
  const authorizeUrl = 'https://claude.ai/oauth/authorize?attempt=1'
  let kind = null
  const calls = []
  await routeAccessContext(page, { accountId: 'a9', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await page.route('**/api/control/model-accounts', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ administrator: false, accounts: [
      { provider: 'openai-codex', providerName: 'OpenAI (ChatGPT)', mine: false, kind: null, shared: false },
      { provider: 'anthropic', providerName: 'Anthropic (Claude)', mine: kind !== null, kind, shared: false },
    ] }),
  }))
  await page.route('**/api/control/model-accounts/anthropic/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/control/model-accounts/anthropic', '')
    const body = request.postDataJSON()
    calls.push([request.method(), path, body])
    const json = (value) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })
    if (path === '/api-key') { kind = 'api_key'; return route.fulfill({ status: 204 }) }
    if (path === '/oauth/start') return json({ loginId, url: authorizeUrl, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() })
    if (path === '/oauth/complete') {
      if (body.code !== 'good#verifier-1') return json({ state: 'failed' })
      kind = 'oauth'
      return json({ state: 'succeeded' })
    }
    return route.fulfill(notFound)
  })

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Chave de API da Anthropic (Claude)' }).waitFor()
  await page.getByLabel('Chave de API', { exact: true }).fill(fakeKey)
  await page.getByRole('button', { name: 'Salvar a chave' }).click()
  await page.getByText('Chave salva.', { exact: false }).waitFor()
  await page.getByText('Conectado com a sua chave.').waitFor()
  assert.equal(await page.getByLabel('Chave de API', { exact: true }).inputValue(), '', 'the field is cleared once the key is saved')

  await page.getByRole('heading', { name: 'Assinatura Claude' }).waitFor()
  await page.getByText('Entrar com a assinatura substitui a chave de API da Anthropic que você salvou.').waitFor()
  await page.getByRole('button', { name: 'Entrar com a assinatura Claude' }).click()
  assert.equal(await page.getByRole('link', { name: 'Abrir a página da Claude' }).getAttribute('href'), authorizeUrl)
  await page.getByLabel('Código da Claude').fill('typo#verifier-1')
  await page.getByRole('button', { name: 'Concluir' }).click()
  await page.getByText('A Anthropic recusou esse código.', { exact: false }).waitFor()
  await page.getByLabel('Código da Claude').fill('good#verifier-1')
  await page.getByRole('button', { name: 'Concluir' }).click()
  await page.getByText('Assinatura Claude conectada.').waitFor()
  await page.getByText('Conectado com a sua assinatura Claude.').waitFor()

  assert.deepEqual(calls, [
    ['PUT', '/api-key', { key: fakeKey }],
    ['POST', '/oauth/start', {}],
    ['POST', '/oauth/complete', { loginId, code: 'typo#verifier-1' }],
    ['POST', '/oauth/complete', { loginId, code: 'good#verifier-1' }],
  ])
  assert.equal(await page.evaluate(() => document.body.innerText.includes('sk-ant-')), false)
})
