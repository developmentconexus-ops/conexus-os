import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { CheckCommand, Identity } from './command.js'

/** The template's unprivileged user's home: the environment of every child the gate runs for it. */
const AGENT_HOME = '/home/conexus-agent'

/** What the process the check runs in tells it about itself, read once at the boundary. */
export type Host = Readonly<{ mainPath: string; uid: number; home: string | undefined; path: string | undefined }>

/** Where the work is: the checkout, the folder the build goes to, and the template's compiler. */
export type Place = Readonly<{ root: string; out: string; appRoot: string; compiler: string }>

/** The compiler lives beside the check: `<tools>/check/<sha256>/main.mjs` and `<tools>/compiler`. */
export const placeOf = (place: Readonly<{ root: string; out: string }>, host: Host): Place => ({
  root: resolve(place.root),
  out: resolve(place.out),
  appRoot: join(resolve(place.root), 'app'),
  compiler: join(dirname(host.mainPath), '..', '..', 'compiler'),
})

export type CheckContext = Place & Pick<CheckCommand, 'caller' | 'thumbnail' | 'templateRef' | 'limits'> & Readonly<{
  mainPath: string
  checkSha256: string
  /** Set when this process runs as root: every child drops to the agent's identity. */
  drop: Identity | null
  home: string
  /** Where the boot worker looks for the browser. */
  path: string
}>

export const checkContextOf = (command: CheckCommand, host: Host): CheckContext => {
  const drop = host.uid === command.agent.uid ? null : command.agent
  return {
    ...placeOf(command, host),
    caller: command.caller,
    thumbnail: command.thumbnail === null ? null : resolve(command.thumbnail),
    templateRef: command.templateRef,
    limits: command.limits,
    mainPath: host.mainPath,
    checkSha256: createHash('sha256').update(readFileSync(host.mainPath)).digest('hex'),
    drop,
    home: drop ? AGENT_HOME : host.home ?? AGENT_HOME,
    path: host.path ?? '/usr/local/bin:/usr/bin:/bin',
  }
}
