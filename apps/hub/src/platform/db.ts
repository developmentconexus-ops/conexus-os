import pg from 'pg'
import type { Pool, PoolClient, PoolConfig, QueryConfig } from 'pg'
import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import type { AccountId } from '@conexus/contract'
import { Failure, logFailure, type FailureCode } from './failure.js'
import { fieldOf } from './field-of.js'
import { logger } from './logger.js'
import { codeOfSql } from './sql-lexer.js'
import { readSecretFile } from './secret-file.js'
import { CAPABILITY_BY_ROLE } from './hub-roles.generated.js'

const sqlBrand: unique symbol = Symbol('sql')
const factoryBrand: unique symbol = Symbol('factory-pool')

export type Mode = 'read' | 'write'
export type Sql = Readonly<{ [sqlBrand]: true; text: string; values: readonly unknown[] }>
export type DatabaseConnection = Readonly<{ host: string; port: number; database: string; user: 'hub_runtime' | 'hub_factory'; passwordFile: string; max?: number; connectionTimeoutMillis?: number; options?: string }>
export type JobName = 'iam-reaper' | 'project-purge' | 'builder-executor' | 'application-presence'
/** The application_name of a dedicated session connection, so a test or an operator finds its backend. */
type SessionName = 'conexus-hub:instance-lock' | 'conexus-hub:application-presence' | 'conexus-hub:project-deletion'
export type FactoryPool = Pool & Readonly<{ [factoryBrand]: true }>
export type PostgresConnection = PoolConfig

const identifier = (name: string): Sql => ({ [sqlBrand]: true, text: `"${name.replaceAll('"', '""')}"`, values: [] })
const isSql = (value: unknown): value is Sql => typeof value === 'object' && value !== null && sqlBrand in value && value[sqlBrand] === true
/** @public Frozen by spec 0015 section 3; the HTTP edge makes one, only a Digest reaches a token lookup. */
export const RawToken = z.string().min(1).brand<'RawToken'>()
/** @public Frozen by spec 0015 section 3. */
export type RawToken = z.output<typeof RawToken>
/** The SHA-256 of a RawToken, as a column stores it; its schema reads one back from a row. */
export const Digest = z.instanceof(Buffer).refine((bytes) => bytes.length === 32).brand<'Digest'>()
/** @public Frozen by spec 0015 section 3. */
export type Digest = z.output<typeof Digest>
/** @public Frozen by spec 0015 section 3; the one way to a Digest. */
export const digest = (raw: RawToken): Digest => Digest.parse(createHash('sha256').update(raw).digest())
type NoRawToken<V extends readonly unknown[]> = { readonly [K in keyof V]: V[K] extends RawToken ? never : V[K] }

export const sql = Object.assign(<V extends readonly unknown[]>(strings: TemplateStringsArray, ...interpolations: V & NoRawToken<V>): Sql => {
  const values: unknown[] = []
  let text = strings[0] ?? ''
  const given: readonly unknown[] = interpolations
  for (const [index, value] of given.entries()) {
    if (isSql(value)) {
      const offset = values.length
      text += value.text.replace(/\$(\d+)/g, (_match, position: string) => `$${Number(position) + offset}`)
      values.push(...value.values)
    } else {
      values.push(value)
      text += `$${values.length}`
    }
    text += strings[index + 1] ?? ''
  }
  return { [sqlBrand]: true, text, values }
}, { identifier })

const ALLOWED_FIRST_KEYWORD = /^(?:select|insert|update|delete|with)\b/
const READ_FIRST_KEYWORD = /^(?:select|with)\b/
const WRITE_OR_LOCK_WORDS = /\b(?:insert|update|delete|merge)\b|\bfor (?:update|share|no key update|key share)\b/

const lowered = (code: string): string => code.toLowerCase().replace(/\s+/g, ' ').trim()

