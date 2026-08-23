import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('W-02 authority preflight separates Brain review from Connection secret/qualification work and preserves bounded follow-up falsifiers', () => {
  const evidencePath = 'docs/evidence/4c/w02-authority-feasibility-preflight.md'
  if (!existsSync(path(evidencePath))) throw new Error('W-02 authority-feasibility preflight must exist before structural hypotheses')

  const evidence = read(evidencePath)
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const surfaces = read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const roadmap = read('docs/roadmap.md')

  for (const law of [
    'W-02A — Workspace Brain',
    'W-02B — Connections',
    'W-02 split = REQUIRED',
    'BRN-11 RunBrainHealthProbe = NOT-HUMAN-FACING / SYSTEM_OWNER_TRANSITION',
    'BRN-12 RunAnalyticQuery = P-02 / NOT W-02',
    'proposal != reviewed meaning != published Brain revision',
    'configured != qualified != bound != healthy != caller-authorized',
    'credential write = write-only / no secret readback',
    'generic Workspace Settings = REJECTED',
    'Initial operation/Permission/owner/trust topology was sound.',
    'F04 Connection human presentation identity = OPERATOR ACCEPTED / GREEN',
    'F05 Brain Discovery proposal intake         = OPERATOR ACCEPTED / GREEN',
    'reference study = TRIGGERED',
  ]) requireText(evidence, law, `W-02 preflight missing law: ${law}`)

  for (const operation of [
    'BRN-01', 'BRN-02', 'BRN-03', 'BRN-04', 'BRN-05', 'BRN-06', 'BRN-07', 'BRN-08', 'BRN-09', 'BRN-10',
    'CON-01', 'CON-02', 'CON-03', 'CON-04', 'CON-05', 'CON-06', 'CON-07', 'CON-08', 'CON-09',
  ]) requireText(evidence, operation, `W-02 preflight missing exact operation ${operation}`)

  for (const permission of [
    'brain.read', 'brain.propose', 'brain.discover', 'brain.review', 'brain.publish',
    'connection.read', 'connection.manage', 'connection.qualify', 'connection.use',
  ]) requireText(evidence, permission, `W-02 preflight missing Permission ${permission}`)

  requireText(ledger, '## 5.5 Brain — 11', 'W-02 precondition lost Brain operation authority')
  requireText(ledger, '## 5.6 Connections — 9', 'W-02 precondition lost Connections operation authority')
  requireText(permissions, '`brain.publish`', 'W-02 precondition lost Brain publication authority')
  requireText(permissions, '`connection.qualify`', 'W-02 precondition lost Connection qualification authority')
  requireText(surfaces, '`W-02` | Workspace Brain + Connections', 'W-02 block ledger route missing')

  requireText(roadmap, 'W-01 LOCKED', 'W-02 may open only after W-01 lock')
  requireText(roadmap, 'W-02A LOCKED', 'W-02 preflight must preserve the locked Brain sub-block')
  requireText(roadmap, 'W-02B LOCKED', 'W-02 preflight must preserve the locked Connections sub-block')
  requireText(roadmap, 'W-03 = LOCKED / OPERATOR APPROVED / P9/P10 CLOSED / VERIFIED GREEN', 'W-02 progression beyond W-03 requires the exact W-03 lock')
  requireText(roadmap, 'W-03 = NEXT / NOT OPEN', 'W-02 must preserve the historical W-03 predecessor marker')
  if (/P-01\s*=\s*OPEN|4D[^\n|]*\|\s*OPEN/.test(roadmap)) {
    throw new Error('W-02 closure must not skip beyond the routed W-04 material block into P-01/4D')
  }
})
