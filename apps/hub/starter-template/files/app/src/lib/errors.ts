import { ConexusError, failureMessage } from '../conexus/failures.gen'

// Plain Portuguese for what the person can act on. The text of each failure is a row of the
// Conexus failure table, written into `conexus/failures.gen.ts` on every check.

// A handler that throws is a bug and arrives as a row too; a call that never reached Conexus has no row.
export function errorMessage(error: unknown): string {
  return failureMessage(error instanceof ConexusError ? error.code : '')
}

// The code of a failed `connectors.fetch`, which a handler returns in its output's `failure` field.
export function connectionMessage(code: string): string {
  return failureMessage(code)
}
