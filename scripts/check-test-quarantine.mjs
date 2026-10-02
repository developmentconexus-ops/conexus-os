import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// A test that fails only sometimes may be quarantined while its cause is investigated, but never
// forgotten: every entry of tests/quarantine.json names a tracking issue and expires within
// MAX_DAYS_AHEAD days. Entry shape: { "test": "<file>:<test name>", "issue": <number>, "until": "YYYY-MM-DD" }.

const MAX_DAYS_AHEAD = 14
const DAY_MS = 24 * 60 * 60 * 1000

export const listTestNames = (source, file) => {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const names = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['test', 'it'].includes(node.expression.text) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) names.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return names
}

// today is YYYY-MM-DD; readTestFile returns the source of a test file, or undefined when it is missing.
export const checkQuarantine = ({ entries, today, readTestFile }) => {
  const errors = []
  const latest = new Date(Date.parse(today) + MAX_DAYS_AHEAD * DAY_MS).toISOString().slice(0, 10)
  for (const entry of entries) {
    const label = `${entry.test}`
    if (!Number.isInteger(entry.issue) || entry.issue <= 0) errors.push(`${label}: the issue number is missing`)
    if (typeof entry.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.until) || Number.isNaN(Date.parse(entry.until))) errors.push(`${label}: until must be a date as YYYY-MM-DD`)
    else if (entry.until < today) errors.push(`${label}: quarantine expired on ${entry.until}; fix the test or remove the entry`)
    else if (entry.until > latest) errors.push(`${label}: until ${entry.until} is more than ${MAX_DAYS_AHEAD} days ahead (latest ${latest})`)
    const separator = typeof entry.test === 'string' ? entry.test.indexOf(':') : -1
    if (separator < 1) {
      errors.push(`${label}: test must be "<file>:<test name>"`)
      continue
    }
    const file = entry.test.slice(0, separator)
    const name = entry.test.slice(separator + 1)
    const source = readTestFile(file)
    if (source === undefined) errors.push(`${label}: the file ${file} does not exist`)
    else if (!listTestNames(source, file).includes(name)) errors.push(`${label}: no test named "${name}" in ${file}`)
  }
  return { ok: errors.length === 0, errors }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(import.meta.dirname, '..')
  const entries = JSON.parse(readFileSync(resolve(root, 'tests/quarantine.json'), 'utf8'))
  const readTestFile = (file) => (existsSync(resolve(root, file)) ? readFileSync(resolve(root, file), 'utf8') : undefined)
  const result = checkQuarantine({ entries, today: new Date().toISOString().slice(0, 10), readTestFile })
  process.stdout.write(result.ok ? `${entries.length} quarantined test(s), all within date and tracked\n` : `${result.errors.join('\n')}\n`)
  process.exit(result.ok ? 0 : 1)
}
