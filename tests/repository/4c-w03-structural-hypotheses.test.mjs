import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = path => readFileSync(resolve(root, path), 'utf8')

function requireText(text, value, label = value) {
  assert.ok(text.includes(value), `W-03 P7 structural record missing: ${label}`)
}

test('W-03 P7 recompiles People/access and Audit into truthful governance structures without backend-shaped UX', () => {
  const path = 'docs/evidence/4c/w03-structural-hypotheses.md'
  assert.equal(existsSync(resolve(root, path)), true, 'W-03 P7 structural record must exist before P8')

  const doc = read(path)

  for (const value of [
    'P7 CANDIDATE / OPERATOR ADJUDICATION / P8 BLOCKED / NOT LOCKED',
    'A — subject-first access + filtered immutable Audit',
    'People & access',
    'Audit',
    'current access administration != immutable audit investigation',
    'People collection',
    'contextual person-access panel',
    'Areas collection',
    'contextual Area-access panel',
    'server-side filters before pagination',
    'contextual Audit detail',
    'preserve the filtered collection context',
    'B — access-matrix first',
    'C — operation/task-page first',
    'frontend effective-access derivation = FORBIDDEN',
    'current resource lookup as historical Audit label authority = FORBIDDEN',
    'fixed Product operations = 116',
    'canonical fixed Product wire = 116 ↔ 116',
    'ordinary Permissions = 25',
    'blocking authority/data findings = 0',
  ]) requireText(doc, value)

  for (const operation of [
    'IAM-04', 'IAM-05', 'IAM-06', 'IAM-07', 'IAM-08', 'IAM-09', 'IAM-10', 'IAM-11', 'IAM-12',
    'IAM-18', 'IAM-19', 'IAM-20', 'WS-04', 'WS-05', 'PRJ-01', 'OBS-04', 'OBS-05',
  ]) requireText(doc, operation, operation)

  for (const semantic of [
    'AccountSummary', 'AreaSummary', 'ProjectSummary', 'WorkspaceMemberAccess', 'AreaAccess',
    'AuditSubjectSnapshotRef', 'DIRECT', 'AREA',
  ]) requireText(doc, semantic, semantic)

  assert.doesNotMatch(doc, /P8\s*=\s*(?:GREEN|LOCKED|APPROVED)/, 'P7 must not pre-authorize P8')
  assert.doesNotMatch(doc, /W-03\s*=\s*LOCKED/, 'W-03 must remain operator-unlocked at P7')
})