/** The composed text of every executed statement may only select, insert, update, delete or run a CTE; see spec 0015, admission section 4.1. */
const refuseSqlText = (statement: Sql, mode: Mode): void => {
  const code = codeOfSql(statement.text)
  const text = code === null ? null : lowered(code)
  const statements = text === null ? [] : text.split(';').map((part) => part.trim()).filter((part) => part !== '')
  if (text === null || statements.length === 0 || statements.some((part) => !ALLOWED_FIRST_KEYWORD.test(part))
    || (mode === 'read' && (statements.some((part) => !READ_FIRST_KEYWORD.test(part)) || WRITE_OR_LOCK_WORDS.test(text)))) {
    throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'SQL_TEXT_REFUSED' } })
  }
}

export interface TxQueries {
  readonly accountId: AccountId | null
  rows<S extends z.ZodType>(schema: S, query: Sql): Promise<readonly z.output<S>[]>
  one<S extends z.ZodType>(schema: S, query: Sql, missing: FailureCode): Promise<z.output<S>>
  maybe<S extends z.ZodType>(schema: S, query: Sql): Promise<z.output<S> | null>
}

/** A read transaction. Its mode is a literal, so a command's WriteTx is never accepted where a read admission takes one. */
export interface ReadTx extends TxQueries {
  readonly mode: 'read'
}

export interface WriteTx extends TxQueries {
  readonly mode: 'write'
  run(query: Sql): Promise<number>
}

/** Nominal and without a query method, so a command can do nothing before admission opens it. */
class Gate {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: type identity is the use
  readonly #gate = true
  readonly mode = 'write' as const
}
/** Nominal and without a query method, so a read can do nothing before admission opens it. */
class ReadDoor {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: type identity is the use
  readonly #readGate = true
  readonly mode = 'read' as const
}
/** Nominal like Gate, and a separate class, so no command admission accepts it; identity-access/authentication.ts holds its lookups. */
class AuthGate {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: type identity is the use
  readonly #authentication = true
  readonly mode = 'write' as const
}
export type CommandGate = Gate
export type ReadGate = ReadDoor
export type AuthenticationGate = AuthGate
type Actor =
  | Readonly<{ kind: 'account'; accountId: AccountId }>
  | Readonly<{ kind: 'job'; job: JobName }>
  | Readonly<{ kind: 'authentication'; accountId: AccountId | null }>
const opened = new WeakMap<Gate | AuthGate, Readonly<{ tx: WriteTx; actor: Actor }>>()
const openedReads = new WeakMap<ReadDoor, ReadTx>()

/** Importable only by identity-access/admission.ts and authentication.ts: the transaction and the actor a gate was opened with. */
export const openGate = (gate: CommandGate | AuthenticationGate): Readonly<{ tx: WriteTx; actor: Actor }> => {
  const record = opened.get(gate)
  if (!record) throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'GATE_UNKNOWN' } })
  return record
}

/** Importable only by identity-access/admission.ts: the read transaction a read gate was opened with. */
export const openReadGate = (gate: ReadGate): ReadTx => {
  const tx = openedReads.get(gate)
  if (!tx) throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'GATE_UNKNOWN' } })
  return tx
}

/**
 * Importable only by identity-access/authentication.ts: the account a lookup found becomes the gate's actor, once.
 * @public Frozen by spec 0015 part iam section 5.
 */
export const bindAccount = (gate: AuthenticationGate, accountId: AccountId): void => {
  const record = opened.get(gate)
  if (!record) throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'GATE_UNKNOWN' } })
  const { actor } = record
  if (actor.kind !== 'authentication' || (actor.accountId !== null && actor.accountId !== accountId)) {
    throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'GATE_ACTOR_REFUSED' } })
  }
  opened.set(gate, { tx: record.tx, actor: { kind: 'authentication', accountId } })
}

