import { isSankhyaConfiguration } from './sankhya-om.js'

export type SankhyaResponseAdmission = Readonly<{
  schemaId: string
  decodeBearer(value: unknown): string | null
  decodeCompany(value: unknown, expectedCompanyCode: number): 'MATCH' | 'MISMATCH' | null
}>

const MAX_TEXT_LENGTH = 256

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

const hasExactKeys = (value: UnknownRecord, keys: readonly string[]): boolean => {
  const actual = Reflect.ownKeys(value)
  return actual.length === keys.length && actual.every((key) => typeof key === 'string' && keys.includes(key))
}

const productionAdmission = Object.freeze({
  schemaId: 'sankhya-om-production/v1',
  decodeBearer(value: unknown): string | null {
    if (!isRecord(value) || !hasExactKeys(value, ['access_token', 'expires_in', 'not-before-policy', 'refresh_expires_in', 'scope', 'token_type'])) return null
    if (typeof value.access_token !== 'string' || value.access_token.length === 0 || value.access_token.length > 8 * 1024 ||
      typeof value.expires_in !== 'number' || !Number.isSafeInteger(value.expires_in) || value.expires_in < 0 ||
      typeof value['not-before-policy'] !== 'number' || !Number.isSafeInteger(value['not-before-policy']) || value['not-before-policy'] < 0 ||
      typeof value.refresh_expires_in !== 'number' || !Number.isSafeInteger(value.refresh_expires_in) || value.refresh_expires_in < 0 ||
      value.token_type !== 'Bearer' || typeof value.scope !== 'string' || value.scope.length > MAX_TEXT_LENGTH) return null
    return value.access_token
  },
  decodeCompany(value: unknown, expectedCompanyCode: number): 'MATCH' | 'MISMATCH' | null {
    if (!isRecord(value) || !isRecord(value.empresas)) return null
    const empresa = value.empresas
    if (!Object.hasOwn(empresa, 'codigoEmpresa') || typeof empresa.codigoEmpresa !== 'number' ||
      !Number.isSafeInteger(empresa.codigoEmpresa) || empresa.codigoEmpresa < 1 || empresa.codigoEmpresa > 2_147_483_647) return null
    return empresa.codigoEmpresa === expectedCompanyCode ? 'MATCH' : 'MISMATCH'
  },
}) satisfies SankhyaResponseAdmission

export const sankhyaProductionResponseAdmission: SankhyaResponseAdmission = productionAdmission

/**
 * Select only the response shape admitted for the current installation's
 * production qualification envelope.  This is deliberately closed: the
 * caller cannot choose a parser, environment, company or connector alias.
 */
export const selectSankhyaProductionResponseAdmission = (
  configuration: unknown,
): SankhyaResponseAdmission | undefined => {
  if (!isSankhyaConfiguration(configuration)) return undefined
  if (configuration.environment !== 'PRODUCTION' ||
    (configuration.companyCode !== 1 && configuration.companyCode !== 2)) return undefined
  return sankhyaProductionResponseAdmission
}
