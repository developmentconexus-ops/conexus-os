import { appendFileSync } from 'node:fs'
import { isAbsolute, relative } from 'node:path'
import { Transform } from 'node:stream'

// A node:test reporter that prints nothing. `npm run verify` loads it into every step through
// NODE_OPTIONS; scripts/check-test-skips.mjs reads what it records. The root filter keeps test runs
// in temporary fixture trees out of the ledger. The closing count proves the reporter loaded.
const ledger = process.env.CONEXUS_TEST_SKIP_LEDGER
const root = process.env.CONEXUS_TEST_SKIP_ROOT
let tests = 0

export default new Transform({
  writableObjectMode: true,
  transform(event, _encoding, done) {
    if (!ledger || !root || (event.type !== 'test:pass' && event.type !== 'test:fail') || !event.data.file) return done()
    const file = relative(root, event.data.file)
    if (file.startsWith('..') || isAbsolute(file)) return done()
    tests += 1
    if (event.data.skip !== undefined) appendFileSync(ledger, `${JSON.stringify({ file, name: event.data.name, skip: event.data.skip })}\n`)
    done()
  },
  flush(done) {
    if (ledger && root) appendFileSync(ledger, `${JSON.stringify({ tests })}\n`)
    done()
  },
})
