import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const check = candidateRoot => spawnSync(process.execPath, [resolve(root, 'scripts/check-web-style.mjs'), candidateRoot], { encoding: 'utf8' })

const tree = (context, files) => {
  const target = mkdtempSync(resolve(tmpdir(), 'conexus-web-style-'))
  context.after(() => rmSync(target, { recursive: true, force: true }))
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(resolve(target, path)), { recursive: true })
    writeFileSync(resolve(target, path), contents)
  }
  return target
}

test('the repository tree passes', () => {
  const result = check(root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^Web style check passed \(files=\d+\)\.\n$/)
})

test('a raw hex color outside the token file fails with its location', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.css': '.a { width: 12px; }\n.b { color: #C0FFEE; }\n',
    'packages/brand/src/tokens.css': ':root { --cx-canvas: #F6F7F8; }\n',
  }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'apps/web/src/screen.css:2: raw hex color #C0FFEE; use a var(--cx-*) token from packages/brand/src/tokens.css\n')
})

test('a font outside the three brand faces fails, in CSS and in TSX', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.css': [
      '.ok { font: 600 .8125rem/1 var(--cx-font-body); font-family: "JetBrains Mono", ui-monospace, monospace; }',
      '.inherit { font: inherit; font-family: inherit; }',
      '.bad { font-family: Arial, sans-serif; }',
      '.shorthand { font: 600 1rem/1.2 "Inter", system-ui; }',
      '',
    ].join('\n'),
    'apps/keycloak-theme/src/page.tsx': "export const Page = () => <p style={{ fontFamily: 'Comic Sans MS', color: '#fff' }} />\n",
  }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, [
    'apps/keycloak-theme/src/page.tsx:1: raw hex color #fff; use a var(--cx-*) token from packages/brand/src/tokens.css',
    'apps/keycloak-theme/src/page.tsx:1: font family Comic Sans MS is not a brand font; use var(--cx-font-display|body|mono)',
    'apps/web/src/screen.css:3: font family Arial is not a brand font; use var(--cx-font-display|body|mono)',
    'apps/web/src/screen.css:3: font family sans-serif is not a brand font; use var(--cx-font-display|body|mono)',
    'apps/web/src/screen.css:4: font family "Inter" is not a brand font; use var(--cx-font-display|body|mono)',
    '',
  ].join('\n'))
})

test('a tree without the web app refuses to pass on zero files', context => {
  const result = check(tree(context, { 'README.md': '# empty\n' }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^no files scanned: apps\/web\/src does not exist under /)
})
