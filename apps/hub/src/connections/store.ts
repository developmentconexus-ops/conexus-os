import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type {
  R2HubCON01Contract,
  R2HubCON02Contract,
  R2HubCON03Contract,
  R2HubCON04Contract,
  R2HubCON05Contract,
  R2HubCON06Contract,
  R2HubCON07Contract,
  R2HubCON08Contract,
  R2HubCON09Contract,
} from '../generated/r2-routes.js'
import type { CredentialBackend } from '../platform/credential-backend.js'
import type { PostgresPool } from '../platform/postgres.js'
import { qualifySankhyaProduction } from './qualification.js'
import type { ConnectionQualificationSettlement } from './qualification.js'
import {
  isSankhyaConfiguration,
  isSankhyaCredentialInput,
  sankhyaOmConnectorDefinition,
  type SankhyaConfiguration,
} from './sankhya-om.js'

export type ConnectorDefinitionSummary = R2HubCON01Contract['responses']['200'][number]
export type ConnectorDefinition = R2HubCON02Contract['responses']['200']
export type Connection = R2HubCON03Contract['responses']['200'][number]
export type ConnectionDetail = R2HubCON04Contract['responses']['200']
export type ConnectionRevision = R2HubCON06Contract['responses']['201']
export type ConnectionQualification = R2HubCON09Contract['responses']['200']
export type OwnerScopeKind = R2HubCON03Contract['params']['ownerScopeKind']
export type ReentryState = 'NEW' | 'RESERVED' | 'SETTLED'
type QualificationReservationState = ReentryState | 'IN_PROGRESS'

export type ConnectionResult<T> = Readonly<
  | { status: 'FOUND'; value: T }
  | { status: 'DENIED' }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT' }
  | { status: 'STALE' }
  | { status: 'INVALID' }
  | { status: 'UNAVAILABLE' }
>

export type ConnectionWriteResult<T> = ConnectionResult<T> & Readonly<{ reentry?: ReentryState }>

export type ConnectionStore = Readonly<{
  listConnectorDefinitions(input: Readonly<{ accountId: string }>): Promise<ConnectionResult<ConnectorDefinitionSummary[]>>
  getConnectorDefinition(input: Readonly<{
    accountId: string
    connectorDefinitionId: string
  }>): Promise<ConnectionResult<ConnectorDefinition>>
  listConnections(input: Readonly<{
    accountId: string
    ownerScopeKind: OwnerScopeKind
    ownerId: string
    forProjectId?: string
  }>): Promise<ConnectionResult<Connection[]>>
  getConnection(input: Readonly<{
    accountId: string
    connectionId: string
  }>): Promise<ConnectionResult<ConnectionDetail>>
  createConnection(input: Readonly<{
    accountId: string
    ownerScopeKind: OwnerScopeKind
    ownerId: string
    idempotencyKey: string
    body: R2HubCON05Contract['body']
  }>): Promise<ConnectionWriteResult<Connection>>
  reviseConnection(input: Readonly<{
    accountId: string
    connectionId: string
    body: R2HubCON06Contract['body']
  }>): Promise<ConnectionResult<ConnectionRevision>>
  setConnectionCredential(input: Readonly<{
    accountId: string
    connectionId: string
    idempotencyKey: string
    body: R2HubCON07Contract['body']
  }>): Promise<ConnectionWriteResult<undefined>>
  qualifyConnection(input: Readonly<{
    accountId: string
    connectionId: string
    idempotencyKey: string
    body: R2HubCON08Contract['body']
  }>): Promise<ConnectionWriteResult<ConnectionQualification>>
  getConnectionQualification(input: Readonly<{
    accountId: string
    connectionId: string
    qualificationId: string
  }>): Promise<ConnectionResult<ConnectionQualification>>
}>

export type ConnectionQualifier = (input: Readonly<{
  configuration: SankhyaConfiguration
  connectionId: string
  credentialGeneration: string
  credentialBackend: CredentialBackend
}>) => Promise<ConnectionQualificationSettlement>

