import type { CredentialBackend, CredentialCoordinate } from '../platform/credential-backend.js'
import { requestBoundedJson } from '../platform/bounded-json.js'
import {
  isSankhyaConfiguration,
  resolveSankhyaOrigin,
  sankhyaOmConnectorDefinition,
  type SankhyaConfiguration,
  type SankhyaCredentialInput,
} from './sankhya-om.js'
import { decodeSankhyaCredential } from './transport.js'
import {
  selectSankhyaProductionResponseAdmission,
  type SankhyaResponseAdmission,
} from './sankhya-response-admission.js'

export type { SankhyaResponseAdmission } from './sankhya-response-admission.js'

export type ConnectionQualificationSettlement = Readonly<{
  qualificationState: string
  outcome: 'PASSED' | 'FAILED' | 'INDETERMINATE'
  diagnostic: Readonly<{ title: string; message: string; remediation?: string }>
  evidenceRefs: readonly string[]
}>

type QualifySankhyaOmInput = Readonly<{
  configuration: SankhyaConfiguration
  credentialCoordinate: CredentialCoordinate
  credentialBackend: CredentialBackend
  responseAdmission?: SankhyaResponseAdmission
  fetchImpl?: typeof fetch
}>

export type SankhyaProductionQualifierInput = Readonly<{
  configuration: SankhyaConfiguration
  connectionId: string
  credentialGeneration: string
  credentialBackend: CredentialBackend
}>

const maximumAuthenticationResponseBytes = 16 * 1024
const maximumCompanyResponseBytes = 256 * 1024
const maximumBearerBytes = 8 * 1024
const maximumAuthenticationHeaderBytes = 16 * 1024
const maximumAuthenticationFormBytes = 64 * 1024
const schemaIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/
const bearerPattern = /^[A-Za-z0-9\-._~+/]+=*$/

const settlement = (
  qualificationState: string,
  outcome: ConnectionQualificationSettlement['outcome'],
  title: string,
  message: string,
  evidenceRefs: readonly string[],
  remediation?: string,
): ConnectionQualificationSettlement => Object.freeze({
  qualificationState,
  outcome,
  diagnostic: Object.freeze({ title, message, ...(remediation ? { remediation } : {}) }),
  evidenceRefs: Object.freeze([...new Set(evidenceRefs)]),
})

const baseEvidence = Object.freeze([
  'connector:sankhya-om@1.0.0',
  'capability:sankhya.company.read.v1',
])

const transportFailure = (stage: 'authentication' | 'company'): ConnectionQualificationSettlement => settlement(
  'PROVIDER_INDETERMINATE',
  'INDETERMINATE',
  'Provider could not be verified',
  `The ${stage} request did not produce a bounded provider response.`,
  [...baseEvidence, `transport:${stage}:indeterminate`],
  'Verify provider availability and try a new qualification attempt.',
)

const providerStatus = (
  stage: 'authentication' | 'company',
  status: number,
): ConnectionQualificationSettlement => {
  const evidence = [...baseEvidence, `http:${stage}:${status}`]
  if (status === 401 || status === 403) return settlement(
    'PROVIDER_REJECTED',
    'FAILED',
    'Provider rejected the connection',
    `The provider rejected the ${stage} request.`,
    evidence,
    'Review the configured credential and company access, then test again.',
  )
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return settlement(
    'PROVIDER_REJECTED',
    'FAILED',
    'Provider rejected the connection',
    `The provider rejected the ${stage} request.`,
    evidence,
    'Review the non-secret configuration and credential, then test again.',
  )
  return settlement(
    'PROVIDER_INDETERMINATE',
    'INDETERMINATE',
    'Provider could not be verified',
    `The provider did not complete the ${stage} request reliably.`,
    evidence,
    'Verify provider availability and try a new qualification attempt.',
  )
}

// Keep these aliases local to preserve the qualification module's existing
// behavior while routing all bounded transport through the shared mechanics.
const requestOnce = requestBoundedJson

