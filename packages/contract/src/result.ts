import type { FailureCode } from './failures.generated.js'

export type Result<T, E extends Readonly<{ code: FailureCode }>> =
  | Readonly<{ ok: true; result: T }>
  | Readonly<{ ok: false; error: E }>