type ConnectionRow = QueryResultRow & Readonly<{
  connection_id: unknown
  name: unknown
  owner_scope_kind: unknown
  owner_id: unknown
  connector_definition_id: unknown
  connector_version: unknown
  current_revision_id: unknown
  credential_configured: unknown
  test_state: unknown
  qualification_id: unknown
  test_environment: unknown
  tested_at: unknown
}>

type ConnectionDetailRow = ConnectionRow & Readonly<{ configuration: unknown }>
type CreateRow = QueryResultRow & Readonly<{
  connection_id: unknown
  connection_revision_id: unknown
  replayed: unknown
}>
type RevisionRow = QueryResultRow & Readonly<{
  connection_id: unknown
  connection_revision_id: unknown
  connector_definition_id: unknown
  connector_version: unknown
}>
type CredentialReservationRow = QueryResultRow & Readonly<{
  credential_generation: unknown
  settlement_state: unknown
}>
type QualificationReservationRow = QueryResultRow & Readonly<{
  qualification_id: unknown
  connection_revision_id: unknown
  credential_generation: unknown
  environment: unknown
  configuration: unknown
  settlement_state: unknown
  qualification_state: unknown
  outcome: unknown
  diagnostic: unknown
  evidence_refs: unknown
  tested_at: unknown
}>
type QualificationRow = QueryResultRow & Readonly<{
  qualification_id: unknown
  connection_id: unknown
  connection_revision_id: unknown
  credential_generation: unknown
  environment: unknown
  qualification_state: unknown
  outcome: unknown
  tested_at: unknown
  diagnostic: unknown
  evidence_refs: unknown
}>

const provider = 'Sankhya API'
const connectorDefinition: ConnectorDefinition = {
  connectorDefinitionId: sankhyaOmConnectorDefinition.connectorDefinitionId,
  connectorVersion: sankhyaOmConnectorDefinition.connectorVersion,
  provider,
  configurationSchema: sankhyaOmConnectorDefinition.configurationSchema,
  credentialInputSchema: sankhyaOmConnectorDefinition.credentialInputSchema,
  operationIds: sankhyaOmConnectorDefinition.capabilities.map(({ capabilityId }) => capabilityId),
  environments: Object.keys(sankhyaOmConnectorDefinition.origins),
}
const connectorSummary: ConnectorDefinitionSummary = {
  connectorDefinitionId: connectorDefinition.connectorDefinitionId,
  connectorVersion: connectorDefinition.connectorVersion,
  provider: connectorDefinition.provider,
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && /\S/.test(value)
const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean =>
  Object.keys(value).sort().join('\0') === [...expected].sort().join('\0')
const outcome = (value: unknown): value is ConnectionQualification['outcome'] =>
  value === 'PASSED' || value === 'FAILED' || value === 'INDETERMINATE'
const reentry = (value: unknown): value is ReentryState =>
  value === 'NEW' || value === 'RESERVED' || value === 'SETTLED'
const qualificationReservationState = (value: unknown): value is QualificationReservationState =>
  reentry(value) || value === 'IN_PROGRESS'
const generation = (value: unknown): string | null => {
  if (typeof value === 'bigint') return value > 0n ? value.toString() : null
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null
}
const timestamp = (value: unknown): string | null => {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null
}
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : ''

const mapDatabaseError = (error: unknown): ConnectionResult<never> | null => {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
  const message = errorMessage(error)
  if (code === '42501' || message.includes('_DENIED')) return { status: 'DENIED' }
  if (code === 'P0002' || code === '22P02' || message.includes('_NOT_FOUND')) return { status: 'NOT_FOUND' }
  if (message.includes('CURRENT_REVISION_CONFLICT')) return { status: 'STALE' }
  if (code === '22023') return { status: 'INVALID' }
  if (code === '23505' || code === '40001' || message.includes('_CONFLICT') ||
    message.includes('_ABANDONED') || message.includes('IDEMPOTENCY')) {
    return { status: 'CONFLICT' }
  }
  return null
}

const transaction = async <T>(
  pool: PostgresPool,
  readOnly: boolean,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN')
    const value = await action(client)
    await client.query('COMMIT')
    return value
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve primary failure */ }
    throw error
  } finally {
    client.release()
  }
}

