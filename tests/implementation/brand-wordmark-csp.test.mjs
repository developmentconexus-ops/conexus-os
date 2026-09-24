import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { chromium } from 'playwright'
import { renderToStaticMarkup } from 'react-dom/server'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = mkdtempSync(resolve(repositoryRoot, 'node_modules/conexus-wordmark-'))
const componentPath = resolve(buildRoot, 'conexus-mark.mjs')
const build = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'packages/brand/src/conexus-mark.tsx'),
  `--outfile=${componentPath}`,
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--jsx=automatic',
  '--packages=external',
  '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })

assert.equal(build.status, 0, build.stderr)
const { ConexusWordmark } = await import(pathToFileURL(componentPath))
const tokens = readFileSync(resolve(repositoryRoot, 'packages/brand/src/tokens.css'), 'utf8')

 test('wordmark named sizes render from brand CSS under a CSP that blocks inline styles', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(async () => {
    await browser.close()
    rmSync(buildRoot, { recursive: true, force: true })
  })
  const page = await browser.newPage()
  const violations = []
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text())
  })
  const wordmarks = ['xs', 'sm', 'md', 'lg'].map((size) => renderToStaticMarkup(ConexusWordmark({ size }))).join('')
  await page.setContent(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-brand-test'"><style nonce="brand-test">${tokens}</style></head><body>${wordmarks}</body></html>`)

  const sizes = await page.locator('.cx-wordmark').evaluateAll((elements) => elements.map((element) => ({
    size: getComputedStyle(element).fontSize,
    hasInlineStyle: element.hasAttribute('style'),
  })))
  assert.deepEqual(sizes, [
    { size: '19px', hasInlineStyle: false },
    { size: '20px', hasInlineStyle: false },
    { size: '26px', hasInlineStyle: false },
    { size: '32px', hasInlineStyle: false },
  ])
  assert.deepEqual(violations, [])
})
