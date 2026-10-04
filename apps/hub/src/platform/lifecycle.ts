import { readdirSync } from 'node:fs'
import { Failure, logFailure, toFailure } from './failure.js'
import { logLine, logger } from './logger.js'
import pg from 'pg'
import type { PostgresConnection, PostgresPool } from './postgres.js'

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
const UNDEFINED_TABLE = '42P01'

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
export const assertSchemaCurrent = async (pool: Pick<PostgresPool, 'query'>, migrationsRoot: string): Promise<void> => {
  const applied = await pool.query<{ version: string }>('SELECT version FROM iam.schema_migration').then(
    (result) => new Set(result.rows.map((row) => row.version)),
    (error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === UNDEFINED_TABLE) return new Set<string>()
      throw error
    },
  )
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
export const takeInstanceLock = async (connection: PostgresConnection, onLost: (cause: unknown) => void): Promise<() => Promise<void>> => {
  const client = new pg.Client({ ...connection, application_name: 'conexus-hub:instance-lock' })
  let releasing = false
  let lost = false
  const lose = (cause: unknown): void => {
    if (releasing || lost) return
    lost = true
    onLost(cause)
  }
  client.on('error', (error) => {
    logFailure(logger, new Failure('HUB_POOL_ERROR', { cause: error }), { 'hub.capability': 'instance-lock' })
    lose(error)
  })
  client.on('end', () => { lose(new Error('the instance lock connection ended')) })
  await client.connect()
  try {
    const { rows } = await client.query<{ taken: boolean }>("SELECT pg_try_advisory_lock(hashtext('conexus.hub.instance')) AS taken")
    if (rows[0]?.taken !== true) throw new Failure('HUB_ALREADY_RUNNING')
  } catch (error) {
    releasing = true
    await client.end()
    throw error
  }
  return () => {
    releasing = true
    return client.end()
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
