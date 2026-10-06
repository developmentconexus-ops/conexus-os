import { type Attributes, type Span, SpanStatusCode, context, trace } from '@opentelemetry/api'
import type { BuilderRunPhase } from '../../generated/builder-run-vocabulary.js'
import type { BuilderRunId, ConversationId, ProjectId } from '@conexus/contract'

const tracer = trace.getTracer('conexus-builder')

/**
 * One run span from claim to last write, with a child span per phase; a wait starting is an event
 * on the run span.
 */
export const traceRun = (identity: Readonly<{ builderRunId: BuilderRunId; conversationId: ConversationId; projectId: ProjectId }>) => {
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
