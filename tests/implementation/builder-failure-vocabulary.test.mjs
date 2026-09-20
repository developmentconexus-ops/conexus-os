import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const output = mkdtempSync(resolve(root, 'apps/hub/builder-failure-vocabulary-build-'))
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--project', resolve(root, 'apps/hub/tsconfig.json'), '--noEmit', 'false', '--outDir', output], { cwd: root, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
test.after(() => rmSync(output, { recursive: true, force: true }))
const { builderFailureCategory, projectBuilderRun } = await import(pathToFileURL(resolve(output, 'builder/failure-vocabulary.js')).href)

const run = (state, failureCode) => ({
  builderRunId: '90000000-0000-4000-8000-000000000001',
  projectId: '90000000-0000-4000-8000-000000000002',
  state, phase: null, mode: 'BUILD', baseSourceRevision: 'a'.repeat(40),
  resultSourceRevision: null, resultKind: null, failureCode,
  requestText: 'Crie um contador', createdAt: '2026-09-20T12:00:00.000Z',
})

test('each public category is reachable from a real internal code', () => {
  assert.equal(builderFailureCategory('BUILDER_SOURCE_MATERIALIZATION_REFUSED'), 'ENVIRONMENT_PREPARATION_FAILED')
  assert.equal(builderFailureCategory('BUILDER_MODEL_AUTH_FAILED'), 'MODEL_CREDENTIAL_REFUSED')
  assert.equal(builderFailureCategory('BUILDER_MODEL_RATE_LIMITED'), 'MODEL_RATE_LIMITED')
  assert.equal(builderFailureCategory('BUILDER_MODEL_STREAM_FAILED'), 'MODEL_REQUEST_REFUSED')
  assert.equal(builderFailureCategory('BUILDER_RESULT_IDENTITY_REFUSED'), 'SOURCE_RESULT_REJECTED')
  assert.equal(builderFailureCategory('APPLICATION_COMPILATION_FAILED'), 'APPLICATION_BUILD_FAILED')
  assert.equal(builderFailureCategory('USER_CANCELLED'), 'RUN_CANCELLED')
  assert.equal(builderFailureCategory('BUILDER_PREPARATION_FAILED'), 'INTERNAL_ERROR')
})

test('a source code carrying the git container suffix names the preparation failure and stays off the wire', () => {
  const projected = projectBuilderRun(run('FAILED', 'BUILDER_SOURCE_BUNDLE_SOURCE_NOT_FOUND'))
  assert.equal(projected.failureCategory, 'ENVIRONMENT_PREPARATION_FAILED')
  assert.equal(projected.failureCode, null)
  assert.equal(builderFailureCategory('BUILDER_SOURCE_READ_PATH_NOT_FOUND'), 'ENVIRONMENT_PREPARATION_FAILED')
})

test('a code nobody declared and a raw provider message are both internal errors', () => {
  assert.equal(builderFailureCategory('SOMETHING_NOBODY_DECLARED'), 'INTERNAL_ERROR')
  // service.ts turns any message that is not an uppercase snake code into BUILDER_PREPARATION_FAILED,
  // which is how "Bad Request" from a provider reaches the run row.
  assert.equal(builderFailureCategory('BUILDER_PREPARATION_FAILED'), 'INTERNAL_ERROR')
  assert.equal(builderFailureCategory(null), null)
})

test('no code outside the table reaches the wire', () => {
  assert.equal(projectBuilderRun(run('FAILED', 'SOMETHING_NOBODY_DECLARED')).failureCode, null)
  assert.equal(projectBuilderRun(run('FAILED', 'SOMETHING_NOBODY_DECLARED')).failureCategory, 'INTERNAL_ERROR')
  assert.equal(projectBuilderRun(run('FAILED', 'APPLICATION_COMPILATION_FAILED')).failureCode, 'APPLICATION_COMPILATION_FAILED')
  assert.equal(projectBuilderRun(run('SUCCEEDED', null)).failureCategory, null)
})

test('an interrupted run is a cancellation unless the Hub restart interrupted it', () => {
  assert.equal(projectBuilderRun(run('INTERRUPTED', 'USER_CANCELLED')).failureCategory, 'RUN_CANCELLED')
  assert.equal(projectBuilderRun(run('INTERRUPTED', 'HUB_RESTART')).failureCategory, 'RUN_INTERRUPTED')
  assert.equal(projectBuilderRun(run('INTERRUPTED', 'HUB_RESTART')).failureCode, 'HUB_RESTART')
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
