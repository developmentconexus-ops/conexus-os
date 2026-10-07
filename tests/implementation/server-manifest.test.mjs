import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { admitManifest } = await import(hubModuleUrl('app-runner/server-manifest.js'))

const LIMIT_MS = 500
const FAULT = '"type" must be one of string, integer, number, boolean, object, array'

const refusal = (text, stage) => {
  const parsed = JSON.parse(text)
  const started = performance.now()
  const admission = admitManifest(parsed, stage)
  return { error: admission.ok ? null : admission.error, ms: performance.now() - started }
}
const manifestRefusal = (where, diagnostic) => ({ code: 'MANIFEST_REFUSED', where, diagnostic })

const wide = (faulty) => {
  const level = (path, child) => ({ type: 'object', properties: Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`p${index}`, child([...path, index])])), additionalProperties: false })
  return level([], (one) => level(one, (two) => level(two, (three) => (faulty(three) ? { type: 'x' } : { type: 'boolean' }))))
}
const serverManifest = (input) => JSON.stringify({ version: 1, operations: { a: { module: 'handlers/a.mjs', export: 'find', input, output: { type: 'boolean' } } }, migrations: [] })
const sourceManifest = (input) => JSON.stringify({ operations: { a: { handler: 'handlers/a.ts', export: 'find', input, output: { type: 'boolean' } } } })
const flat = (count) => ({ type: 'object', properties: Object.fromEntries(Array.from({ length: count }, (_, index) => [`p${index}`, { type: 'x' }])), additionalProperties: false })

test('a 64 x 64 x 64 server manifest with a fault in the last leaf is refused at that leaf', () => {
  const result = refusal(serverManifest(wide((path) => path.every((index) => index === 63))), 'server')
  assert.deepEqual(result.error, manifestRefusal('operations.a.input.properties.p63.properties.p63.properties.p63', FAULT))
  assert.ok(result.ms < LIMIT_MS, `${result.ms} ms`)
})

test('a 64 x 64 x 64 server manifest with every leaf faulty is refused at the first leaf, in bounded time', () => {
  const result = refusal(serverManifest(wide(() => true)), 'server')
  assert.deepEqual(result.error, manifestRefusal('operations.a.input.properties.p0.properties.p0.properties.p0', FAULT))
  assert.ok(result.ms < LIMIT_MS, `${result.ms} ms`)
})

test('a source manifest with 200,000 properties is refused on the count, with or without faulty leaves', () => {
  const valid = JSON.parse(sourceManifest(flat(0)))
  valid.operations.a.input.properties = Object.fromEntries(Array.from({ length: 200000 }, (_, index) => [`p${index}`, { type: 'boolean' }]))
  for (const text of [JSON.stringify(valid), sourceManifest(flat(200000))]) {
    const result = refusal(text, 'source')
    assert.deepEqual(result.error, manifestRefusal('operations.a.input', 'more than 64 properties'))
    assert.ok(result.ms < LIMIT_MS, `${result.ms} ms`)
  }
})

test('a source manifest nested 5000 levels is refused at depth 7 without a RangeError', () => {
  const text = `{"operations":{"a":{"handler":"handlers/a.ts","export":"find","input":{"type":"object","properties":{"x":${'{"type":"array","items":'.repeat(5000)}{"type":"boolean"}${'}'.repeat(5000)}},"additionalProperties":false},"output":{"type":"boolean"}}}}`
  const result = refusal(text, 'source')
  assert.deepEqual(result.error, manifestRefusal('operations.a.input.properties.x.items.items.items.items.items.items', 'nested deeper than 6 levels'))
  assert.ok(result.ms < LIMIT_MS, `${result.ms} ms`)
})

test('a property named __proto__ is admitted and an operation id __proto__ is refused', () => {
  const property = '{"operations":{"a":{"handler":"handlers/a.ts","export":"find","input":{"type":"object","properties":{"__proto__":{"type":"boolean"}},"additionalProperties":false},"output":{"type":"boolean"}}}}'
  assert.equal(refusal(property, 'source').error, null)
  const id = '{"operations":{"__proto__":{"handler":"handlers/a.ts","export":"find","input":{"type":"object","properties":{},"additionalProperties":false},"output":{"type":"boolean"}}}}'
  assert.deepEqual(refusal(id, 'source').error, manifestRefusal('operations.__proto__', 'an operation id is camelCase letters and digits, starting lowercase'))
})

test('a valid source and a valid server manifest are admitted as the very object given', () => {
  const source = JSON.parse(sourceManifest({ type: 'object', properties: {}, additionalProperties: false }))
  assert.deepEqual(admitManifest(source, 'source'), { ok: true, result: source })
  const server = JSON.parse(serverManifest({ type: 'object', properties: {}, additionalProperties: false }))
  assert.deepEqual(admitManifest(server, 'server'), { ok: true, result: server })
})
