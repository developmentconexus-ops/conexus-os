// The closed codes a consumer may see; never a provider body, header, status text or token.
export const BROKER_ERROR_CODES = [
  'OPERATION_UNKNOWN',
  'INPUT_REFUSED',
  'EFFECT_REFUSED',
  'NOT_GRANTED',
  'CONNECTOR_UNCONFIGURED',
  'CREDENTIAL_REFUSED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
  'RESPONSE_REFUSED',
  'CALL_LIMIT',
  'SERVICE_REFUSED',
] as const

export type BrokerErrorCode = typeof BROKER_ERROR_CODES[number]

type Refusal = Readonly<{ ok: false; code: BrokerErrorCode; issues?: readonly string[] }>

export type BrokerResult<O> = Readonly<{ ok: true; value: O }> | Refusal

const ISSUE_LIMIT = 10

// Schema paths only: an unrecognized key is the caller's own text, so it comes back as a placeholder.
export const inputIssues = (issues: readonly Readonly<{ path: readonly PropertyKey[]; code: string }>[]): readonly string[] =>
  [...new Set(issues.slice(0, ISSUE_LIMIT).map((issue) => {
    const path = `/${issue.path.map(String).join('/')}`
    return (issue.code === 'unrecognized_keys' ? `${path === '/' ? '' : path}/<unrecognized>` : path).slice(0, 200)
  }))]

export const refused = (code: BrokerErrorCode, issues?: readonly string[]): Refusal =>
  Object.freeze(issues && issues.length > 0 ? { ok: false, code, issues: Object.freeze([...issues]) } : { ok: false, code })

/** What an adapter may report. `TOKEN_REFUSED` is the token cache's signal to drop and reissue once. */
export type AdapterFailureReason =
  | 'AUTHENTICATION_REFUSED'
  | 'TOKEN_REFUSED'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'PROVIDER_ERROR'
  | 'RESPONSE_REFUSED'
  | 'SERVICE_REFUSED'

/** Carries a reason and nothing else: no provider text can ride along in its message. */
export class AdapterFailure extends Error {
  readonly reason: AdapterFailureReason
  constructor(reason: AdapterFailureReason) {
    super(reason)
    this.name = 'AdapterFailure'
    this.reason = reason
  }
}

export const brokerCodeOf = (reason: AdapterFailureReason): BrokerErrorCode => {
  switch (reason) {
    case 'AUTHENTICATION_REFUSED': return 'CREDENTIAL_REFUSED'
    // Reaching the broker means the one retry was spent: a fresh token was refused too.
    case 'TOKEN_REFUSED': return 'CREDENTIAL_REFUSED'
    case 'TIMEOUT': return 'PROVIDER_TIMEOUT'
    case 'UNAVAILABLE': return 'PROVIDER_UNAVAILABLE'
    case 'PROVIDER_ERROR': return 'PROVIDER_ERROR'
    case 'RESPONSE_REFUSED': return 'RESPONSE_REFUSED'
    case 'SERVICE_REFUSED': return 'SERVICE_REFUSED'
  }
}
