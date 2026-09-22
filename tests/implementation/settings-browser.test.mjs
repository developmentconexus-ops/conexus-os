import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { startWebServer } from './web-dev-server.mjs'

const BUILDER_MODELS = [
  { id: 'anthropic/claude-opus-4-5', provider: 'anthropic', modelName: 'claude-opus-4-5', hasApiKey: true, useCount: 0 },
  { id: 'anthropic/claude-sonnet-4-5', provider: 'anthropic', modelName: 'claude-sonnet-4-5', hasApiKey: true, useCount: 0 },
  { id: 'groq/llama-4', provider: 'groq', modelName: 'llama-4', hasApiKey: false, useCount: 0 },
]

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

const routeBuilderModels = (page) =>
  page.route('**/api/control/model-accounts/models', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: BUILDER_MODELS }) }))

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
  assert.equal(await page.getByRole('link', { name: 'GitHub' }).count(), 0)
  assert.equal(await page.getByRole('link', { name: 'Administradores' }).count(), 0)

  await page.goto(`${origin}/settings/installation/github`)
  await page.getByText('Esta seção é só para administradores da instalação.').waitFor()
})

test('an administrator sees all five installation items in the rail', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a2', displayName: 'Administradora', email: 'admin@example.com' })
  await routeInstallation(page, true)
  await page.goto(`${origin}/settings/account`)
  for (const label of ['GitHub', 'Contas compartilhadas', 'Modelos padrão', 'Memória', 'Administradores']) {
    await page.getByRole('link', { name: label }).waitFor()
  }
})

test('Minhas contas de modelo connects by API key, and by device code', async (t) => {
  const { page, origin } = await withServer(t)
  const writes = []
  const providers = [
    { provider: 'anthropic', source: 'none', oauth: { supported: true, modes: ['device-code'] } },
    { provider: 'google', source: 'none' },
  ]
  await routeAccessContext(page, { accountId: 'a3', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers, orgKeyAdmin: false }) }))
  await page.route('**/api/control/model-defaults', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: false }) }))
  let polls = 0
  await page.route('**/web/config/providers/*/key', (route) => {
    writes.push(['PUT', route.request().postDataJSON()])
    providers[1] = { ...providers[1], source: 'stored-user', userCredential: 'api_key' }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route('**/web/config/providers/*/oauth/start', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'session-1', kind: 'device-code', url: 'https://provider.example/device', userCode: 'ABCD-1234', nextPollMs: 50 }) }))
  await page.route('**/web/config/providers/*/oauth/poll', (route) => {
    polls += 1
    if (polls < 2) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pending', nextPollMs: 50 }) })
    providers[0] = { ...providers[0], source: 'stored-user', userCredential: 'oauth' }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'complete' }) })
  })

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Minhas contas de modelo' }).waitFor()
  await page.getByText('Nenhuma conta conectada').waitFor()
  await page.getByRole('button', { name: 'Anthropic (Claude)' }).click()
  await page.getByRole('button', { name: 'Entrar com a assinatura' }).click()
  await page.getByText('ABCD-1234').waitFor()
  await page.getByText('Aguardando você concluir a entrada na outra aba').waitFor()
  await page.locator('.cxs-row', { hasText: 'Anthropic (Claude)' }).getByText('Conectada').waitFor({ timeout: 5000 })

  await page.getByRole('button', { name: 'Conectar conta' }).click()
  await page.getByRole('button', { name: 'Google (Gemini)' }).click()
  await page.getByLabel('Chave de API').fill('AIza-my-key')
  await page.getByRole('button', { name: 'Salvar chave' }).click()
  await page.getByText('Conta conectada.').waitFor()
  assert.deepEqual(writes.at(-1), ['PUT', { key: 'AIza-my-key' }])
  await page.locator('.cxs-row', { hasText: 'Google (Gemini)' }).getByText('Conectada').waitFor()
})

