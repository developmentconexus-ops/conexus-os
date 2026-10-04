import { chmodSync, chownSync, closeSync, constants, copyFileSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Identity } from './command.js'
import type { CheckContext } from './context.js'

/** Where the gate's cache lives: a folder only root can enter, so nothing the agent writes can reach it. */
const GATE_STORE = '/var/lib/conexus-check-cache'
const INFO_NAME = 'tsbuildinfo'
/** A build info file is a few megabytes; more than this is not one and is never stored. */
const MAX_INFO_BYTES = 64 * 1024 * 1024
const LOCK_WAIT_MS = 15_000
const LOCK_POLL_MS = 100
/** The gate does not run without its cache: a lock that stays taken fails the step with this code. */
const GATE_CACHE_LOCK_TIMEOUT = 'GATE_CACHE_LOCK_TIMEOUT'

export type CacheProject = 'app' | 'server'

/** The folder of one cache: keyed by the bundle's hash, who asks and which project, so no two keys share a file. */
export const cacheDirectory = (ctx: Pick<CheckContext, 'caller' | 'checkSha256' | 'home'>, project: CacheProject): string =>
  ctx.caller === 'gate'
    ? join(GATE_STORE, ctx.checkSha256, 'gate', project)
    : join(ctx.home, '.conexus-check-cache', ctx.checkSha256, 'tool', project)

const errnoOf = (error: unknown): unknown => (typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined)

const isAlive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true } catch (error) { return errnoOf(error) === 'EPERM' }
}

const holderOf = (path: string): number | null => {
  try { return Number(readFileSync(path, 'utf8')) || null } catch { return null }
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const createExclusive = (path: string): boolean => {
  try {
    const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    writeFileSync(fd, String(process.pid))
    closeSync(fd)
    return true
  } catch (error) {
    if (errnoOf(error) === 'EEXIST') return false
    throw error
  }
}

/**
 * Takes the lock file of one cache key, waiting for the check that holds it up to `waitMs`. A lock
 * whose holder is gone is removed and taken. That removal assumes one waiter per key, which holds
 * because a VM runs one check at a time: a stale lock exists only after a check died, and the next
 * check is the only one that finds it. Answers how to release it, or null when it was not free in time.
 */
const acquireLock = async (path: string, waitMs = LOCK_WAIT_MS): Promise<(() => void) | null> => {
  const deadline = Date.now() + waitMs
  for (;;) {
    if (createExclusive(path)) return () => rmSync(path, { force: true })
    if (Date.now() >= deadline) return null
    const holder = holderOf(path)
    if (holder !== null && !isAlive(holder)) rmSync(path, { force: true })
    else await pause(LOCK_POLL_MS)
  }
}

type Run<T> = (tsBuildInfoFile: string | null) => Promise<T>

/**
 * The agent tool's cache: a folder in the agent's own home, written by `tsc` as the agent. It never
 * decides admission, so the agent may forge it; the lock only keeps two checks from writing it at once.
 */
export const withToolCache = async <T>(directory: string, run: Run<T>): Promise<T> => {
  // The tool's cache decides nothing, so any trouble with its folder or lock means checking without it.
  let release: (() => void) | null
  try {
    mkdirSync(directory, { recursive: true })
    release = await acquireLock(`${directory}.lock`)
  } catch {
    return run(null)
  }
  if (!release) return run(null)
  try { return await run(join(directory, INFO_NAME)) } finally { release() }
}

/** Reads a build info file the agent's `tsc` wrote, refusing anything but a plain file of a sane size. */
const readBackInfo = (path: string): Buffer | null => {
  let fd: number
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW) } catch { return null }
  try {
    const stat = fstatSync(fd)
    return stat.isFile() && stat.size <= MAX_INFO_BYTES ? readFileSync(fd) : null
  } finally { closeSync(fd) }
}

/**
 * The gate's cache, which only root writes. Under the lock for its key: every process of the agent's
 * user is ended; a copy of the stored build info goes into a fresh folder the agent's user owns;
 * `run` (the `tsc` child) uses that copy; every process of the agent's user is ended again; and the
 * updated copy is read as root and stored back, owned by root. Nothing of the agent's user runs
 * between the copy out and the copy back except `tsc`, so a build info the agent forged earlier is
 * never read, and one it forges during the lend is never kept past the next lend's first sweep.
 */
export const withGateCache = async <T>(
  input: Readonly<{ store: string; agent: Identity; sweep(): void }>,
  run: Run<T>,
): Promise<T> => {
  // A store that cannot be made or a lock that is not free is a broken VM, not a reason to check without the cache.
  mkdirSync(input.store, { recursive: true, mode: 0o700 })
  const release = await acquireLock(`${input.store}.lock`)
  if (!release) throw new Error(`${GATE_CACHE_LOCK_TIMEOUT}: ${input.store}`)
  // The same path for every lend of one key: the build info records its own distance to the sources.
  const lend = join(tmpdir(), `conexus-lend-${createHash('sha256').update(input.store).digest('hex').slice(0, 16)}`)
  try {
    input.sweep()
    rmSync(lend, { recursive: true, force: true })
    mkdirSync(lend, { mode: 0o700 })
    const stored = join(input.store, INFO_NAME)
    const lent = join(lend, INFO_NAME)
    if (existsSync(stored)) { copyFileSync(stored, lent); chownSync(lent, input.agent.uid, input.agent.gid) }
    chownSync(lend, input.agent.uid, input.agent.gid)
    chmodSync(lend, 0o700)
    const result = await run(lent)
    input.sweep()
    const updated = readBackInfo(lent)
    // An unchanged build info is not written back: the store keeps its file, and its date says so.
    if (updated && !(existsSync(stored) && readFileSync(stored).equals(updated))) {
      const next = join(input.store, `.${randomUUID()}`)
      writeFileSync(next, updated, { mode: 0o600 })
      renameSync(next, stored)
    }
    return result
  } finally {
    rmSync(lend, { recursive: true, force: true })
    release()
  }
}
