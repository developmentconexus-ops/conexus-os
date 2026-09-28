import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const outDir = resolve(process.env.CONEXUS_SCREENSHOT_DIR ?? resolve(repositoryRoot, 'docs/evidence/screens/q4-connection-bindings'))
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
        { connectionId: 'conn-2', connectorId: 'sankhya', label: 'ERP filial', createdAt: '2026-09-27T09:00:00.000Z' },
      ],
    }),
  }))
  await page.route(`**/api/control/projects/${PROJECT_ID}/connection-bindings`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      entries: [
        { kind: 'binding', bindingId: 'binding-1', name: 'erp', connectionId: 'conn-1', connectorId: 'sankhya', label: 'ERP principal', boundAt: '2026-09-24T10:00:00.000Z' },
        { kind: 'bindable', connectionId: 'conn-2', connectorId: 'sankhya', label: 'ERP filial' },
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
    const context = await browser.newContext()
    const page = await context.newPage()
    await mockRoutes(page)
    await page.goto(`${origin}/projects/${PROJECT_ID}/integrations`)
    await page.getByRole('heading', { name: 'Integrações', exact: true }).waitFor()
    await page.getByText('ERP filial').first().waitFor()
    for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      for (const scheme of ['light', 'dark']) {
        await page.setViewportSize(viewport)
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await page.waitForTimeout(250)
        // The frame scrolls inside itself, so the page grows to the frame's content for a full shot.
        const overflow = await page.evaluate(() => {
          const main = document.querySelector('[data-slot="app-shell-main"]')
          return main ? main.scrollHeight - main.clientHeight : 0
        })
        if (overflow > 0) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height + overflow })
          await page.waitForTimeout(250)
        }
        await page.screenshot({ path: resolve(outDir, `integrations-${label}-${scheme}.png`), fullPage: true })
      }
    }
    await context.close()
  } finally {
    await browser.close()
    await server.close()
  }
  console.log(`Screenshots written to ${outDir}`)
}

await main()
