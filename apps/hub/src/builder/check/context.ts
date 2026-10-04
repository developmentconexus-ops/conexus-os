import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { AGENT_HOME } from './agent.js'
import type { CheckCommand, Identity, Tree } from './command.js'

/** What the process the check runs in tells it about itself, read once at the boundary. */
export type Host = Readonly<{ mainPath: string; uid: number; home: string | undefined; path: string | undefined }>

/** Where the work is: the checkout, the folder the build goes to, and the template's compiler. */
export type Place = Tree & Readonly<{ appRoot: string; compiler: string }>

/** The compiler lives beside the check: `<tools>/check/<sha256>/main.mjs` and `<tools>/compiler`. */
export const placeOf = (place: Readonly<{ root: string; out: string }>, host: Host): Place => ({
  root: resolve(place.root),
  out: resolve(place.out),
  appRoot: join(resolve(place.root), 'app'),
  compiler: join(dirname(host.mainPath), '..', '..', 'compiler'),
})

type Common = Place & Pick<CheckCommand, 'thumbnail' | 'templateRef' | 'limits'> & Readonly<{
  mainPath: string
  checkSha256: string
  home: string
  /** Where the boot worker looks for the browser. */
  path: string
}>

/**
 * Who runs the check decides what it may do, so the two callers are two shapes. The gate is root and
 * drops to the agent's identity for every child; the tool already is the agent and drops nothing.
 */
export type CheckContext =
  | (Common & Readonly<{ caller: 'gate'; drop: Identity }>)
  | (Common & Readonly<{ caller: 'tool'; drop: null }>)

/** The caller and the user the process runs as do not match: nothing runs. */
const CALLER_REFUSED = 'CHECK_CALLER_REFUSED'

export const checkContextOf = (command: CheckCommand, host: Host): CheckContext => {
  const common = {
    ...placeOf(command, host),
    thumbnail: command.thumbnail === null ? null : resolve(command.thumbnail),
    templateRef: command.templateRef,
    limits: command.limits,
    mainPath: host.mainPath,
    checkSha256: createHash('sha256').update(readFileSync(host.mainPath)).digest('hex'),
    path: host.path ?? '/usr/local/bin:/usr/bin:/bin',
  }
  if (command.caller === 'gate') {
    if (host.uid !== 0 || command.agent.uid === 0) throw new Error(`${CALLER_REFUSED}: the gate runs as root and names a user that is not root`)
    return { ...common, caller: 'gate', drop: command.agent, home: AGENT_HOME }
  }
  if (host.uid !== command.agent.uid) throw new Error(`${CALLER_REFUSED}: the tool runs as the agent's own user`)
  return { ...common, caller: 'tool', drop: null, home: host.home ?? AGENT_HOME }
}
