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
  // No provider recommended packs unless a test says otherwise.
  await page.route('**/web/config/model-packs', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ packs: [], activePackId: null }),
  }))
  return { page, origin }
}

const routeAccessContext = (page, account) =>
  page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ account, workspaces: [], projects: [] }),
  }))

const routeBuilderModels = (page) =>
  page.route(/\/api\/control\/model-accounts\/models(\?.*)?$/, (route) =>
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

test('an administrator sees all three installation items in the rail', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a2', displayName: 'Administradora', email: 'admin@example.com' })
  await routeInstallation(page, true)
  await page.goto(`${origin}/settings/account`)
  for (const label of ['GitHub', 'Modelos da empresa', 'Administradores']) {
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
  const anthropicRow = page.locator('.cxs-row', { hasText: 'Anthropic (Claude)' })
  await anthropicRow.getByText('Não conectado').waitFor()
  await anthropicRow.getByRole('button', { name: 'Conectar' }).click()
  await page.getByRole('button', { name: 'Entrar com a assinatura' }).click()
  await page.getByText('ABCD-1234').waitFor()
  await page.getByText('Aguardando você concluir a entrada na outra aba').waitFor()
  assert.equal(await page.locator('.cxs-spinner').count(), 0)
  await anthropicRow.getByText('Conectada').waitFor({ timeout: 5000 })

  const googleRow = page.locator('.cxs-row', { hasText: 'Google (Gemini)' })
  await googleRow.getByText('Não conectado').waitFor()
  await googleRow.getByRole('button', { name: 'Conectar' }).click()
  await page.getByLabel('Chave de API').fill('AIza-my-key')
  await page.getByRole('button', { name: 'Salvar chave' }).click()
  await page.getByText('Conta conectada.').waitFor()
  assert.deepEqual(writes.at(-1), ['PUT', { key: 'AIza-my-key' }])
  await googleRow.getByText('Conectada').waitFor()
})

test('Minhas contas de modelo connects a personal key when a provider is shared by the installation', async (t) => {
  const { page, origin } = await withServer(t)
  const writes = []
  const providers = [
    { provider: 'anthropic', source: 'stored-org', orgCredential: 'api_key' },
  ]
  await routeAccessContext(page, { accountId: 'a3b', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers, orgKeyAdmin: false }) }))
  await page.route('**/api/control/model-defaults', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: false }) }))
  await page.route('**/web/config/providers/*/key', (route) => {
    writes.push(['PUT', route.request().postDataJSON()])
    providers[0] = { ...providers[0], source: 'stored-user', userCredential: 'api_key' }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Minhas contas de modelo' }).waitFor()
  const anthropicRow = page.locator('.cxs-row', { hasText: 'Anthropic (Claude)' })
  await anthropicRow.getByText('Compartilhada pela instalação').waitFor()
  await anthropicRow.getByRole('button', { name: 'Conectar a sua conta' }).click()
  await page.getByLabel('Chave de API').fill('sk-ant-my-key')
  await page.getByRole('button', { name: 'Salvar chave' }).click()
  await page.getByText('Conta conectada.').waitFor()
  assert.deepEqual(writes.at(-1), ['PUT', { key: 'sk-ant-my-key' }])
  await anthropicRow.getByText('Conectada').waitFor()
})

