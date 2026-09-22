// Screenshots the real Hub (this repo's app, served locally against a mocked API — the same
// technique project-browser.test.mjs and builder-browser.test.mjs use) side by side with the
// approved prototype file, at the same viewport, for the three states a shell review compares:
// Workspace home expanded, home collapsed, and Construir expanded. Run it after any shell change
// that touches the top bar or sidebar, before asking for another owner review:
//
//   PROTOTYPE_HTML=/path/to/redesign.html node tests/implementation/parity-shots.mjs [outDir]
//
// outDir defaults to ~/ux-shots-parity. PROTOTYPE_HTML defaults to ~/ux-shots/redesign.html.
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { startWebServer } from './web-dev-server.mjs'

const outDir = resolve(process.argv[2] ?? resolve(homedir(), 'ux-shots-parity'))
const prototypePath = process.env.PROTOTYPE_HTML ?? resolve(homedir(), 'ux-shots/redesign.html')
mkdirSync(outDir, { recursive: true })

const viewport = { width: 1440, height: 900 }
const ids = { operations: '20000000-0000-4000-8000-000000000001', vacation: '30000000-0000-4000-8000-000000000001' }
const projectName = 'Pedidos de férias'

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body ?? {}) })

// A small, self-contained mock of the Hub API: enough for the shell (top bar, sidebar, Workspace
// home) and a minimally populated Construir screen to render, not the full builder feature set.
async function mockHub(page) {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    const p = url.pathname
    if (p === '/api/control/access-context') {
      return json(route, 200, {
        account: { accountId: 'account-1', displayName: 'Marina Alves', email: 'marina@empresa.com.br' },
        workspaces: [{ workspaceId: ids.operations, name: 'Operações' }],
        projects: [],
      })
    }
    if (p.endsWith('/project-summaries')) {
      return json(route, 200, { projects: [{ projectId: ids.vacation, name: projectName, archived: false, lastActivityAt: new Date().toISOString(), latestRun: { state: 'SUCCEEDED', resultKind: 'SOURCE_CHANGED' }, hasPreview: true }] })
    }
    if (/^\/api\/control\/projects\/[^/]+$/.test(p)) return json(route, 200, { projectId: ids.vacation, workspaceId: ids.operations, name: projectName, projectRevision: 'r1', archived: false })
    if (p.endsWith('/conversations') && method === 'GET') return json(route, 200, { conversations: [{ conversationId: 'c1', title: null, createdAt: new Date().toISOString() }] })
    if (p.endsWith('/conversations') && method === 'POST') return json(route, 201, { conversation: { conversationId: 'c1', title: null, createdAt: new Date().toISOString() } })
    if (p.endsWith('/builder-session')) return json(route, 200, { projectId: ids.vacation, latestBuilderRun: null, latestCodeChangingRun: null, preview: { workingSourceRevision: null, lastGoodSourceRevision: null, lastGoodArtifactRevisionId: null, lastGoodArtifactDigest: null }, mode: 'BUILD', runHistory: [] })
    if (p.includes('/agent-controller/code/sessions/') && p.endsWith('/messages')) return json(route, 200, { messages: [] })
    if (p.includes('/agent-controller/code/sessions/')) return json(route, 200, { modelId: 'anthropic/claude-opus-4-5', modeId: 'build', threadId: 'c1' })
    if (p.endsWith('/model-accounts/models')) return json(route, 200, { models: [{ id: 'anthropic/claude-opus-4-5', provider: 'anthropic', modelName: 'claude-opus-4-5', hasApiKey: true }] })
    return json(route, 404, { type: 'not-mocked' })
  })
}

const measure = (page) => page.evaluate(() => {
  const one = (sel) => { const e = document.querySelector(sel); if (!e) return null; const s = getComputedStyle(e); return { text: e.textContent?.trim().slice(0, 40), font: `${s.fontSize}/${s.fontWeight}`, h: Math.round(e.getBoundingClientRect().height) } }
  const svg = [...document.querySelectorAll('svg')].find((s) => s.getAttribute('viewBox') === '0 0 32 32')
  return {
    navItem: one('.shell-sidebar li a, .shell-sidebar li span[aria-disabled]'),
    switcher: one('.cx-rail-switch, .cx-rail-switch--static'),
    crumb: one('.cx-crumb, .crumb'),
    mark: svg ? Math.round(svg.getBoundingClientRect().width) : null,
  }
})

async function shootHub(browser) {
  console.log('starting web server...')
  const origin = await startWebServer({ after: () => {} })
  console.log('web server at', origin)
  const page = await browser.newPage({ viewport, colorScheme: 'dark' })
  page.on('console', (m) => console.log('[page]', m.text()))
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await mockHub(page)
  console.log('navigating...')
  await page.goto(`${origin}/workspaces/${ids.operations}/projects`, { timeout: 20_000 })
  console.log('waiting for heading...')
  await page.getByRole('heading', { name: 'O que vamos construir?' }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: resolve(outDir, 'hub-home.png') })
  console.log('hub home', JSON.stringify(await measure(page)))
  await page.locator('.shell-sidebar').getByRole('button', { name: /Recolher barra lateral/ }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(outDir, 'hub-home-collapsed.png') })
  await page.locator('.shell-sidebar').getByRole('button', { name: /Expandir barra lateral/ }).click()
  await page.waitForTimeout(400)
  await page.goto(`${origin}/projects/${ids.vacation}`)
  await page.getByLabel('Mensagem para o agente').waitFor({ timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: resolve(outDir, 'hub-construir.png') })
  console.log('hub construir', JSON.stringify(await measure(page)))
}

async function shootPrototype(browser) {
  const page = await browser.newPage({ viewport, colorScheme: 'dark' })
  await page.goto(`file://${prototypePath}`)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: resolve(outDir, 'proto-home.png') })
  console.log('proto home', JSON.stringify(await measure(page)))
  await page.keyboard.press('Control+b')
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(outDir, 'proto-home-collapsed.png') })
  await page.keyboard.press('Control+b')
  await page.waitForTimeout(400)
  await page.locator('.card').first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: resolve(outDir, 'proto-construir.png') })
  console.log('proto construir', JSON.stringify(await measure(page)))
}

const browser = await chromium.launch()
await shootHub(browser)
await shootPrototype(browser)
await browser.close()
console.log(`Screenshots in ${outDir}`)
