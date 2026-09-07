import { TextDecoder } from 'node:util'
import type { CredentialBackend, CredentialCoordinate } from '../platform/credential-backend.js'
import { requestBoundedJson, type BoundedJsonResponse } from '../platform/bounded-json.js'
import {
  isSankhyaConfiguration,
  isSankhyaCredentialInput,
  resolveSankhyaOrigin,
  sankhyaOmConnectorDefinition,
  type SankhyaConfiguration,
  type SankhyaCredentialInput,
} from './sankhya-om.js'
import type { SankhyaResponseAdmission } from './sankhya-response-admission.js'

const maximumBearerBytes = 8 * 1024
const maximumAuthenticationHeaderBytes = 16 * 1024
const maximumAuthenticationFormBytes = 64 * 1024
const maximumCredentialBytes = 64 * 1024
const utf8 = new TextDecoder('utf-8', { fatal: true })
const schemaIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/
const bearerPattern = /^[A-Za-z0-9\-._~+/]+=*$/

const decodeSankhyaCredential = (bytes: Uint8Array): SankhyaCredentialInput => {
  if (bytes.byteLength === 0 || bytes.byteLength > maximumCredentialBytes) throw new Error('SANKHYA_CREDENTIAL_REFUSED')
  try {
    const value: unknown = JSON.parse(utf8.decode(bytes))
    if (!isSankhyaCredentialInput(value)) throw new Error('SANKHYA_CREDENTIAL_REFUSED')
    return value
  } catch (error) {
    if (error instanceof Error && error.message === 'SANKHYA_CREDENTIAL_REFUSED') throw error
    throw new Error('SANKHYA_CREDENTIAL_REFUSED')
  }
}

/** Shared last-mile authentication mechanics for Connection-owned composition. */
export const authenticateSankhya = async ({
  configuration,
  credentialCoordinate,
  credentialBackend,
  responseAdmission,
  fetchImpl = globalThis.fetch,
}: Readonly<{
  configuration: SankhyaConfiguration
  credentialCoordinate: CredentialCoordinate
  credentialBackend: CredentialBackend
  responseAdmission: SankhyaResponseAdmission
  fetchImpl?: typeof fetch
}>): Promise<Readonly<{ bearer: string }>> => {
  if (!isSankhyaConfiguration(configuration)) throw new Error('SANKHYA_CONFIGURATION_REFUSED')
  if (!responseAdmission || typeof responseAdmission.schemaId !== 'string' || !schemaIdPattern.test(responseAdmission.schemaId) ||
    typeof responseAdmission.decodeBearer !== 'function') throw new Error('SANKHYA_RESPONSE_ADMISSION_REFUSED')

  let credentialBytes: Uint8Array
  try {
    credentialBytes = await credentialBackend.materialize(credentialCoordinate)
  } catch {
    throw new Error('SANKHYA_CREDENTIAL_UNAVAILABLE')
  }

  let credential: SankhyaCredentialInput
  try {
    credential = decodeSankhyaCredential(credentialBytes)
  } finally {
    credentialBytes.fill(0)
  }

  const authentication = sankhyaOmConnectorDefinition.authentication
  const authenticationUrl = new URL(authentication.path, resolveSankhyaOrigin(configuration.environment)).toString()
  const authenticationForm = new URLSearchParams({
    grant_type: authentication.grantType,
    client_id: credential.clientId,
    client_secret: credential.clientSecret,
  }).toString()
  if (
    Buffer.byteLength(authenticationForm) > maximumAuthenticationFormBytes
    || Buffer.byteLength(credential.xToken) > maximumAuthenticationHeaderBytes
    || /[\r\n]/.test(credential.xToken)
  ) throw new Error('SANKHYA_CREDENTIAL_REFUSED')

  let result: BoundedJsonResponse
  try {
    result = await requestBoundedJson(fetchImpl, authenticationUrl, {
      method: authentication.method,
      headers: {
        'content-type': authentication.contentType,
        [authentication.xTokenHeader]: credential.xToken,
      },
      body: authenticationForm,
    }, 16 * 1024)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('BOUNDED_JSON_')) throw new Error('SANKHYA_RESPONSE_REFUSED')
    throw new Error('SANKHYA_TRANSPORT_FAILED')
  }
  if (!result.response.ok) throw new Error(`SANKHYA_HTTP_${result.response.status}`)

  let bearer: string | null = null
  try { bearer = responseAdmission.decodeBearer(result.body) } catch { bearer = null }
  if (typeof bearer !== 'string' || !bearer || Buffer.byteLength(bearer) > maximumBearerBytes || !bearerPattern.test(bearer)) {
    throw new Error('SANKHYA_RESPONSE_REFUSED')
  }
  return Object.freeze({ bearer })
}

export { decodeSankhyaCredential }
export type { SankhyaResponseAdmission } from './sankhya-response-admission.js'
