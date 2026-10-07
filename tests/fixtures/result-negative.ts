import type { Result } from '@conexus/contract'

export type ManifestRefusal = Readonly<{ code: 'MANIFEST_REFUSED'; where: string; diagnostic: string }>
export type AccountConnectionError = Readonly<{ code: 'ACCOUNT_INACTIVE' | 'ACCOUNT_NOT_FOUND' }>

// @ts-expect-error Unknown codes are not part of the failure table.
export type UnknownCode = Result<string, { readonly code: 'UNREGISTERED_CODE' }>
// @ts-expect-error Success carries result, not value.
export const flatSuccess: Result<string, ManifestRefusal> = { ok: true, value: 'accepted' }
// @ts-expect-error Failure carries error, not a flat code.
export const flatFailure: Result<string, ManifestRefusal> = { ok: false, code: 'MANIFEST_REFUSED' }
// @ts-expect-error A refusal can use only its operation's codes.
export const unrelated: Result<string, ManifestRefusal> = { ok: false, error: { code: 'NOT_FOUND', where: '', diagnostic: '' } }
export declare const result: Result<string, ManifestRefusal>
// @ts-expect-error The success payload is unavailable until the result is narrowed.
result.result
if (!result.ok) {
  // @ts-expect-error Result variants are readonly.
  result.error = { code: 'MANIFEST_REFUSED', where: '', diagnostic: '' }
}

export function accountConnection(): Result<void, AccountConnectionError> {
  return { ok: true, result: undefined }
}
