import test from 'node:test'
import assert from 'node:assert/strict'

const { createMastraObservationMapper, notifyObservation } = await import('../../apps/hub/src/builder/runtime-observation.ts')
const { parseObservationEvent } = await import('../../packages/builder-observation/src/index.mjs')

const chunk = (type, payload = {}) => ({ type, payload })

test('maps text and repeated provider ids to ordered presentation blocks', () => {
  const mapper = createMastraObservationMapper()
  const events = [
    chunk('text-start', { id: 'provider-text-1' }),
    chunk('text-delta', { id: 'provider-text-1', text: 'first' }),
    chunk('text-end', { id: 'provider-text-1' }),
    chunk('tool-call', { toolCallId: 'provider-tool-1', toolName: 'readFile', args: { path: '/secret' } }),
    chunk('tool-result', { toolCallId: 'provider-tool-1', toolName: 'readFile', result: { success: true, contents: 'secret' } }),
    chunk('text-start', { id: 'provider-text-1' }),
    chunk('text-delta', { id: 'provider-text-1', text: 'second' }),
    chunk('text-end', { id: 'provider-text-1' }),
  ].flatMap((value) => mapper.map(value))

  assert.deepEqual(events, [
    { kind: 'TEXT_START', blockId: 'text-1' },
    { kind: 'TEXT_DELTA', blockId: 'text-1', text: 'first' },
    { kind: 'TEXT_END', blockId: 'text-1' },
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'READ_FILES', state: 'started' },
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'READ_FILES', state: 'succeeded' },
    { kind: 'TEXT_START', blockId: 'text-2' },
    { kind: 'TEXT_DELTA', blockId: 'text-2', text: 'second' },
    { kind: 'TEXT_END', blockId: 'text-2' },
  ])
  events.forEach((event, index) => { parseObservationEvent({ generation: 'generation-1', sequence: index + 1, event }) })
})

test('splits an implicit text occurrence after a tool boundary', () => {
  const mapper = createMastraObservationMapper()
  const events = [
    chunk('text-start', { id: 'reused' }),
    chunk('text-delta', { id: 'reused', text: 'before' }),
    chunk('tool-call', { toolCallId: 'tool-1', toolName: 'executeCommand', args: { command: 'pwd' } }),
    chunk('tool-result', { toolCallId: 'tool-1', toolName: 'executeCommand', result: { success: false } }),
    chunk('text-delta', { id: 'reused', text: 'after' }),
    chunk('text-end', { id: 'reused' }),
  ].flatMap((value) => mapper.map(value))

  assert.deepEqual(events, [
    { kind: 'TEXT_START', blockId: 'text-1' },
    { kind: 'TEXT_DELTA', blockId: 'text-1', text: 'before' },
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'RUN_COMMAND', state: 'started' },
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'RUN_COMMAND', state: 'failed' },
    { kind: 'TEXT_END', blockId: 'text-1' },
    { kind: 'TEXT_START', blockId: 'text-2' },
    { kind: 'TEXT_DELTA', blockId: 'text-2', text: 'after' },
    { kind: 'TEXT_END', blockId: 'text-2' },
  ])
  events.forEach((event, index) => { parseObservationEvent({ generation: 'generation-1', sequence: index + 1, event }) })
})

test('maps tool errors and isError without exposing provider data', () => {
  const mapper = createMastraObservationMapper()
  const events = [
    chunk('tool-call-input-streaming-start', { toolCallId: 'tool-approval', toolName: 'mysteryTool' }),
    chunk('tool-call-delta', { toolCallId: 'tool-approval', toolName: 'mysteryTool', argsTextDelta: '{"password":"nope"}' }),
    chunk('tool-result', { toolCallId: 'tool-approval', toolName: 'mysteryTool', result: { success: true }, isError: true }),
    chunk('tool-call', { toolCallId: 'tool-denied', toolName: 'writeFile', args: { content: 'private' } }),
    chunk('tool-result', { toolCallId: 'tool-denied', toolName: 'writeFile', result: { success: true }, isError: true }),
    chunk('tool-call', { toolCallId: 'tool-error', toolName: 'writeFile', args: { content: 'private' } }),
    chunk('tool-error', { toolCallId: 'tool-error', toolName: 'writeFile', error: { message: 'private error' } }),
  ].flatMap((value) => mapper.map(value))

  assert.deepEqual(events, [
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'WORKSPACE', state: 'started' },
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'WORKSPACE', state: 'failed' },
    { kind: 'ACTIVITY', activityId: 'activity-2', label: 'EDIT_FILES', state: 'started' },
    { kind: 'ACTIVITY', activityId: 'activity-2', label: 'EDIT_FILES', state: 'failed' },
    { kind: 'ACTIVITY', activityId: 'activity-3', label: 'EDIT_FILES', state: 'started' },
    { kind: 'ACTIVITY', activityId: 'activity-3', label: 'EDIT_FILES', state: 'failed' },
  ])
  events.forEach((event, index) => { parseObservationEvent({ generation: 'generation-1', sequence: index + 1, event }) })
  const serialized = JSON.stringify(events)
  for (const forbidden of ['tool-approval', 'mysteryTool', 'password', 'nope', 'private', 'private error']) {
    assert.equal(serialized.includes(forbidden), false, `observation disclosed ${forbidden}`)
  }
})

test('closes an active text block at terminal chunks and bounds large deltas', () => {
  const mapper = createMastraObservationMapper()
  const events = [
    chunk('text-start', { id: 'text-1' }),
    chunk('text-delta', { id: 'text-1', text: 'x'.repeat(65_537) }),
    chunk('error', { error: { message: 'provider secret' } }),
  ].flatMap((value) => mapper.map(value))

  assert.equal(events.at(-1)?.kind, 'TEXT_END')
  const deltas = events.filter((event) => event.kind === 'TEXT_DELTA')
  assert.equal(deltas.length, 2)
  assert.equal(deltas.every((event) => event.text.length <= 65_536), true)
  assert.equal(JSON.stringify(events).includes('provider secret'), false)
})

test('observer failures are swallowed at the observation boundary', () => {
  assert.doesNotThrow(() => notifyObservation(() => { throw new Error('observer failure') }, { kind: 'PHASE', phase: 'CODING' }))
  assert.doesNotThrow(() => notifyObservation(undefined, { kind: 'PHASE', phase: 'CODING' }))
})

test('unfinished tools are interrupted, never reported as successful', () => {
  const mapper = createMastraObservationMapper()
  mapper.map(chunk('tool-call', { toolCallId: 'unfinished', toolName: 'readFile' }))
  assert.deepEqual(mapper.finish(), [{ kind: 'ACTIVITY', activityId: 'activity-1', label: 'READ_FILES', state: 'interrupted' }])
  assert.deepEqual(mapper.finish(), [])
})