type SessionLock = Readonly<{
  tryAdvisoryLock(key: bigint): Promise<boolean>
  advisoryLockShared(key: bigint): Promise<void>
}>
export interface Database {
  transaction<T>(accountId: AccountId, fn: (gate: CommandGate) => Promise<T>): Promise<T>
  read<T>(accountId: AccountId, fn: (gate: ReadGate) => Promise<T>): Promise<T>
  system<T>(job: JobName, fn: (gate: CommandGate) => Promise<T>): Promise<T>
  authenticate<T>(fn: (gate: AuthenticationGate) => Promise<T>): Promise<T>
  /** Runs fn on a dedicated connection; its locks end with it, and `lost` aborts when it ends before fn does. */
  session<T>(name: SessionName, fn: (lock: SessionLock, lost: AbortSignal) => Promise<T>): Promise<T>
  /** The migration versions the ledger records, read as the login role, which keeps SELECT on the ledger alone; none before the ledger exists. */
  appliedMigrations(): Promise<ReadonlySet<string>>
  close(): Promise<void>
}

type DatabaseFailureRule = Readonly<{ sqlstate: string; constraint: string | null; failure: FailureCode }>
/** @public Frozen by spec 0015 section 3; each part adds its constraints. */
export const DATABASE_FAILURES: readonly DatabaseFailureRule[] = Object.freeze([
  { sqlstate: '23503', constraint: 'workspace_membership_workspace_id_fkey', failure: 'WORKSPACE_NOT_FOUND' },
  // A Preview launch whose Hub session was signed out after the request resolved it.
  { sqlstate: '23503', constraint: 'handoff_parent_pair_fkey', failure: 'AUTHENTICATION_REQUIRED' },
  // lock_timeout and statement_timeout on hub_runtime: one named 503 for a wait or a statement that ran out of time.
  { sqlstate: '55P03', constraint: null, failure: 'DATABASE_BUSY' },
  { sqlstate: '57014', constraint: null, failure: 'DATABASE_BUSY' },
])

export const errorCode = (error: unknown): string | undefined => {
  const code = fieldOf(error, 'code')
  return typeof code === 'string' ? code : undefined
}

const databaseFailure = (error: unknown): Failure | unknown => {
  if (!(error instanceof pg.DatabaseError)) return error
  const rule = DATABASE_FAILURES.find((entry) => entry.sqlstate === error.code && entry.constraint === error.constraint)
    ?? DATABASE_FAILURES.find((entry) => entry.sqlstate === error.code && entry.constraint === null)
  // The SQLSTATE and the names of our own constraint and table, never the message: it can carry a row's values.
  const details = Object.fromEntries(Object.entries({ sqlstate: error.code, constraint: error.constraint, table: error.table }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  return new Failure(rule?.failure ?? 'INTERNAL_UNEXPECTED', { cause: error, details })
}

const CONNECT_TIMEOUT_MS = 5000
const Taken = z.object({ taken: z.boolean() })

const openPool = (connection: PoolConfig): Pool => {
  const capability = connection.user ? CAPABILITY_BY_ROLE[connection.user] ?? connection.user : 'unlabelled'
  const pool = new pg.Pool({ ...connection, application_name: `conexus-hub:${capability}`, max: connection.max ?? 20, connectionTimeoutMillis: connection.connectionTimeoutMillis ?? CONNECT_TIMEOUT_MS })
  pool.on('connect', (client) => {
    client.on('error', (error) => logFailure(logger, new Failure('HUB_POOL_ERROR', { cause: error }), { 'hub.capability': capability, 'db.error_code': errorCode(error) ?? '' }))
  })
  pool.on('error', () => undefined)
  return pool
}

// pg sends a query with no values on the simple protocol, which accepts several statements.
// queryMode is supported by pg 8 but missing from its types, so the config is typed here.
const extendedQuery = (statement: Sql): QueryConfig & { readonly queryMode: 'extended' } =>
  ({ text: statement.text, values: [...statement.values], queryMode: 'extended' })

const transactionView = (client: PoolClient, mode: Mode) => {
  let active = true
  const query = async (statement: Sql) => {
    if (!active) throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'TRANSACTION_ENDED' } })
    refuseSqlText(statement, mode)
    try { return await client.query(extendedQuery(statement)) }
    catch (error) { throw databaseFailure(error) }
  }
  const rows: ReadTx['rows'] = async (schema, statement) => (await query(statement)).rows.map((row: unknown) => schema.parse(row))
  const one: ReadTx['one'] = async (schema, statement, missing) => {
    const found = await rows(schema, statement)
    const row = found[0]
    if (row === undefined) throw new Failure(missing)
    if (found.length !== 1) throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'MULTIPLE_ROWS' } })
    return row
  }
  const maybe: ReadTx['maybe'] = async (schema, statement) => (await rows(schema, statement))[0] ?? null
  const execute: WriteTx['run'] = async (statement) => (await query(statement)).rowCount ?? 0
  return {
    rows,
    one,
    maybe,
    execute,
    end: () => { active = false },
  }
}

