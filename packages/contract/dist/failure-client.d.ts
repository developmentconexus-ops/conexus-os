import { type FailureCode } from './failures.generated.js';
/** A public failure reconstructed at a client boundary. It never carries server diagnostics. */
export declare class ReceivedFailure extends Error {
    readonly code: FailureCode;
    readonly status: number | null;
    readonly traceId: string | null;
    constructor(code: FailureCode, status: number | null, traceId?: string | null);
}
/** Reads only the closed Problem representation, and requires its status to match the HTTP status. */
export declare function readFailure(response: Response): Promise<ReceivedFailure>;
export declare const isFailure: (error: unknown, ...codes: readonly FailureCode[]) => error is ReceivedFailure;
/** The short reference for stored run identifiers as well as validated trace identifiers. */
export declare const shortReference: (id: string) => string;
export declare const failureText: (error: unknown) => string;
export declare const failureCodeText: (code: string | null | undefined) => string;
export declare const isRetryable: (error: unknown) => boolean;
