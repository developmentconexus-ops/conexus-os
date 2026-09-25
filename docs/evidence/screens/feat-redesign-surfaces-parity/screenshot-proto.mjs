import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const outDir = resolve('/tmp/parity-shots')
mkdirSync(outDir, { recursive: true })
const file = `file://${resolve(homedir(), 'ux-shots/redesign.html')}`

async function shots(page, name) {
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: resolve(outDir, `${name}-${scheme}.png`) })
  }
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
await page.goto(file)
await page.waitForTimeout(300)

await shots(page, 'proto-home')

await page.evaluate(() => {
  for (const el of document.querySelectorAll('.page, .home, .construir')) el.hidden = el.id !== 'view-construir'
  document.getElementById('view-construir')?.removeAttribute('hidden')
})
await page.waitForTimeout(300)
await shots(page, 'proto-previa')

await page.click('#lens-diff')
await page.waitForTimeout(300)
await shots(page, 'proto-alteracoes-unificado')
await page.click('#mode-split')
await page.waitForTimeout(300)
await shots(page, 'proto-alteracoes-split')

await page.click('#lens-sobre')
await page.waitForTimeout(300)
await shots(page, 'proto-sobre')

await browser.close()
console.log('DONE', outDir)
