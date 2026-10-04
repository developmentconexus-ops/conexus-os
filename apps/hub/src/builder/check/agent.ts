import { spawnSync } from 'node:child_process'
import type { Identity } from './command.js'

/** The template's unprivileged user, defined once: its name, home and numeric identity. */
export const AGENT_USER = 'conexus-agent'
export const AGENT_HOME = `/home/${AGENT_USER}`
export const AGENT_IDENTITY: Identity = Object.freeze({ uid: 1500, gid: 1500 })

/**
 * Ends every process of the agent's user. Only a check running as root can say so without killing
 * itself; one that already is the agent has nothing to end. It ends every process of the user, so a
 * second check running in the same VM at once would lose its children: a VM runs one check at a time.
 */
export const endAgentProcesses = ({ drop }: Readonly<{ drop: Identity | null }>): void => {
  if (drop) spawnSync('/bin/sh', ['-c', 'kill -KILL -1'], { ...drop, stdio: 'ignore' })
}
