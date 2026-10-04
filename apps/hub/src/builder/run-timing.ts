/**
 * Where a Builder run's time goes outside the agent, one log event per run so the eval reads it
 * without a database column: `BUILDER_RUN_TIMING` with the run's ids and one `builder.stage.<stage>_ms`
 * field per stage, which telemetry exports as attributes.
 * A stage's time runs from the previous mark, so the marks partition the run and their sum is the
 * run's wall time. A stage the run never reached is left out of the line.
 */
const RUN_TIMING_STAGES = ['sandbox', 'seed', 'starter', 'session', 'agent', 'pull', 'admission', 'compile', 'publish'] as const
type RunTimingStage = (typeof RUN_TIMING_STAGES)[number]

export type RunTiming = Readonly<{
  /** Ends `stage` now. */
  mark(stage: RunTimingStage): void
  fields(run: Readonly<{ builderRunId: string; conversationId: string; projectId: string }>): Readonly<Record<string, string | number>>
}>

export const createRunTiming = (now: () => number = Date.now): RunTiming => {
  const elapsed = new Map<RunTimingStage, number>()
  let previous = now()
  return {
    mark(stage) {
      const current = now()
      elapsed.set(stage, (elapsed.get(stage) ?? 0) + Math.max(0, current - previous))
      previous = current
    },
    fields: ({ builderRunId, conversationId, projectId }) => ({
      'builder.run_id': builderRunId, 'builder.conversation_id': conversationId, 'builder.project_id': projectId,
      ...Object.fromEntries(RUN_TIMING_STAGES.flatMap((stage) => (elapsed.has(stage) ? [[`builder.stage.${stage}_ms`, elapsed.get(stage) ?? 0]] : []))),
    }),
  }
}
