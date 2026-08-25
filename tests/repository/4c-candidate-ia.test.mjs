import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = path => readFileSync(resolve(root, path), 'utf8')

const iaPath = 'docs/evidence/4c/candidate-information-architecture.md'

const requiredTerms = [
  'Workspace',
  'Project',
  'Build',
  'Brain',
  'Connection',
  'Integration',
  'Capability',
  'Release',
  'Promotion',
  'Product Agent',
  'Conexus',
  'Finding',
  'Evidence'
]

test('4C-4 candidate IA stays human-centered and inside accepted authority', () => {
  assert.equal(existsSync(resolve(root, iaPath)), true, '4C-4 candidate IA evidence must exist')

  const ia = read(iaPath)

  assert.match(ia, /Status:\*\* CANDIDATE \/ 4C-4/)
  assert.match(ia, /CONTROL PLANE/)
  assert.match(ia, /PUBLISHED APPLICATION/)
  assert.match(ia, /Projects.*primary Workspace destination/s)
  assert.match(ia, /Build.*primary Project destination/s)
  assert.match(ia, /Connection.*external-system relationship/s)
  assert.match(ia, /Integration.*Project use\/binding/s)
  assert.match(ia, /Versions.*REJECTED as the leading Project navigation label/s)
  assert.match(ia, /Releases.*CANDIDATE Project navigation label/s)
  assert.match(ia, /universal Approval Center.*REJECTED/s)
  assert.match(ia, /global search.*NOT ADMITTED/s)
  assert.match(ia, /Phase-3 Workspace\/Project shells.*semantic seeds.*not a pre-approved navbar/s)
  assert.match(ia, /4C-A01.*VALIDATED/)
  assert.match(ia, /4C-A02.*OPEN/)
  assert.match(ia, /4C-5.*NOT STARTED/)
  assert.match(ia, /LOCKED.*operator-only/s)

  for (const term of requiredTerms) {
    assert.match(ia, new RegExp(`\\| ${term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')} \\|`), `terminology glossary missing ${term}`)
  }

  for (const letter of 'ABCDEFGHIJKLMNO') {
    assert.match(ia, new RegExp(`Journey ${letter}`), `candidate IA must preserve Journey ${letter}`)
  }
})
