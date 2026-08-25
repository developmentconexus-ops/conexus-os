import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message = needle) {
  if (!text.includes(needle)) throw new Error(`W-04 P7 structural record missing: ${message}`)
}

test('W-04 P7 preserves the operator-approved Agent-first catalog without inventing fleet or source-read authority', () => {
  const docPath = 'docs/evidence/4c/w04-structural-hypotheses.md'
  if (!existsSync(path(docPath))) throw new Error('W-04 P7 structural record must exist before P8')

  const doc = read(docPath)

  for (const token of [
    'P7 CANDIDATE / OPERATOR ADJUDICATION / P8 BLOCKED / NOT LOCKED',
    'A — Agent-first searchable catalog',
    'B — Project-grouped catalog',
    'C — Project-first master/detail',
    'LEADING CANDIDATE',
    'REJECTED',
    'PRJ-22 ListWorkspaceProductAgents',
    'project.read',
    'project.source.read',
    'project.read != project.source.read',
    'ProjectProductAgent',
    'ProjectSummary',
    'ProductAgent.name',
    'ProductAgent.purpose',
    'agentId = technical identity',
    'Included in active Release',
    'No active Release',
    'activeReleaseId -X-> runtime health',
    'complete already-disclosed PRJ-22 collection',
    'local search/filter',
    'no PRJ-22 pagination contract',
    'no server-side sort contract',
    'future P-03 boundary',
    'Workspace Agent/fleet owner = FORBIDDEN',
    'frontend Agent/Project label join = FORBIDDEN',
    'PRJ-21 dependency under project.read = FORBIDDEN',
    'P8 = BLOCKED',
  ]) requireText(doc, token)

  for (const forbidden of [
    'Agent create/edit/run controls = NOT ADMITTED',
    'Active / Inactive = FORBIDDEN',
    'Healthy / Running / Online / Ready = FORBIDDEN',
  ]) requireText(doc, forbidden)

  if (/P8\s*=\s*(?:GREEN|LOCKED|APPROVED)/.test(doc)) throw new Error('W-04 P7 must not pre-authorize P8')
  if (/W-04\s*=\s*LOCKED/.test(doc)) throw new Error('W-04 must remain operator-unlocked at P7')
})
