import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const contract = read('docs/evidence/4c/p11-faithful-assembly-contract.md')
const patterns = read('docs/evidence/4c/pre11-terminal-p10-pattern-vocabulary.md')
const roadmap = read('docs/roadmap.md')

test('faithful P11 gate enumerates every final input block and accepted journey', () => {
  for (const block of ['T-01', 'GF-01', 'W-01', 'W-02A', 'W-02B', 'W-03', 'W-04', 'P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'PA-01']) {
    assert.ok(contract.includes(`| ${block} |`), `assembly manifest missing ${block}`)
  }
  for (const journey of 'ABCDEFGHIJKLMNO') assert.match(contract, new RegExp(`^${journey}\\s`, 'm'), `journey ${journey} missing`)
})

test('assembly proof floor is behavioral and P11 authoring is now explicitly gated', () => {
  for (const token of [
    'exercise each cross-block handoff',
    'inert tabs/buttons/links = 0',
    'owner-specific negative/recovery states',
    'fail when any manifest item is removed',
    'CURRENT P11 LOCKED / OPERATOR APPROVED / HISTORICAL P11 LOCK PRESERVED',
  ]) assert.ok(contract.includes(token), `faithful assembly contract missing ${token}`)
  assert.match(roadmap, /P11 = LOCKED \/ OPERATOR APPROVED \/ blob 536052096dd10dec2f604ccef49aa64ba52e4dac/)
  assert.match(roadmap, /P12 = CLOSED \/ CLEAR \/ GLOBAL MAXIMUM \+ EDGE MATRIX OPERATOR APPROVED \/ FAMILIES 1-4 RE-LOCKED \/ CURRENT P11 RE-LOCKED \/ MATERIAL UX-ARCHITECTURE FINDINGS=0/)
  assert.match(roadmap, /P11 = LOCKED \/ OPERATOR APPROVED/)
})

test('terminal P10 vocabulary remains semantic and rejects premature abstractions', () => {
  for (const token of [
    'adaptive current-scope shell',
    'human-first exact reference',
    'context-preserving exact-subject panel',
    'owner-paged honest collection',
    'exact-current guarded action',
    'consequence-first exact decision',
    'GenericDrawer',
    'shared cross-owner DTO/store/cache authority',
  ]) assert.ok(patterns.includes(token), `terminal P10 vocabulary missing ${token}`)
  assert.match(patterns, /does not select components, hooks, stores, router APIs, design tokens, SDKs or a design system/)
})
