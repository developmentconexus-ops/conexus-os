import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const outDir = resolve(repositoryRoot, 'docs/evidence/screens/feat-screens-settings')
const FACTORY_CONTROLLER = '**/api/mastra-factory/agent-controller/code'
const BUILDER_MODELS = [
  { id: 'anthropic/claude-opus-4-5', provider: 'anthropic', modelName: 'claude-opus-4-5', hasApiKey: true, useCount: 0 },
  { id: 'anthropic/claude-sonnet-4-5', provider: 'anthropic', modelName: 'claude-sonnet-4-5', hasApiKey: true, useCount: 0 },
]

const providers = [
  { provider: 'anthropic', source: 'stored-user', userCredential: 'api_key', oauth: { supported: true, modes: ['device-code'] } },
  { provider: 'openai', source: 'stored-org', orgCredential: 'api_key' },
  { provider: 'google', source: 'none', oauth: { supported: true, modes: ['device-code'] } },
]

async function mockRoutes(page) {
  await page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ account: { accountId: 'shot-1', displayName: 'Ana Beatriz Cardoso', email: 'ana.cardoso@example.com' }, workspaces: [{ workspaceId: 'w1', name: 'Operações' }], projects: [] }),
  }))
  await page.route('**/api/control/installation', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ administrator: true }) }))
  await page.route(`${FACTORY_CONTROLLER}/models`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: BUILDER_MODELS }) }))
  await page.route('**/api/control/model-accounts', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers, orgKeyAdmin: true }) }))
  await page.route('**/api/control/model-accounts/*/oauth/start', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sessionId: 'shot-session', kind: 'device-code', url: 'https://provider.example/device', userCode: 'WXYZ-7890', nextPollMs: 60000 }),
  }))
  await page.route('**/api/control/model-accounts/*/oauth/poll', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pending', nextPollMs: 60000 }) }))
  await page.route('**/api/control/model-defaults', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ installation: { build: BUILDER_MODELS[0].id, fast: BUILDER_MODELS[1].id }, mine: null, administrator: true }),
  }))
  await page.route('**/api/control/installation/github', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      state: 'connected', organization: { login: 'conexus-inc', type: 'Organization' },
      installUrl: 'https://github.com/apps/conexus/installations/new', manageUrl: 'https://github.com/organizations/conexus-inc/settings/installations',
      repositories: [{ slug: 'conexus-inc/ateliê-web', state: 'reachable' }, { slug: 'conexus-inc/faturamento-api', state: 'missing' }],
    }),
  }))
  await page.route('**/api/control/installation/memory', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ model: BUILDER_MODELS[0].id }) }))
  await page.route('**/api/control/installation/administrators', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ administrators: [
      { accountId: 'shot-1', displayName: 'Ana Beatriz Cardoso', email: 'ana.cardoso@example.com', grantedVia: 'OPERATOR_BOOTSTRAP', grantedBy: null, grantedAt: '2026-08-01T00:00:00.000Z' },
      { accountId: 'shot-2', displayName: 'Diego Fonseca', email: 'diego.fonseca@example.com', grantedVia: 'ADMINISTRATOR', grantedBy: { accountId: 'shot-1', displayName: 'Ana Beatriz Cardoso' }, grantedAt: '2026-09-10T00:00:00.000Z' },
    ] }),
  }))
}

const targets = [
  { name: 'account', path: '/settings/account' },
  { name: 'models', path: '/settings/models' },
  { name: 'github', path: '/settings/installation/github' },
  { name: 'installation-models', path: '/settings/installation/models' },
  { name: 'model-defaults', path: '/settings/installation/model-defaults' },
  { name: 'memory', path: '/settings/installation/memory' },
  { name: 'admins', path: '/settings/installation/admins' },
]

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]
const schemes = ['light', 'dark']

async function main() {
  await mkdir(outDir, { recursive: true })
  const server = await createServer({ configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'), server: { host: '127.0.0.1', port: 41830, strictPort: true } })
  await server.listen()
  const origin = 'http://127.0.0.1:41830'
  const browser = await chromium.launch({ headless: true })
  try {
    for (const viewport of viewports) {
      for (const scheme of schemes) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: scheme })
        const page = await context.newPage()
        await mockRoutes(page)
        for (const target of targets) {
          await page.goto(`${origin}${target.path}`)
          await page.locator('main.cxs-page').waitFor()
          await page.waitForTimeout(150)
          await page.screenshot({ path: resolve(outDir, `${target.name}-${viewport.name}-${scheme}.png`), fullPage: true })
        }
        if (viewport.name === 'desktop' && scheme === 'light') {
          await page.goto(`${origin}/settings/models`)
          await page.getByRole('button', { name: 'Conectar conta' }).click()
          await page.getByRole('button', { name: 'Google (Gemini)' }).click()
          await page.getByRole('button', { name: 'Entrar com a assinatura' }).click()
          await page.getByText('WXYZ-7890').waitFor()
          await page.waitForTimeout(150)
          await page.screenshot({ path: resolve(outDir, 'models-device-code-desktop-light.png'), fullPage: true })
        }
        await context.close()
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }
  console.log(`Screenshots written to ${outDir}`)
}

await main()
