import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { QUARANTINED } from './test-skip-reasons.mjs'

// A test that fails only sometimes may be quarantined while its cause is investigated, but never
// forgotten: every entry of tests/quarantine.json names a tracking issue and expires within
// MAX_DAYS_AHEAD days, and it matches a test skipped with a reason starting QUARANTINED, both ways. Entry shape: { "test": "<file>:<test name>", "issue": <number>, "until": "YYYY-MM-DD" }.

const MAX_DAYS_AHEAD = 14
const DAY_MS = 24 * 60 * 60 * 1000

// Every test declared with a literal name, with its literal skip reason when it has one.
export const listTests = (source, file) => {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const tests = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['test', 'it'].includes(node.expression.text) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      const options = node.arguments.find((argument) => ts.isObjectLiteralExpression(argument))
      const skip = options?.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === 'skip')
      tests.push({ name: node.arguments[0].text, skip: skip && ts.isStringLiteralLike(skip.initializer) ? skip.initializer.text : undefined })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return tests
}

// The entries and the skips bind both ways. today is YYYY-MM-DD; testFiles maps each test file path to its source.
export const checkQuarantine = ({ entries, today, testFiles }) => {
  const errors = []
  const latest = new Date(Date.parse(today) + MAX_DAYS_AHEAD * DAY_MS).toISOString().slice(0, 10)
  const tests = new Map([...testFiles].map(([file, source]) => [file, listTests(source, file)]))
  const listed = new Set(entries.map((entry) => entry.test))
  for (const [file, fileTests] of tests) {
    for (const { name, skip } of fileTests) {
      if (skip?.startsWith(QUARANTINED) && !listed.has(`${file}:${name}`)) errors.push(`${file}:${name}: skipped as quarantined but has no entry in tests/quarantine.json`)
    }
  }
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
    if (!tests.has(file)) errors.push(`${label}: the file ${file} does not exist`)
    else {
      const found = tests.get(file).find((test) => test.name === name)
      if (!found) errors.push(`${label}: no test named "${name}" in ${file}`)
      else if (!found.skip?.startsWith(QUARANTINED)) errors.push(`${label}: the test is not skipped with a reason starting "${QUARANTINED}"`)
    }
  }
  return { ok: errors.length === 0, errors }
}

const listTestFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(directory, entry.name)
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listTestFiles(path)
  return entry.name.endsWith('.test.mjs') ? [path] : []
})

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(import.meta.dirname, '..')
  const entries = JSON.parse(readFileSync(resolve(root, 'tests/quarantine.json'), 'utf8'))
  const testFiles = new Map(listTestFiles(resolve(root, 'tests')).sort().map((path) => [relative(root, path), readFileSync(path, 'utf8')]))
  const result = checkQuarantine({ entries, today: new Date().toISOString().slice(0, 10), testFiles })
  process.stdout.write(result.ok ? `${entries.length} quarantined test(s), all within date and tracked\n` : `${result.errors.join('\n')}\n`)
  process.exit(result.ok ? 0 : 1)
}
