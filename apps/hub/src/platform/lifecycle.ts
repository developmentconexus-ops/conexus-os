import { readdirSync } from 'node:fs'
import { Failure, logFailure } from './failure.js'
import { logLine, logger, recordFailure } from './logger.js'
import pg from 'pg'
import type { PostgresConnection, PostgresPool } from './postgres.js'

const SHUTDOWN_DEADLINE_MS = 15_000

/**
 * EX_CONFIG. A Hub that refuses to start because another Hub holds the database or the schema is
 * behind its code would refuse again on every retry, so a supervisor must not restart it. Units
 * name this code in RestartPreventExitStatus=.
 */
const REFUSED_START_EXIT_CODE = 78

const isRefusedStart = (error: unknown): boolean =>
  (error instanceof Failure && error.id === 'CONFIG_MISSING') || (error instanceof Error && /^(HUB_ALREADY_RUNNING|HUB_SCHEMA_BEHIND:)/.test(error.message))

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
  if (missing.length > 0) throw new Error(`HUB_SCHEMA_BEHIND:${missing.join(',')}`)
}

/**
 * One Hub per database. The session lock outlives every request and vanishes with the process, so
 * a Hub that cannot take it exits before recovery marks the live Hub's runs INTERRUPTED. It sits on
 * its own connection, not the pool's, so ending the pool at shutdown never waits on it.
 */
export const takeInstanceLock = async (connection: PostgresConnection): Promise<() => Promise<void>> => {
  const client = new pg.Client({ ...connection, application_name: 'conexus-hub:instance-lock' })
  client.on('error', () => logLine('HUB_POOL_ERROR:instance-lock:', 'error'))
  await client.connect()
  try {
    const { rows } = await client.query<{ taken: boolean }>("SELECT pg_try_advisory_lock(hashtext('conexus.hub.instance')) AS taken")
    if (rows[0]?.taken !== true) throw new Error('HUB_ALREADY_RUNNING')
  } catch (error) {
    await client.end()
    throw error
  }
  return () => client.end()
}

type ExitProcess = (code: number) => never

/** A rejection or exception nobody handled ends the Hub with one named line, never silently. */
export const installFatalHandlers = (exit: ExitProcess = (code) => process.exit(code)): void => {
  const fatal = (cause: 'unhandledRejection' | 'uncaughtException') => (error: unknown): never => {
    if (error instanceof Failure) logFailure(logger, error, { 'hub.fatal.cause': cause })
    else recordFailure(logger, 'HUB_FATAL', error, { 'hub.fatal.cause': cause })
    return exit(isRefusedStart(error) ? REFUSED_START_EXIT_CODE : 1)
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
      logLine(`HUB_SHUTDOWN_FORCED:${signal}`, 'error')
      exit(1)
    }
    closing = true
    logLine(`HUB_SHUTDOWN_STARTED:${signal}`)
    setTimeout(() => {
      logLine('HUB_SHUTDOWN_TIMEOUT', 'error')
      exit(1)
    }, deadlineMs)
    close().then(
      () => exit(0),
      (error: unknown) => {
        recordFailure(logger, 'HUB_SHUTDOWN_FAILED', error)
        exit(1)
      },
    )
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
}
