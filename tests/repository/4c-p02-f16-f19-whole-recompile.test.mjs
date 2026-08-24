import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('operator-approved F16-F19 close as a bounded 117-operation recompile before P-02 P7', () => {
  const roadmap = read('docs/roadmap.md')
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const wireContract = read('docs/product/wire-contract.md')

  for (const token of ['4C-F16', '4C-F17', '4C-F18', '4C-F19', 'N_platform = 117', 'Brain — 12']) {
    assert.ok(ledger.includes(token), `current Product authority missing ${token}`)
  }
  assert.ok(permissions.includes('ordinary Permissions = 25'), 'bounded correction must not add a Permission')
  assert.ok(wireContract.includes('117'), 'wire contract must project current 117-operation closure')
  assert.ok(roadmap.includes('P-02 = OPEN'), 'P-02 must remain open')
  assert.ok(roadmap.includes('P7'), 'roadmap must route next to P7 after whole-wire closure')
  assert.doesNotMatch(roadmap, /P-02\s*=\s*LOCKED|P8\s*=\s*CANDIDATE|P-03\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'whole recompile must not skip the P7/P8/operator gates')
})
