import type { QueryResultRow } from 'pg'
import { sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { PostgresPool } from '../platform/postgres.js'
import { readProjectBrainRealizationManifest } from './brain-realization.js'
import type { ProjectSourceSnapshotFactory } from './inception.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SOURCE_REVISION = /^[0-9a-f]{40}$/
const CONNECTION_BINDINGS_PATH = '.conexus/project/connection-bindings.json'

type Registration = Readonly<{
  queryId: string
  workspaceId: string
  projectId: string
  connectionId: string
  environment: 'SANDBOX' | 'PRODUCTION'
  datasetId: string
  mappingDigest: string
}>

export type ProjectKeyConformanceBasisRequest = Readonly<{
  accountId: string
  registration: Registration
}>

export type ProjectKeyConformanceBasis = Readonly<{
  workspaceId: string
  projectId: string
  connectionId: string
  connectionRevisionId: string
  qualificationId: string
  credentialGeneration: string
  environment: 'SANDBOX' | 'PRODUCTION'
  companyCode: number
  connectorDefinitionId: 'sankhya-om'
  connectorVersion: '1.0.0'
  sourceRevision: string
  inputDigest: string
}>

type SubjectRow = QueryResultRow & Readonly<{
  workspace_id: unknown
  project_id: unknown
  connection_id: unknown
  connection_revision_id: unknown
  qualification_id: unknown
  credential_generation: unknown
  environment: unknown
  company_code: unknown
  connector_definition_id: unknown
  connector_version: unknown
  source_revision: unknown
}>

const text = (value: unknown): value is string => typeof value === 'string'
const uuid = (value: unknown): value is string => text(value) && UUID.test(value)
const knownRefusal = (error: unknown): boolean => error !== null && typeof error === 'object' && 'code' in error &&
  ['42501', 'P0002'].includes(String(error.code))

const captureRow = (row: SubjectRow | undefined): Omit<ProjectKeyConformanceBasis, 'inputDigest'> | null => {
  if (!row || !uuid(row.workspace_id) || !uuid(row.project_id) || !uuid(row.connection_id) ||
    !uuid(row.connection_revision_id) || !uuid(row.qualification_id) ||
    !text(row.credential_generation) || !/^[1-9][0-9]{0,18}$/.test(row.credential_generation) ||
    BigInt(row.credential_generation) > 9_223_372_036_854_775_807n ||
    (row.environment !== 'SANDBOX' && row.environment !== 'PRODUCTION') ||
    !Number.isInteger(row.company_code) || Number(row.company_code) < 1 || Number(row.company_code) > 2_147_483_647 ||
    row.connector_definition_id !== 'sankhya-om' || row.connector_version !== '1.0.0' ||
    !text(row.source_revision) || !SOURCE_REVISION.test(row.source_revision)) return null
  return Object.freeze({
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    connectionId: row.connection_id,
    connectionRevisionId: row.connection_revision_id,
    qualificationId: row.qualification_id,
    credentialGeneration: row.credential_generation,
    environment: row.environment,
    companyCode: Number(row.company_code),
    connectorDefinitionId: 'sankhya-om',
    connectorVersion: '1.0.0',
    sourceRevision: row.source_revision,
  })
}

const sameBasis = (
  left: Omit<ProjectKeyConformanceBasis, 'inputDigest'>,
  right: Omit<ProjectKeyConformanceBasis, 'inputDigest'>,
): boolean => Object.keys(left).every((key) =>
  left[key as keyof typeof left] === right[key as keyof typeof right])

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))

const sourceDeclaresBasis = async (
  source: ReturnType<ProjectSourceSnapshotFactory>,
  basis: Omit<ProjectKeyConformanceBasis, 'inputDigest'>,
): Promise<boolean> => {
  const entry = (await source.listPaths()).find((candidate) => candidate.path === CONNECTION_BINDINGS_PATH)
  if (entry?.ownershipClass !== 'PLATFORM-CONTRACT' || entry.byteLength > 1_048_576) return false
  const files = await source.readBatch([CONNECTION_BINDINGS_PATH])
  const file = files[0]
  if (files.length !== 1 || !file || file.path !== CONNECTION_BINDINGS_PATH || file.digest !== entry.digest ||
    Buffer.byteLength(file.utf8Bytes, 'utf8') !== entry.byteLength ||
    sha256(Buffer.from(file.utf8Bytes, 'utf8')) !== entry.digest) return false
  let parsed: unknown
  try { parsed = JSON.parse(file.utf8Bytes) } catch { return false }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
    !exactKeys(parsed as Record<string, unknown>, ['bindings'])) return false
  const bindings = (parsed as { bindings: unknown }).bindings
  if (!Array.isArray(bindings) || bindings.length > 4_096) return false
  const identities = new Set<string>()
  let selected = false
  for (const value of bindings) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const binding = value as Record<string, unknown>
    if (!exactKeys(binding, ['connectionId', 'connectionRevisionId', 'environment', 'qualificationId']) ||
      !uuid(binding.connectionId) || !uuid(binding.connectionRevisionId) || !uuid(binding.qualificationId) ||
      (binding.environment !== 'SANDBOX' && binding.environment !== 'PRODUCTION') ||
      identities.has(binding.connectionId)) return false
    identities.add(binding.connectionId)
    if (binding.connectionId === basis.connectionId) {
      selected = binding.connectionRevisionId === basis.connectionRevisionId &&
        binding.qualificationId === basis.qualificationId && binding.environment === basis.environment
    }
  }
  return selected
}

/** Resolves only DB/source-owned facts; Gateway derives the logical source-scope digest. */
export const createProjectKeyConformanceBasisResolver = ({
  pool,
  sourceSnapshot,
}: Readonly<{
  pool: PostgresPool
  sourceSnapshot: ProjectSourceSnapshotFactory
}>) => {
  const resolveDatabase = async (request: ProjectKeyConformanceBasisRequest) => {
    try {
      const result = await pool.query<SubjectRow>(`
        SELECT * FROM project.resolve_key_conformance_subject($1, $2, $3)
      `, [request.accountId, request.registration.projectId, request.registration.connectionId])
      if (result.rows.length !== 1) return null
      return captureRow(result.rows[0])
    } catch (error) {
      if (knownRefusal(error)) return null
      throw error
    }
  }

  return async (request: ProjectKeyConformanceBasisRequest): Promise<ProjectKeyConformanceBasis | null> => {
    const before = await resolveDatabase(request)
    if (!before) return null
    if (before.workspaceId !== request.registration.workspaceId ||
      before.projectId !== request.registration.projectId ||
      before.connectionId !== request.registration.connectionId ||
      before.environment !== request.registration.environment) return null
    const projectSource = sourceSnapshot({ projectId: before.projectId, sourceRevision: before.sourceRevision })
    const source = await readProjectBrainRealizationManifest({
      source: projectSource,
      expectedSourceRevision: before.sourceRevision,
    })
    if (!source.manifest.mappings.some((mapping) =>
      mapping.itemId === request.registration.datasetId &&
      mapping.queryId === request.registration.queryId &&
      mapping.mappingDigest === request.registration.mappingDigest)) return null
    if (!await sourceDeclaresBasis(projectSource, before)) throw new Error('KEY_CONFORMANCE_SUBJECT_SOURCE_CONFLICT')
    const after = await resolveDatabase(request)
    if (!after || !sameBasis(before, after)) throw new Error('KEY_CONFORMANCE_SUBJECT_DRIFT')
    return Object.freeze({ ...after, inputDigest: source.inputDigest })
  }
}
