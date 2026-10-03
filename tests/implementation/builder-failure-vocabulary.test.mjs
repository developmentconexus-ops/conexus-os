import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { builderFailureCategory, projectBuilderRun } = await import(hubModuleUrl('builder/failure-vocabulary.js'))

const run = (state, failureCode) => ({
  builderRunId: '90000000-0000-4000-8000-000000000001',
  projectId: '90000000-0000-4000-8000-000000000002',
  state, phase: null, mode: 'BUILD', baseSourceRevision: 'a'.repeat(40),
  resultSourceRevision: null, resultKind: null, failureCode,
  requestText: 'Crie um contador', createdAt: '2026-09-20T12:00:00.000Z',
})

test('each public category is reachable from a real internal code', () => {
  assert.equal(builderFailureCategory('BUILDER_STARTER_ROOT_REFUSED'), 'ENVIRONMENT_PREPARATION_FAILED')
  assert.equal(builderFailureCategory('BUILDER_MODEL_AUTH_FAILED'), 'MODEL_CREDENTIAL_REFUSED')
  // A Project whose operator never chose a model reads as a credential the run does not have.
  assert.equal(builderFailureCategory('BUILDER_MODEL_NOT_SELECTED'), 'MODEL_CREDENTIAL_REFUSED')
  assert.equal(builderFailureCategory('BUILDER_MODEL_RATE_LIMITED'), 'MODEL_RATE_LIMITED')
  assert.equal(builderFailureCategory('BUILDER_MODEL_STREAM_FAILED'), 'MODEL_REQUEST_REFUSED')
  assert.equal(builderFailureCategory('BUILDER_RESULT_BUNDLE_TOO_LARGE'), 'SOURCE_RESULT_REJECTED')
  assert.equal(builderFailureCategory('BUILDER_RESULT_CONTENT_TOO_LARGE'), 'SOURCE_RESULT_REJECTED')
  assert.equal(builderFailureCategory('APPLICATION_SMOKE_FAILED'), 'APPLICATION_BUILD_FAILED')
  assert.equal(builderFailureCategory('USER_CANCELLED'), 'RUN_CANCELLED')
  assert.equal(builderFailureCategory('BUILDER_PREPARATION_FAILED'), 'INTERNAL_ERROR')
  assert.equal(builderFailureCategory('BUILDER_SOURCE_BASE_MOVED'), 'SOURCE_BASE_MOVED')
  assert.equal(builderFailureCategory('BUILDER_PREVIEW_NOT_BUILT'), 'PREVIEW_NOT_BUILT')
})

test('a stale base and a lost Preview reach the wire with their own codes', () => {
  const moved = projectBuilderRun(run('FAILED', 'BUILDER_SOURCE_BASE_MOVED'))
  assert.deepEqual([moved.failureCategory, moved.failureCode], ['SOURCE_BASE_MOVED', 'BUILDER_SOURCE_BASE_MOVED'])
  const unbuilt = projectBuilderRun(run('FAILED', 'BUILDER_PREVIEW_NOT_BUILT'))
  assert.deepEqual([unbuilt.failureCategory, unbuilt.failureCode], ['PREVIEW_NOT_BUILT', 'BUILDER_PREVIEW_NOT_BUILT'])
})

test('a source read code carrying the git container suffix names the preparation failure and stays off the wire', () => {
  const projected = projectBuilderRun(run('FAILED', 'BUILDER_SOURCE_READ_PATH_NOT_FOUND'))
  assert.equal(projected.failureCategory, 'ENVIRONMENT_PREPARATION_FAILED')
  assert.equal(projected.failureCode, null)
})

test('an unreachable application runner is the platform failing, not a build the author can repair', () => {
  const unreachable = projectBuilderRun(run('FAILED', 'APPLICATION_RUNNER_UNAVAILABLE'))
  assert.deepEqual([unreachable.failureCategory, unreachable.failureCode], ['ENVIRONMENT_PREPARATION_FAILED', 'APPLICATION_RUNNER_UNAVAILABLE'])
})

test('a generic prepare refusal is the platform failing too, same as an unreachable runner', () => {
  const refused = projectBuilderRun(run('FAILED', 'APPLICATION_SERVER_REFUSED'))
  assert.deepEqual([refused.failureCategory, refused.failureCode], ['ENVIRONMENT_PREPARATION_FAILED', 'APPLICATION_SERVER_REFUSED'])
})

