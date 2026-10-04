import { parseArgs } from 'node:util'
import { type ChildStepId, STEP_IDS, STEP_LIMIT_MS } from './report.js'

/** Who asks: the Hub's gate, which decides admission, or the agent's own tool, which decides nothing. */
export type Caller = 'gate' | 'tool'
export type Identity = Readonly<{ uid: number; gid: number }>
type StepLimits = Readonly<Record<ChildStepId, number>>
export type Worker = 'build' | 'server' | 'boot'

/** Where the work is: the checkout and the folder the build goes to. */
export type Tree = Readonly<{ root: string; out: string }>

/** Every way the check is started. A fourth kind is a compile error in `main.ts`. */
export type Command =
  | (Tree & Readonly<{ kind: 'CHECK'; caller: Caller; thumbnail: string | null; templateRef: string; agent: Identity; limits: StepLimits }>)
  | (Tree & Readonly<{ kind: 'SERVER' }>)
  | (Tree & Readonly<{ kind: 'WORKER'; worker: Worker }>)
export type CheckCommand = Extract<Command, { kind: 'CHECK' }>

export const USAGE = [
  'usage: main.mjs check --caller <gate|tool> --root <checkout> --out <dist> --template-ref <ref> --as <uid>:<gid> [--thumbnail <png>] [--limit <step>=<ms>]',
  '       main.mjs server --root <checkout> --out <dist>',
  '       main.mjs worker <build|server|boot> --root <checkout> --out <dist>',
].join('\n')

const OPTIONS = {
  root: { type: 'string' },
  out: { type: 'string' },
  caller: { type: 'string' },
  thumbnail: { type: 'string' },
  'template-ref': { type: 'string' },
  as: { type: 'string' },
  limit: { type: 'string', multiple: true },
} as const

const CHILD_STEPS = STEP_IDS.filter((id): id is ChildStepId => id !== 'generate')
const WORKERS: readonly Worker[] = ['build', 'server', 'boot']

const identityOf = (value: string | undefined): Identity | null => {
  if (!value || !/^\d+:\d+$/.test(value)) return null
  const [uid, gid] = value.split(':').map(Number)
  return uid === undefined || gid === undefined ? null : { uid, gid }
}

/** A `--limit step=ms` can only shorten the step's own limit. */
const limitsOf = (requested: readonly string[]): StepLimits | null => {
  const limits: Record<ChildStepId, number> = { ...STEP_LIMIT_MS }
  for (const entry of requested) {
    const [step, ms] = entry.split('=')
    const id = CHILD_STEPS.find((candidate) => candidate === step)
    const limit = Number(ms)
    if (!id || !Number.isInteger(limit) || limit < 1) return null
    limits[id] = Math.min(limits[id], limit)
  }
  return limits
}

const parseStrict = (argv: readonly string[]) => {
  try {
    return parseArgs({ args: [...argv], strict: true, allowPositionals: true, options: OPTIONS })
  } catch {
    return null
  }
}

/** The command line, parsed once: a Command, or null when it is not one of the three the check answers. */
export const parseCommand = (argv: readonly string[]): Command | null => {
  const parsed = parseStrict(argv)
  if (!parsed) return null
  const [kind, worker, ...extra] = parsed.positionals
  const { root, out, caller, thumbnail, as, limit } = parsed.values
  if (!root || !out || extra.length > 0) return null
  const place = { root, out }
  const check = [caller, thumbnail, parsed.values['template-ref'], as, limit]
  if (kind === 'server' && worker === undefined && check.every((value) => value === undefined)) return { kind: 'SERVER', ...place }
  if (kind === 'worker' && check.every((value) => value === undefined)) {
    const named = WORKERS.find((candidate) => candidate === worker)
    return named ? { kind: 'WORKER', worker: named, ...place } : null
  }
  const agent = identityOf(as)
  const limits = limitsOf(limit ?? [])
  const templateRef = parsed.values['template-ref']
  if (kind !== 'check' || worker !== undefined || (caller !== 'gate' && caller !== 'tool') || !agent || !limits || !templateRef) return null
  return { kind: 'CHECK', caller, thumbnail: thumbnail ?? null, templateRef, agent, limits, ...place }
}
