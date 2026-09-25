import { existsSync, readdirSync, readFileSync } from 'node:fs'

// Inside `npm run verify` a test may skip only when it declares an opt-in live authority. Any other
// skip, a PostgreSQL suite in a step without a database for example, passes silently and proves
// nothing, so it fails the graph here.
const OPT_IN = 'opt-in:'

const fail = (message) => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

// A node --test started inside a test inherits NODE_TEST_CONTEXT and reports to its parent, so the
// ledger reporter never loads in it and its skips cannot be seen. Only these files may start one.
const NESTED_RUN_ALLOWLIST = new Map([
  ['tests/repository/verify-gates.test.mjs', 'runs fixture trees in temporary directories, outside the verify root'],
  ['tests/implementation/guard-mutations.mjs', 'a mutation script run by hand, never under node --test'],
  ['tests/implementation/builder-production-composed-live-runner.mjs', 'an opt-in live runner started by npm, never under node --test'],
])
const SPAWNED_TEST_FLAG = /(['"`])--test\1/

const nestedRuns = existsSync('tests')
  ? readdirSync('tests', { recursive: true })
    .map((path) => `tests/${path}`)
    .filter((path) => path.endsWith('.mjs') && !NESTED_RUN_ALLOWLIST.has(path))
    .flatMap((path) => readFileSync(path, 'utf8').split('\n').flatMap((line, index) => (SPAWNED_TEST_FLAG.test(line) ? [`${path}:${index + 1}: ${line.trim()}`] : [])))
  : []
if (nestedRuns.length > 0) {
  fail([
    'a test starts a nested node --test, whose skips the ledger reporter cannot see; run the file in the verify graph or add it to NESTED_RUN_ALLOWLIST with a reason:',
    ...nestedRuns,
  ].join('\n'))
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
