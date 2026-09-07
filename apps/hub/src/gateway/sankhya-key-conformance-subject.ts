import { sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type {
  RegisteredKeyConformanceResolutionRequest,
  RegisteredKeyConformanceResolver,
  RegisteredKeyConformanceSubject,
} from './key-conformance.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const DIGEST = /^[0-9a-f]{64}$/
const SOURCE_REVISION = /^[0-9a-f]{40}$/
const GENERATION = /^(?:0|[1-9][0-9]{0,18})$/
const SIGNED_BIGINT_MAX = 9_223_372_036_854_775_807n

export type SankhyaKeyConformanceBasis = Readonly<{
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

export type SankhyaKeyConformanceBasisResolver = (
  request: RegisteredKeyConformanceResolutionRequest,
) => PromiseLike<SankhyaKeyConformanceBasis | null> | SankhyaKeyConformanceBasis | null

const validBasis = (value: unknown): value is SankhyaKeyConformanceBasis => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = [
    'workspaceId', 'projectId', 'connectionId', 'connectionRevisionId', 'qualificationId',
    'credentialGeneration', 'environment', 'companyCode', 'connectorDefinitionId',
    'connectorVersion', 'sourceRevision', 'inputDigest',
  ]
  if (Reflect.ownKeys(record).length !== keys.length || !keys.every((key) => Object.hasOwn(record, key))) return false
  if (![record.workspaceId, record.projectId, record.connectionId,
    record.connectionRevisionId, record.qualificationId].every((entry) => typeof entry === 'string' && UUID.test(entry))) return false
  if (typeof record.credentialGeneration !== 'string' || !GENERATION.test(record.credentialGeneration) ||
    BigInt(record.credentialGeneration) > SIGNED_BIGINT_MAX) return false
  return (record.environment === 'SANDBOX' || record.environment === 'PRODUCTION') &&
    Number.isInteger(record.companyCode) && Number(record.companyCode) >= 1 && Number(record.companyCode) <= 2_147_483_647 &&
    record.connectorDefinitionId === 'sankhya-om' && record.connectorVersion === '1.0.0' &&
    typeof record.sourceRevision === 'string' && SOURCE_REVISION.test(record.sourceRevision) &&
    typeof record.inputDigest === 'string' && DIGEST.test(record.inputDigest)
}

/** Gateway-owned logical source identity. Key order and bytes are part of the ratified v1 contract. */
export const sankhyaSourceScopeId = (basis: Pick<SankhyaKeyConformanceBasis,
  'connectorDefinitionId' | 'connectorVersion' | 'connectionId' | 'companyCode' | 'environment'>): string => {
  const value = {
    schemaVersion: 'conexus-sankhya-source-scope/v1',
    connectorDefinitionId: basis.connectorDefinitionId,
    connectorVersion: basis.connectorVersion,
    connectionId: basis.connectionId,
    companyCode: basis.companyCode,
    environment: basis.environment,
  }
  return sha256(Buffer.from(JSON.stringify(value), 'utf8'))
}

/** Composes owner-resolved facts into the closed Gateway subject; expected request digests never enter this boundary. */
export const createSankhyaKeyConformanceSubjectResolver = ({
  resolveBasis,
}: Readonly<{ resolveBasis: SankhyaKeyConformanceBasisResolver }>): RegisteredKeyConformanceResolver => {
  if (typeof resolveBasis !== 'function') throw new Error('KEY_CONFORMANCE_SUBJECT_CONFIGURATION_INVALID')
  return async (request): Promise<RegisteredKeyConformanceSubject | null> => {
    const basis = await resolveBasis(request)
    if (basis === null) return null
    if (!validBasis(basis)) throw new Error('KEY_CONFORMANCE_SUBJECT_INVALID')
    if (basis.workspaceId !== request.registration.workspaceId ||
      basis.projectId !== request.registration.projectId ||
      basis.connectionId !== request.registration.connectionId ||
      basis.environment !== request.registration.environment) return null
    return Object.freeze({
      workspaceId: basis.workspaceId,
      projectId: basis.projectId,
      connectionId: basis.connectionId,
      connectionRevisionId: basis.connectionRevisionId,
      qualificationId: basis.qualificationId,
      credentialGeneration: basis.credentialGeneration,
      environment: basis.environment,
      sourceScopeId: sankhyaSourceScopeId(basis),
      sourceRevision: basis.sourceRevision,
      inputDigest: basis.inputDigest,
    })
  }
}