test('a prepare refusal that names the Project\'s own compiled server tree is a build failure', () => {
  assert.equal(builderFailureCategory('SERVER_TREE_REFUSED'), 'APPLICATION_BUILD_FAILED')
  assert.equal(builderFailureCategory('MANIFEST_REFUSED'), 'APPLICATION_BUILD_FAILED')
})

test('a code nobody declared and a raw provider message are both internal errors', () => {
  assert.equal(builderFailureCategory('SOMETHING_NOBODY_DECLARED'), 'INTERNAL_ERROR')
  // service.ts turns any message that is not an uppercase snake code into BUILDER_PREPARATION_FAILED,
  // which is how "Bad Request" from a provider reaches the run row.
  assert.equal(builderFailureCategory('BUILDER_PREPARATION_FAILED'), 'INTERNAL_ERROR')
  assert.equal(builderFailureCategory(null), null)
})

test('the code a page that did not render is admitted with names the build, not an internal error', async () => {
  const { UNRENDERED_FAILURE_CODE } = await import(hubModuleUrl('builder/runtime.js'))
  assert.equal(builderFailureCategory(UNRENDERED_FAILURE_CODE), 'APPLICATION_BUILD_FAILED')
})

test('a run that spent its red finishes reads as a rejected result', () => {
  assert.equal(builderFailureCategory('BUILDER_APP_NOT_FIXED'), 'SOURCE_RESULT_REJECTED')
})

test("a candidate the Hub's check refuses reads as a rejected result (AC-9)", () => {
  assert.equal(builderFailureCategory('BUILDER_CHECK_FAILED'), 'SOURCE_RESULT_REJECTED')
})

test('no code outside the table reaches the wire', () => {
  assert.equal(projectBuilderRun(run('FAILED', 'SOMETHING_NOBODY_DECLARED')).failureCode, null)
  assert.equal(projectBuilderRun(run('FAILED', 'SOMETHING_NOBODY_DECLARED')).failureCategory, 'INTERNAL_ERROR')
  assert.equal(projectBuilderRun(run('FAILED', 'APPLICATION_SMOKE_FAILED')).failureCode, 'APPLICATION_SMOKE_FAILED')
  assert.equal(projectBuilderRun(run('SUCCEEDED', null)).failureCategory, null)
})

test('an interrupted run is a cancellation unless the Hub interrupted it, on a restart or a question unanswered for 7 days', () => {
  assert.equal(projectBuilderRun(run('INTERRUPTED', 'USER_CANCELLED')).failureCategory, 'RUN_CANCELLED')
  assert.equal(projectBuilderRun(run('INTERRUPTED', 'HUB_RESTART')).failureCategory, 'RUN_INTERRUPTED')
  assert.equal(projectBuilderRun(run('INTERRUPTED', 'HUB_RESTART')).failureCode, 'HUB_RESTART')
  const expired = projectBuilderRun(run('INTERRUPTED', 'BUILDER_RUN_PARKED_EXPIRED'))
  assert.deepEqual([expired.failureCategory, expired.failureCode], ['RUN_INTERRUPTED', 'BUILDER_RUN_PARKED_EXPIRED'])
})

test('the projection keeps the request text and the creation instant it was handed', () => {
  assert.deepEqual(projectBuilderRun(run('FAILED', 'BUILDER_MODEL_RATE_LIMITED')), {
    builderRunId: '90000000-0000-4000-8000-000000000001',
    projectId: '90000000-0000-4000-8000-000000000002',
    state: 'FAILED', phase: null, mode: 'BUILD', baseSourceRevision: 'a'.repeat(40),
    resultSourceRevision: null, resultKind: null,
    failureCode: 'BUILDER_MODEL_RATE_LIMITED', failureCategory: 'MODEL_RATE_LIMITED',
    requestText: 'Crie um contador', createdAt: '2026-09-20T12:00:00.000Z',
  })
})

test('the person reads why a run whose question went unanswered for 7 days ended, apart from a restart', async () => {
  const { failureReason } = await import('../../apps/web/src/features/builder/failure-reasons.ts')
  assert.deepEqual([failureReason(projectBuilderRun(run('INTERRUPTED', 'BUILDER_RUN_PARKED_EXPIRED'))), failureReason(projectBuilderRun(run('INTERRUPTED', 'HUB_RESTART')))], [
    'A pergunta do agente ficou 7 dias sem resposta, então a execução foi encerrada e o Project ficou livre. Envie o pedido novamente.',
    'O Conexus reiniciou durante a execução. Envie o pedido novamente.',
  ])
})