test('Minhas contas de modelo device-code wait mark has no phone overflow and holds still under reduced motion', async (t) => {
  const { page, origin } = await withServer(t)
  const providers = [
    { provider: 'anthropic', source: 'none', oauth: { supported: true, modes: ['device-code'] } },
  ]
  await routeAccessContext(page, { accountId: 'a4', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers, orgKeyAdmin: false }) }))
  await page.route('**/api/control/model-defaults', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: false }) }))
  await page.route('**/web/config/providers/*/oauth/start', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'session-9', kind: 'device-code', url: 'https://provider.example/device', userCode: 'PHNE-0001', nextPollMs: 60_000 }) }))
  await page.route('**/web/config/providers/*/oauth/poll', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pending', nextPollMs: 60_000 }) }))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${origin}/settings/models`)
  const anthropicRow = page.locator('.cxs-row', { hasText: 'Anthropic (Claude)' })
  await anthropicRow.getByRole('button', { name: 'Conectar' }).click()
  await page.getByRole('button', { name: 'Entrar com a assinatura' }).click()
  await page.getByText('PHNE-0001').waitFor()
  const mark = page.locator('.cx-mark--working')
  await mark.waitFor()

  // 390px width, no zoom: the wait mark and its surrounding step must not force a horizontal scrollbar.
  const overflowAtPhoneWidth = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  assert.ok(overflowAtPhoneWidth <= 1, `expected no horizontal overflow at 390px, got ${overflowAtPhoneWidth}px`)

  // Same layout at 200% zoom. Chromium's non-standard `style.zoom` does not reproduce real
  // browser zoom here: the app shell picks its desktop/mobile layout from `matchMedia`, which
  // `style.zoom` leaves keyed to the unzoomed width, so it can pick the wrong layout for the
  // zoomed viewport. A real 200% zoom instead halves the effective CSS viewport that both layout
  // and matchMedia see, so we reproduce that directly by shrinking the viewport.
  await page.setViewportSize({ width: 195, height: 422 })
  const overflowAtZoom = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  assert.ok(overflowAtZoom <= 1, `expected no horizontal overflow at 200% zoom, got ${overflowAtZoom}px`)
  await page.setViewportSize({ width: 390, height: 844 })

  const animationName = await mark.locator('.cx-mark-a').evaluate((element) => getComputedStyle(element).animationName)
  assert.notEqual(animationName, 'none')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const stillAnimationName = await mark.locator('.cx-mark-a').evaluate((element) => getComputedStyle(element).animationName)
  assert.equal(stillAnimationName, 'none')
})

test('Minhas contas de modelo shows a warning for an account that needs to sign in again, and restarts the flow', async (t) => {
  const { page, origin } = await withServer(t)
  const providers = [
    { provider: 'anthropic', source: 'stored-user', userCredential: 'oauth', health: 'needs-reconnect', oauth: { supported: true, modes: ['device-code'] } },
  ]
  await routeAccessContext(page, { accountId: 'a5', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers, orgKeyAdmin: false }) }))
  await page.route('**/api/control/model-defaults', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: false }) }))
  let polls = 0
  await page.route('**/web/config/providers/*/oauth/start', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'session-2', kind: 'device-code', url: 'https://provider.example/device', userCode: 'WXYZ-9876', nextPollMs: 50 }) }))
  await page.route('**/web/config/providers/*/oauth/poll', (route) => {
    polls += 1
    if (polls < 2) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pending', nextPollMs: 50 }) })
    providers[0] = { ...providers[0], health: 'ok' }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'complete' }) })
  })

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Minhas contas de modelo' }).waitFor()
  const row = page.locator('.cxs-row', { hasText: 'Anthropic (Claude)' })
  await row.getByText('Precisa entrar de novo').waitFor()
  await row.getByRole('button', { name: 'Entrar de novo' }).click()
  await page.getByText('WXYZ-9876').waitFor()
  await page.getByText('Aguardando você concluir a entrada na outra aba').waitFor()
  await row.getByText('Conectada').waitFor({ timeout: 5000 })
  assert.equal(await row.getByText('Precisa entrar de novo').count(), 0)
})

test('Minhas contas de modelo recovers from transient poll failures, and shows the technical detail when the device code fails for good', async (t) => {
  const { page, origin } = await withServer(t)
  const providers = [
    { provider: 'anthropic', source: 'none', oauth: { supported: true, modes: ['device-code'] } },
  ]
  await routeAccessContext(page, { accountId: 'a7', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers, orgKeyAdmin: false }) }))
  await page.route('**/api/control/model-defaults', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: false }) }))
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
  await page.route('**/web/config/providers/*/oauth/start', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'session-3', kind: 'device-code', url: 'https://provider.example/device', userCode: 'WXYZ-9876', nextPollMs: 30, expiresAt }) }))
  let polls = 0
  await page.route('**/web/config/providers/*/oauth/poll', (route) => {
    polls += 1
    if (polls <= 2) return route.fulfill({ status: 503 })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'failed', error: 'device_code_expired' }) })
  })

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Minhas contas de modelo' }).waitFor()
  const anthropicRow = page.locator('.cxs-row', { hasText: 'Anthropic (Claude)' })
  await anthropicRow.getByRole('button', { name: 'Conectar' }).click()
  await page.getByRole('button', { name: 'Entrar com a assinatura' }).click()
  await page.getByText('WXYZ-9876').waitFor()
  await page.getByText(/Expira em \d:\d\d/).waitFor()
  // Two transient poll failures are absorbed silently; the third failed poll surfaces the error.
  await page.getByRole('alert').waitFor({ timeout: 5000 })
  await page.getByText('Detalhe técnico').click()
  await page.getByText('device_code_expired').waitFor()
})

