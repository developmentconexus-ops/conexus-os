import type { FailureCode, TraceReference } from './types.js'

export class ReceivedFailure extends Error {
  readonly code: FailureCode
  readonly status: number | null
  readonly traceId: TraceReference

  constructor(input: Readonly<{ code: FailureCode; status: number | null; traceId: TraceReference }>) {
    super(input.code)
    this.name = 'ReceivedFailure'
    this.code = input.code
    this.status = input.status
    this.traceId = input.traceId
  }
}

export declare function readFailure(response: Response): Promise<ReceivedFailure>
export declare function failureText(error: unknown): string
export declare function failureCodeText(code: string | null | undefined): string
export declare function isFailure(error: unknown, ...codes: readonly FailureCode[]): boolean
export declare function isRetryable(error: unknown): boolean
export declare function shortReference(id: string): string