const testSummary = (row: ConnectionRow): Connection['connectionTest'] | null => {
  const state = row.test_state
  if (state === 'NOT_TESTED') {
    return row.qualification_id === null && row.test_environment === null && row.tested_at === null ? { state } : null
  }
  if (state !== 'NEEDS_RETEST' && state !== 'PASSED' && state !== 'FAILED' && state !== 'INDETERMINATE') return null
  const testedAt = timestamp(row.tested_at)
  if (!text(row.qualification_id) || !text(row.test_environment) ||
    !connectorDefinition.environments.includes(row.test_environment) || !testedAt) return null
  return { state, qualificationId: row.qualification_id, environment: row.test_environment, testedAt }
}

const connection = (row: ConnectionRow): Connection | null => {
  const connectionTest = testSummary(row)
  if (!text(row.connection_id) || !text(row.name) ||
    (row.owner_scope_kind !== 'WORKSPACE' && row.owner_scope_kind !== 'PROJECT') || !text(row.owner_id) ||
    !text(row.connector_definition_id) || !text(row.connector_version) ||
    !definitionMatches(row.connector_definition_id, row.connector_version) || !text(row.current_revision_id) ||
    typeof row.credential_configured !== 'boolean' || !connectionTest) return null
  return {
    connectionId: row.connection_id,
    name: row.name,
    ownerScopeKind: row.owner_scope_kind,
    ownerId: row.owner_id,
    connectorDefinitionId: row.connector_definition_id,
    connectorVersion: row.connector_version,
    currentRevisionId: row.current_revision_id,
    credentialConfigured: row.credential_configured,
    connectionTest,
  }
}

const qualificationDiagnostic = (value: unknown): ConnectionQualification['diagnostic'] | null => {
  if (!record(value) || !text(value.title) || !text(value.message)) return null
  const keys = value.remediation === undefined ? ['title', 'message'] : ['title', 'message', 'remediation']
  if (!exactKeys(value, keys) || value.remediation !== undefined && !text(value.remediation)) return null
  return { title: value.title, message: value.message, ...(value.remediation ? { remediation: value.remediation } : {}) }
}

const qualification = (row: QualificationRow): ConnectionQualification | null => {
  const credentialGeneration = row.credential_generation === null ? null : generation(row.credential_generation)
  const testedAt = timestamp(row.tested_at)
  const diagnostic = qualificationDiagnostic(row.diagnostic)
  if (!text(row.qualification_id) || !text(row.connection_id) || !text(row.connection_revision_id) ||
    (row.credential_generation !== null && !credentialGeneration) || !text(row.environment) ||
    !connectorDefinition.environments.includes(row.environment) ||
    !text(row.qualification_state) || !outcome(row.outcome) || !testedAt || !diagnostic ||
    !Array.isArray(row.evidence_refs) || row.evidence_refs.length === 0 || !row.evidence_refs.every(text) ||
    new Set(row.evidence_refs).size !== row.evidence_refs.length) return null
  return {
    qualificationId: row.qualification_id,
    connectionId: row.connection_id,
    connectionRevisionId: row.connection_revision_id,
    credentialGeneration,
    environment: row.environment,
    qualificationState: row.qualification_state,
    outcome: row.outcome,
    testedAt,
    diagnostic,
    evidenceRefs: row.evidence_refs,
  }
}

const digest = (value: unknown): string => sha256(canonicalBytes(value))
const keyDigest = (value: string): string => sha256(Buffer.from(value, 'utf8'))
const definitionMatches = (definitionId: string, version: string): boolean =>
  definitionId === connectorDefinition.connectorDefinitionId && version === connectorDefinition.connectorVersion

