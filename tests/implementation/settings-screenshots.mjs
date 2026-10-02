import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const outDir = resolve(repositoryRoot, 'docs/evidence/screens/feat-screens-settings')
async function mockRoutes(page) {
  await page.route('**/api/control/access-context', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ account: { accountId: 'shot-1', displayName: 'Ana Beatriz Cardoso', email: 'ana.cardoso@example.com' }, workspaces: [{ workspaceId: 'w1', name: 'Operações' }], projects: [] }),
  }))
  await page.route('**/api/control/installation', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ administrator: true }) }))
  await page.route('**/api/control/model-accounts/google-ai-pro/connection', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ mine: true, shared: false, administrator: true }),
  }))
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
  { name: 'admins', path: '/settings/installation/admins' },
]

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]
const schemes = ['light', 'dark']

// The shell scrolls inside its main pane, so a full-page capture stops at the viewport; grow the
// viewport by whatever that pane hides instead.
async function showWholePage(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  const hidden = await page.evaluate(() => {
    let element = document.querySelector('main.cxs-page')
    let most = 0
    while (element) {
      most = Math.max(most, element.scrollHeight - element.clientHeight)
      element = element.parentElement
    }
    return most
  })
  if (hidden > 0) await page.setViewportSize({ width: viewport.width, height: viewport.height + hidden })
}

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
          await showWholePage(page, viewport)
          await page.screenshot({ path: resolve(outDir, `${target.name}-${viewport.name}-${scheme}.png`), fullPage: true })
        }
        await page.goto(`${origin}/settings/models`)
        await page.getByRole('button', { name: 'Conectar conta' }).click()
        await page.getByRole('button', { name: 'Google (Gemini)' }).click()
        await page.getByRole('button', { name: 'Entrar com a assinatura' }).click()
        await page.getByText('WXYZ-7890').waitFor()
        await page.waitForTimeout(150)
        await showWholePage(page, viewport)
        await page.screenshot({ path: resolve(outDir, `models-device-code-${viewport.name}-${scheme}.png`), fullPage: true })
        await context.close()
      }
    }

    const reducedContext = await browser.newContext({ viewport: { width: viewports[0].width, height: viewports[0].height }, colorScheme: 'light', reducedMotion: 'reduce' })
    const reducedPage = await reducedContext.newPage()
    await mockRoutes(reducedPage)
    await reducedPage.goto(`${origin}/settings/models`)
    await reducedPage.getByRole('button', { name: 'Conectar conta' }).click()
    await reducedPage.getByRole('button', { name: 'Google (Gemini)' }).click()
    await reducedPage.getByRole('button', { name: 'Entrar com a assinatura' }).click()
    await reducedPage.getByText('WXYZ-7890').waitFor()
    await reducedPage.waitForTimeout(150)
    await showWholePage(reducedPage, viewports[0])
    await reducedPage.screenshot({ path: resolve(outDir, 'models-device-code-desktop-light-reduced-motion.png'), fullPage: true })
    await reducedContext.close()
  } finally {
    await browser.close()
    await server.close()
  }
  console.log(`Screenshots written to ${outDir}`)
}

await main()
