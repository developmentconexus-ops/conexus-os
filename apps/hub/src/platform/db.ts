import pg from 'pg'
import type { Pool, PoolClient, PoolConfig } from 'pg'
import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import type { AccountId } from '../../../../packages/contract/dist/index.js'
import { Failure, logFailure, type FailureCode } from './failure.js'
import { fieldOf } from './field-of.js'
import { logger } from './logger.js'
import { readSecretFile } from './secrets.js'
import { CAPABILITY_BY_ROLE } from './hub-roles.generated.js'

const sqlBrand: unique symbol = Symbol('sql')
const factoryBrand: unique symbol = Symbol('factory-pool')

export type Mode = 'read' | 'write'
export type Sql = Readonly<{ [sqlBrand]: true; text: string; values: readonly unknown[] }>
export type DatabaseConnection = Readonly<{ host: string; port: number; database: string; user: 'hub_runtime' | 'hub_factory'; passwordFile: string; max?: number; connectionTimeoutMillis?: number; options?: string }>
export type JobName = 'iam-reaper' | 'project-purge' | 'builder-executor'
export type FactoryPool = Pool & Readonly<{ [factoryBrand]: true }>
export type PostgresPool = Pool
export type PostgresConnection = PoolConfig

const identifier = (name: string): Sql => ({ [sqlBrand]: true, text: `"${name.replaceAll('"', '""')}"`, values: [] })
const isSql = (value: unknown): value is Sql => typeof value === 'object' && value !== null && sqlBrand in value && value[sqlBrand] === true
/** @public Frozen by spec 0015 section 3; the HTTP edge makes one, only a Digest reaches a token lookup. */
export const RawToken = z.string().min(1).brand<'RawToken'>()
/** @public Frozen by spec 0015 section 3. */
export type RawToken = z.output<typeof RawToken>
const DigestBytes = z.instanceof(Buffer).brand<'Digest'>()
/** @public Frozen by spec 0015 section 3. */
export type Digest = z.output<typeof DigestBytes>
/** @public Frozen by spec 0015 section 3; the one way to a Digest. */
export const digest = (raw: RawToken): Digest => DigestBytes.parse(createHash('sha256').update(raw).digest())
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
const REFUSED_WORDS = /\bconexus\b|session_authorization|u&|set_config|current_setting/

const normalizedText = (text: string): string => text.toLowerCase()
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
  .replaceAll('"', '').replace(/\s+/g, ' ').trim()

/** The composed text of every executed statement may only select, insert, update, delete or run a CTE; see spec 0015, admission section 4.1. */
const refuseSqlText = (statement: Sql): void => {
  const text = normalizedText(statement.text)
  const statements = text.split(';').map((part) => part.trim()).filter((part) => part !== '')
  if (statements.length === 0 || statements.some((part) => !ALLOWED_FIRST_KEYWORD.test(part)) || REFUSED_WORDS.test(text)) {
    throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'SQL_TEXT_REFUSED' } })
  }
}

export interface ReadTx {
  readonly mode: Mode
  readonly accountId: AccountId | null
  rows<S extends z.ZodType>(schema: S, query: Sql): Promise<readonly z.output<S>[]>
  one<S extends z.ZodType>(schema: S, query: Sql, missing: FailureCode): Promise<z.output<S>>
  maybe<S extends z.ZodType>(schema: S, query: Sql): Promise<z.output<S> | null>
}

export interface WriteTx extends ReadTx {
  readonly mode: 'write'
  run(query: Sql): Promise<number>
}

type SessionLock = Readonly<{ tryAdvisoryLock(key: bigint): Promise<boolean> }>
export interface Database {
  transaction<T>(accountId: AccountId, fn: (tx: WriteTx) => Promise<T>): Promise<T>
  read<T>(accountId: AccountId, fn: (tx: ReadTx) => Promise<T>): Promise<T>
  system<T>(job: JobName, fn: (tx: WriteTx) => Promise<T>): Promise<T>
  session<T>(fn: (lock: SessionLock) => Promise<T>): Promise<T>
  close(): Promise<void>
}

type DatabaseFailureRule = Readonly<{ sqlstate: string; constraint: string | null; failure: FailureCode }>
/** @public Frozen by spec 0015 section 3; each part adds its constraints. */
export const DATABASE_FAILURES: readonly DatabaseFailureRule[] = Object.freeze([
  { sqlstate: '23503', constraint: 'workspace_membership_workspace_id_fkey', failure: 'WORKSPACE_NOT_FOUND' },
])

export const errorCode = (error: unknown): string | undefined => {
  const code = fieldOf(error, 'code')
  return typeof code === 'string' ? code : undefined
}

