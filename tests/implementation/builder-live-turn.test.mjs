import assert from 'node:assert/strict'
import test from 'node:test'
import { idleTurn, reduceTurn } from '../../apps/web/src/features/builder/live-turn.ts'

const event = (runId, payload) => ({ runId, kind: 'event', event: payload })

test('a run that switches mode and model is followed by the turn, in the controller\'s own event shapes', () => {
  const afterMode = reduceTurn(idleTurn, event('run-1', { type: 'mode_changed', modeId: 'build', previousModeId: 'plan' }))
  assert.deepEqual({ runId: afterMode.runId, mode: afterMode.mode, modelId: afterMode.modelId }, { runId: 'run-1', mode: 'build', modelId: null })
  const afterModel = reduceTurn(afterMode, event('run-1', { type: 'model_changed', modelId: 'openai/gpt-5.1', scope: 'thread' }))
  assert.deepEqual({ mode: afterModel.mode, modelId: afterModel.modelId }, { mode: 'build', modelId: 'openai/gpt-5.1' })
  const backToPlan = reduceTurn(afterModel, event('run-1', { type: 'mode_changed', modeId: 'plan', previousModeId: 'build' }))
  assert.equal(backToPlan.mode, 'plan')
})

test('another run starts from a turn with no mode or model of its own', () => {
  const first = reduceTurn(idleTurn, event('run-1', { type: 'mode_changed', modeId: 'build', previousModeId: 'plan' }))
  const second = reduceTurn(first, event('run-2', { type: 'agent_end', reason: 'complete' }))
  assert.deepEqual({ runId: second.runId, mode: second.mode, modelId: second.modelId, status: second.status }, { runId: 'run-2', mode: null, modelId: null, status: 'ENDED' })
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