test('Minhas contas de modelo lets a person generate another device code once it expires', async (t) => {
  const { page, origin } = await withServer(t)
  const providers = [
    { provider: 'anthropic', source: 'none', oauth: { supported: true, modes: ['device-code'] } },
  ]
  await routeAccessContext(page, { accountId: 'a8', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers, orgKeyAdmin: false }) }))
  await page.route('**/api/control/model-defaults', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: false }) }))
  let starts = 0
  await page.route('**/web/config/providers/*/oauth/start', (route) => {
    starts += 1
    const expiresAt = new Date(Date.now() + (starts === 1 ? 1_000 : 5 * 60_000)).toISOString()
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ sessionId: `session-expire-${starts}`, kind: 'device-code', url: 'https://provider.example/device', userCode: `CODE-${starts}`, nextPollMs: 60_000, expiresAt }),
    })
  })
  await page.route('**/web/config/providers/*/oauth/poll', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pending', nextPollMs: 60_000 }) }))

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Minhas contas de modelo' }).waitFor()
  const anthropicRow = page.locator('.cxs-row', { hasText: 'Anthropic (Claude)' })
  await anthropicRow.getByRole('button', { name: 'Conectar' }).click()
  await page.getByRole('button', { name: 'Entrar com a assinatura' }).click()
  await page.getByText('CODE-1').waitFor()
  await page.getByText('O código expirou.').waitFor({ timeout: 5000 })
  await page.getByRole('button', { name: 'Gerar outro código' }).click()
  await page.getByText('CODE-2').waitFor()
})

test('Meus padrões offers the company defaults, a provider pack and a custom choice', async (t) => {
  const { page, origin } = await withServer(t)
  let mine = null
  const pack = {
    id: 'anthropic-pack', name: 'Anthropic recomendado', description: 'Pacote recomendado pela Anthropic',
    models: { build: BUILDER_MODELS[1].id, fast: BUILDER_MODELS[0].id }, custom: false, active: false,
  }
  await routeAccessContext(page, { accountId: 'a4', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ providers: [{ provider: 'anthropic', source: 'stored-user', userCredential: 'api_key' }], orgKeyAdmin: false }),
  }))
  await page.route('**/web/config/model-packs', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ packs: [pack], activePackId: null }),
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
  await page.getByText(/\(da empresa\)/).waitFor()
  await page.getByRole('radio', { name: 'Usar os padrões da empresa' }).waitFor()

  await page.getByRole('radio', { name: 'Usar o pacote recomendado: Anthropic recomendado' }).click()
  await page.getByText('Padrões salvos.').waitFor()
  assert.deepEqual(mine, pack.models)

  await page.getByRole('radio', { name: 'Escolher o modelo' }).click()
  await page.getByRole('combobox', { name: 'Construção' }).click()
  await page.getByRole('option', { name: /claude-opus-4-5/ }).click()
  await page.getByRole('listbox').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Salvar meus padrões' }).click()
  await page.getByText('Padrões salvos.').waitFor()
  assert.deepEqual(mine, { build: BUILDER_MODELS[0].id, fast: BUILDER_MODELS[0].id })

  await page.getByRole('button', { name: 'Mais opções' }).click()
  await page.getByRole('combobox', { name: 'Rápido' }).click()
  await page.getByRole('option', { name: /claude-sonnet-4-5/ }).click()
  await page.getByRole('listbox').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Salvar meus padrões' }).click()
  await page.getByText('Padrões salvos.').waitFor()
  assert.deepEqual(mine, { build: BUILDER_MODELS[0].id, fast: BUILDER_MODELS[1].id })

  await page.getByRole('radio', { name: 'Usar os padrões da empresa' }).click()
  await page.getByText('Voltou a usar os padrões da empresa.').waitFor()
  assert.equal(mine, null)
})