const databaseFailure = (error: unknown): Failure | unknown => {
  if (!(error instanceof pg.DatabaseError)) return error
  const rule = DATABASE_FAILURES.find((entry) => entry.sqlstate === error.code && entry.constraint === error.constraint)
    ?? DATABASE_FAILURES.find((entry) => entry.sqlstate === error.code && entry.constraint === null)
  return new Failure(rule?.failure ?? 'INTERNAL_UNEXPECTED', { cause: error })
}

const openPool = (connection: PoolConfig): Pool => {
  const capability = connection.user ? CAPABILITY_BY_ROLE[connection.user] ?? connection.user : 'unlabelled'
  const pool = new pg.Pool({ ...connection, application_name: `conexus-hub:${capability}`, max: connection.max ?? 20, connectionTimeoutMillis: connection.connectionTimeoutMillis ?? 5000 })
  pool.on('connect', (client) => {
    client.on('error', (error) => logFailure(logger, new Failure('HUB_POOL_ERROR', { cause: error }), { 'hub.capability': capability, 'db.error_code': errorCode(error) ?? '' }))
  })
  pool.on('error', () => undefined)
  return pool
}

const transactionView = (client: PoolClient) => {
  let active = true
  const query = async (statement: Sql) => {
    if (!active) throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'TRANSACTION_ENDED' } })
    refuseSqlText(statement)
    try { return await client.query(statement.text, [...statement.values]) }
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

type Acting = Readonly<{ accountId: AccountId | null; scope: 'system' | '' }>

const readView = (client: PoolClient, acting: Acting) => {
  const { rows, one, maybe, end } = transactionView(client)
  return { mode: 'read' as const, accountId: acting.accountId, rows, one, maybe, end }
}

const writeView = (client: PoolClient, acting: Acting) => {
  const { rows, one, maybe, execute, end } = transactionView(client)
  return { mode: 'write' as const, accountId: acting.accountId, rows, one, maybe, run: execute, end }
}

const entered = new AsyncLocalStorage<true>()
const refuseOptionNamingRole = (connection: DatabaseConnection): void => {
  if (connection.options !== undefined && /\b(?:role|session_authorization)\b/i.test(connection.options)) {
    throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'POOL_OPTION_NAMES_ROLE' } })
  }
}

const pools = new WeakMap<Database, Pool>()
export const unportedPool = (database: Database): Pool => {
  const pool = pools.get(database)
  if (!pool) throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'DATABASE_POOL_MISSING' } })
  return pool
}

export const openDatabase = (connection: DatabaseConnection): Database => {
  refuseOptionNamingRole(connection)
  const pool = openPool({ ...connection, password: readSecretFile(connection.passwordFile) })
  const transact = async <T, V extends ReadTx>(begin: string, acting: Acting, view: (client: PoolClient, acting: Acting) => V & { end(): void }, fn: (tx: V) => Promise<T>): Promise<T> => {
    if (entered.getStore()) throw new Failure('INTERNAL_UNEXPECTED', { details: { reason: 'NESTED_TRANSACTION' } })
    const client = await pool.connect()
    let discard: Error | undefined
    let started = false
    const tx = view(client, acting)
    try {
      await client.query(begin)
      started = true
      await client.query("SELECT set_config('conexus.account_id', $1, true), set_config('conexus.scope', $2, true)", [acting.accountId ?? '', acting.scope])
      const value = await entered.run(true, () => fn(tx))
      await client.query('COMMIT')
      return value
    } catch (error) {
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
    transaction: (accountId, fn) => transact('BEGIN', { accountId, scope: '' }, writeView, fn),
    read: (accountId, fn) => transact('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', { accountId, scope: '' }, readView, fn),
    system: (_job, fn) => transact('BEGIN', { accountId: null, scope: 'system' }, writeView, fn),
    session: async (fn) => {
      const client = new pg.Client({ ...connection, password: readSecretFile(connection.passwordFile), application_name: 'conexus-hub:instance-lock' })
      const lost = new Promise<never>((_resolve, reject) => {
        client.on('error', reject)
        client.on('end', () => reject(new Error('instance lock connection ended')))
      })
      await client.connect()
      try {
        return await Promise.race([fn({ tryAdvisoryLock: async (key) => (await client.query<{ taken: boolean }>('SELECT pg_try_advisory_lock($1) AS taken', [key])).rows[0]?.taken === true }), lost])
      } finally {
        await client.end().catch(() => undefined)
      }
    },
    close: () => pool.end(),
  }
  pools.set(database, pool)
  return database
}

export const openFactoryPool = (connection: DatabaseConnection): FactoryPool => {
  refuseOptionNamingRole(connection)
  return Object.assign(openPool({ ...connection, password: readSecretFile(connection.passwordFile) }), { [factoryBrand]: true as const })
}

export const probeConnection = async (connection: PostgresConnection): Promise<void> => {
  const client = new pg.Client({ ...connection, connectionTimeoutMillis: 5000 })
  try {
    await client.connect()
    await client.query('SELECT 1')
  } finally {
    await client.end().catch(() => undefined)
  }
}
