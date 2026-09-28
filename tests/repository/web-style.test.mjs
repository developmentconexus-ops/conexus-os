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

test('a Conexus class with no CSS rule fails with its location', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.tsx': "export const Screen = () => <div className=\"cx-panel cx-panel--missing\" />\n",
    'apps/web/src/screen.css': '.cx-panel { padding: 1rem; }\n',
  }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'apps/web/src/screen.tsx:1: class "cx-panel--missing" has no CSS rule under apps/web/src or packages/brand/src\n')
})

test('a Conexus class defined in every checked root passes', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.tsx': "export const Screen = () => <div className=\"cx-panel cx-mark\" />\n",
    'apps/web/src/screen.css': '.cx-panel { padding: 1rem; }\n',
    'packages/brand/src/tokens.css': '.cx-mark { width: 1rem; }\n',
  }))
  assert.equal(result.status, 0, result.stderr)
})

test('a class built from a template literal fails unless it is in the allowlist', context => {
  const result = check(tree(context, {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: this fixture's own source is a literal ${tone} for the script to parse, not a JS interpolation
    'apps/web/src/screen.tsx': "export const Screen = ({ tone }) => <div className={`cx-row cx-row-${tone}`} />\n",
    'apps/web/src/screen.css': '.cx-row { display: flex; }\n',
  }))
  assert.equal(result.status, 1)
  // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the script's own literal ${tone} error text
  assert.equal(result.stderr, 'apps/web/src/screen.tsx:1: class "cx-row-${tone}" is built dynamically; add it to DYNAMIC_CLASSES in scripts/check-web-style.mjs\n')
})

test('a class defined in CSS with no .tsx use warns but does not fail', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.tsx': "export const Screen = () => <div className=\"cx-panel\" />\n",
    'apps/web/src/screen.css': '.cx-panel { padding: 1rem; }\n.cx-panel-unused { padding: 0; }\n',
  }))
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /^1 Conexus class\(es\) defined in CSS with no apps\/web\/src\/\*\*\/\*\.tsx use:\napps\/web\/src\/screen\.css:2: class "cx-panel-unused" is defined in CSS but no apps\/web\/src\/\*\*\/\*\.tsx uses it\n$/)
  assert.match(result.stdout, /^Web style check passed \(files=\d+\)\.\n$/)
})
