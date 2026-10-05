import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { unresolved } from '../../scripts/check-enforced-by.mjs'

const root = resolve(import.meta.dirname, '../..')

test('the principles file names only things that exist', () => {
  assert.deepEqual(unresolved(readFileSync(resolve(root, 'docs/development/codebase-principles.md'), 'utf8')), [])
})

test('a name that does not exist fails by kind', () => {
  const absent = ['unchecked', 'Rows'].join('')
  const line = `   Enforced by: \`scripts/not-a-check.mjs\`, \`biome:noSuchRule\`, \`npm run no:such-script\`, \`${absent}\`, \`scripts/check-enforced-by.mjs\`, \`pgQueryRows\`.`
  assert.deepEqual(unresolved(line), [
    'scripts/not-a-check.mjs: no such file',
    'biome:noSuchRule: no such Biome rule in biome.json',
    'npm run no:such-script: no such npm script',
    `${absent}: no such symbol in apps, packages, scripts, contracts or tests`,
  ])
})
