import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const compareCodeUnits = (a, b) => a < b ? -1 : a > b ? 1 : 0

const args = process.argv.slice(2)
const schemaIndex = args.indexOf('--schema')
const dataIndexes = args.flatMap((value, index) => value === '--data' ? [index] : [])

if (schemaIndex < 0 || !args[schemaIndex + 1] || dataIndexes.length === 0) {
  process.stderr.write('usage: node ajv-gate.mjs --schema <schema.json> --data <data.json> [--data <data.json>...]\n')
  process.exitCode = 2
} else {
  try {
    const schemaPath = resolve(args[schemaIndex + 1])
    const dataPaths = dataIndexes.map(index => resolve(args[index + 1]))
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
    })
    addFormats(ajv)
    const validate = ajv.compile(schema)
    const results = dataPaths.map(path => {
      const data = JSON.parse(readFileSync(path, 'utf8'))
      const before = JSON.stringify(data)
      const valid = validate(data)
      if (JSON.stringify(data) !== before) throw new Error(`validator mutated ${path}`)
      const errors = (validate.errors ?? []).map(error => ({
        instancePath: error.instancePath,
        schemaPath: error.schemaPath,
        keyword: error.keyword,
        message: error.message,
      })).sort((a, b) => compareCodeUnits(JSON.stringify(a), JSON.stringify(b)))
      return { path, valid, errors }
    })
    const valid = results.every(result => result.valid)
    process.stdout.write(`${JSON.stringify({
      kind: 'conexus.ajv-gate-result/v1',
      schemaPath,
      valid,
      results,
    }, null, 2)}\n`)
    if (!valid) process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      kind: 'conexus.ajv-gate-problem/v1',
      message: error instanceof Error ? error.message : String(error),
    })}\n`)
    process.exitCode = 2
  }
}
