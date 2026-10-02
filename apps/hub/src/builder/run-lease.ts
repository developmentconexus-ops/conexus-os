/** How often the Hub proves it still works the runs its legs hold. */
const RUN_HEARTBEAT_MS = 10_000
/** Every third heartbeat, so every 30 s, the Hub also takes over and settles the runs whose owner went quiet. */
const SWEEP_EVERY_HEARTBEATS = 3

export type RunLeasePorts = Readonly<{
  /** Refreshes the heartbeat of every run a leg of this Hub works. */
  heartbeat(): Promise<void>
  /** Takes over the runs whose heartbeat went stale and settles each. */
  sweep(): Promise<void>
  log(line: string): void
}>

/**
 * @public Tests import this at runtime from the built module.
 * The run ownership lease: a sweep at boot, a heartbeat every 10 s, and a sweep after every third.
 * A sweep runs after the heartbeat of its own tick, so a leg of this Hub is never stale to it, and
 * never beside another: a sweep that outlasts the interval would take its own unsettled runs again.
 * `close()` stops the timer, tells the pass in flight to skip its sweep, and settles after it, so
 * the pool it reads can end after it.
 */
export const scheduleRunLease = (ports: RunLeasePorts, heartbeatMs = RUN_HEARTBEAT_MS): Readonly<{ tick(sweep: boolean): Promise<void>; close(): Promise<void> }> => {
  const inFlight = new Set<Promise<void>>()
  const stop = new AbortController()
  let sweeping = false
  const tick = (sweep: boolean): Promise<void> => {
    const pass = (async () => {
      await ports.heartbeat()
      if (!sweep || stop.signal.aborted || sweeping) return
      sweeping = true
      try { await ports.sweep() } finally { sweeping = false }
    })()
    inFlight.add(pass)
    const settled = (): void => { inFlight.delete(pass) }
    pass.then(settled, settled)
    return pass
  }
  const tickLogged = (sweep: boolean): void => {
    tick(sweep).catch((error: unknown) => ports.log(`BUILDER_RUN_LEASE_FAILED:${error instanceof Error ? error.message : String(error)}`))
  }
  let beats = 0
  tickLogged(true)
  const timer = setInterval(() => {
    beats += 1
    tickLogged(beats % SWEEP_EVERY_HEARTBEATS === 0)
  }, heartbeatMs)
  timer.unref()
  return Object.freeze({
    tick,
    close: async () => {
      clearInterval(timer)
      stop.abort()
      await Promise.allSettled([...inFlight])
    },
  })
}