const readView = (client: PoolClient, accountId: AccountId | null) => {
  const { rows, one, maybe, end } = transactionView(client, 'read')
  return { mode: 'read' as const, accountId, rows, one, maybe, end }
}

/**
 * A read view of a write transaction: it only selects, so it cannot write and takes no row lock.
 * A SQL function that writes, called from a SELECT, is not stopped here; the server's grants decide that.
 */
export const readOnlyView = (tx: WriteTx): ReadTx => {
  const check = (statement: Sql): Sql => { refuseSqlText(statement, 'read'); return statement }
  return {
    mode: 'read',
    accountId: tx.accountId,
    rows: (schema, statement) => tx.rows(schema, check(statement)),
    one: (schema, statement, missing) => tx.one(schema, check(statement), missing),
    maybe: (schema, statement) => tx.maybe(schema, check(statement)),
  }
}

const writeView = (client: PoolClient, accountId: AccountId | null) => {
  const { rows, one, maybe, execute, end } = transactionView(client, 'write')
  return { mode: 'write' as const, accountId, rows, one, maybe, run: execute, end }
}

const gateFor = (tx: WriteTx, actor: Actor): CommandGate => {
  const gate = new Gate()
  opened.set(gate, { tx, actor })
  return gate
}

const readGateFor = (tx: ReadTx): ReadGate => {
  const gate = new ReadDoor()
  openedReads.set(gate, tx)
  return gate
}

const authenticationGateFor = (tx: WriteTx): AuthenticationGate => {
  const gate = new AuthGate()
  opened.set(gate, { tx, actor: { kind: 'authentication', accountId: null } })
  return gate
}

type Entry = Readonly<{ begin: string }>
const READ_ENTRY = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'

const entered = new AsyncLocalStorage<true>()
// Connection options name settings the server applies to every session. Only these are allowed; a
// role, a session authorization or a conexus.* setting would change what every transaction is.
const ALLOWED_OPTION_SETTINGS: readonly string[] = ['search_path']
const optionSettings = (options: string): readonly string[] | null => {
  const names: string[] = []
  const tokens = options.trim().split(/\s+/).filter((token) => token !== '')
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? ''
    const setting = token === '-c' ? tokens[++index] : token.startsWith('-c') ? token.slice(2) : token.startsWith('--') ? token.slice(2) : undefined
    if (setting === undefined) return null
    names.push((setting.split('=')[0] ?? '').toLowerCase().replaceAll('-', '_'))
  }
  return names
}
// pg reads PGOPTIONS when the config leaves options unset, so the options checked are the ones the
// pool is given explicitly: the environment's value goes through the allow list like the config's.
const checkedConnection = (connection: DatabaseConnection): DatabaseConnection => {
  // biome-ignore lint/style/noProcessEnv: pg reads PGOPTIONS itself, so the pool must check the same variable.
  const options = connection.options ?? process.env.PGOPTIONS
  if (options === undefined) return connection
  const names = optionSettings(options)
  if (names === null || names.some((name) => !ALLOWED_OPTION_SETTINGS.includes(name))) {
    throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'POOL_OPTION_REFUSED' } })
  }
  return { ...connection, options }
}

const UNDEFINED_TABLE = '42P01'