test('Meus padrões saves my defaults and clears back to the company ones', async (t) => {
  const { page, origin } = await withServer(t)
  let mine = null
  await routeAccessContext(page, { accountId: 'a4', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ providers: [{ provider: 'anthropic', source: 'stored-user', userCredential: 'api_key' }], orgKeyAdmin: false }),
  }))
  await page.route('**/api/control/model-defaults', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ installation: { build: BUILDER_MODELS[0].id, fast: BUILDER_MODELS[1].id }, mine, administrator: false }),
  }))
  await page.route('**/api/control/model-defaults/mine', (route) => {
    if (route.request().method() === 'DELETE') { mine = null; return route.fulfill({ status: 204 }) }
    mine = route.request().postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mine) })
  })

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Meus padrões', exact: false }).waitFor()
  await page.getByRole('button', { name: 'Escolher os meus' }).click()
  await page.getByRole('combobox', { name: 'Construção' }).click()
  await page.getByRole('option', { name: /claude-opus-4-5/ }).click()
  await page.getByRole('listbox').waitFor({ state: 'detached' })
  await page.getByRole('combobox', { name: 'Rápido' }).click()
  await page.getByRole('option', { name: /claude-sonnet-4-5/ }).click()
  await page.getByRole('button', { name: 'Salvar meus padrões' }).click()
  await page.getByText('Padrões salvos.').waitFor()
  assert.deepEqual(mine, { build: BUILDER_MODELS[0].id, fast: BUILDER_MODELS[1].id })

  await page.getByRole('button', { name: 'Usar os padrões da empresa' }).click()
  await page.getByText('Voltou a usar os padrões da empresa.').waitFor()
  assert.equal(mine, null)
})

test('GitHub connect shows the sentence for a personal account', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a5', displayName: 'Administradora', email: 'admin@example.com' })
  await routeInstallation(page, true)
  await page.route('**/api/control/installation/github', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ state: 'not-connected', organization: null, installUrl: 'https://github.com/apps/conexus/installations/new', manageUrl: null, repositories: [] }),
  }))
  await page.route('**/api/control/installation/github/connect', (route) => route.fulfill(problem('github-organization-required')))

  await page.goto(`${origin}/settings/installation/github`)
  await page.getByRole('heading', { name: 'GitHub' }).waitFor()
  await page.getByRole('button', { name: 'Verificar conexão' }).click()
  await page.getByText('Precisa ser uma organização do GitHub. Contas pessoais não servem.').waitFor()
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
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ providers: [{ provider: 'google-ai-pro', source: 'none' }, { provider: 'google', source: 'none' }], orgKeyAdmin: false }),
  }))
  await page.route('**/api/control/model-defaults', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: false }) }))
  await page.route('**/api/control/model-accounts/google-ai-pro/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/control/model-accounts/google-ai-pro', '')
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (!enabled) return json(404, { type: 'not-found' })
    writes.push([request.method(), path, 'x-conexus-csrf' in request.headers(), request.postDataJSON?.() ?? null])
    if (path === '/connection') return json(200, { mine: connected, shared: false, administrator: false })
    if (path === '/login/start') return json(200, { loginId, url: signIn })
    if (path === '/login/complete') {
      if (!request.postDataJSON().callbackUrl.includes('state=issued-state')) return json(400, { type: 'model-login-callback-refused' })
      connected = true
      return json(200, { state: 'succeeded' })
    }
    if (path === `/login/${loginId}`) return json(200, { state: 'waiting' })
    return json(404, {})
  })

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Google AI Pro' }).waitFor()
  const generic = page.getByRole('region', { name: 'Conectar uma conta' })
  await generic.getByRole('button', { name: 'Google (Gemini)' }).waitFor()
  assert.equal(await generic.getByRole('button', { name: 'Google AI Pro' }).count(), 0)

  await page.getByRole('button', { name: 'Conectar com o Google' }).click()
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
  await page.getByRole('button', { name: 'Desconectar' }).waitFor()

  enabled = false
  await page.reload()
  await page.getByRole('heading', { name: 'Minhas contas de modelo' }).waitFor()
  await page.getByRole('heading', { name: 'Meus padrões' }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Google AI Pro' }).count(), 0)
})
