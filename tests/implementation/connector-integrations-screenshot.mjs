import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const outDir = resolve(repositoryRoot, 'docs/evidence/stage2-q4')
const WORKSPACE_ID = 'w1'
const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT = { projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, name: 'Pedidos de compra', projectRevision: 'r1', archived: false }

// Fixture data only: no field here is a credential, since the wire schema never returns one.
async function mockRoutes(page) {
  await page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      account: { accountId: 'shot-1', displayName: 'Ana Beatriz Cardoso', email: 'ana.cardoso@example.com' },
      workspaces: [{ workspaceId: WORKSPACE_ID, name: 'Metal Nobre' }],
      projects: [],
    }),
  }))
  await page.route(`**/api/control/projects/${PROJECT_ID}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(PROJECT),
  }))
  await page.route(`**/api/control/workspaces/${WORKSPACE_ID}/connections`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      entries: [
        { connectionId: 'conn-1', connectorId: 'sankhya', label: 'ERP principal', createdAt: '2026-09-20T13:00:00.000Z' },
      ],
    }),
  }))
  await page.route(`**/api/control/projects/${PROJECT_ID}/connector-grants`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      entries: [
        { kind: 'grant', grantId: 'grant-1', connectionId: 'conn-1', connectorId: 'sankhya', capabilityId: 'sankhya.purchase-order.read', grantedAt: '2026-09-24T10:00:00.000Z' },
      ],
    }),
  }))
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const server = await createServer({ configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'), server: { host: '127.0.0.1', port: 41832, strictPort: true } })
  await server.listen()
  const origin = 'http://127.0.0.1:41832'
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, colorScheme: 'light' })
    const page = await context.newPage()
    await mockRoutes(page)
    await page.goto(`${origin}/projects/${PROJECT_ID}/integrations`)
    await page.getByRole('heading', { name: 'Integrações', exact: true }).waitFor()
    await page.getByText('ERP principal').waitFor()
    await page.waitForTimeout(150)
    await page.screenshot({ path: resolve(outDir, 'integrations-screen.png'), fullPage: true })
    await context.close()
  } finally {
    await browser.close()
    await server.close()
  }
  console.log(`Screenshot written to ${resolve(outDir, 'integrations-screen.png')}`)
}

await main()
