import test from 'node:test'
import assert from 'node:assert/strict'

const { createMastraSessionObservationProjector, notifyObservation } = await import('../../apps/hub/src/builder/runtime-observation.ts')
const { parseObservationEvent } = await import('../../packages/builder-observation/src/index.mjs')

test('projects native Session events into ordered safe presentation blocks', () => {
  const projector = createMastraSessionObservationProjector()
  const events = [
    { type: 'message_start', message: { id: 'message-1', role: 'assistant', content: { parts: [{ type: 'text', text: 'first' }] } } },
    { type: 'message_update', message: { id: 'message-1', role: 'assistant', content: { parts: [{ type: 'text', text: 'first' }] } } },
    { type: 'message_end', message: { id: 'message-1', role: 'assistant', content: { parts: [{ type: 'text', text: 'first' }] } } },
    { type: 'tool_start', toolCallId: 'provider-tool-1', toolName: 'mastra_workspace_read_file', args: { path: '/workspace/repo/app/src/main.tsx' } },
    { type: 'tool_end', toolCallId: 'provider-tool-1', toolName: 'mastra_workspace_read_file', result: { success: true }, isError: false },
    { type: 'message_start', message: { id: 'message-2', role: 'assistant', content: { parts: [{ type: 'text', text: 'second' }] } } },
    { type: 'message_end', message: { id: 'message-2', role: 'assistant', content: { parts: [{ type: 'text', text: 'second' }] } } },
  ].flatMap((event) => projector.map(event))

  assert.deepEqual(events, [
    { kind: 'TEXT_START', blockId: 'text-1' },
    { kind: 'TEXT_DELTA', blockId: 'text-1', text: 'first' },
    { kind: 'TEXT_END', blockId: 'text-1' },
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'READ_FILES', detail: 'app/src/main.tsx', state: 'started' },
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'READ_FILES', detail: 'app/src/main.tsx', state: 'succeeded' },
    { kind: 'TEXT_START', blockId: 'text-2' },
    { kind: 'TEXT_DELTA', blockId: 'text-2', text: 'second' },
    { kind: 'TEXT_END', blockId: 'text-2' },
  ])
  events.forEach((event, index) => {
    parseObservationEvent({ generation: 'generation-1', sequence: index + 1, event })
  })
})

test('keeps one activity row across a failed native tool call', () => {
  const projector = createMastraSessionObservationProjector()
  const events = [
    { type: 'tool_start', toolCallId: 'tool-1', toolName: 'mastra_workspace_execute_command', args: { command: 'pwd' } },
    { type: 'tool_end', toolCallId: 'tool-1', toolName: 'mastra_workspace_execute_command', result: { success: false }, isError: true },
  ].flatMap((event) => projector.map(event))

  assert.deepEqual(events, [
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'RUN_COMMAND', state: 'started' },
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'RUN_COMMAND', state: 'failed' },
  ])
})

test('maps native tool failures without exposing tool payloads', () => {
  const projector = createMastraSessionObservationProjector()
  const events = [
    { type: 'tool_start', toolCallId: 'tool-approval', toolName: 'mysteryTool', args: { password: 'nope' } },
    { type: 'tool_end', toolCallId: 'tool-approval', toolName: 'mysteryTool', result: { success: true }, isError: true },
    { type: 'tool_start', toolCallId: 'tool-denied', toolName: 'mastra_workspace_write_file', args: { content: 'private' } },
    { type: 'tool_end', toolCallId: 'tool-denied', toolName: 'mastra_workspace_write_file', result: { success: true }, isError: true, denied: true },
  ].flatMap((event) => projector.map(event))

  assert.deepEqual(events, [
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'WORKSPACE', state: 'started' },
    { kind: 'ACTIVITY', activityId: 'activity-1', label: 'WORKSPACE', state: 'failed' },
    { kind: 'ACTIVITY', activityId: 'activity-2', label: 'EDIT_FILES', state: 'started' },
    { kind: 'ACTIVITY', activityId: 'activity-2', label: 'EDIT_FILES', state: 'failed' },
  ])
  const serialized = JSON.stringify(events)
  for (const forbidden of ['tool-approval', 'mysteryTool', 'password', 'nope', 'private']) assert.equal(serialized.includes(forbidden), false)
})

test('closes native text at terminal events and bounds large deltas', () => {
  const projector = createMastraSessionObservationProjector()
  const events = [
    { type: 'message_start', message: { id: 'message-1', role: 'assistant', content: { parts: [{ type: 'text', text: '' }] } } },
    { type: 'message_update', message: { id: 'message-1', role: 'assistant', content: { parts: [{ type: 'text', text: 'x'.repeat(65_537) }] } } },
    { type: 'agent_end', reason: 'error' },
  ].flatMap((event) => projector.map(event))

  assert.equal(events.at(-1)?.kind, 'TEXT_END')
  const deltas = events.filter((event) => event.kind === 'TEXT_DELTA')
  assert.equal(deltas.length, 2)
  assert.equal(deltas.every((event) => event.text.length <= 65_536), true)
})

test('observer failures are swallowed at the observation boundary', () => {
  assert.doesNotThrow(() => notifyObservation(() => { throw new Error('observer failure') }, { kind: 'PHASE', phase: 'CODING' }))
  assert.doesNotThrow(() => notifyObservation(undefined, { kind: 'PHASE', phase: 'CODING' }))
})

test('unfinished tools are interrupted, never reported as successful', () => {
  const projector = createMastraSessionObservationProjector()
  projector.map({ type: 'tool_start', toolCallId: 'unfinished', toolName: 'mastra_workspace_read_file', args: {} })
  assert.deepEqual(projector.finish(), [{ kind: 'ACTIVITY', activityId: 'activity-1', label: 'READ_FILES', state: 'interrupted' }])
  assert.deepEqual(projector.finish(), [])
})
