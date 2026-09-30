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
