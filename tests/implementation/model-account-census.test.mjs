import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { modelAccountCensus } from '../../scripts/check-model-account-census.mjs'

const OWNER = 'apps/hub/src/model-account/'
const oldKey = ['CONEXUS', 'FACTORY', 'SECRET', 'KEY', 'FILE'].join('_')
const oldPrefix = `${['mastra', 'factory-secret', 'v1'].join(':')}:`
function fixture(t, sources) {
  const root = mkdtempSync(join(tmpdir(), 'model-account-census-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [file, source] of Object.entries(sources)) {
    const destination = resolve(root, file)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, source)
  }
  return modelAccountCensus({ root, files: Object.keys(sources) })
}

test('a single credential codec, finite native leaf and actual branded port are clean', (t) => {
  const result = fixture(t, {
    [`${OWNER}credential.ts`]: 'export const value = z.codec(z.string(), z.json(), { decode(text) { return JSON.parse(text) }, encode(value) { return JSON.stringify(value) } })',
    [`${OWNER}providers.ts`]: 'export function select(modelId: ModelId) { return modelId }',
    [`${OWNER}native/moved.ts`]: 'export function call(held: HeldAccount) { return held.credential }',
  })
  assert.deepEqual(result.hits, [])
  assert.equal(Object.values(result.counts).every((count) => count === 0), true)
})

const defects = [
  ['providerJsonParsers', `${OWNER}native/moved.ts`, 'export function moved(text: string) { return JSON.parse(text) }'],
  ['misplacedCodecs', `${OWNER}native/moved.ts`, 'export const codec = z.codec(z.string(), z.string(), {})'],
  ['retiredApis', `${OWNER}providers.ts`, 'export function createModelRouting() {}'],
  ['coreBuilderImports', `${OWNER}native/moved.ts`, 'import { store } from "../../builder/store.js"'],
  ['coreBuilderTables', `${OWNER}store.ts`, 'const query = sql`SELECT * FROM builder.builder_run_model_account`'],
  ['builderOwnedFiles', 'apps/hub/src/builder/anthropic/route.ts', 'export function model() {}'],
  ['plainIds', `${OWNER}module.ts`, 'export function model(modelId: string) {}'],
  ['topLevelArrows', `${OWNER}module.ts`, 'export const model = () => 1'],
  ['suppressions', `${OWNER}module.ts`, '// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt\nexport function model() {}'],
  ['over80', `${OWNER}module.ts`, `export function model() {\n${' void 1\n'.repeat(81)}}`],
  ['legacyCustodyNames', 'apps/hub/src/platform/config.ts', `export const variable = '${oldKey}'`],
  ['legacyCustodyNames', 'scripts/backup-probe.mjs', `const prefix = '${oldPrefix}'`],
  ['providerJsonParsers', `${OWNER}native/moved.mts`, 'export function moved(text: string) { return JSON.parse(text) }'],
]
for (const [key, file, source] of defects) test(`${key} names the actual defect even after a native file moves`, (t) => {
  const result = fixture(t, { [file]: source })
  assert.equal(result.counts[key], 1)
  assert.deepEqual(result.hits.find((hit) => hit.key === key)?.file, file)
})

test('all actual historical and rejected inputs are classified individually, with no whole-file exemption', (t) => {
  const root = resolve(import.meta.dirname, '../..')
  const files = ['builder-composition.postgres.test.mjs', 'secret-custody.test.mjs', 'secret-custody-migration.postgres.test.mjs', 'company-model-accounts-migration.postgres.test.mjs', 'iam-owner-migration.postgres.test.mjs']
  const sources = Object.fromEntries(files.map((name) => {
    const file = `tests/implementation/${name}`
    return [file, `${readFileSync(resolve(root, file), 'utf8')}\nconst live = '${oldKey}'\n`]
  }))
  const result = fixture(t, sources)
  assert.equal(result.retiredInputs.length, 6)
  assert.equal(result.counts.legacyCustodyNames, 5)
  assert.deepEqual(result.hits.map(({ file }) => file).sort(), Object.keys(sources).sort())
})

test('moving a rejected input to live code or using it outside its negative assertion fails', (t) => {
  const result = fixture(t, {
    [`${OWNER}credential.ts`]: `const historical = '${oldPrefix}synthetic'`,
    'tests/implementation/builder-composition.postgres.test.mjs': `test('retired key variable alone cannot boot a Hub', () => readHubConfig({ ${oldKey}: '/synthetic/retired-key' }))`,
    'tests/implementation/secret-custody.test.mjs': `const record = '${oldPrefix}historical'`,
  })
  assert.equal(result.counts.legacyCustodyNames, 3)
  assert.deepEqual(result.retiredInputs, [])
})
