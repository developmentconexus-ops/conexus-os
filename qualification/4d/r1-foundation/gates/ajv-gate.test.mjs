import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = dirname(fileURLToPath(import.meta.url))
const gate = resolve(root, 'ajv-gate.mjs')
const schema = resolve(root, 'fixtures/sample.schema.json')

const run = data => spawnSync(process.execPath, [gate, '--schema', schema, '--data', resolve(root, data)], {
  encoding: 'utf8',
})

test('bounded Ajv gate accepts valid data without mutation', () => {
  const result = run('fixtures/sample.valid.json')
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.valid, true)
  assert.deepEqual(output.results[0].errors, [])
})

test('bounded Ajv gate deterministically rejects invalid data without coercion or removal', () => {
  const first = run('fixtures/sample.invalid.json')
  const second = run('fixtures/sample.invalid.json')
  assert.equal(first.status, 1, first.stderr)
  assert.equal(second.status, 1, second.stderr)
  assert.equal(first.stdout, second.stdout)
  const output = JSON.parse(first.stdout)
  assert.equal(output.valid, false)
  assert.deepEqual(output.results[0].errors.map(error => error.keyword), [
    'additionalProperties',
    'type',
    'format',
  ])
})
