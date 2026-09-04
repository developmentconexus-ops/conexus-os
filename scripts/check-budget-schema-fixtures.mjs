import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const root = resolve(import.meta.dirname, '..')
const temporaryRoot = resolve('/tmp')
const fixtureRoot = resolve(root, 'contracts/examples/budget-analyzer/fixtures')
const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const analyze = ajv.compile(JSON.parse(readFileSync(resolve(temporaryRoot, 'AnalyzePendingBudgets.output.schema.json'), 'utf8')))
const list = ajv.compile(JSON.parse(readFileSync(resolve(temporaryRoot, 'ListPendingBudgets.output.schema.json'), 'utf8')))
const fixture = (name) => JSON.parse(readFileSync(resolve(fixtureRoot, name), 'utf8'))

const validCases = [
  [analyze, 'analyze-supported.valid.json'],
  [list, 'list-partial-negative-age.valid.json'],
]
const negativeCases = [
  [analyze, 'analyze-unverified-zero.invalid.json', 'UNVERIFIED cannot masquerade as zero'],
  [list, 'list-supported-negative-age.invalid.json', 'supported negative Budget age rejected'],
  [list, 'list-partial-negative-age-banded.invalid.json', 'negative Budget age is never banded'],
  [analyze, 'analyze-supported-currency-missing.invalid.json', 'value-bearing analysis requires currencyCode'],
  [list, 'list-supported-name-missing.invalid.json', 'rows require seller/customer names'],
]

if (process.argv.includes('--valid')) {
  for (const [validate, name] of validCases) {
    if (!validate(fixture(name))) throw new Error(`${name} invalid: ${ajv.errorsText(validate.errors, { separator: '; ' })}`)
  }
  process.stdout.write('Budget Analyzer valid schema fixtures passed (2/2).\n')
} else if (process.argv.includes('--negative')) {
  for (const [validate, name, claim] of negativeCases) {
    if (validate(fixture(name))) throw new Error(`negative control failed: ${claim}`)
    process.stdout.write(`negative control fired: ${claim}\n`)
  }
} else {
  throw new Error('expected --valid or --negative')
}
