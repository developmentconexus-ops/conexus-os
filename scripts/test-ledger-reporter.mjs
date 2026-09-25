import { appendFileSync } from 'node:fs'
import { isAbsolute, relative } from 'node:path'
import { Transform } from 'node:stream'

// A node:test reporter that prints nothing and records each skip and each todo. `npm run verify`
// loads it into every step through NODE_OPTIONS for scripts/check-test-skips.mjs. The root filter
// keeps test runs in temporary fixture trees out of the ledger. The closing count proves it loaded.
const ledger = process.env.CONEXUS_TEST_LEDGER
const root = process.env.CONEXUS_TEST_LEDGER_ROOT
let tests = 0

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
    done()
  },
  flush(done) {
    if (ledger && root) record({ tests })
    done()
  },
})
