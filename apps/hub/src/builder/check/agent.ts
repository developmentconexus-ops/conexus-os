import { spawnSync } from 'node:child_process'
import type { Identity } from './command.js'

/**
 * Ends every process of the agent's user. Only a check running as root can say so without killing
 * itself; one that already is the agent has nothing to end.
 */
export const endAgentProcesses = ({ drop }: Readonly<{ drop: Identity | null }>): void => {
  if (drop) spawnSync('/bin/sh', ['-c', 'kill -KILL -1'], { ...drop, stdio: 'ignore' })
}
