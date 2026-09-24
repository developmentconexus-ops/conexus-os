// The closed codes of design.md section 2. A consumer only ever sees one of these, never a provider
// body, header, status text or token.
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

export type BrokerResult<O> =
  | Readonly<{ ok: true; value: O }>
  | Readonly<{ ok: false; code: BrokerErrorCode; issues?: readonly string[] }>

export const refused = (code: BrokerErrorCode, issues?: readonly string[]): BrokerResult<never> =>
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
