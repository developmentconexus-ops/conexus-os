import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const prototypeDir = resolve(repositoryRoot, 'apps/web/public/prototypes/settings-reorg')
const screenshotDir = resolve(repositoryRoot, 'docs/evidence/issue-328')

// Minimal static HTTP server for prototype files
function createPrototypeServer() {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  }

  const server = http.createServer((req, res) => {
    const filePath = path.join(prototypeDir, req.url === '/' ? 'index.html' : req.url.split('?')[0])
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }

    const ext = path.extname(filePath)
    const contentType = mimeTypes[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': contentType })
    fs.createReadStream(filePath).pipe(res)
  })

  return server
}

test('prototype verifies sections, interactions, light/dark theme, and takes screenshots', async (t) => {
  await mkdir(screenshotDir, { recursive: true })

  // Start local server
  const server = createPrototypeServer()
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  const port = server.address().port
  t.after(() => server.close())

  const origin = `http://127.0.0.1:${port}`
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())

  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()))
  page.on('pageerror', err => console.error('BROWSER ERROR:', err))

  await page.goto(`${origin}/index.html`)

  // 1. Verify Modelos de IA initial screen
  const title = await page.locator('h1').textContent()
  assert.equal(title?.trim(), 'Modelos de IA')
  assert.ok(await page.locator('text=Suas contas').isVisible())
  assert.ok(await page.locator('text=Compartilhadas pela instalação').isVisible())
  assert.ok(await page.locator('text=Anthropic (Claude)').isVisible())
  assert.ok(await page.locator('text=Precisa entrar de novo').isVisible())

  // Take screenshot 01: Modelos de IA (light)
  await page.screenshot({ path: resolve(screenshotDir, '01-modelos-de-ia-light.png'), fullPage: true })

  // 2. Test Dark Mode toggle
  await page.click('#toggle-theme')
  const themeAttr = await page.locator('html').getAttribute('data-theme')
  assert.equal(themeAttr, 'dark')
  await page.screenshot({ path: resolve(screenshotDir, '02-modelos-de-ia-dark.png'), fullPage: true })

  // Switch back to light
  await page.click('#toggle-theme')

  // 3. Test Connect flow modal
  await page.click('#btn-open-connect')
  assert.ok(await page.locator('text=Escolha o provedor de IA').isVisible())
  await page.click('[data-pick-provider="openai"]')
  assert.ok(await page.locator('text=Código no dispositivo').isVisible())
  await page.screenshot({ path: resolve(screenshotDir, '03-connect-flow.png') })
  await page.click('#btn-cancel-connect')

  // 4. Test Navigation to Padrão das conversas novas
  await page.click('[data-nav="padrao-conversas"]')
  const padraoTitle = await page.locator('h1').textContent()
  assert.equal(padraoTitle?.trim(), 'Padrão das conversas novas')
  assert.ok(await page.locator('#btn-use-company').isVisible())
  await page.screenshot({ path: resolve(screenshotDir, '04-padrao-conversas-company.png'), fullPage: true })

  // Toggle to custom defaults
  await page.click('#btn-use-mine')
  assert.ok(await page.locator('#form-my-defaults').isVisible())
  await page.screenshot({ path: resolve(screenshotDir, '05-padrao-conversas-mine.png'), fullPage: true })

  // 5. Test Navigation to Modelos da empresa
  await page.click('[data-nav="modelos-empresa"]')
  const empresaTitle = await page.locator('h1').textContent()
  assert.equal(empresaTitle?.trim(), 'Modelos da empresa')
  assert.ok(await page.locator('h2:has-text("Compartilhadas com todos")').isVisible())
  assert.ok(await page.locator('h2:has-text("Suas contas que podem ser compartilhadas")').isVisible())
  assert.ok(await page.locator('h2:has-text("Modelos padrão da instalação")').isVisible())
  await page.screenshot({ path: resolve(screenshotDir, '06-modelos-empresa.png'), fullPage: true })

  // 6. Test Phone Viewport Mode
  await page.click('#toggle-phone')
  const isPhoneMode = await page.locator('#viewport').getAttribute('class')
  assert.match(isPhoneMode || '', /phone-mode/)
  await page.screenshot({ path: resolve(screenshotDir, '07-phone-viewport.png') })
})