export const openDatabase = (given: DatabaseConnection): Database => {
  const connection = checkedConnection(given)
  const pool = openPool({ ...connection, password: readSecretFile(connection.passwordFile) })
  const transact = async <T, V extends TxQueries>(entry: Entry, view: (client: PoolClient) => V & { end(): void }, fn: (tx: V) => Promise<T>): Promise<T> => {
    if (entered.getStore()) throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'NESTED_TRANSACTION' } })
    const client = await pool.connect()
    let discard: Error | undefined
    let started = false
    const tx = view(client)
    try {
      await client.query(entry.begin)
      started = true
      const value = await entered.run(true, () => fn(tx))
      tx.end()
      await client.query('COMMIT')
      return value
    } catch (error) {
      tx.end()
      if (started) await client.query('ROLLBACK').catch((rollbackError: unknown) => {
        discard = rollbackError instanceof Error ? rollbackError : new Error('ROLLBACK failed')
      })
      throw databaseFailure(error)
    } finally {
      tx.end()
      client.release(discard)
    }
  }
  const database: Database = {
    transaction: (accountId, fn) => transact({ begin: 'BEGIN' }, (client) => writeView(client, accountId),
      (tx) => fn(gateFor(tx, { kind: 'account', accountId }))),
    read: (accountId, fn) => transact({ begin: READ_ENTRY }, (client) => readView(client, accountId), (tx) => fn(readGateFor(tx))),
    system: (job, fn) => transact({ begin: 'BEGIN' }, (client) => writeView(client, null),
      (tx) => fn(gateFor(tx, { kind: 'job', job }))),
    // READ COMMITTED like transaction: a one use DELETE ... RETURNING raced by another session returns no row instead of 40001.
    authenticate: (fn) => transact({ begin: 'BEGIN' }, (client) => writeView(client, null),
      (tx) => fn(authenticationGateFor(tx))),
    session: async (name, fn) => {
      const client = new pg.Client({
        ...connection, password: readSecretFile(connection.passwordFile), application_name: name,
        connectionTimeoutMillis: connection.connectionTimeoutMillis ?? CONNECT_TIMEOUT_MS,
      })
      try { await client.connect() }
      catch (error) { throw databaseFailure(error) }
      // Armed only once connected: a refused connect rejects above and leaves no listener to fire later.
      const aborter = new AbortController()
      const lost = new Promise<never>((_resolve, reject) => {
        const end = (cause: unknown) => {
          aborter.abort(cause)
          reject(cause)
        }
        client.on('error', end)
        client.on('end', () => end(new Error(`${name} connection ended`)))
      })
      // The login role's lock_timeout bounds the blocking wait; its 55P03 answers DATABASE_BUSY like a transaction's.
      const lockQuery = async (text: string, key: bigint): Promise<unknown> => {
        try { return (await client.query(text, [key])).rows[0] }
        catch (error) { throw databaseFailure(error) }
      }
      try {
        return await Promise.race([fn({
          tryAdvisoryLock: async (key) => Taken.parse(await lockQuery('SELECT pg_try_advisory_lock($1) AS taken', key)).taken,
          advisoryLockShared: async (key) => { await lockQuery('SELECT pg_advisory_lock_shared($1)', key) },
        }, aborter.signal), lost])
      } finally {
        await client.end().catch(() => undefined)
      }
    },
    appliedMigrations: () => pool.query<{ version: string }>('SELECT version FROM iam.schema_migration').then(
      (result) => new Set(result.rows.map((row) => row.version)),
      (error: unknown) => {
        if (errorCode(error) === UNDEFINED_TABLE) return new Set<string>()
        throw databaseFailure(error)
      },
    ),
    close: () => pool.end(),
  }
  return database
}

export const openFactoryPool = (given: DatabaseConnection): FactoryPool => {
  const connection = checkedConnection(given)
  return Object.assign(openPool({ ...connection, password: readSecretFile(connection.passwordFile) }), { [factoryBrand]: true as const })
}

export const probeConnection = async (connection: PostgresConnection): Promise<void> => {
  const client = new pg.Client({ ...connection, connectionTimeoutMillis: CONNECT_TIMEOUT_MS })
  try {
    await client.connect()
    await client.query('SELECT 1')
  } finally {
    await client.end().catch(() => undefined)
  }
}
