import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('W-03 preserves its approved inner contract and pins the operator-relocked GF-01 shell', () => {
  const htmlPath = 'docs/evidence/4c/w03-people-access-audit-functional-wireframe.html'
  const contractPath = 'docs/evidence/4c/w03-people-access-audit-screen-contract.md'
  if (!existsSync(path(contractPath))) throw new Error('W-03 exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const hypotheses = read('docs/evidence/4c/w03-structural-hypotheses.md')
  const contract = read(contractPath)
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const roadmap = read('docs/roadmap.md')

  const approvedBlob = '7434c561ef0cfbc43c81ab8dd1f72b13cf032135'
  const candidateBlob = 'e9d630622d853d6e352737f46202f2765526fd6a'
  if (gitBlobSha(html) !== candidateBlob) throw new Error('operator-approved W-03 shell artifact drifted after re-lock')
  requireText(contract, 'LOCKED / OPERATOR APPROVED / P11-W03-F01 SHELL RE-LOCKED', 'W-03 Screen Contract must own the shell re-lock')
  requireText(contract, `approved P8 artifact blob = ${approvedBlob}`, 'W-03 Screen Contract must preserve the historical approved blob')
  requireText(contract, `approved shell-corrected P8 artifact blob = ${candidateBlob}`, 'W-03 Screen Contract must pin the approved shell artifact')

  requireText(hypotheses, 'P7 CANDIDATE / OPERATOR ADJUDICATION / P8 BLOCKED / NOT LOCKED', 'W-03 P7 record must remain immutable historical candidate Evidence')
  requireText(hypotheses, 'A — subject-first access + filtered immutable Audit', 'W-03 historical P7 must preserve the selected structure')

  for (const exactTrace of [
    'IAM-04 ListWorkspaceMembers',
    'IAM-05 AddWorkspaceMember',
    'IAM-06 RemoveWorkspaceMember',
    'IAM-07 GrantAccountProjectAccess',
    'IAM-08 RevokeAccountProjectAccess',
    'IAM-09 AddAreaMember',
    'IAM-10 RemoveAreaMember',
    'IAM-11 GrantAreaProjectAccess',
    'IAM-12 RevokeAreaProjectAccess',
    'IAM-18 ListWorkspaceMembershipCandidates',
    'IAM-19 GetWorkspaceMemberAccess',
    'IAM-20 GetAreaAccess',
    'WS-04 ListAreas',
    'WS-05 CreateArea',
    'PRJ-01 ListProjects',
    'OBS-04 ListAuditRecords',
    'OBS-05 GetAuditRecord',
  ]) requireText(contract, exactTrace, `W-03 Screen Contract missing ${exactTrace}`)

  for (const permission of ['workspace.access.manage', 'workspace.manage', 'audit.read']) {
    requireText(contract, permission, `W-03 Screen Contract missing Permission boundary ${permission}`)
  }

  for (const law of [
    'current access administration != immutable audit investigation',
    'frontend effective-access derivation = FORBIDDEN',
    'browser page != audit search universe',
    'append-time label != current resource lookup',
    'applied Audit filter set = URL_NAVIGATION',
    'membership candidate query = FORM_DRAFT',
    'local disclosed-list filter = EPHEMERAL_UI',
    'context-preserving exact-subject panel',
    'P10 graduated shared patterns = 1',
    'P11 = LATER ASSEMBLED PRODUCT',
  ]) requireText(contract, law, `W-03 closure missing law: ${law}`)

  for (const forbidden of ['generic RBAC', 'SearchAudit', 'frontend-owned authorization', 'Audit mutation / retry / undo']) {
    requireText(contract, forbidden, `W-03 Screen Contract must preserve forbidden scope: ${forbidden}`)
  }

  for (const recompiledSurface of [
    '| WS-S10 | People & access | `ROUTE_PAGE` |',
    '| WS-S10A | People / Workspace membership + member access | `MATERIAL_REGION` + `DRAWER_MODAL` |',
    '| WS-S10B | Areas + Area access | `MATERIAL_REGION` + `DRAWER_MODAL` |',
    '| WS-S10C | Direct Account Project access | `MATERIAL_REGION` inside contextual person panel |',
    '| WS-S11 | Audit investigation | `ROUTE_PAGE` + `DRAWER_MODAL` |',
  ]) requireText(inventory, recompiledSurface, `W-03 lock must recompile affected surface inventory: ${recompiledSurface}`)

  requireText(roadmap, 'W-03 = LOCKED / OPERATOR APPROVED / P11-W03-F01 SHELL RE-LOCKED', 'roadmap must show W-03 shell re-lock')
  requireText(roadmap, 'W-04 = NEXT / NOT OPEN', 'roadmap must route the next material 4C block to W-04 without opening it')
  if (/\|\s*4D\b[^|\n]*\|\s*(?:OPEN|ACTIVE)\b/.test(roadmap)) throw new Error('W-03 lock must not open 4D before remaining 4C blocks, P11/P12 and closure')
})
