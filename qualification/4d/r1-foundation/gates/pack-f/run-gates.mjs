import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('usage: node run-gates.mjs <installed-root>')
const fixtures = resolve(root, 'gates/pack-f/fixtures')
const node = process.execPath
const run = ({ command = node, args, cwd = root, env = {} }) => spawnSync(command, args, {
  cwd,
  encoding: 'utf8',
  env: { ...process.env, ...env },
})
const expect = (id, command, shouldPass) => {
  const result = run(command)
  if (shouldPass) assert.equal(result.status, 0, `${id} clean failed\n${result.stderr || result.stdout}`)
  else assert.notEqual(result.status, 0, `${id} negative unexpectedly passed`)
  return { id, expected: shouldPass ? 'GREEN' : 'RED', exitCode: result.status, verdict: 'PASS' }
}

const cases = []
const biome = resolve(root, 'node_modules/@biomejs/biome/bin/biome')
cases.push(expect('biome-negative', { command: biome, args: ['check', resolve(fixtures, 'biome/bad.js')] }, false))
cases.push(expect('biome-clean', { command: biome, args: ['check', resolve(fixtures, 'biome/good.js')] }, true))

const tsc = resolve(root, 'node_modules/typescript/bin/tsc')
cases.push(expect('typescript-negative', { args: [tsc, '--project', resolve(fixtures, 'typescript/bad/tsconfig.json')] }, false))
cases.push(expect('typescript-clean', { args: [tsc, '--project', resolve(fixtures, 'typescript/good/tsconfig.json')] }, true))

const vite = resolve(root, 'node_modules/vite/bin/vite.js')
cases.push(expect('vite-negative', { args: [vite, 'build'], cwd: resolve(fixtures, 'vite/bad') }, false))
cases.push(expect('vite-clean', { args: [vite, 'build'], cwd: resolve(fixtures, 'vite/good') }, true))

cases.push(expect('node-test-negative', { args: ['--test', resolve(fixtures, 'node/bad.test.mjs')] }, false))
cases.push(expect('node-test-clean', { args: ['--test', resolve(fixtures, 'node/good.test.mjs')] }, true))

const ajvGate = resolve(root, 'gates/ajv-gate.mjs')
const schema = resolve(root, 'gates/fixtures/sample.schema.json')
cases.push(expect('ajv-negative', { args: [ajvGate, '--schema', schema, '--data', resolve(root, 'gates/fixtures/sample.invalid.json')] }, false))
cases.push(expect('ajv-clean', { args: [ajvGate, '--schema', schema, '--data', resolve(root, 'gates/fixtures/sample.valid.json')] }, true))

const redocly = resolve(root, 'node_modules/@redocly/cli/bin/cli.js')
cases.push(expect('redocly-negative', { args: [redocly, 'lint', resolve(fixtures, 'redocly/bad.yaml'), '--extends=recommended'] }, false))
cases.push(expect('redocly-clean', { args: [redocly, 'lint', resolve(fixtures, 'redocly/good.yaml'), '--extends=recommended'] }, true))

const playwright = resolve(root, 'node_modules/@playwright/test/cli.js')
const playwrightConfig = resolve(root, 'gates/pack-f/playwright.config.mjs')
cases.push(expect('playwright-negative', {
  args: [playwright, 'test', resolve(fixtures, 'playwright/bad.spec.mjs'), `--config=${playwrightConfig}`, '--project=chromium'],
  env: { PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright' },
}, false))
cases.push(expect('playwright-clean', {
  args: [playwright, 'test', resolve(fixtures, 'playwright/good.spec.mjs'), `--config=${playwrightConfig}`, '--project=chromium'],
  env: { PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright' },
}, true))

process.stdout.write(`${JSON.stringify({
  kind: 'conexus.r1f.pack-f-gate-results/v1',
  cases,
  redCount: cases.filter(value => value.expected === 'RED').length,
  greenCount: cases.filter(value => value.expected === 'GREEN').length,
  verdict: 'PASS',
}, null, 2)}\n`)
