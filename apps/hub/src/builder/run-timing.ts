/**
 * Where a Builder run's time goes outside the agent, one log line per run so the eval reads it
 * without a database column: `BUILDER_RUN_TIMING:<runId>:sandbox=1200:seed=900:...` in milliseconds.
 * A stage's time runs from the previous mark, so the marks partition the run and their sum is the
 * run's wall time. A stage the run never reached is left out of the line.
 */
const RUN_TIMING_STAGES = ['sandbox', 'seed', 'starter', 'session', 'agent', 'pull', 'admission', 'compile', 'publish'] as const
type RunTimingStage = (typeof RUN_TIMING_STAGES)[number]

export type RunTiming = Readonly<{
  /** Ends `stage` now. */
  mark(stage: RunTimingStage): void
  line(builderRunId: string): string
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
    line: (builderRunId) => [
      `BUILDER_RUN_TIMING:${builderRunId}`,
      ...RUN_TIMING_STAGES.flatMap((stage) => (elapsed.has(stage) ? [`${stage}=${elapsed.get(stage)}`] : [])),
    ].join(':'),
  }
}
