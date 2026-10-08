import { type FailureCode } from './failures.generated.js';
import { type TraceId } from './problem.js';
/** A public failure reconstructed at a client boundary. It never carries server diagnostics. */
export declare class ReceivedFailure extends Error {
    readonly code: FailureCode;
    readonly status: number | null;
    readonly traceId: TraceId | null;
    constructor(code: FailureCode, status: number | null, traceId?: TraceId | null);
}
/** Reads only the closed Problem representation, and requires its status to match the HTTP status. */
export declare function readFailure(response: Response): Promise<ReceivedFailure>;
export declare function isFailure(error: unknown, ...codes: readonly FailureCode[]): error is ReceivedFailure;
/** The short reference for stored run identifiers as well as validated trace identifiers. */
export declare function shortReference(id: string): string;
export declare function failureText(error: unknown): string;
export declare function failureCodeText(code: string | null | undefined): string;
export declare function isRetryable(error: unknown): boolean;
