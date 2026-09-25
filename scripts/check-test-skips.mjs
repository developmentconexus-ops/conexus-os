import { existsSync, readFileSync } from 'node:fs'

// Inside `npm run verify` a test may skip only when it declares an opt-in live authority. Any other
// skip, a PostgreSQL suite in a step without a database for example, passes silently and proves
// nothing, so it fails the graph here.
const OPT_IN = 'opt-in:'

const fail = (message) => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const ledger = process.env.CONEXUS_TEST_LEDGER
if (!ledger || !existsSync(ledger)) fail(`the runner did not instrument this run: no test ledger at ${ledger ?? '(CONEXUS_TEST_LEDGER unset)'}`)

const records = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
const tests = records.filter((record) => 'tests' in record).reduce((sum, record) => sum + record.tests, 0)
if (tests === 0) fail(`the test ledger at ${ledger} recorded no test, so the ledger reporter did not run`)

const skips = records.filter((record) => 'skip' in record)
const describe = ({ file, name, skip }) => `${file} › ${name}: ${skip === true ? 'no reason given' : skip}`
const refused = skips.filter(({ skip }) => typeof skip !== 'string' || !skip.startsWith(OPT_IN))
if (refused.length > 0) {
  fail([
    `${refused.length} skipped test(s) in the verify graph; only a reason starting with "${OPT_IN}" may skip:`,
    ...refused.map(describe),
  ].join('\n'))
}
for (const skip of skips) process.stdout.write(`opt-in skip: ${describe(skip)}\n`)
process.stdout.write(`no skipped test outside opt-in live runs (tests=${tests}, opt-in skips=${skips.length})\n`)