test('Memória shows a danger alert when saving the model fails', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a7', displayName: 'Administradora', email: 'admin@example.com' })
  await routeInstallation(page, true)
  await routeBuilderModels(page)
  await page.route('**/api/control/model-accounts', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [], orgKeyAdmin: false }),
  }))
  await page.route('**/web/config/providers', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [], orgKeyAdmin: false }),
  }))
  await page.route('**/api/control/model-defaults', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: true }),
  }))
  await page.route('**/api/control/installation/memory', (route) => {
    if (route.request().method() === 'PUT') return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model: null }) })
  })

  await page.goto(`${origin}/settings/installation/memory`)
  await page.waitForURL(`${origin}/settings/installation/models`)
  await page.getByRole('heading', { name: 'Memória' }).waitFor()
  await page.getByText('Valor atual: Padrão do Conexus').waitFor()
  assert.equal(await page.getByText('gemini-3.5-flash').count(), 0)
  await page.getByRole('combobox', { name: 'Modelo de memória' }).click()
  await page.getByRole('option', { name: /claude-opus-4-5/ }).click()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  const alert = page.getByRole('alert')
  await alert.getByText('Não foi possível salvar.').waitFor()
  assert.equal(await alert.evaluate((element) => element.className), 'cxs-alert')
  assert.equal(await page.getByRole('status').count(), 0)
})

test('Modelos da empresa queries builder models with scope=installation and saves company defaults and memory', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a7b', displayName: 'Administradora', email: 'admin@example.com' })
  await routeInstallation(page, true)

  const scopesRequested = []
  await page.route(/\/api\/control\/model-accounts\/models(\?.*)?$/, (route) => {
    const url = new URL(route.request().url())
    scopesRequested.push(url.searchParams.get('scope'))
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: BUILDER_MODELS }) })
  })

  await page.route('**/api/control/model-accounts', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      providers: [
        {
          provider: 'anthropic',
          source: 'stored-shared',
          userCredential: 'oauth',
          sharedWithEveryone: true,
          sharedBy: { accountId: 'a7b', displayName: 'Administradora' },
        },
      ],
      orgKeyAdmin: false,
    }),
  }))

  let savedDefaults = null
  await page.route('**/api/control/model-defaults/installation', (route) => {
    if (route.request().method() === 'PUT') {
      savedDefaults = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(savedDefaults) })
    }
    return route.fulfill({ status: 404 })
  })
  await page.route('**/api/control/model-defaults', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ installation: { build: BUILDER_MODELS[0].id, fast: BUILDER_MODELS[1].id }, mine: null, administrator: true }),
  }))

  let savedMemory = null
  await page.route('**/api/control/installation/memory', (route) => {
    if (route.request().method() === 'PUT') {
      savedMemory = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model: savedMemory.model }) })
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ model: null }),
    })
  })

  await page.goto(`${origin}/settings/installation/models`)
  await page.getByRole('heading', { name: 'Modelos da empresa' }).waitFor()
  await page.getByRole('heading', { name: 'Contas compartilhadas' }).waitFor()
  await page.getByRole('heading', { name: 'Modelos padrão' }).waitFor()
  await page.getByRole('heading', { name: 'Memória' }).waitFor()

  // Verify that the page queried builder models with scope=installation
  assert.ok(scopesRequested.includes('installation'), `Expected models query with scope=installation, got ${JSON.stringify(scopesRequested)}`)

  // Save company defaults
  await page.getByRole('combobox', { name: 'Construção' }).click()
  await page.getByRole('option', { name: /claude-sonnet-4-5/ }).click()
  await page.getByRole('listbox').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Salvar padrões' }).click()
  await page.getByText('Padrões salvos.').waitFor()
  assert.deepEqual(savedDefaults, { build: BUILDER_MODELS[1].id, fast: BUILDER_MODELS[1].id })

  // Save memory model
  await page.getByRole('combobox', { name: 'Modelo de memória' }).click()
  await page.getByRole('option', { name: /claude-opus-4-5/ }).click()
  await page.getByRole('listbox').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByText('Padrão salvo.').waitFor()
  assert.deepEqual(savedMemory, { model: BUILDER_MODELS[0].id })
})

