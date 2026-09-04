import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const propertyPattern = /(?:WIR|AUT|FE|DAT|DPL|INT|REL|RUN|DXE|MEM|LRN|CMP|IOP|EVA|TEL|VER|CON)-\d{2}/g
const allPropertyPattern = /(?:SCF|WIR|AUT|FE|DAT|DPL|INT|REL|RUN|DXE|MEM|LRN|CMP|IOP|EVA|TEL|VER|CON)-\d{2}/g

test('4D-03 maps every post-scaffold property into a consumer-gated mechanism-neutral contract', () => {
  const ledger = read('docs/evidence/4d/4d-01-protected-property-ledger.md')
  const contract = read('docs/evidence/4d/4d-03-paved-road-property-contract.md')
  const phase = read('docs/phases/4d-project-paved-road-and-runtime-realization.md')
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')

  const ledgerIds = [...new Set(ledger.match(propertyPattern) ?? [])].sort()
  const contractIds = [...new Set(contract.match(propertyPattern) ?? [])]
    .filter(id => id !== 'VER-07')
    .sort()
  assert.equal(ledgerIds.length, 106)
  assert.deepEqual(contractIds, ledgerIds)

  const realizeIds = [...new Set(ledger.split(/\r?\n/)
    .filter(line => line.startsWith('| `') && line.includes('| `REALIZE` |'))
    .flatMap(line => line.match(allPropertyPattern) ?? []))]
    .sort()
  const profilePartition = contract.match(/FIRST_MANAGED_BUDGET_ANALYZER REALIZE = 93\n([\s\S]*?)\n\nCURRENT_PLATFORM_LATER REALIZE = 3\n([^\n]+)/)
  assert.ok(profilePartition, '4D-03 missing exact REALIZE profile partition')
  const firstProfileIds = [...new Set(profilePartition[1].match(allPropertyPattern) ?? [])].sort()
  const laterProfileIds = [...new Set(profilePartition[2].match(allPropertyPattern) ?? [])].sort()
  assert.equal(firstProfileIds.length, 93)
  assert.deepEqual(laterProfileIds, ['FE-09', 'FE-10', 'MEM-02'])
  assert.deepEqual([...firstProfileIds, ...laterProfileIds].sort(), realizeIds)

  for (const token of [
    'CLOSED / OPERATOR APPROVED / 4E-R1-F01 BOUNDED OWNER CORRECTION APPROVED / 2026-08-30',
    'Exact dependency/package/topology selection:** `0`',
    'SEVEN OWNER-BOUNDED MECHANICAL CONTRACTS',
    'R1 `PRJ-24` Project cognition and later `BLD-16` Builder cognition',
    'canonical wire + request authority',
    'browser projection + interaction conformance',
    'owner-isolated persistence + Project data path',
    'exact integration binding + Gateway execution',
    'immutable Release + MAR serving/occurrence',
    'Builder/runtime/protocol composition',
    'verification + evaluation + observation Evidence',
    'FIRST_MANAGED_BUDGET_ANALYZER',
    'CURRENT_PLATFORM_LATER',
    'FIRST_MANAGED_BUDGET_ANALYZER REALIZE = 93',
    'CURRENT_PLATFORM_LATER REALIZE = 3',
    'PRESERVE_SEAM',
    'DEFER',
    'First-profile reachability manifest',
    'Complete ledger coverage',
    'Enforcement and proof matrix',
    'Product implementation, push, PR and merge remain',
  ]) assert.ok(contract.includes(token), `4D-03 contract missing ${token}`)

  assert.match(contract, /`REALIZE` means a property becomes mandatory when its named consumer is\s+reachable/)
  assert.match(contract, /FE-09 and `MEM-02` are contracted now but not instantiated/)
  assert.match(contract, /The `93` first-profile properties describe the complete R1\/RB\/R2–R7 proving\s+profile, not one implementation increment/)
  assert.match(contract, /There is no generic cross-owner `UnitOfWork` or `Repository<T>`/)
  assert.match(contract, /The first Budget Analyzer profile is read-only/)
  assert.match(contract, /Builder is serial by default/)
  assert.match(contract, /Missing Evidence or a non-firing negative control cannot become PASS/)
  assert.match(contract, /No table, service, package, runtime, worker or exporter is created/)
  assert.match(contract, /`VER-07` remains intentionally absent/)
  assert.match(contract, /operator approved it on 2026-08-29;\s+4D-B is closed and only 4D-04 runtime-family applicability may now open/)

  assert.match(phase, /Mutable status and exact next action.*owned only by/s)
  assert.match(index, /4D-03 approved Paved-Road property contract/)
})
