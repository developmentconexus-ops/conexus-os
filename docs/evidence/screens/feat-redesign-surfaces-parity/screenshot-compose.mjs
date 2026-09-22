import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const dataUri = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`

const dir = '/tmp/parity-shots'
const outDir = resolve(dir, 'compose')
mkdirSync(outDir, { recursive: true })

const pairs = [
  ['home', 'hub-home', 'proto-home'],
  ['previa', 'hub-previa', 'proto-previa'],
  ['alteracoes-unificado', 'hub-alteracoes-unificado', 'proto-alteracoes-unificado'],
  ['alteracoes-split', 'hub-alteracoes-split', 'proto-alteracoes-split'],
  ['sobre', 'hub-sobre', 'proto-sobre'],
]

const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext()).newPage()

for (const [name, hub, proto] of pairs) {
  for (const scheme of ['light', 'dark']) {
    const hubFile = dataUri(resolve(dir, `${hub}-${scheme}.png`))
    const protoFile = dataUri(resolve(dir, `${proto}-${scheme}.png`))
    await page.setViewportSize({ width: 2920, height: 960 })
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#333;font-family:sans-serif">
      <div style="display:flex;gap:20px;padding:20px">
        <div><div style="color:#fff;padding:6px 0;font-weight:600">Hub (esta PR)</div><img src="${hubFile}" style="width:1440px;display:block;border:2px solid #666"></div>
        <div><div style="color:#fff;padding:6px 0;font-weight:600">Protótipo aprovado</div><img src="${protoFile}" style="width:1440px;display:block;border:2px solid #666"></div>
      </div>
    </body></html>`)
    await page.waitForTimeout(150)
    const box = await page.evaluate(() => { const b = document.body.getBoundingClientRect(); return { width: Math.ceil(b.width), height: Math.ceil(b.height) } })
    await page.setViewportSize({ width: box.width, height: box.height })
    await page.screenshot({ path: resolve(outDir, `${name}-${scheme}.png`) })
  }
}
await browser.close()
console.log('DONE', outDir)
