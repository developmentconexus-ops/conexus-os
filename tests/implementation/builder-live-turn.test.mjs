import assert from 'node:assert/strict'
import test from 'node:test'
import { idleTurn, reduceTurn } from '../../apps/web/src/features/builder/live-turn.ts'

const event = (runId, payload) => ({ runId, kind: 'event', event: payload })

test('the approval of a plan is an ordinary question with its two options', () => {
  const asked = reduceTurn(idleTurn, event('run-1', { type: 'tool_suspended', toolCallId: 'call1', toolName: 'ask_user', args: {}, suspendPayload: { question: 'Posso construir assim?', options: [{ label: 'Aprovar e construir' }, { label: 'Pedir ajustes' }] } }))
  assert.deepEqual(Object.values(asked.waiting).map((call) => [call.kind, call.prompt.question, call.prompt.options.map((option) => option.label)]), [['QUESTION', 'Posso construir assim?', ['Aprovar e construir', 'Pedir ajustes']]])
})

test('a page that subscribes while the run waits on the person gets the question card from the display state snapshot', () => {
  const snapshot = { type: 'display_state_changed', displayState: {
    activeTools: {}, tasks: [], pendingApproval: null,
    pendingSuspensions: { call1: { toolCallId: 'call1', toolName: 'ask_user', args: { question: 'Quais status?' }, suspendPayload: { question: 'Quais status?', options: [{ label: 'A' }] } } },
  } }
  const turn = reduceTurn(idleTurn, event('run-1', snapshot))
  assert.deepEqual(Object.values(turn.waiting).map((call) => [call.kind, call.toolCallId, call.toolName, call.prompt.question]), [['QUESTION', 'call1', 'ask_user', 'Quais status?']])
  const answered = reduceTurn(turn, event('run-1', { type: 'tool_end', toolCallId: 'call1', result: 'A', isError: false }))
  assert.deepEqual(answered.waiting, {})
})

test('a failed observation stays marked on the turn until an observation succeeds', () => {
  const failed = reduceTurn(idleTurn, event('run-1', { type: 'om_observation_failed', cycleId: 'c1', error: 'auth_unavailable: no auth available (providers=antigravity, model=gemini-3.6-flash-high)', durationMs: 5 }))
  assert.equal(failed.memoryFailed, 'observation')
  const reflectionEnded = reduceTurn(failed, event('run-1', { type: 'om_reflection_end', cycleId: 'c2', durationMs: 1, compressedTokens: 10 }))
  assert.equal(reflectionEnded.memoryFailed, 'observation')
  const observed = reduceTurn(failed, event('run-1', { type: 'om_observation_end', cycleId: 'c3', durationMs: 9, tokensObserved: 31000, observationTokens: 900 }))
  assert.equal(observed.memoryFailed, null)
})

test('a failed reflection and a failed background buffer are marked by what they were doing', () => {
  const reflection = reduceTurn(idleTurn, event('run-1', { type: 'om_reflection_failed', cycleId: 'c1', error: 'boom', durationMs: 5 }))
  assert.equal(reflection.memoryFailed, 'reflection')
  const buffering = reduceTurn(idleTurn, event('run-1', { type: 'om_buffering_failed', cycleId: 'c2', operationType: 'observation', error: 'boom' }))
  assert.equal(buffering.memoryFailed, 'observation')
  const buffered = reduceTurn(buffering, event('run-1', { type: 'om_buffering_end', cycleId: 'c3', operationType: 'observation', tokensBuffered: 100, bufferedTokens: 100 }))
  assert.equal(buffered.memoryFailed, null)
})

test('a question answered after the run stopped parked on it ends completed, not failed', () => {
  const state = (activeTools) => ({ type: 'display_state_changed', displayState: { activeTools, tasks: [], pendingApproval: null, pendingSuspensions: {} } })
  const ask = { name: 'ask_user', args: { questions: [] } }
  let turn = reduceTurn(idleTurn, event('run-1', state({ call1: { ...ask, status: 'running' } })))
  turn = reduceTurn(turn, event('run-1', { type: 'tool_suspended', toolCallId: 'call1', toolName: 'ask_user', args: {}, suspendPayload: {} }))
  turn = reduceTurn(turn, event('run-1', { type: 'agent_end', reason: 'suspended' }))
  turn = reduceTurn(turn, event('run-1', state({ call1: { ...ask, status: 'error' } })))
  assert.equal(turn.tools.call1.status, 'error')
  turn = reduceTurn(turn, event('run-1', state({})))
  turn = reduceTurn(turn, event('run-1', { type: 'tool_end', toolCallId: 'call1', result: { content: 'User answered: A' }, isError: false }))
  assert.equal(turn.tools.call1.status, 'completed')
  assert.equal(turn.tools.call1.isError, false)
  assert.deepEqual(turn.waiting, {})
})

test('a retryable error event is a retry in progress, not a failure, and it ends when the model speaks again', () => {
  const retrying = reduceTurn(idleTurn, event('run-1', { type: 'error', error: new Error('Service Unavailable'), retryable: true, retryDelay: 500, retryAttempt: 2, maxRetries: 10 }))
  assert.deepEqual([retrying.error, retrying.retrying], [null, { attempt: 2, maxRetries: 10 }])
  const spoke = reduceTurn(retrying, event('run-1', { type: 'message_start', message: { id: 'm1', role: 'assistant', createdAt: new Date(), content: { format: 2, parts: [] } } }))
  assert.deepEqual([spoke.error, spoke.retrying], [null, null])
})

test('an error event with no retry is the failure, and it replaces a retry in progress', () => {
  const retrying = reduceTurn(idleTurn, event('run-1', { type: 'error', error: new Error('Service Unavailable'), retryable: true, retryAttempt: 10, maxRetries: 10 }))
  const failed = reduceTurn(retrying, event('run-1', { type: 'error', error: new Error('Service Unavailable') }))
  assert.deepEqual([failed.error, failed.retrying], ['Service Unavailable', null])
})