test('GitHub shows the removed-app notice with Projetos vocabulary', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a9', displayName: 'Administradora', email: 'admin@example.com' })
  await routeInstallation(page, true)
  await page.route('**/api/control/installation/github', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      state: 'gone', organization: { login: 'acme-org', type: 'Organization' },
      installUrl: 'https://github.com/apps/conexus/installations/new', manageUrl: null, repositories: [],
    }),
  }))

  await page.goto(`${origin}/settings/installation/github`)
  await page.getByRole('heading', { name: 'GitHub' }).waitFor()
  await page.getByText('Os Projetos não aceitam pedidos').waitFor()
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

test('retired installation routes redirect to Modelos da empresa', async (t) => {
  const { page, origin } = await withServer(t)
  await routeAccessContext(page, { accountId: 'a7', displayName: 'Administradora', email: 'admin@example.com' })
  await routeInstallation(page, true)
  await routeBuilderModels(page)
  await page.route('**/api/control/model-accounts', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [] }),
  }))
  await page.route('**/api/control/model-defaults', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: true }),
  }))
  await page.route('**/api/control/installation/memory', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ model: null }),
  }))

  await page.goto(`${origin}/settings/installation/model-defaults`)
  await page.waitForURL(`${origin}/settings/installation/models`)
  await page.getByRole('heading', { name: 'Modelos da empresa' }).waitFor()

  await page.goto(`${origin}/settings/installation/memory`)
  await page.waitForURL(`${origin}/settings/installation/models`)
  await page.getByRole('heading', { name: 'Modelos da empresa' }).waitFor()
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
  const googleRow = page.locator('.cxs-row', { hasText: 'Google AI Pro' })
  await googleRow.waitFor()
  assert.equal(await page.getByRole('button', { name: 'Conectar outro provedor' }).count(), 0)

  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    googleRow.getByRole('button', { name: 'Conectar com o Google' }).click(),
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
  await page.getByRole('button', { name: 'Desconectar' }).waitFor()

  enabled = false
  await page.reload()
  await page.getByRole('heading', { name: 'Minhas contas de modelo' }).waitFor()
  await page.getByRole('heading', { name: 'Meus padrões' }).waitFor()
  assert.equal(await page.locator('.cxs-row', { hasText: 'Google AI Pro' }).count(), 0)
})

test('Minhas contas de modelo falls back to the primary sign-in link when the popup is blocked', async (t) => {
  const { page, origin } = await withServer(t)
  const loginId = '0f0f0f0f-0000-4000-8000-000000000002'
  const signIn = 'https://accounts.google.com/o/oauth2/v2/auth?state=blocked-state'
  await routeAccessContext(page, { accountId: 'a10', displayName: 'Pessoa Bloqueada', email: 'bloqueada@example.com' })
  await routeInstallation(page, false)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ providers: [{ provider: 'google-ai-pro', source: 'none' }, { provider: 'google', source: 'none' }], orgKeyAdmin: false }),
  }))
  await page.route('**/api/control/model-defaults', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: false }) }))
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
  const googleRow = page.locator('.cxs-row', { hasText: 'Google AI Pro' })
  await googleRow.waitFor()
  await googleRow.getByRole('button', { name: 'Conectar com o Google' }).click()
  const link = page.getByRole('link', { name: 'Abrir a entrada do Google' })
  await link.waitFor()
  assert.equal(await link.getAttribute('href'), signIn)
  assert.equal(await link.getAttribute('data-variant'), 'primary')
  await page.getByText('Não conseguimos abrir a aba automaticamente', { exact: false }).waitFor()
})

