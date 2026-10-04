import type { EventLog } from '../platform/logger.js'
import type { PausedConversationMachine } from './sandbox.js'

/**
 * A paused conversation machine nobody resumed for this long is deleted (spec 0002, B6). The files
 * stay in the conversation's branch mirror, so the limit decides speed and never loss. This sweep
 * is for E2B's paused VMs; the live sessions have their own in `conversation.ts`.
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
 * keeps its machine. Safe to repeat: a deleted machine is no longer listed. The `idle-machines` job runs it every hour.
 */
export const sweepIdleMachines = async ({ listPaused, openRunConversations, kill, log, now = Date.now }: IdleMachineSweepPorts, signal: AbortSignal): Promise<number> => {
  const cutoff = now() - IDLE_MACHINE_MAX_AGE_MS
  const idle = (await listPaused()).filter((machine) => machine.idleSince.getTime() <= cutoff)
  if (idle.length === 0 || signal.aborted) return 0
  const open = await openRunConversations()
  if (signal.aborted) return 0
  const doomed = idle.filter((machine) => !open.has(machine.conversationId))
  const gone = new Set(await kill(doomed.map((machine) => machine.providerSandboxId)))
  for (const machine of doomed) {
    if (!gone.has(machine.providerSandboxId)) continue
    const idleDays = Math.floor((now() - machine.idleSince.getTime()) / 86_400_000)
    log('BUILDER_IDLE_MACHINE_DELETED', { conversation: machine.conversationId, machine: machine.providerSandboxId, idleDays })
  }
  return gone.size
}
