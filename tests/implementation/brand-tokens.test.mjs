import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const tokensPath = resolve(repositoryRoot, 'packages/brand/src/tokens.css')
const tokens = readFileSync(tokensPath, 'utf8')

const declarations = (body) => Object.fromEntries([...body.matchAll(/(--cx-[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
const block = (pattern) => {
  const match = tokens.match(pattern)
  assert.ok(match, `token block ${pattern} exists`)
  return declarations(match[1])
}

const light = block(/^:root \{\n(\s+--cx-canvas[^}]*)\}/m)
const darkByPreference = block(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\):not\(\.light\) \{([^}]*)\}/)
const darkByChoice = block(/:root\[data-theme="dark"\], :root\.dark \{([^}]*)\}/)

test('brand tokens define every color token in light, OS dark and chosen dark', () => {
  const names = Object.keys(light).sort()
  assert.deepEqual(names, [
    '--cx-accent', '--cx-accent-soft', '--cx-accent-text', '--cx-canvas', '--cx-danger', '--cx-ink', '--cx-line',
    '--cx-line-strong', '--cx-mark', '--cx-on-ink', '--cx-success', '--cx-surface', '--cx-surface-3', '--cx-surface-4',
    '--cx-text', '--cx-text-2', '--cx-warning',
  ])
  assert.deepEqual(Object.keys(darkByPreference).sort(), names)
  assert.deepEqual(darkByChoice, darkByPreference)
})

test('brand tokens carry the approved Grafite e Ipê values', () => {
  assert.equal(light['--cx-ink'], '#121518')
  assert.equal(light['--cx-canvas'], '#F6F7F8')
  assert.equal(light['--cx-accent'], '#B07A0C')
  assert.equal(light['--cx-accent-text'], '#9A6A08')
  assert.equal(light['--cx-accent-soft'], '#FBF1D9')
  assert.equal(light['--cx-mark'], '#C08A12')
  assert.equal(darkByPreference['--cx-ink'], '#EEF0F2')
  assert.equal(darkByPreference['--cx-on-ink'], '#121518')
  assert.equal(darkByPreference['--cx-accent'], '#F2B53A')
  assert.equal(darkByPreference['--cx-accent-soft'], '#3A2E12')
  assert.equal(darkByPreference['--cx-mark'], '#F2B53A')
})

test('brand fonts are self-hosted files next to the tokens', () => {
  const sources = [...tokens.matchAll(/url\("([^"]+)"\)/g)].map(([, source]) => source)
  assert.deepEqual(sources, ['../fonts/BricolageGrotesque-latin.woff2', '../fonts/HankenGrotesk-latin.woff2', '../fonts/JetBrainsMono-latin.woff2'])
  for (const source of sources) assert.ok(existsSync(resolve(dirname(tokensPath), source)), source)
  assert.doesNotMatch(tokens, /fonts\.googleapis|fonts\.gstatic/)
})

test('the web app uses only tokens the brand defines and no Mastra green survives', () => {
  const defined = new Set([...tokens.matchAll(/(--cx-[\w-]+)\s*:/g)].map(([, name]) => name))
  for (const file of ['apps/web/src/styles.css', 'apps/web/src/mastra-theme.css']) {
    const css = readFileSync(resolve(repositoryRoot, file), 'utf8')
    for (const [, name] of css.matchAll(/var\((--cx-[\w-]+)/g)) assert.ok(defined.has(name), `${file} uses undefined ${name}`)
  }
  const theme = readFileSync(resolve(repositoryRoot, 'apps/web/src/mastra-theme.css'), 'utf8')
  for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
    assert.match(theme, new RegExp(`--brand-green-${step}:\\s*[^;]*--cx-`), `brand-green-${step} is re-pointed`)
  }
  for (const name of ['--accent1', '--positive1', '--notice-success', '--badge-green', '--color-emerald-400']) {
    assert.match(theme, new RegExp(`${name}:\\s*[^;]*--cx-`), `${name} is re-pointed`)
  }
})