test('Minhas contas de modelo preserves non-featured connected accounts and allows switching connect flows', async (t) => {
  const { page, origin } = await withServer(t)
  const providers = [
    { provider: 'anthropic', source: 'none', oauth: { supported: true, modes: ['device-code'] } },
    { provider: 'openai', source: 'none' },
    { provider: 'together', source: 'stored-user', userCredential: 'api_key' },
    { provider: 'fireworks', source: 'none' },
  ]
  await routeAccessContext(page, { accountId: 'a11', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, false)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers, orgKeyAdmin: false }) }))
  await page.route('**/api/control/model-defaults', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: false }) }))

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Minhas contas de modelo' }).waitFor()

  // Non-featured provider with active key ('together') is preserved as a card
  const togetherRow = page.locator('.cxs-row', { hasText: 'Together' })
  await togetherRow.waitFor()
  await togetherRow.getByText('Conectada').waitFor()

  // Non-featured provider without active key ('fireworks') is NOT in the cards list
  assert.equal(await page.locator('.cxs-row', { hasText: 'Fireworks' }).count(), 0)

  // Clicking "Conectar" on Anthropic opens Anthropic's connect form directly
  const anthropicRow = page.locator('.cxs-row', { hasText: 'Anthropic (Claude)' })
  await anthropicRow.getByRole('button', { name: 'Conectar' }).click()
  await page.getByRole('region', { name: 'Conectar Anthropic' }).waitFor()

  // Clicking "Conectar" on OpenAI switches the connect form to OpenAI without closing/reopening
  const openaiRow = page.locator('.cxs-row', { hasText: 'OpenAI' })
  await openaiRow.getByRole('button', { name: 'Conectar' }).click()
  const openaiRegion = page.getByRole('region', { name: 'Conectar OpenAI' })
  await openaiRegion.waitFor()
  assert.equal(await page.getByRole('region', { name: 'Conectar Anthropic' }).count(), 0)

  // Verify header row alignment between title and Cancelar button
  const headerBox = await openaiRegion.locator('.cxs-connect-header').boundingBox()
  const titleBox = await openaiRegion.getByRole('heading', { name: 'OpenAI' }).boundingBox()
  const cancelBox = await openaiRegion.getByRole('button', { name: 'Cancelar' }).boundingBox()
  assert(headerBox && titleBox && cancelBox, 'Header elements must have bounding boxes')
  // Title and Cancelar must align horizontally (within 8px tolerance) rather than stacking vertically
  assert(Math.abs(titleBox.y - cancelBox.y) < 8, `Title y (${titleBox.y}) and Cancelar y (${cancelBox.y}) must align horizontally`)
  assert(cancelBox.x > titleBox.x, 'Cancelar button must be placed after the title')

  // Clicking "Cancelar" closes the inline connect form, revealing "Conectar outro provedor"
  await page.getByRole('button', { name: 'Cancelar' }).click()

  // Clicking "Conectar outro provedor" shows the picker containing unlisted providers
  const otherRow = page.locator('.cxs-row-actions', { hasText: 'Conectar outro provedor' })
  await otherRow.waitFor()
  await page.getByRole('button', { name: 'Conectar outro provedor' }).click()
  const fireworksItem = page.getByRole('button', { name: 'Fireworks' })
  await fireworksItem.waitFor()

  // Clicking an API-key-only provider from the picker advances straight to the API key input
  await fireworksItem.click()
  await page.getByRole('region', { name: 'Conectar Fireworks' }).waitFor()
  await page.getByLabel('Chave de API').waitFor()
  await page.getByRole('button', { name: 'Salvar chave' }).waitFor()
})

test('Minhas contas de modelo displays Google AI Pro card independently of google provider and shows connected state', async (t) => {
  const { page, origin } = await withServer(t)
  // Providers list does NOT include 'google', only 'anthropic' and 'google-ai-pro'
  const providers = [
    { provider: 'anthropic', source: 'none', oauth: { supported: true, modes: ['device-code'] } },
    { provider: 'google-ai-pro', source: 'stored-user' },
  ]
  await routeAccessContext(page, { accountId: 'a12', displayName: 'Pessoa', email: 'pessoa@example.com' })
  await routeInstallation(page, true)
  await routeBuilderModels(page)
  await page.route('**/web/config/providers', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers, orgKeyAdmin: true }) }))
  await page.route('**/api/control/model-defaults', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ installation: null, mine: null, administrator: true }) }))
  await page.route('**/api/control/model-accounts/google-ai-pro/connection', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mine: true, shared: false, administrator: true }) }))

  await page.goto(`${origin}/settings/models`)
  await page.getByRole('heading', { name: 'Minhas contas de modelo' }).waitFor()

  // Google AI Pro is still rendered even without 'google' in providers
  const proRow = page.locator('.cxs-row', { hasText: 'Google AI Pro' })
  await proRow.waitFor()
  await proRow.getByText('Conectado com a sua conta Google.').waitFor()
  await proRow.getByRole('button', { name: 'Desconectar' }).waitFor()
  await proRow.getByRole('button', { name: 'Compartilhar com todos' }).waitFor()
})
