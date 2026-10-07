import type { Result, ManifestRefusal, WorkerAnswer, PrepareAnswer, AccountConnectionAnswer } from './types.js'
import { Failure, failureResponse } from './server.js'
import { ReceivedFailure } from './client.js'

// @ts-expect-error Unknown codes cannot enter the shared envelope.
type Unknown = Result<string, { code: 'UNREGISTERED_CODE' }>
// @ts-expect-error Success owns result, never value.
const oldSuccess: Result<string, ManifestRefusal> = { ok: true, value: 'accepted' }
// @ts-expect-error Failure owns error, never a flat code.
const oldFailure: Result<string, ManifestRefusal> = { ok: false, code: 'MANIFEST_REFUSED' }
// @ts-expect-error An operation refuses only with its own narrowed codes.
const unrelated: Result<string, ManifestRefusal> = { ok: false, error: { code: 'NOT_FOUND', where: '', diagnostic: '' } }
declare const answer: Result<string, ManifestRefusal>
// @ts-expect-error Narrow ok before reading the successful payload.
answer.result
if (!answer.ok) {
  // @ts-expect-error The envelope is readonly.
  answer.error = { code: 'MANIFEST_REFUSED', where: '', diagnostic: '' }
}
// @ts-expect-error Worker failures do not transport text.
const leaks: WorkerAnswer = { ok: false, error: { code: 'HANDLER_FAILED', detail: 'synthetic private marker' } }
// @ts-expect-error The worker cannot emit another operation's refusal.
const wrongWorker: WorkerAnswer = { ok: false, error: { code: 'MANIFEST_REFUSED' } }
// @ts-expect-error A failed preparation carries no successful reset decision.
const badPrepare: PrepareAnswer = { ok: false, result: { reset: true, applied: [] }, error: { code: 'MANIFEST_REFUSED' } }
// @ts-expect-error Account connection has a closed subset of the same vocabulary.
const wrongAccount: AccountConnectionAnswer = { ok: false, error: { code: 'PROJECT_NOT_FOUND' } }
// @ts-expect-error The public sender cannot accept private diagnostics.
failureResponse({ code: 'MANIFEST_REFUSED', traceId: null, diagnostic: 'private marker' })
// @ts-expect-error The browser type carries no cause or detail.
new ReceivedFailure({ code: 'NOT_FOUND', status: 404, traceId: null, detail: 'private marker' })
// @ts-expect-error Logged server diagnostics are scalar.
new Failure('INTERNAL_UNEXPECTED', { details: { values: ['private marker'] } })
