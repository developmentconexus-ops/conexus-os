import { type Attributes, type Span, SpanStatusCode, context, trace } from '@opentelemetry/api'
import type { BuilderRunPhase } from '../../generated/builder-run-vocabulary.js'

const tracer = trace.getTracer('conexus-builder')

/**
 * A run as telemetry sees it: one span from its claim to its last write, the wait included, and one
 * child span per phase, so each phase has its duration. A wait starting is an event on the run span,
 * so a long wait shows before its phase span ends.
 */
export const traceRun = (identity: Readonly<{ builderRunId: string; conversationId: string; projectId: string }>) => {
  const attributes: Attributes = {
    'builder.run_id': identity.builderRunId, 'builder.conversation_id': identity.conversationId, 'builder.project_id': identity.projectId,
  }
  const run = tracer.startSpan('builder.run', { attributes })
  const parent = trace.setSpan(context.active(), run)
  let current: Span | undefined
  return Object.freeze({
    phase: (phase: BuilderRunPhase): void => {
      current?.end()
      current = tracer.startSpan('builder.phase', { attributes: { ...attributes, 'builder.phase': phase } }, parent)
      if (phase === 'WAITING') run.addEvent('builder.waiting')
    },
    end: (ending: string, failed: boolean): void => {
      current?.end()
      current = undefined
      run.setAttribute('builder.ending', ending)
      if (failed) run.setStatus({ code: SpanStatusCode.ERROR })
      run.end()
    },
  })
}
