import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const outDir = resolve(repositoryRoot, 'docs/evidence/stage2-q3')
const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT = { projectId: PROJECT_ID, workspaceId: 'w1', name: 'Faturamento', projectRevision: 'r1', archived: false }

async function mockRoutes(page) {
  await page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      account: { accountId: 'shot-1', displayName: 'Ana Beatriz Cardoso', email: 'ana.cardoso@example.com' },
      workspaces: [{ workspaceId: 'w1', name: 'Operações' }],
      projects: [],
    }),
  }))
  await page.route(`**/api/control/projects/${PROJECT_ID}`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(PROJECT),
  }))
  await page.route(`**/api/control/projects/${PROJECT_ID}/application-access`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      address: 'https://faturamento.apps.conexus.example',
      entries: [
        { kind: 'grant', grantId: 'g1', accountId: 'acc-1', displayName: 'Diego Fonseca', email: 'diego.fonseca@example.com', grantedAt: '2026-08-14T00:00:00.000Z' },
        { kind: 'grant', grantId: 'g2', accountId: 'acc-2', displayName: 'Marina Alves', email: 'marina.alves@example.com', grantedAt: '2026-09-02T00:00:00.000Z' },
        { kind: 'invitation', invitationId: 'inv-1', email: 'convidado.externo@example.com', invitedAt: '2026-09-18T00:00:00.000Z', expiresAt: '2026-10-02T00:00:00.000Z' },
      ],
    }),
  }))
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const server = await createServer({ configFile: resolve(repositoryRoot, 'apps/web/vite.config.mjs'), root: resolve(repositoryRoot, 'apps/web'), server: { host: '127.0.0.1', port: 41831, strictPort: true } })
  await server.listen()
  const origin = 'http://127.0.0.1:41831'
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, colorScheme: 'light' })
    const page = await context.newPage()
    await mockRoutes(page)
    await page.goto(`${origin}/projects/${PROJECT_ID}/settings/access`)
    await page.getByRole('heading', { name: 'Acesso ao aplicativo' }).waitFor()
    await page.getByText('Marina Alves').waitFor()
    await page.waitForTimeout(150)
    await page.screenshot({ path: resolve(outDir, 'grant-screen.png'), fullPage: true })
    await context.close()
  } finally {
    await browser.close()
    await server.close()
  }
  console.log(`Screenshot written to ${resolve(outDir, 'grant-screen.png')}`)
}

await main()
