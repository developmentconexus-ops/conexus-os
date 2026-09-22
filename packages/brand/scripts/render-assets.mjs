// Generates lockup-light.svg / lockup-dark.svg (with the wordmark font embedded as a base64 data
// URI, since an SVG used as an image never fetches an external @font-face url) and renders every
// PNG export in packages/brand/assets/ from the SVG sources, using the Playwright Chromium already
// vendored for the repo's browser test suites. Rerun this after any change to mark.svg,
// mark-dark.svg, or the lockup layout constants below.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const assetsDir = path.dirname(fileURLToPath(import.meta.url)).replace(/scripts$/, 'assets')
const fontsDir = path.join(assetsDir, '..', 'fonts')

const MARK_PATHS = ['M4 4H18V14H10V28H4Z', 'M28 28H14V18H22V4H28Z']
// The mark's 32-unit viewBox is scaled 1.25x in the lockup, giving it a 40-unit rendered width.
const MARK_WIDTH = 32 * 1.25
// Gap between mark and wordmark: ~0.4x the mark's rendered width, matching the in-app topbar lockup.
const GAP = MARK_WIDTH * 0.4
const TEXT_X = MARK_WIDTH + GAP

function buildLockupSvg({ markColor, coText, nexusText }) {
  const fontBase64 = readFileSync(path.join(fontsDir, 'BricolageGrotesque-latin.woff2')).toString('base64')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 48" role="img" aria-label="Conexus">
  <defs>
    <style>
      @font-face {
        font-family: "Bricolage Grotesque";
        font-weight: 600;
        src: url("data:font/woff2;base64,${fontBase64}") format("woff2");
      }
      text { font: 600 34px "Bricolage Grotesque", system-ui, sans-serif; letter-spacing: -0.03em; }
    </style>
  </defs>
  <g transform="translate(0,4) scale(1.25)">
    <path d="${MARK_PATHS[0]}" fill="${markColor}"/>
    <path d="${MARK_PATHS[1]}" fill="${markColor}"/>
  </g>
  <text x="${TEXT_X}" y="33"><tspan fill="${coText}">Co</tspan><tspan fill="${nexusText}">nexus</tspan></text>
</svg>
`
}

function writeLockups() {
  const light = buildLockupSvg({ markColor: '#C08A12', coText: '#121518', nexusText: '#9A6A08' })
  const dark = buildLockupSvg({ markColor: '#F2B53A', coText: '#EEF0F2', nexusText: '#F2B53A' })
  writeFileSync(path.join(assetsDir, 'lockup-light.svg'), light)
  writeFileSync(path.join(assetsDir, 'lockup-dark.svg'), dark)
}

const MARK_LIGHT = readFileSync(path.join(assetsDir, 'mark.svg'), 'utf8')
const MARK_DARK = readFileSync(path.join(assetsDir, 'mark-dark.svg'), 'utf8')

function markSvg(svg, sizePx) {
  return svg.replace('<svg ', `<svg width="${sizePx}" height="${sizePx}" `)
}

async function shoot(page, html, outFile, { width, height, omitBackground }) {
  await page.setViewportSize({ width, height })
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.screenshot({ path: outFile, omitBackground })
}

async function main() {
  writeLockups()

  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Plain transparent mark icons, standard favicon/PWA sizes.
  for (const size of [16, 32, 48, 192, 512]) {
    await shoot(
      page,
      `<html><body style="margin:0">${markSvg(MARK_LIGHT, size)}</body></html>`,
      path.join(assetsDir, `mark-${size}.png`),
      { width: size, height: size, omitBackground: true },
    )
  }

  // Apple touch icon: opaque paper background, mark padded to the iOS safe area (~72% of canvas).
  {
    const size = 180
    const markSize = Math.round(size * 0.72)
    const offset = Math.round((size - markSize) / 2)
    const html = `<html><body style="margin:0;width:${size}px;height:${size}px;background:#FFFFFF;
      display:flex;align-items:center;justify-content:center">
      <div style="width:${markSize}px;height:${markSize}px">${markSvg(MARK_LIGHT, markSize)}</div>
      </body></html>`
    await shoot(page, html, path.join(assetsDir, 'mark-180.png'), { width: size, height: size, omitBackground: false })
  }

  // Maskable 512: opaque ink background, mark kept inside the platform's ~80% safe zone.
  {
    const size = 512
    const markSize = Math.round(size * 0.6)
    const html = `<html><body style="margin:0;width:${size}px;height:${size}px;background:#121518;
      display:flex;align-items:center;justify-content:center">
      <div style="width:${markSize}px;height:${markSize}px">${markSvg(MARK_DARK, markSize)}</div>
      </body></html>`
    await shoot(page, html, path.join(assetsDir, 'mark-512-maskable.png'), { width: size, height: size, omitBackground: false })
  }

  // Lockups at 2x for docs, transparent background so they composite on any doc theme.
  for (const [name, bg] of [['lockup-light', null], ['lockup-dark', '#0E1012']]) {
    const svg = readFileSync(path.join(assetsDir, `${name}.svg`), 'utf8')
    const scale = 2
    const width = 210 * scale
    const height = 48 * scale
    const scaled = svg.replace('<svg ', `<svg width="${width}" height="${height}" `)
    const bodyBg = bg ? `background:${bg}` : ''
    const html = `<html><body style="margin:0;${bodyBg}">${scaled}</body></html>`
    await shoot(page, html, path.join(assetsDir, `${name}@2x.png`), { width, height, omitBackground: !bg })
  }

  await browser.close()
  console.log('Rendered PNG exports into', assetsDir)
}

main()
