import { appendFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { Transform } from 'node:stream'

// A node:test reporter that prints nothing and records each skip, each todo and each failure with its kind.
// `npm run verify` loads it into every step through NODE_OPTIONS for scripts/check-test-skips.mjs,
// and scripts/check-changed-tests.mjs loads it into each base and head run. The root filter keeps
// test runs in temporary fixture trees out of the ledger. The closing count proves it loaded.
const ledger = process.env.CONEXUS_TEST_LEDGER
const root = process.env.CONEXUS_TEST_LEDGER_ROOT
let tests = 0

// Measured on Node 24. A file that fails outside any test (a missing module or export, a top-level
// throw) reports one failure named by the file's path as given, with the bare cause 'test failed'.
// A parent whose subtest failed, or a test cancelled with its parent, only echoes a failure that is
// already recorded, so it adds no kind.
const failureKind = (data) => {
  const error = data.details.error
  if (error.failureType === 'subtestsFailed' || error.failureType === 'cancelledByParent') return null
  if (error.failureType === 'testTimeoutFailure') return 'timeout'
  if (error.cause?.code === 'ERR_ASSERTION') return 'assertion'
  if (data.nesting === 0 && resolve(data.name) === data.file && error.cause === 'test failed') return 'load-error'
  return 'error'
}

// A skipped test and a todo test both leave work unexecuted. Only a reason that declares an opt-in
// live authority may do that. A bodyless test.todo reports as a pass with todo: true.
export const OPT_IN = 'opt-in:'
export const unexecuted = (records) => records.flatMap(({ file, name, skip, todo }) => [
  ...(skip !== undefined ? [{ file, name, kind: 'skip', reason: skip }] : []),
  ...(todo !== undefined ? [{ file, name, kind: 'todo', reason: todo }] : []),
])
export const approved = ({ reason }) => typeof reason === 'string' && reason.startsWith(OPT_IN)
export const describeUnexecuted = ({ file, name, kind, reason }) => `${file} › ${name}: ${reason === true ? 'no reason given' : reason}${kind === 'todo' ? ' (todo)' : ''}`

const record = (entry) => appendFileSync(ledger, `${JSON.stringify(entry)}\n`)

export default new Transform({
  writableObjectMode: true,
  transform(event, _encoding, done) {
    if (!ledger || !root || (event.type !== 'test:pass' && event.type !== 'test:fail') || !event.data.file) return done()
    const file = relative(root, event.data.file)
    if (file.startsWith('..') || isAbsolute(file)) return done()
    tests += 1
    if (event.data.skip !== undefined) record({ file, name: event.data.name, skip: event.data.skip })
    if (event.data.todo !== undefined) record({ file, name: event.data.name, todo: event.data.todo })
    const failure = event.type === 'test:fail' ? failureKind(event.data) : null
    if (failure) record({ file, name: event.data.name, failure })
    done()
  },
  flush(done) {
    if (ledger && root) record({ tests })
    done()
  },
})
