import { HUB_ROLES } from './hub-roles.generated.js'
import { createPostgresPool } from './postgres.js'
import { readSecretFile } from './secrets.js'

export type ConnectionCensusState = 'ok' | 'invalid' | 'unreachable' | 'unreadable' | 'unconfigured'

export type ConnectionCensusRow = Readonly<{
  role: string
  capability: string
  state: ConnectionCensusState
  sqlstate?: string
}>

export type ConnectionCensusDatabase = Readonly<{
  host: string
  port: number
  database: string
}>

const AUTHENTICATION_SQLSTATES = new Set(['28P01', '28000'])

// pg reports a Postgres-side refusal (wrong password, wrong pg_hba entry) with a SQLSTATE
// in error.code. A cluster that never got that far (ECONNREFUSED, ETIMEDOUT, a hung socket)
// reports a Node/libuv error code instead, which is never a five-character SQLSTATE.
const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined

const isSqlstate = (code: string): boolean => /^[0-9A-Z]{5}$/.test(code)

const censusStateFor = (error: unknown): { state: 'invalid' | 'unreachable'; sqlstate?: string } => {
  const code = errorCode(error)
  if (code && isSqlstate(code)) {
    return AUTHENTICATION_SQLSTATES.has(code) ? { state: 'invalid', sqlstate: code } : { state: 'unreachable', sqlstate: code }
  }
  return code === undefined ? { state: 'unreachable' } : { state: 'unreachable', sqlstate: code }
}

// The Hub's pools connect lazily, so before this census a bad credential first appeared as a
// 28P01 in the middle of somebody's request. This runs one SELECT 1 per configured role at
// startup and nothing else. It never writes, never alters a role, and never reads a password
// into its result, so a census row is safe to log.
export const censusConnections = async (
  database: ConnectionCensusDatabase,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<readonly ConnectionCensusRow[]> => {
  const rows: ConnectionCensusRow[] = []
  for (const registered of HUB_ROLES) {
    const role = (registered.roleVariable ? environment[registered.roleVariable] : undefined) ?? registered.role
    const passwordFile = environment[registered.passwordFileVariable]
    if (!passwordFile) {
      rows.push({ role, capability: registered.capability, state: 'unconfigured' })
      continue
    }
    let password: string
    try {
      password = readSecretFile(passwordFile)
    } catch {
      // Never report why the file was unreadable: that could echo its contents or path.
      rows.push({ role, capability: registered.capability, state: 'unreadable' })
      continue
    }
    const pool = createPostgresPool({ ...database, user: role, password })
    try {
      await pool.query('select 1')
      rows.push({ role, capability: registered.capability, state: 'ok' })
    } catch (error) {
      rows.push({ role, capability: registered.capability, ...censusStateFor(error) })
    } finally {
      await pool.end()
    }
  }
  return rows
}

export const reportConnectionCensus = (rows: readonly ConnectionCensusRow[], write: (line: string) => void): void => {
  const counted = (state: ConnectionCensusState) => rows.filter(row => row.state === state).length
  write(
    `HUB_CONNECTION_CENSUS:ok=${counted('ok')}:invalid=${counted('invalid')}:unreachable=${counted('unreachable')}:unreadable=${counted('unreadable')}:unconfigured=${counted('unconfigured')}\n`,
  )
  for (const row of rows) {
    if (row.state === 'ok') continue
    write(`HUB_CONNECTION_CENSUS:${row.state}:${row.role}:${row.capability}:${row.sqlstate ?? ''}\n`)
  }
}
