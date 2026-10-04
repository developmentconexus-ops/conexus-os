import { Failure, logFailure } from '../platform/failure.js'
import { logger } from '../platform/logger.js'
import type { EventLog } from '../platform/logger.js'
import type { PausedConversationMachine } from './sandbox.js'

/**
 * A paused conversation machine nobody resumed for this long is deleted (spec 0002, B6). The files
 * stay in the conversation's branch mirror, so the limit decides speed and never loss.
 */
const IDLE_MACHINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type IdleMachineSweepPorts = Readonly<{
  listPaused(): Promise<readonly PausedConversationMachine[]>
  /** The conversations with a run that is queued or running, a run waiting on a question included. */
  openRunConversations(): Promise<ReadonlySet<string>>
  /** Kills the machines by provider id and answers the ones that are gone. */
  kill(providerSandboxIds: readonly string[]): Promise<readonly string[]>
  log: EventLog
  now?: () => number
}>

/**
 * Deletes the paused machines that are idle past the limit, unless their conversation has a run.
 * The run read comes after the E2B list and right before the kill, so a run that started meanwhile
 * keeps its machine. Safe to repeat: a deleted machine is no longer listed.
 */
const sweepIdleMachines = async ({ listPaused, openRunConversations, kill, log, now = Date.now }: IdleMachineSweepPorts, signal?: AbortSignal): Promise<number> => {
  const cutoff = now() - IDLE_MACHINE_MAX_AGE_MS
  const idle = (await listPaused()).filter((machine) => machine.idleSince.getTime() <= cutoff)
  if (idle.length === 0 || signal?.aborted) return 0
  const open = await openRunConversations()
  if (signal?.aborted) return 0
  const doomed = idle.filter((machine) => !open.has(machine.conversationId))
  const gone = new Set(await kill(doomed.map((machine) => machine.providerSandboxId)))
  for (const machine of doomed) {
    if (!gone.has(machine.providerSandboxId)) continue
    const idleDays = Math.floor((now() - machine.idleSince.getTime()) / 86_400_000)
    log('BUILDER_IDLE_MACHINE_DELETED', { conversation: machine.conversationId, machine: machine.providerSandboxId, idleDays })
  }
  return gone.size
}

const IDLE_MACHINE_SWEEP_INTERVAL_MS = 60 * 60 * 1000

/**
 * Sweeps once at boot and then every hour; a failed pass is logged and the next one tries again.
 * `close()` stops the timer, tells the pass in flight to stop at its next step, and settles after it,
 * so the pool it reads can end after it.
 */
export const scheduleIdleMachineSweep = (
  ports: IdleMachineSweepPorts,
  intervalMs = IDLE_MACHINE_SWEEP_INTERVAL_MS,
): Readonly<{ tick(): Promise<number>; close(): Promise<void> }> => {
  const inFlight = new Set<Promise<number>>()
  const stop = new AbortController()
  const tick = (): Promise<number> => {
    const pass = sweepIdleMachines(ports, stop.signal)
    inFlight.add(pass)
    const settled = (): void => { inFlight.delete(pass) }
    pass.then(settled, settled)
    return pass
  }
  const tickLogged = (): void => {
    tick().catch((error: unknown) => logFailure(logger, new Failure('BUILDER_IDLE_MACHINE_SWEEP_FAILED', { cause: error })))
  }
  tickLogged()
  const timer = setInterval(tickLogged, intervalMs)
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
