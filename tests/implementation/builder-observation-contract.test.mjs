import assert from 'node:assert/strict'
import test from 'node:test'
import { parseObservationEvent } from '../../packages/builder-observation/src/index.mjs'

test('observation parses ordered text and refuses private or unrecognized payloads', () => {
  const input = { generation: 'g1', sequence: 1, event: { kind: 'TEXT_DELTA', blockId: 'b1', text: 'Olá' } }
  assert.deepEqual(parseObservationEvent(input), input)
  assert.throws(() => parseObservationEvent({ ...input, event: { ...input.event, toolResult: 'private' } }))
  assert.throws(() => parseObservationEvent({ ...input, sequence: 0 }))
  assert.throws(() => parseObservationEvent({ ...input, event: { kind: 'VERIFIED' } }))
  assert.throws(() => parseObservationEvent({ ...input, event: { kind: 'ACTIVITY', activityId: 'a1', label: 'raw-command', state: 'started' } }))
})
