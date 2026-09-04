import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')

test('RF-01 selects a bounded custom compiler candidate from current exact Evidence', () => {
  const selection = read('docs/evidence/4d/4d-05-rf01-profile-compiler-selection.md')
  const phase = read('docs/phases/4d-project-paved-road-and-runtime-realization.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')

  for (const token of [
    'CLOSED / OPERATOR APPROVED / BUILD SELECTED / 2026-08-29',
    'BUILD BOUNDED CONEXUS PROFILE COMPILER V1',
    'Direct third-party generator/template dependency:** `0`',
    'RF-01 ONLY',
    '/websites/nx_dev',
    '/copier-org/copier',
    '/plopjs/plop',
    '`@nx/devkit` | `23.1.2`',
    'sha512-NBk4cWde0QKnNfomA0lSHPadDVyqA0Cu8/vVy7crCO6Dk0FIrati9pZXuj3TQzfFJLWuZ/XzJpzuIkOovYrFGA==',
    'Copier | `9.17.2`',
    '02e9c0d05281603c06d52f48350e48ffca0b4283d9f025664fbce4befabaa555',
    'Plop | `4.0.5`',
    '`BUILD / SELECTED CANDIDATE`',
    '`DEFER AS FALSIFIER-TRIGGERED ADAPT ALTERNATIVE`',
    '`REFERENCE_ONLY / NOT ADMITTED`',
    'compilerProtocol = conexus-profile-compiler/v1',
    'ProfileAdmission/schema validator + canonical JSON = RF-12 prerequisite',
    'COPY_BYTES',
    'SERIALIZE_CANONICAL_JSON',
    'RENDER_TOKEN_TEXT',
    'GenerationReceipt last',
    'Product implementation, push, PR and merge remain',
  ]) assert.ok(selection.includes(token), `RF-01 selection missing ${token}`)

  const proofIds = [...selection.matchAll(/`RF01-P(\d{2})`/g)].map(match => match[1])
  assert.deepEqual(proofIds, Array.from({ length: 14 }, (_value, index) => String(index + 1).padStart(2, '0')))

  assert.match(selection, /Filesystem multi-file mutation is not claimed atomic/)
  assert.match(selection, /until the new receipt commits, the tree is not admitted/)
  assert.match(selection, /compiler never writes or deletes an existing `APP-OWNED` path/)
  assert.match(selection, /no generator\/template dependency or executable profile task surface/)
  assert.match(selection, /No\s+dependency is installed and no compiler\/source\/topology is implemented/)

  assert.match(phase, /Mutable status and exact next action.*owned only by/s)
  assert.match(index, /4D-05 approved RF-01 profile compiler selection/)
})
