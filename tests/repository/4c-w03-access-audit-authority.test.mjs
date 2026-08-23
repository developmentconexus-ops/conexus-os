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
  const end = text.indexOf(endNeedle, start)
  return text.slice(start, end < 0 ? undefined : end)
}

test('W-03 preserves operator-approved F11/F12 Global-Maximum decision history before recompile', () => {
  const files = [
    'docs/evidence/4c/w03-authority-feasibility-preflight.md',
    'docs/evidence/4c/w03a-human-reviewable-access-finding.md',
    'docs/evidence/4c/w03a-human-reviewable-access-global-maximum.md',
    'docs/evidence/4c/w03a-human-reviewable-access-selected-realization.md',
    'docs/evidence/4c/w03b-human-investigable-audit-finding.md',
    'docs/evidence/4c/w03b-human-investigable-audit-global-maximum.md',
    'docs/evidence/4c/w03b-human-investigable-audit-selected-realization.md',
  ]
  for (const p of files) if (!existsSync(path(p))) throw new Error(`W-03 decision Evidence missing: ${p}`)

  const preflight = read(files[0])
  const f11 = read(files[2])
  const f11Selected = read(files[3])
  const f12 = read(files[5])
  const f12Selected = read(files[6])

  for (const law of [
    'W-03A — People & access',
    'W-03B — Audit',
    'F11 — human-reviewable access administration',
    'F12 — human-investigable immutable Audit',
    'P8 BLOCKED',
  ]) requireText(preflight, law, `W-03 preflight missing law: ${law}`)

  for (const alternative of [
    'A — show opaque IDs and let the UI label them',
    'B — query Keycloak directly from the frontend / reuse Keycloak groups and roles',
    'C — create a generic Person/UserProfile + RBAC/Role engine',
    'D — expose CRUD/list endpoints for every membership/grant record',
    'E — one screen-shaped `GetAccessDashboard`',
    'F — enrich current owners + three purpose-built I&A reads',
  ]) requireText(f11, alternative, `F11 assessment missing alternative: ${alternative}`)
  requireText(f11Selected, 'OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED', 'F11 selected realization must start RED')

  for (const alternative of [
    'A — browser-local filters over loaded audit page',
    'B — current Account/Project/Area lookup at render time only',
    'C — generic event/search domain or event-sourcing framework',
    'D — add new SearchAudit Product operation',
    'E — enrich OBS-04/05 with server-side filters + immutable presentation snapshots',
  ]) requireText(f12, alternative, `F12 assessment missing alternative: ${alternative}`)
  requireText(f12Selected, 'OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED', 'F12 selected realization must start RED')
})

