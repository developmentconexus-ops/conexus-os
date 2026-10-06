import { readdirSync } from 'node:fs'
import { Failure, logFailure, toFailure } from './failure.js'
import { logLine, logger } from './logger.js'
import type { Database } from './db.js'

const SHUTDOWN_DEADLINE_MS = 15_000

/**
 * EX_CONFIG. A Hub that refuses to start because another Hub holds the database or the schema is
 * behind its code would refuse again on every retry, so a supervisor must not restart it. Units
 * name this code in RestartPreventExitStatus=.
 */
const REFUSED_START_EXIT_CODE = 78

const REFUSED_START_CODES: ReadonlySet<string> = new Set(['CONFIG_MISSING', 'CONFIG_INVALID', 'HUB_ALREADY_RUNNING', 'HUB_SCHEMA_BEHIND'])

/** A start the operator must change something to allow exits 78; anything else that ends the Hub exits 1. */
const exitCodeOf = (error: unknown): number => (error instanceof Failure && REFUSED_START_CODES.has(error.id) ? REFUSED_START_EXIT_CODE : 1)

const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/

const migrationVersionsIn = (migrationsRoot: string): readonly string[] =>
  readdirSync(migrationsRoot).flatMap((name) => {
    const version = MIGRATION_FILE.exec(name)?.[1]
    return version ? [version] : []
  }).sort()

/**
 * The migration files that ship with this code are the schema it expects. A ledger missing any of
 * them means the database is behind, and every request that touches the missing change would fail
 * one by one, so the Hub refuses to serve instead. The ledger is written only by
 * scripts/run-hub-migrations.mjs, which the operator runs before starting the Hub.
 */
export const assertSchemaCurrent = async (database: Pick<Database, 'appliedMigrations'>, migrationsRoot: string): Promise<void> => {
  const applied = await database.appliedMigrations()
  const missing = migrationVersionsIn(migrationsRoot).filter((version) => !applied.has(version))
  if (missing.length > 0) throw new Failure('HUB_SCHEMA_BEHIND', { details: { versions: missing.join(',') } })
}

/**
 * One Hub per database. The session lock outlives every request and vanishes with the process, so
 * a Hub that cannot take it exits before recovery marks the live Hub's runs INTERRUPTED. It sits on
 * its own connection, not the pool's, so ending the pool at shutdown never waits on it. The lock
 * lives only as long as that connection: once it drops, another Hub may take the lock and the runs,
 * so `onLost` is told, once, unless the Hub let go of the lock itself.
 */
const deferred = () => {
  let resolve: () => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<void>((opened, failed) => { resolve = opened; reject = failed })
  return { promise, resolve, reject }
}

export const takeInstanceLock = async (database: Database, onLost: (cause: unknown) => void): Promise<() => Promise<void>> => {
  let releasing = false
  let lockAcquired = false
  const acquired = deferred()
  const release = deferred()
  const held = database.session('conexus-hub:instance-lock', async (lock) => {
    if (!await lock.tryAdvisoryLock(1_538_775_160n)) throw new Failure('HUB_ALREADY_RUNNING')
    lockAcquired = true
    acquired.resolve()
    await release.promise
  })
  held.catch((error: unknown) => {
    acquired.reject(error)
    if (lockAcquired && !releasing) {
      logFailure(logger, new Failure('HUB_POOL_ERROR', { cause: error }), { 'hub.capability': 'instance-lock' })
      onLost(error)
    }
  })
  await acquired.promise
  return async () => {
    releasing = true
    release.resolve()
    await held
  }
}

/** A Hub that lost its instance lock may already share the database with another: it stops serving at once. */
export const exitOnLostInstanceLock = (exit: ExitProcess = (code) => process.exit(code)) => (cause: unknown): void => {
  logFailure(logger, new Failure('HUB_INSTANCE_LOCK_LOST', { cause }))
  exit(1)
}

type ExitProcess = (code: number) => never

/** A Hub that cannot start logs the one line of why and exits. */
export const exitOnFailedStart = (error: unknown, exit: ExitProcess = (code) => process.exit(code)): never => {
  const failure = toFailure(error)
  logFailure(logger, failure)
  return exit(exitCodeOf(failure))
}

/** A rejection or exception nobody handled ends the Hub with one named line, never silently. */
export const installFatalHandlers = (exit: ExitProcess = (code) => process.exit(code)): void => {
  const fatal = (cause: 'unhandledRejection' | 'uncaughtException') => (error: unknown): never => {
    logFailure(logger, error instanceof Failure ? error : new Failure('HUB_FATAL', { cause: error }), { 'hub.fatal.cause': cause })
    return exit(exitCodeOf(error))
  }
  process.on('unhandledRejection', fatal('unhandledRejection'))
  process.on('uncaughtException', fatal('uncaughtException'))
}

/**
 * The first signal closes the Hub and exits 0. A close that fails or outlasts the deadline exits 1,
 * and so does a second signal; what a forced exit leaves RUNNING, the next boot's recovery interrupts.
 */
export const exitOnSignals = (
  close: () => Promise<void>,
  { deadlineMs = SHUTDOWN_DEADLINE_MS, exit = (code) => process.exit(code) }: Readonly<{ deadlineMs?: number; exit?: ExitProcess }> = {},
): void => {
  let closing = false
  const onSignal = (signal: NodeJS.Signals): void => {
    if (closing) {
      logFailure(logger, new Failure('HUB_SHUTDOWN_FORCED'), { 'hub.signal': signal })
      exit(1)
    }
    closing = true
    logLine('HUB_SHUTDOWN_STARTED', { signal })
    setTimeout(() => {
      logFailure(logger, new Failure('HUB_SHUTDOWN_TIMEOUT'))
      exit(1)
    }, deadlineMs)
    close().then(
      () => exit(0),
      (error: unknown) => {
        logFailure(logger, new Failure('HUB_SHUTDOWN_FAILED', { cause: error }))
        exit(1)
      },
    )
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
}
