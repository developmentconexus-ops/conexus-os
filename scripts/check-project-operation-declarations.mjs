import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'

const root = resolve(import.meta.dirname, '..')
const schema = JSON.parse(readFileSync(resolve(root, 'contracts/api/project-operation.schema.json'), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: false })
const validate = ajv.compile(schema)

if (!process.argv.includes('--schema-only')) {
  for (const name of ['AnalyzePendingBudgets.operation.json', 'ListPendingBudgets.operation.json']) {
    const value = JSON.parse(readFileSync(resolve(root, 'contracts/examples/budget-analyzer', name), 'utf8'))
    if (!validate(value)) throw new Error(`${name} invalid: ${ajv.errorsText(validate.errors, { separator: '; ' })}`)
  }
  process.stdout.write('Budget Analyzer Project operation declarations passed (2 exact declarations).\n')
} else {
  process.stdout.write('Project operation Draft 2020-12 schema compiled successfully.\n')
}
