import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const blob = path => {
  const bytes = Buffer.from(read(path).replaceAll('\r\n', '\n'), 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

const locks = [
  ['T-01', 'docs/evidence/4c/t01-trusted-setup-functional-wireframe.html', 'docs/evidence/4c/t01-trusted-setup-screen-contract.md', '3955589bfd983923b74a4cd72f6ef13f2b9867e7'],
  ['GF-01', 'docs/evidence/4c/gf01-global-frame-wireframe.html', 'docs/evidence/4c/gf01-screen-contract.md', 'e83a0e8c9e64ee47d28a58d267f5fb1169b41ed3'],
  ['P-01', 'docs/evidence/4c/p01-build-workspace-functional-wireframe.html', 'docs/evidence/4c/p01-build-workspace-screen-contract.md', '8ff34e12ab35ee69f8ffaff1bdd0a8274ac62cec'],
  ['P-03', 'docs/evidence/4c/p03-product-agent-functional-wireframe.html', 'docs/evidence/4c/p03-product-agent-screen-contract.md', 'b462c3bb536e0562d28ffb85ef9f6d44fb52df3a'],
]

const currentP12Candidates = new Map([
  ['T-01', '4da586d8a421bb03413bc82ee5b2e82432d6f620'],
  ['GF-01', '603b47ccaba1fe6557e557b48efa4f40207d3724'],
  ['P-01', '25e5077106892c4ff6aba6774987e73a12ccff51'],
  ['P-03', '17d31534fac0e57a74f70202567b23d8a63cd3c0'],
])

test('terminal pre-P11 delta locks pin the exact operator-approved HTML identities', () => {
  for (const [block, html, contract, expected] of locks) {
    assert.equal(blob(html), currentP12Candidates.get(block) || expected, `${block} approved/candidate HTML identity drifted`)
    const owner = read(contract)
    assert.ok(owner.includes(expected), `${block} Screen Contract does not pin its approved blob`)
    assert.match(owner, /LOCKED|RE-LOCKED/, `${block} Screen Contract does not own a lock`)
    assert.match(owner, /P9[\s\S]*(?:CLOSED|closed)/, `${block} P9 is not closed`)
    assert.match(owner, /P10[\s\S]*(?:CONSOLIDATED|consolidated)/, `${block} P10 is not consolidated`)
  }
  const roadmap = read('docs/roadmap.md')
  assert.match(roadmap, /P11 historical assembly = INVALIDATED AS CURRENT PROOF BY OPERATOR-AUTHORIZED P12 CHILD DELTAS/)
})

test('terminal P10 and faithful assembly gate authorize only P11', () => {
  const p10 = read('docs/evidence/4c/pre11-terminal-p10-pattern-vocabulary.md')
  const gate = read('docs/evidence/4c/p11-faithful-assembly-contract.md')
  const roadmap = read('docs/roadmap.md')

  assert.match(p10, /TERMINAL P10 RECONCILED \/ CLOSED FOR P11 INPUT/)
  assert.match(gate, /CURRENT P11 LOCKED \/ OPERATOR APPROVED \/ HISTORICAL P11 LOCK PRESERVED/)
  for (const [, , , expected] of locks) assert.ok(gate.includes(expected), `P11 gate missing ${expected}`)
  assert.match(roadmap, /P11 = LOCKED \/ OPERATOR APPROVED \/ blob 536052096dd10dec2f604ccef49aa64ba52e4dac/)
  assert.match(roadmap, /P12 \/ 4D \/ Product implementation = NOT AUTHORIZED/)
  assert.match(roadmap, /Budget Analyzer remains[\s\S]*not a current Conexus-platform frontend block/i)
})
