import assert from 'node:assert/strict'
import { test } from 'node:test'
import { trace } from '@opentelemetry/api'
import { tracing } from '@opentelemetry/sdk-node'
import { conversationId, harness, projectId, runId } from './builder-run-harness.mjs'

const exporter = new tracing.InMemorySpanExporter()
trace.setGlobalTracerProvider(new tracing.BasicTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(exporter)] }))

const SUSPENDED = { reason: 'suspended', userMessageId: 'user-message', toolCallId: 'c1' }

test('a run is one span from its claim to its last write, with a child span per phase, WAITING included, and an event when the wait starts (AC-13)', async (t) => {
  exporter.reset()
  const run = await harness(t, {
    answers: [(service) => service.answerQuestion({ projectId, conversationId, toolCallId: 'c1', resumeData: ['Azul'] })],
    turn: async ({ resume }) => (resume ? { reason: 'complete', userMessageId: 'user-message', summary: 'Pronto.' } : SUSPENDED),
  })
  await run.start()
  await run.service.close()
  const spans = exporter.getFinishedSpans()
  const runs = spans.filter((span) => span.name === 'builder.run')
  assert.equal(runs.length, 1)
  const [whole] = runs
  assert.deepEqual(whole.attributes, { 'builder.run_id': runId, 'builder.conversation_id': conversationId, 'builder.project_id': projectId, 'builder.ending': 'SETTLED' })
  const phases = spans.filter((span) => span.name === 'builder.phase')
  assert.deepEqual(phases.map((span) => span.attributes['builder.phase']).slice(0, 4), ['PREPARING', 'AGENT', 'WAITING', 'AGENT'])
  for (const phase of phases) {
    assert.equal(phase.parentSpanContext?.spanId, whole.spanContext().spanId, 'each phase is a child of the run')
    assert.equal(phase.attributes['builder.run_id'], runId)
  }
  const waiting = phases.find((span) => span.attributes['builder.phase'] === 'WAITING')
  const toNs = ([seconds, nanos]) => BigInt(seconds) * 1_000_000_000n + BigInt(nanos)
  assert.ok(toNs(waiting.endTime) >= toNs(waiting.startTime), 'the wait has its duration')
  assert.deepEqual(whole.events.map((event) => event.name), ['builder.waiting'])
})
