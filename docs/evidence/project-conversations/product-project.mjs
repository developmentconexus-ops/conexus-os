// Ensures the test operator has a Project to hold conversations in, and prints its id.
import { chromium } from '@playwright/test'

const base = 'https://hub.conexus.localhost:3443'
const statePath = process.env.CONEXUS_STATE
const workspaceId = '840c8630-eb50-435e-9adf-a6084930d2ae'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ storageState: statePath, viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.on('response', (response) => {
  const url = new URL(response.url())
  if (url.pathname.startsWith('/api/') && response.status() >= 400) console.log(`HTTP ${response.status()} ${url.pathname}`)
})

try {
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  const access = await page.evaluate(async () => (await fetch('/api/control/access-context', { credentials: 'same-origin' })).json())
  let projectId = access.projects?.at(0)?.projectId
  if (!projectId) {
    await page.goto(`${base}/workspaces/${workspaceId}/projects/new`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Nome do Project').fill('Conversas')
    const started = Date.now()
    await page.getByRole('button', { name: 'Criar Project' }).click()
    await page.getByRole('heading', { name: 'Conversas' }).first().waitFor({ timeout: 300_000 })
    console.log(`PROJECT CREATED in ${Math.round((Date.now() - started) / 1000)}s`)
    projectId = page.url().split('/projects/')[1].split('/')[0]
  }
  console.log(`PROJECT ${projectId}`)
} finally {
  await browser.close()
}