export const qualifySankhyaOm = async ({
  configuration,
  credentialCoordinate,
  credentialBackend,
  responseAdmission,
  fetchImpl = globalThis.fetch,
}: QualifySankhyaOmInput): Promise<ConnectionQualificationSettlement> => {
  if (!isSankhyaConfiguration(configuration)) throw new Error('SANKHYA_CONFIGURATION_REFUSED')
  if (!responseAdmission) return settlement(
    'PROVIDER_SCHEMA_UNPROVEN',
    'INDETERMINATE',
    'Provider response schema is not admitted',
    'No exact Sankhya authentication and company response schema is currently admitted.',
    [...baseEvidence, 'response-schema:not-admitted', 'egress:not-authorized'],
    'Complete the controlled live schema admission before claiming qualification.',
  )
  if (
    typeof responseAdmission.schemaId !== 'string' || !schemaIdPattern.test(responseAdmission.schemaId)
  ) {
    throw new Error('SANKHYA_RESPONSE_ADMISSION_REFUSED')
  }

  let credentialBytes: Uint8Array
  try {
    credentialBytes = await credentialBackend.materialize(credentialCoordinate)
  } catch {
    return settlement(
      'CREDENTIAL_UNAVAILABLE',
      'INDETERMINATE',
      'Credential could not be used',
      'The exact current credential generation could not be materialized safely.',
      [...baseEvidence, 'credential:unavailable'],
      'Replace the credential and test the connection again.',
    )
  }

  let credential: SankhyaCredentialInput
  try {
    credential = decodeSankhyaCredential(credentialBytes)
  } catch {
    return settlement(
      'CREDENTIAL_INVALID',
      'FAILED',
      'Credential is not valid for this connector',
      'The exact current credential does not match the admitted connector credential schema.',
      [...baseEvidence, 'credential:invalid'],
      'Replace the credential with all required values and test again.',
    )
  } finally {
    credentialBytes.fill(0)
  }

  const origin = resolveSankhyaOrigin(configuration.environment)
  const authentication = sankhyaOmConnectorDefinition.authentication
  const authenticationUrl = new URL(authentication.path, origin).toString()
  const authenticationForm = new URLSearchParams({
    grant_type: authentication.grantType,
    client_id: credential.clientId,
    client_secret: credential.clientSecret,
  }).toString()
  if (
    Buffer.byteLength(authenticationForm) > maximumAuthenticationFormBytes
    || Buffer.byteLength(credential.xToken) > maximumAuthenticationHeaderBytes
    || /[\r\n]/.test(credential.xToken)
  ) {
    return settlement(
      'CREDENTIAL_INVALID',
      'FAILED',
      'Credential is not valid for this connector',
      'The exact current credential cannot be represented at the admitted provider boundary.',
      [...baseEvidence, 'credential:transport-refused'],
      'Replace the credential and test the connection again.',
    )
  }

  let authenticationResult: Readonly<{ response: Response; body?: unknown }>
  try {
    authenticationResult = await requestOnce(fetchImpl, authenticationUrl, {
      method: authentication.method,
      headers: {
        'content-type': authentication.contentType,
        [authentication.xTokenHeader]: credential.xToken,
      },
      body: authenticationForm,
    }, maximumAuthenticationResponseBytes)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('BOUNDED_JSON_')) return settlement(
      'PROVIDER_SCHEMA_UNPROVEN',
      'INDETERMINATE',
      'Provider response could not be verified',
      'The authentication response did not match the admitted bounded response contract.',
      [...baseEvidence, 'response:authentication:refused'],
      'Verify the admitted provider response schema before testing again.',
    )
    return transportFailure('authentication')
  }
  const authenticationResponse = authenticationResult.response
  if (!authenticationResponse.ok) {
    return providerStatus('authentication', authenticationResponse.status)
  }
  let bearer: string | null
  try { bearer = responseAdmission.decodeBearer(authenticationResult.body) } catch { bearer = null }
  if (
    typeof bearer !== 'string'
    || !bearer
    || Buffer.byteLength(bearer) > maximumBearerBytes
    || !bearerPattern.test(bearer)
  ) return settlement(
    'PROVIDER_SCHEMA_UNPROVEN',
    'INDETERMINATE',
    'Provider response could not be verified',
    'The authentication response did not match the exact admitted response schema.',
    [...baseEvidence, `response-schema:${responseAdmission.schemaId}`, 'response:authentication:refused'],
    'Verify provider compatibility and the admitted response schema.',
  )

  const capability = sankhyaOmConnectorDefinition.capabilities.find(
    ({ capabilityId }) => capabilityId === 'sankhya.company.read.v1',
  )
  if (!capability) throw new Error('SANKHYA_CAPABILITY_REFUSED')
  const companyPath = capability.pathTemplate.replace(
    '{serverResolvedCompanyCode}',
    encodeURIComponent(String(configuration.companyCode)),
  )
  let companyResult: Readonly<{ response: Response; body?: unknown }>
  try {
    companyResult = await requestOnce(fetchImpl, new URL(companyPath, origin).toString(), {
      method: capability.method,
      headers: { authorization: `Bearer ${bearer}` },
    }, maximumCompanyResponseBytes)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('BOUNDED_JSON_')) return settlement(
      'PROVIDER_SCHEMA_UNPROVEN',
      'INDETERMINATE',
      'Provider response could not be verified',
      'The company response did not match the admitted bounded response contract.',
      [...baseEvidence, `response-schema:${responseAdmission.schemaId}`, 'response:company:refused'],
      'Verify provider compatibility and the admitted response schema.',
    )
    return transportFailure('company')
  }
  const companyResponse = companyResult.response
  if (!companyResponse.ok) {
    return providerStatus('company', companyResponse.status)
  }
  let company: 'MATCH' | 'MISMATCH' | null
  try {
    company = responseAdmission.decodeCompany(companyResult.body, configuration.companyCode)
  } catch {
    company = null
  }
  if (company !== 'MATCH' && company !== 'MISMATCH') return settlement(
    'PROVIDER_SCHEMA_UNPROVEN',
    'INDETERMINATE',
    'Provider response could not be verified',
    'The company response did not match the exact admitted response schema.',
    [...baseEvidence, `response-schema:${responseAdmission.schemaId}`, 'response:company:refused'],
    'Verify provider compatibility and the admitted response schema.',
  )
  if (company === 'MISMATCH') return settlement(
    'COMPANY_MISMATCH',
    'FAILED',
    'Provider returned a different company',
    'The provider response did not identify the exact server-resolved company.',
    [...baseEvidence, `response-schema:${responseAdmission.schemaId}`, 'company:mismatch'],
    'Review the company configuration and credential scope, then test again.',
  )
  return settlement(
    'PROVIDER_CONFIRMED',
    'PASSED',
    'Connection test passed',
    'The provider confirmed the exact configured company for this qualification attempt.',
    [...baseEvidence, `response-schema:${responseAdmission.schemaId}`, 'company:confirmed'],
  )
}

