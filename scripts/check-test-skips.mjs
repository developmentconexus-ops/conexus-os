import { existsSync, readFileSync } from 'node:fs'

const OPT_IN = 'opt-in:'

// Inside `npm run verify` a test may skip, or be a todo, only when it declares an opt-in live
// authority. Any other unexecuted test, a PostgreSQL suite in a step without a database for example,
// passes silently and proves nothing, so it fails the command here.

// A bodyless test.todo reports as a pass with todo: true, so a todo is recorded like a skip.
const unexecuted = (records) => records.flatMap(({ file, name, skip, todo }) => [
  ...(skip !== undefined ? [{ file, name, kind: 'skip', reason: skip }] : []),
  ...(todo !== undefined ? [{ file, name, kind: 'todo', reason: todo }] : []),
])
const approved = ({ reason }) => typeof reason === 'string' && reason.startsWith(OPT_IN)
const describeUnexecuted = ({ file, name, kind, reason }) => `${file} › ${name}: ${reason === true ? 'no reason given' : reason}${kind === 'todo' ? ' (todo)' : ''}`

const fail = (message) => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const ledger = process.env.CONEXUS_TEST_LEDGER
if (!ledger || !existsSync(ledger)) fail(`the runner did not instrument this run: no test ledger at ${ledger ?? '(CONEXUS_TEST_LEDGER unset)'}`)

const records = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
const tests = records.filter((record) => 'tests' in record).reduce((sum, record) => sum + record.tests, 0)
if (tests === 0) fail(`the test ledger at ${ledger} recorded no test, so the ledger reporter did not run`)

const all = unexecuted(records)
const refused = all.filter((entry) => !approved(entry))
if (refused.length > 0) {
  fail([
    `${refused.length} skipped or todo test(s) in the test command; only a reason starting with "${OPT_IN}" may leave a test unexecuted:`,
    ...refused.map(describeUnexecuted),
  ].join('\n'))
}
for (const entry of all) process.stdout.write(`opt-in ${entry.kind}: ${describeUnexecuted(entry)}\n`)
process.stdout.write(`no unexecuted test outside opt-in live runs (tests=${tests}, opt-in skips=${all.filter(({ kind }) => kind === 'skip').length}, opt-in todos=${all.filter(({ kind }) => kind === 'todo').length})\n`)
