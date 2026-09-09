import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = value => resolve(root, value)
const read = value => readFileSync(path(value), 'utf8')

const requireText = (text, needle, message = needle) => {
  if (!text.includes(needle)) throw new Error(`P-04 authority preflight missing ${message}`)
}

const sliceBetween = (text, startNeedle, endNeedle) => {
  const start = text.indexOf(startNeedle)
  if (start < 0) return ''
  const end = text.indexOf(endNeedle, start)
  return text.slice(start, end < 0 ? undefined : end)
}

test('operator-approved P-04 closes the revised P8 through exact P9/P10 trace', () => {
  const ownerPath = 'docs/evidence/4c/p04-release-operations-authority-feasibility-and-structural-hypotheses.md'
  if (!existsSync(path(ownerPath))) throw new Error('canonical P-04 authority/feasibility owner must exist')

  const owner = read(ownerPath)
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')

  for (const token of [
    'P-04 LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED',
    '4C-F31', '4C-F32', '4C-F33', '4C-F34',
    'Operator adjudication:',
    'A — current-serving Releases route + owner-specific Activity lenses',
    'PRESENT-IN-AUTHORITY — F31',
    'PRESENT-IN-AUTHORITY — F32',
    'PRESENT-IN-AUTHORITY — F33 / MAR-04',
    'PRESENT-IN-AUTHORITY — F34',
    'P8 = LOCKED / approved blob 9aaa2c8e6d85b7b5d535bfba5969c475190ba7e7',
    'P9 = EXACT TRACE CLOSED',
    'P10 = CONSOLIDATED',
    'P11 / 4D / Product implementation = NOT AUTHORIZED',
  ]) requireText(owner, token)

  requireText(inventory, 'P-04', 'P-04 inventory route')

  if (!existsSync(path('docs/evidence/4c/p04-release-operations-functional-wireframe.html'))) throw new Error('canonical P-04 P8 artifact must exist')
  if (!existsSync(path('docs/evidence/4c/p04-release-operations-screen-contract.md'))) throw new Error('P-04 Screen Contract must exist after explicit P8 lock')
})

test('F31-F34 close exact Release, MAR and OBS human-operability gaps without frontend authority', () => {
  const release = read('contracts/api/product/release-paths.yaml')
  const mar = read('contracts/api/product/mar-paths.yaml')
  const obs = read('contracts/api/product/observability-paths.yaml')

  const releaseSummary = sliceBetween(release, '    ReleaseSummary:\n', '    ReleaseManifestProjection:\n')
  const composition = sliceBetween(release, '    ReleaseManifestProjection:\n', '    Release:\n')
  const promotion = sliceBetween(release, '    Promotion:\n', '    ServingVerification:\n')
  const servingPath = sliceBetween(release, '  /api/control/projects/{projectId}/serving-state:\n', '  /api/control/projects/{projectId}/environments/{environmentId}/conformance:\n')
  const activity = sliceBetween(obs, '    ProjectActivityEntry:\n', '    ProjectActivityPage:\n')

  for (const field of ['releaseId:', 'releaseLabel:', 'releaseManifestDigest:', 'sourceRevision:', 'createdAt:', 'releaseState:', 'compositionSummary:']) {
    requireText(releaseSummary, field, `F31 ReleaseSummary ${field}`)
  }
  requireText(release, 'ReleasePage:', 'F31 scalable Release page')
  requireText(composition, 'additionalProperties: false', 'F31 closed safe ReleaseManifestProjection')
  for (const field of ['components:', 'bindings:', 'configurationDigest:', 'runtimeContractDigest:']) requireText(composition, field, `F31 composition ${field}`)

  for (const field of ['environmentId:', 'environmentLabel:', 'requestedAt:', 'requestedBy:']) requireText(promotion, field, `F32 Promotion ${field}`)
  requireText(servingPath, '$ref: \'#/components/schemas/ProjectServingState\'', 'F32 target serving matrix')
  requireText(release, 'environments:', 'F32 server-disclosed environment list')
  requireText(release, 'enum: [UNSET, SET]', 'F32 explicit pointer state')

  requireText(mar, 'x-conexus-4a-id: MAR-04', 'F33 distinct runnable-job read')
  requireText(mar, 'operationId: ListRunnableManagedJobs', 'F33 operation identity')
  for (const field of ['jobId:', 'name:', 'purpose:']) requireText(mar, field, `F33 runnable job ${field}`)

  for (const coordinate of ['subject:', 'kind:', 'occurredAt:', 'summary:', 'detailTarget:']) requireText(activity, coordinate, `F34 Activity ${coordinate}`)
  requireText(obs, 'ActivitySubjectSnapshotRef:', 'F34 Activity-specific human snapshot')
  requireText(obs, 'ActivityDetailTarget:', 'F34 conditional owner-detail target')
})