/**
 * Production Connections qualifier. Selection is performed from the
 * reserved configuration before the credential coordinate is materialized.
 * The low-level qualifier remains independently injectable for transport
 * contract tests and other explicitly admitted compositions.
 */
const qualifySankhyaProductionWithFetch = async ({
  configuration,
  connectionId,
  credentialGeneration,
  credentialBackend,
}: SankhyaProductionQualifierInput, fetchImpl: typeof fetch): Promise<ConnectionQualificationSettlement> => {
  const responseAdmission = selectSankhyaProductionResponseAdmission(configuration)
  if (!responseAdmission) return settlement(
    'PROVIDER_SCHEMA_UNPROVEN',
    'INDETERMINATE',
    'Provider response schema is not admitted',
    'The reserved Connection configuration is outside the admitted Sankhya production qualification envelope.',
    [...baseEvidence, 'response-schema:not-admitted', 'egress:not-authorized'],
    'Use an admitted production company and test again.',
  )
  return qualifySankhyaOm({
    configuration,
    credentialCoordinate: { connectionId, generation: credentialGeneration },
    credentialBackend,
    responseAdmission,
    fetchImpl,
  })
}

export const qualifySankhyaProduction = (
  input: SankhyaProductionQualifierInput,
): Promise<ConnectionQualificationSettlement> =>
  qualifySankhyaProductionWithFetch(input, globalThis.fetch)

export const createSankhyaProductionQualifier = (
  fetchImpl: typeof fetch = globalThis.fetch,
) => (input: SankhyaProductionQualifierInput): Promise<ConnectionQualificationSettlement> =>
  qualifySankhyaProductionWithFetch(input, fetchImpl)
