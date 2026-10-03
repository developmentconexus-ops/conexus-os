import assert from 'node:assert/strict'
import test from 'node:test'
import { failureCodeText } from '../../apps/web/src/app/failure.ts'
import { viewRun } from '../../apps/web/src/features/builder/construir/run-state.ts'
import { hubModuleUrl } from './hub-build.mjs'

const { Failure, toFailure } = await import(hubModuleUrl('platform/failure.js'))
const { FAILURES } = await import(hubModuleUrl('platform/failures.generated.js'))

test('a run ends with the code of the Failure it threw, and a fault nobody named ends as the unexpected failure', () => {
  assert.equal(toFailure(new Failure('BUILDER_STARTER_ROOT_REFUSED')).id, 'BUILDER_STARTER_ROOT_REFUSED')
  const raw = new Error('connect ECONNRESET e2b.example')
  const failure = toFailure(raw)
  assert.equal(failure.id, 'INTERNAL_UNEXPECTED')
  assert.equal(failure.cause, raw)
})

test('a RAISE of a row code in our own database is that row, with the database error as its cause', () => {
  const raised = Object.assign(new Error('BUILDER_CHECK_FAILED'), { code: 'P0001' })
  assert.equal(toFailure(raised).id, 'BUILDER_CHECK_FAILED')
  assert.equal(toFailure(raised).cause, raised)
  assert.equal(toFailure(Object.assign(new Error('BUILDER_CHECK_FAILED'), { code: '23505' })).id, 'INTERNAL_UNEXPECTED')
  assert.equal(toFailure(Object.assign(new Error('SOMETHING_NOBODY_DECLARED'), { code: 'P0001' })).id, 'INTERNAL_UNEXPECTED')
})

test('every code a run can end with is a row, and a Conexus fault never tells the person to try again', () => {
  for (const code of ['BUILDER_AGENT_STALLED', 'BUILDER_AGENT_PLATFORM_FAILED', 'BUILDER_AGENT_TRIPWIRE', 'BUILDER_MODEL_CONTEXT_LENGTH', 'BUILDER_MODEL_CONTENT_FILTERED', 'HUB_RESTART', 'USER_CANCELLED', 'BUILDER_SOURCE_BASE_MOVED']) {
    assert.ok(Object.hasOwn(FAILURES, code), code)
  }
  assert.equal(FAILURES.BUILDER_AGENT_STALLED.category, 'SYSTEM')
  assert.doesNotMatch(failureCodeText('BUILDER_AGENT_STALLED'), /tente|novamente|de novo/i)
})

test('the page names a settled run by its code: the row for a known code, the unexpected failure for any other', () => {
  assert.equal(failureCodeText('BUILDER_SOURCE_BASE_MOVED'), 'O código do Projeto mudou enquanto esta execução trabalhava, então o resultado não foi aplicado e nada foi sobrescrito.')
  assert.equal(failureCodeText('SOMETHING_NOBODY_DECLARED'), 'O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.')
  assert.equal(failureCodeText(null), 'O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.')
})

const settled = (state, failureCode, extra = {}) => viewRun({ builderRunId: 'r', projectId: 'p', conversationId: 'c', state, phase: null, baseSourceRevision: 'a'.repeat(40), resultSourceRevision: null, resultKind: null, failureCode, requestText: null, createdAt: '2026-10-03T00:00:00.000Z', ...extra })

test('a settled run reads as stopped, discarded, moved or failed by its code, not by a category', () => {
  assert.equal(settled('INTERRUPTED', 'USER_CANCELLED').outcome, 'STOPPED')
  assert.equal(settled('INTERRUPTED', 'HUB_RESTART').outcome, 'DISCARDED')
  assert.equal(settled('INTERRUPTED', 'BUILDER_RUN_PARKED_EXPIRED').outcome, 'DISCARDED')
  assert.equal(settled('FAILED', 'BUILDER_SOURCE_BASE_MOVED').outcome, 'BASE_MOVED')
  assert.equal(settled('FAILED', 'BUILDER_MODEL_AUTH_FAILED').outcome, 'FAILED')
  assert.equal(settled('FAILED', 'BUILDER_MODEL_AUTH_FAILED', { cancellationRequested: true }).outcome, 'STOPPED')
})