const recoveredQualification = (): ConnectionQualificationSettlement => ({
  qualificationState: 'ATTEMPT_INTERRUPTED',
  outcome: 'INDETERMINATE',
  diagnostic: {
    title: 'Connection test outcome is indeterminate',
    message: 'A prior qualification attempt was interrupted after its exact basis was reserved.',
    remediation: 'Start a new qualification attempt with a new idempotency key.',
  },
  evidenceRefs: ['qualification:reserved-reentry'],
})

export const createConnectionStore = ({
  pool,
  credentialBackend,
  qualifier = qualifySankhyaProduction,
  mintIdentity = randomUUID,
  now = () => new Date(),
}: Readonly<{
  pool: PostgresPool
  credentialBackend: CredentialBackend
  qualifier?: ConnectionQualifier
  mintIdentity?: () => string
  now?: () => Date
}>): ConnectionStore => {
  const safely = async <T>(
    action: () => Promise<ConnectionResult<T>>,
    unavailableOnUnknown = false,
  ): Promise<ConnectionResult<T>> => {
    try {
      return await action()
    } catch (error) {
      const mapped = mapDatabaseError(error)
      if (mapped) return mapped
      if (unavailableOnUnknown) return { status: 'UNAVAILABLE' }
      throw error
    }
  }

  const anyConnectionRead = async (accountId: string): Promise<boolean> => transaction(pool, true, async (client) => {
    const result = await client.query<{ permitted: unknown }>('SELECT iam.admit_any_connection_read($1) AS permitted', [accountId])
    if (result.rows.length !== 1 || typeof result.rows[0]?.permitted !== 'boolean') throw new Error('CONNECTION_ADMISSION_INVALID')
    return result.rows[0].permitted
  })

  return Object.freeze({
    listConnectorDefinitions: ({ accountId }) => safely(async () =>
      await anyConnectionRead(accountId) ? { status: 'FOUND', value: [{ ...connectorSummary }] } : { status: 'DENIED' }),

    getConnectorDefinition: ({ accountId, connectorDefinitionId }) => safely(async () => {
      if (!await anyConnectionRead(accountId)) return { status: 'DENIED' }
      if (connectorDefinitionId !== connectorDefinition.connectorDefinitionId) return { status: 'NOT_FOUND' }
      return {
        status: 'FOUND',
        value: {
          ...connectorDefinition,
          operationIds: [...connectorDefinition.operationIds],
          environments: [...connectorDefinition.environments],
        },
      }
    }),

    listConnections: ({ accountId, ownerScopeKind, ownerId, forProjectId }) => safely(async () => {
      const rows = await transaction(pool, true, async (client) => (await client.query<ConnectionRow>(
        'SELECT * FROM con.list_connections($1, $2, $3, $4)',
        [accountId, ownerScopeKind, ownerId, forProjectId ?? null],
      )).rows)
      const values = rows.map(connection)
      if (values.some((value) => value === null)) throw new Error('CONNECTION_PROJECTION_INVALID')
      return { status: 'FOUND', value: values as Connection[] }
    }),

    getConnection: ({ accountId, connectionId }) => safely(async () => {
      const rows = await transaction(pool, true, async (client) => (await client.query<ConnectionDetailRow>(
        'SELECT * FROM con.get_connection($1, $2)', [accountId, connectionId],
      )).rows)
      if (rows.length === 0) return { status: 'NOT_FOUND' }
      if (rows.length !== 1 || !isSankhyaConfiguration(rows[0]?.configuration)) {
        throw new Error('CONNECTION_PROJECTION_INVALID')
      }
      const summary = connection(rows[0])
      if (!summary) throw new Error('CONNECTION_PROJECTION_INVALID')
      return { status: 'FOUND', value: { ...summary, configuration: rows[0].configuration } }
    }),

    createConnection: ({ accountId, ownerScopeKind, ownerId, idempotencyKey, body }) => safely(async () => {
      if (!definitionMatches(body.connectorDefinitionId, body.connectorVersion) || !isSankhyaConfiguration(body.configuration)) {
        return { status: 'INVALID' }
      }
      const connectionId = mintIdentity()
      const revisionId = mintIdentity()
      const requestDigest = digest({ ownerScopeKind, ownerId, body })
      const rows = await transaction(pool, false, async (client) => (await client.query<CreateRow>(
        'SELECT * FROM con.create_or_replay_connection($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
        [accountId, ownerScopeKind, ownerId, keyDigest(idempotencyKey), requestDigest, connectionId, revisionId,
          body.name, body.connectorDefinitionId, body.connectorVersion, body.configuration, digest(body.configuration)],
      )).rows)
      const row = rows[0]
      if (rows.length !== 1 || !text(row?.connection_id) || !text(row.connection_revision_id) || typeof row.replayed !== 'boolean') {
        throw new Error('CONNECTION_CREATE_RESULT_INVALID')
      }
      return {
        status: 'FOUND',
        reentry: row.replayed ? 'SETTLED' : 'NEW',
        value: {
          connectionId: row.connection_id,
          name: body.name,
          ownerScopeKind,
          ownerId,
          connectorDefinitionId: body.connectorDefinitionId,
          connectorVersion: body.connectorVersion,
          currentRevisionId: row.connection_revision_id,
          credentialConfigured: false,
          connectionTest: { state: 'NOT_TESTED' },
        },
      }
    }),

    reviseConnection: ({ accountId, connectionId, body }) => safely(async () => {
      if (!isSankhyaConfiguration(body.configuration)) return { status: 'INVALID' }
      const rows = await transaction(pool, false, async (client) => (await client.query<RevisionRow>(
        'SELECT * FROM con.revise_connection($1, $2, $3, $4, $5, $6)',
        [accountId, connectionId, body.expectedCurrentRevisionId, mintIdentity(), body.configuration, digest(body.configuration)],
      )).rows)
      const row = rows[0]
      if (rows.length !== 1 || !text(row?.connection_id) || !text(row.connection_revision_id) ||
        !text(row.connector_definition_id) || !text(row.connector_version)) throw new Error('CONNECTION_REVISION_RESULT_INVALID')
      return { status: 'FOUND', value: {
        connectionId: row.connection_id,
        connectionRevisionId: row.connection_revision_id,
        connectorDefinitionId: row.connector_definition_id,
        connectorVersion: row.connector_version,
      } }
    }),

    setConnectionCredential: ({ accountId, connectionId, idempotencyKey, body }) => safely(async () => {
      if (!isSankhyaCredentialInput(body.credential)) return { status: 'INVALID' }
      const credentialBytes = canonicalBytes(body.credential)
      const key = keyDigest(idempotencyKey)
      try {
        let requestDigest: string
        try {
          requestDigest = credentialBackend.idempotencyDigest(connectionId, credentialBytes)
        } catch (error) {
          if (errorMessage(error) === 'CREDENTIAL_COORDINATE_REFUSED') return { status: 'NOT_FOUND' }
          throw error
        }
        const rows = await transaction(pool, false, async (client) => (await client.query<CredentialReservationRow>(
          'SELECT * FROM con.reserve_connection_credential($1, $2, $3, $4)',
          [accountId, connectionId, key, requestDigest],
        )).rows)
        const row = rows[0]
        const reservedGeneration = generation(row?.credential_generation)
        if (rows.length === 1 && row?.settlement_state === 'ABANDONED') return { status: 'CONFLICT' }
        if (rows.length !== 1 || !row || !reservedGeneration || !reentry(row.settlement_state)) {
          throw new Error('CONNECTION_CREDENTIAL_RESERVATION_INVALID')
        }
        try {
          await credentialBackend.publishOrMatch({ connectionId, generation: reservedGeneration }, credentialBytes)
        } catch (error) {
          if (errorMessage(error) === 'CREDENTIAL_GENERATION_CONFLICT') return { status: 'CONFLICT' }
          throw error
        }
        await transaction(pool, false, async (client) => {
          await client.query('SELECT con.settle_connection_credential($1, $2, $3, $4, $5)',
            [accountId, connectionId, key, requestDigest, reservedGeneration])
        })
        return { status: 'FOUND', value: undefined, reentry: row.settlement_state }
      } finally {
        credentialBytes.fill(0)
      }
    }),

    qualifyConnection: ({ accountId, connectionId, idempotencyKey, body }) => safely(async () => {
      if (!text(body.environment) || !connectorDefinition.environments.includes(body.environment)) return { status: 'INVALID' }
      const key = keyDigest(idempotencyKey)
      const requestDigest = digest({ connectionId, body })
      const attemptId = mintIdentity()
      const rows = await transaction(pool, false, async (client) => (await client.query<QualificationReservationRow>(
        'SELECT * FROM con.reserve_connection_qualification($1, $2, $3, $4, $5, $6, $7, $8)',
        [accountId, connectionId, body.connectionRevisionId, body.environment, key, requestDigest, mintIdentity(), attemptId],
      )).rows)
      const row = rows[0]
      const credentialGeneration = generation(row?.credential_generation)
      if (rows.length !== 1 || !text(row?.qualification_id) || !text(row.connection_revision_id) ||
        !credentialGeneration || !text(row.environment) || !record(row.configuration) ||
        !qualificationReservationState(row.settlement_state)) {
        throw new Error('CONNECTION_QUALIFICATION_RESERVATION_INVALID')
      }
      if (row.settlement_state === 'IN_PROGRESS') return { status: 'CONFLICT' }
      if (row.settlement_state === 'SETTLED') {
        const settled = qualification({ ...row, connection_id: connectionId })
        if (!settled) throw new Error('CONNECTION_QUALIFICATION_RESULT_INVALID')
        return { status: 'FOUND', value: settled, reentry: 'SETTLED' }
      }
      if (!isSankhyaConfiguration(row.configuration) || row.configuration.environment !== row.environment) {
        return { status: 'INVALID' }
      }
      let settlement: ConnectionQualificationSettlement
      if (row.settlement_state === 'RESERVED') {
        settlement = recoveredQualification()
      } else {
        try {
          settlement = await qualifier({
            configuration: row.configuration,
            connectionId,
            credentialGeneration,
            credentialBackend,
          })
        } catch {
          settlement = {
            qualificationState: 'QUALIFICATION_UNAVAILABLE',
            outcome: 'INDETERMINATE',
            diagnostic: {
              title: 'Connection test could not complete',
              message: 'The qualification dependency did not return a safe result.',
              remediation: 'Start a new qualification attempt when the dependency is available.',
            },
            evidenceRefs: ['qualification:dependency-unavailable'],
          }
        }
      }
      const testedAt = now().toISOString()
      await transaction(pool, false, async (client) => {
        await client.query('SELECT con.settle_connection_qualification($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', [
          accountId, connectionId, row.qualification_id, row.connection_revision_id, credentialGeneration,
          row.environment, attemptId, settlement.qualificationState, settlement.outcome, settlement.diagnostic,
          [...settlement.evidenceRefs], testedAt,
        ])
      })
      return { status: 'FOUND', reentry: row.settlement_state, value: {
        qualificationId: row.qualification_id,
        connectionId,
        connectionRevisionId: row.connection_revision_id,
        credentialGeneration,
        environment: row.environment,
        qualificationState: settlement.qualificationState,
        outcome: settlement.outcome,
        testedAt,
        diagnostic: { ...settlement.diagnostic },
        evidenceRefs: [...settlement.evidenceRefs],
      } }
    }, true),

    getConnectionQualification: ({ accountId, connectionId, qualificationId }) => safely(async () => {
      const rows = await transaction(pool, true, async (client) => (await client.query<QualificationRow>(
        'SELECT * FROM con.get_connection_qualification($1, $2, $3)', [accountId, connectionId, qualificationId],
      )).rows)
      if (rows.length === 0) return { status: 'NOT_FOUND' }
      const value = rows.length === 1 && rows[0] ? qualification(rows[0]) : null
      if (!value) throw new Error('CONNECTION_QUALIFICATION_RESULT_INVALID')
      return { status: 'FOUND', value }
    }),
  })
}
