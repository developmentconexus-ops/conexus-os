import { appendFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { Transform } from 'node:stream'

// A node:test reporter that prints nothing and records each skip and each todo. `npm run verify`
// loads it through scripts/test-with-ledger.sh for scripts/check-test-skips.mjs. The root filter
// keeps test runs in temporary fixture trees out of the ledger. The closing count proves it loaded.
const ledger = process.env.CONEXUS_TEST_LEDGER
const root = process.env.CONEXUS_TEST_LEDGER_ROOT
let tests = 0

const record = (entry) => appendFileSync(ledger, `${JSON.stringify(entry)}\n`)

export default new Transform({
  writableObjectMode: true,
  transform(event, _encoding, done) {
    if (!ledger || !root || (event.type !== 'test:pass' && event.type !== 'test:fail') || !event.data.file) return done()
    // Node emits a successful file placeholder even when it declared no tests.
    if (event.data.line === 1 && event.data.column === 1 && resolve(root, event.data.name) === event.data.file) return done()
    const file = relative(root, event.data.file)
    if (file.startsWith('..') || isAbsolute(file)) return done()
    tests += 1
    if (event.data.skip !== undefined) record({ file, name: event.data.name, skip: event.data.skip })
    if (event.data.todo !== undefined) record({ file, name: event.data.name, todo: event.data.todo })
    done()
  },
  flush(done) {
    if (ledger && root) record({ tests })
    done()
  },
})
