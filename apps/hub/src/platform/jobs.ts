import { Failure, logFailure } from './failure.js'
import { logger } from './logger.js'

export type Job = Readonly<{
  /** The job's name in its failure line. A label: nothing dispatches on it. */
  name: string
  /** The wait from the end of one pass to the start of the next. */
  everyMs: number
  /** One pass. It converges when repeated and stops at its next step once `signal` aborts. */
  run(signal: AbortSignal): Promise<void>
}>

export type Jobs = Readonly<{ close(): Promise<void> }>

/**
 * Runs each job: one pass at start, and the next `everyMs` after the previous pass settles, so a job
 * never overlaps itself. A rejected pass is one `JOB_FAILED` line and the next pass runs as usual.
 * `close()` aborts the signal the passes share, arms nothing more and settles after every pass in
 * flight, so what a pass reads can close after it.
 */
export const startJobs = (jobs: readonly Job[]): Jobs => {
  const stop = new AbortController()
  const timers = new Set<NodeJS.Timeout>()
  const passes = new Set<Promise<void>>()
  const pass = (job: Job): void => {
    const settled = (async () => { await job.run(stop.signal) })()
      .catch((cause: unknown) => { logFailure(logger, new Failure('JOB_FAILED', { cause, details: { job: job.name } })) })
      .then(() => {
        if (stop.signal.aborted) return
        const timer = setTimeout(() => { timers.delete(timer); pass(job) }, job.everyMs)
        timer.unref()
        timers.add(timer)
      })
    passes.add(settled)
    void settled.then(() => { passes.delete(settled) })
  }
  for (const job of jobs) pass(job)
  let closing: Promise<void> | undefined
  return Object.freeze({
    close: () => {
      closing ??= (async () => {
        stop.abort()
        for (const timer of timers) clearTimeout(timer)
        timers.clear()
        await Promise.all([...passes])
      })()
      return closing
    },
  })
}
