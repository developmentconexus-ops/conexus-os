import { FAILURE_ACTIONS, FAILURE_STATUS, FAILURES } from './failures.generated.js';
import { Problem } from './problem.js';
/** A public failure reconstructed at a client boundary. It never carries server diagnostics. */
export class ReceivedFailure extends Error {
    code;
    status;
    traceId;
    constructor(code, status, traceId = null) {
        super(code);
        this.name = 'ReceivedFailure';
        this.code = code;
        this.status = status;
        this.traceId = traceId;
    }
}
const isFailureCode = (value) => typeof value === 'string' && Object.hasOwn(FAILURE_STATUS, value);
/** Reads only the closed Problem representation, and requires its status to match the HTTP status. */
export async function readFailure(response) {
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/problem+json')
        return new ReceivedFailure('HUB_RESPONSE_UNREADABLE', response.status);
    const body = await response.json().catch(() => null);
    const parsed = Problem.safeParse(body);
    if (response.status < 400 || response.status > 599 || !parsed.success || parsed.data.status !== response.status) {
        return new ReceivedFailure('HUB_RESPONSE_UNREADABLE', response.status);
    }
    const { code, traceId } = parsed.data;
    return new ReceivedFailure(code, response.status, traceId ?? null);
}
export const isFailure = (error, ...codes) => error instanceof ReceivedFailure && (codes.length === 0 || codes.includes(error.code));
const hasAudienceRow = (code) => {
    return Object.hasOwn(FAILURES, code);
};
const rowOf = (code) => {
    if (!hasAudienceRow(code))
        return FAILURES.INTERNAL_UNEXPECTED;
    return FAILURES[code];
};
const sentence = (code) => {
    const row = rowOf(code);
    const action = FAILURE_ACTIONS[row.action];
    return action === null ? row.message : `${row.message} ${action}`;
};
/** The short reference for stored run identifiers as well as validated trace identifiers. */
export const shortReference = (id) => `Referência: ${id.slice(0, 8)}.`;
export const failureText = (error) => {
    const code = error instanceof ReceivedFailure ? error.code : 'HUB_RESPONSE_UNREADABLE';
    const text = sentence(code);
    return error instanceof ReceivedFailure && error.traceId !== null && rowOf(code).category === 'SYSTEM'
        ? `${text} ${shortReference(error.traceId)}`
        : text;
};
export const failureCodeText = (code) => sentence(code !== null && code !== undefined && isFailureCode(code) ? code : 'INTERNAL_UNEXPECTED');
export const isRetryable = (error) => rowOf(error instanceof ReceivedFailure ? error.code : 'HUB_RESPONSE_UNREADABLE').action === 'RETRY_LATER';