test('selected F11 realization makes access administration human-reviewable at I&A/Workspace owners', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const identity = read('docs/product/human-context-identity-contract.md')
  const permissions = read('docs/product/permission-contract.md')
  const wire = read('contracts/api/product/identity-workspace-paths.yaml')
  const projectWire = read('contracts/api/product/project-paths.yaml')
  const checker = read('scripts/check-wire-identity-workspace.mjs')

  requireText(ledger, 'N_platform = 116', 'F11 RED: fixed Product census must recompile to 116')
  requireText(ledger, '## 5.1 Identity & Access — 19', 'F11 RED: IAM census must recompile to 19')
  for (const op of [
    '`IAM-18` | `ListWorkspaceMembershipCandidates`',
    '`IAM-19` | `GetWorkspaceMemberAccess`',
    '`IAM-20` | `GetAreaAccess`',
  ]) requireText(ledger, op, `F11 ledger missing ${op}`)
  requireText(ledger, '4C-F11', 'F11 semantic correction must be current 4A authority')

  for (const law of [
    'Account.displayName',
    'Account.email',
    'Area.name',
    'displayName != authorization',
    'email != stable identity',
    'Area.name != authorization',
  ]) requireText(identity, law, `F11 human-presentation authority missing law: ${law}`)

  const provision = sliceBetween(wire, 'summary: ProvisionAccount', '\n  /api/control/workspaces/{workspaceId}/members:')
  requireText(provision, 'required: [externalSubject, displayName]', 'F11 IAM-03 must require externalSubject + displayName')
  requireText(provision, 'email:', 'F11 IAM-03 must admit optional email presentation/contact data')

  const members = sliceBetween(wire, 'summary: ListWorkspaceMembers', '\n  /api/control/workspaces/{workspaceId}/members/{accountId}:')
  requireText(members, "$ref: '#/components/schemas/AccountSummary'", 'F11 IAM-04 must return AccountSummary rather than opaque accountId-only items')

  const areas = sliceBetween(wire, 'summary: ListAreas', 'summary: CreateArea')
  requireText(areas, "$ref: '#/components/schemas/AreaSummary'", 'F11 WS-04 must return human-readable AreaSummary')
  const createArea = sliceBetween(wire, 'summary: CreateArea', undefined)
  requireText(createArea, 'required: [name]', 'F11 WS-05 must require Area.name')

  for (const op of ['ListWorkspaceMembershipCandidates', 'GetWorkspaceMemberAccess', 'GetAreaAccess']) {
    requireText(wire, `operationId: ${op}`, `F11 wire missing ${op}`)
    requireText(checker, op, `F11 checker missing ${op}`)
  }
  for (const schema of ['AccountSummary:', 'AreaSummary:', 'WorkspaceMemberAccess:', 'AreaAccess:']) {
    requireText(wire, schema, `F11 wire missing schema ${schema}`)
  }
  for (const source of ['DIRECT', 'AREA']) requireText(wire, source, `F11 effective-access source vocabulary missing ${source}`)

  requireText(permissions, 'IAM-18..20', 'F11 workspace.access.manage Permission mapping must include new read consumers')
  requireText(permissions, 'access-administration summary disclosure', 'F11 Permission contract must bound alternate summary disclosure')
  requireText(projectWire, 'workspace.access.manage', 'F11 PRJ-01 wire description must preserve narrow access-administration summary disclosure')

  const ids = [...wire.matchAll(/x-conexus-4a-id: (IAM-\d+)/g)].map(m => m[1])
  if (ids.length !== 19 || new Set(ids).size !== 19) throw new Error(`F11 IAM wire topology must contain 19 unique operations; got ${ids.length}`)
})

test('selected F12 realization makes immutable Audit server-searchable and historically human-readable', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const wire = read('contracts/api/product/observability-paths.yaml')
  const checker = read('scripts/check-wire-observability.mjs')

  requireText(ledger, '4C-F12', 'F12 semantic correction must be current 4A authority')

  const listAudit = sliceBetween(wire, 'summary: ListAuditRecords', '\n  /api/control/workspaces/{workspaceId}/audit-records/{auditRecordId}:')
  for (const filter of ['name: from', 'name: to', 'name: actorQuery', 'name: actionQuery', 'name: projectId', 'name: pageToken']) {
    requireText(listAudit, filter, `F12 OBS-04 missing server-side filter ${filter}`)
  }
  requireText(listAudit, 'before pagination', 'F12 OBS-04 must state filtering occurs before pagination')

  const snapshot = sliceBetween(wire, '    AuditSubjectSnapshotRef:\n', '    AuditRecordSummary:\n')
  for (const field of ['kind:', 'ref:', 'label:']) requireText(snapshot, field, `F12 immutable audit snapshot missing ${field}`)
  requireText(snapshot, 'append-time', 'F12 label must be append-time historical presentation Evidence')

  const summary = sliceBetween(wire, '    AuditRecordSummary:\n', '    AuditRecordPage:\n')
  requireText(summary, "$ref: '#/components/schemas/AuditSubjectSnapshotRef'", 'F12 audit summary actor/subject must use immutable snapshot refs')
  requireText(summary, 'summary:', 'F12 audit list must carry deterministic human summary')

  const detail = sliceBetween(wire, '    AuditRecord:\n', undefined)
  requireText(detail, "$ref: '#/components/schemas/AuditSubjectSnapshotRef'", 'F12 audit detail actor/subject must use immutable snapshot refs')
  requireText(detail, 'summary:', 'F12 audit detail must carry deterministic human summary')
  requireText(detail, 'evidenceRefs:', 'F12 exact audit detail must retain Evidence')

  for (const token of ['actorQuery', 'actionQuery', 'AuditSubjectSnapshotRef', 'before pagination']) {
    requireText(checker, token, `F12 OBS checker missing guard ${token}`)
  }

  const obsIds = [...wire.matchAll(/x-conexus-4a-id: (OBS-\d+)/g)].map(m => m[1])
  if (obsIds.length !== 5 || new Set(obsIds).size !== 5) throw new Error(`F12 must preserve 5 OBS operations; got ${obsIds.length}`)
})
