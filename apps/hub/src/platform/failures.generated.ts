// GENERATED from contracts/technical/failures.json by scripts/generate-failures.mjs. Do not edit.

type FailureCategory = 'USER' | 'SYSTEM' | 'THIRD_PARTY'
type FailureRow = Readonly<{ category: FailureCategory; status: number }>

export const FAILURES = {
  'INTERNAL_UNEXPECTED': { category: 'SYSTEM', status: 500 },
  'NOT_FOUND': { category: 'USER', status: 404 },
  'REQUEST_VALIDATION_FAILED': { category: 'USER', status: 400 },
  'REQUEST_JSON_INVALID': { category: 'USER', status: 400 },
  'REQUEST_JSON_EMPTY': { category: 'USER', status: 400 },
  'REQUEST_BODY_TOO_LARGE': { category: 'USER', status: 413 },
  'REQUEST_MEDIA_TYPE_UNSUPPORTED': { category: 'USER', status: 415 },
} as const satisfies Readonly<Record<string, FailureRow>>

export type FailureCode = keyof typeof FAILURES
