import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = path => readFileSync(resolve(root, path), 'utf8')

const removed = new Map([
  ['WS-03', 'UpdateWorkspace'],
  ['WS-06', 'UpdateArea'],
  ['PRJ-04', 'UpdateProject']
])

test('operator-approved 4B-F01 subtraction remains preserved after later bounded 4C-F02 and 4C-F03', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const sectionStart = ledger.indexOf('# 5. Fixed Conexus platform census')
  const sectionEnd = ledger.indexOf('\n---\n\n## 6. Product-visible Published Application boundary', sectionStart)
  if (sectionStart < 0 || sectionEnd < 0) throw new Error('unable to locate fixed-platform census in operation ledger')

  const fixedSection = ledger.slice(sectionStart, sectionEnd)
  const rows = [...fixedSection.matchAll(/^\| `([A-Z]+-\d+)` \| `([A-Za-z][A-Za-z0-9]+)` \|/gm)]
  if (rows.length !== 113) throw new Error(`expected 113 current fixed 4A operations after accepted 4C-F03, found ${rows.length}`)

  for (const [id, operationId] of removed) {
    if (fixedSection.includes(`\`${id}\``) || fixedSection.includes(`\`${operationId}\``)) {
      throw new Error(`removed 4B-F01 operation returned to current 4A census: ${id} ${operationId}`)
    }
  }

  if (!fixedSection.includes('`PRJ-23` | `GetProjectBaselineCandidate`')) {
    throw new Error('current census must preserve accepted PRJ-23 exact candidate read')
  }
  if (!fixedSection.includes('`PRJ-24` | `AskConexusAboutBaselineCandidate`')) {
    throw new Error('current census must add accepted PRJ-24 exact candidate contextual read')
  }

  for (const historical of [
    '= 111 fixed operations after 4B-F01',
    '= 112 fixed operations after 4C-F02',
    '= 113 current fixed Conexus platform Product operations'
  ]) {
    if (!ledger.includes(historical)) throw new Error(`operation ledger must preserve bounded correction chronology: ${historical}`)
  }
})
