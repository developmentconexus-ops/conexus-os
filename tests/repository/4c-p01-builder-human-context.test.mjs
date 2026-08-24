import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function sliceBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle)
  if (start < 0) return ''
  const end = endNeedle ? text.indexOf(endNeedle, start) : -1
  return text.slice(start, end < 0 ? undefined : end)
}

test('P-01 preserves operator-approved F14 history while current status stops at approved P7 before P8', () => {
  const files = [
    'docs/evidence/4c/p01-authority-feasibility-preflight.md',
    'docs/evidence/4c/p01-builder-human-context-finding.md',
    'docs/evidence/4c/p01-builder-human-context-global-maximum.md',
    'docs/evidence/4c/p01-builder-human-context-selected-realization.md',
  ]
  for (const p of files) if (!existsSync(path(p))) throw new Error(`P-01 F14 Evidence missing: ${p}`)

  const preflight = read(files[0])
  const selected = read(files[3])
  const roadmap = read('docs/roadmap.md')

  for (const law of [
    'F14-A — Change human meaning is lost after creation',
    'F14-B — contextual assistant cannot bind an exact current Change',
    'P7 = BLOCKED UNTIL F14 GREEN',
    'P8 = BLOCKED',
  ]) requireText(preflight, law, `P-01 preflight missing historical law: ${law}`)

  requireText(selected, 'OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED', 'F14 selected realization must preserve its historical RED selection')
  requireText(selected, 'ChangeSummary requires intent', 'F14 must preserve durable Change intent selection')
  requireText(selected, 'BLD-16 admits optional changeId', 'F14 must preserve exact optional Change assistant context selection')

  requireText(roadmap, 'P-01 = OPEN / F14 GREEN / P7 OPERATOR APPROVED / P8 BLOCKED / NOT LOCKED', 'roadmap must stop at approved P7 before any P8 work')
  requireText(roadmap, 'F14 whole-wire GREEN = Verify #797 SUCCESS', 'roadmap must pin the fresh F14 whole-wire GREEN proof')
  requireText(roadmap, 'P7 structural GREEN = Verify #803 SUCCESS', 'roadmap must pin the P7 structural GREEN proof')
  if (/P-02[^\n|]*=\s*OPEN/.test(roadmap) || /4D[^\n|]*=\s*OPEN/.test(roadmap)) throw new Error('P-01 P7 closure must not open P-02 or 4D')
})

test('selected F14 realization preserves Change intent and exact optional Change context inside the Builder owner', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const wire = read('contracts/api/product/builder-paths.yaml')
  const checker = read('scripts/check-wire-builder.mjs')

  requireText(ledger, 'N_platform = 116', 'F14 must preserve fixed Product census 116')
  requireText(ledger, '## 5.4 Builder — 17', 'F14 must preserve exactly 17 Builder operations')
  requireText(ledger, '4C-F14', 'F14 semantic correction must be projected into current 4A Builder authority')
  requireText(ledger, 'intent remains the required human semantic statement of what must become true', 'F14 ledger must preserve authored Change intent as human meaning')
  requireText(ledger, 'optional exact current Change context', 'F14 ledger must bind BLD-16 optional exact Change context')
  requireText(permissions, 'ordinary Permissions = 25', 'F14 must preserve the ordinary Permission census')

  const summary = sliceBetween(wire, '    ChangeSummary:\n', '    Change:\n')
  requireText(summary, 'required: [changeId, projectId, intent, state]', 'F14: ChangeSummary must require intent')
  requireText(summary, 'intent:', 'F14: ChangeSummary must expose intent')

  const change = sliceBetween(wire, '    Change:\n', '    PlanItem:\n')
  requireText(change, 'required: [changeId, projectId, intent, baselineDigest, planningDepth, rigorProfile, state]', 'F14: Change must require intent')
  requireText(change, 'intent:', 'F14: Change must expose intent')

  const assistant = sliceBetween(wire, 'summary: AskConexusAboutContext', 'summary: GetChangeExecutionDetail')
  requireText(assistant, 'changeId:', 'F14: BLD-16 must admit optional exact Change context')
  requireText(assistant, 'untrusted', 'F14 BLD-16 changeId must remain an untrusted reference')
  if (/required:\s*\[[^\]]*changeId/.test(assistant)) throw new Error('F14 BLD-16 changeId must stay optional so Project-level assistance remains valid')

  for (const guard of [
    "required(changeSummary, 'changeId', 'projectId', 'intent', 'state')",
    "required(change, 'changeId', 'projectId', 'intent', 'baselineDigest', 'planningDepth', 'rigorProfile', 'state')",
    "assistantRequest.properties?.changeId",
  ]) requireText(checker, guard, `F14 Builder checker missing guard: ${guard}`)

  for (const forbidden of ['Change.title', 'Change.name', 'UpdateChange', 'RenameChange', 'ContextRef']) {
    if (wire.includes(forbidden)) throw new Error(`F14 must not realize speculative Builder authority: ${forbidden}`)
  }
  for (const schema of [summary, change]) {
    if (/\n\s+title:\s*\n/.test(schema) || /\n\s+name:\s*\n/.test(schema)) {
      throw new Error('F14 Change schemas must reuse intent rather than invent title/name presentation fields')
    }
  }

  const ids = [...wire.matchAll(/x-conexus-4a-id: (BLD-\d+)/g)].map(m => m[1])
  if (ids.length !== 17 || new Set(ids).size !== 17) throw new Error(`F14 must preserve 17 unique Builder operations; got ${ids.length}`)
})
