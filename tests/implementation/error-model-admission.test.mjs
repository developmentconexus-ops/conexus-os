import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { admitManifest, admitServerTree } = await import(hubModuleUrl('app-runner/server-manifest.js'))
const empty = { type: 'object', properties: {}, additionalProperties: false }
function manifest(stage, operations = { find: { export: 'find', input: empty, output: { type: 'boolean' } } }) {
  return { ...(stage === 'server' ? { version: 1, migrations: [] } : {}), operations: Object.fromEntries(Object.entries(operations).map(([id, operation]) => [id, { [stage === 'source' ? 'handler' : 'module']: `handlers/a.${stage === 'source' ? 'ts' : 'mjs'}`, ...operation }])) }
}
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function file(path, content) {
  const bytes = Buffer.from(content)
  return { path, content: bytes.toString('base64'), sha256: sha(bytes) }
}

test('source and server admit 32 operations and refuse 33 before checking entries', () => {
  for (const stage of ['source', 'server']) {
    const entries = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`op${i}`, { export: 'find', input: empty, output: { type: 'boolean' } }]))
    const valid = manifest(stage, entries)
    assert.deepEqual(admitManifest(valid, stage), valid)
    valid.operations.op32 = null
    assert.throws(() => admitManifest(valid, stage), { message: 'MANIFEST_REFUSED: operations: must declare between 1 and 32 operations' })
  }
})

test('source and server keep insertion order when multiple operations are invalid', () => {
  for (const stage of ['source', 'server']) {
    const value = manifest(stage, { first: { export: '', input: null, output: null }, second: { export: '', input: null, output: null } })
    assert.throws(() => admitManifest(value, stage), { message: 'MANIFEST_REFUSED: operations.first: "export" must name the handler function' })
  }
})

test('handler confinement and schema bounds retain their first refusal', () => {
  for (const stage of ['source', 'server']) {
    const value = manifest(stage)
    value.operations.find[stage === 'source' ? 'handler' : 'module'] = '../outside.ts'
    assert.throws(() => admitManifest(value, stage), { message: stage === 'source' ? 'MANIFEST_REFUSED: operations.find: "handler" must be a path like handlers/notes.ts inside conexus/' : 'MANIFEST_REFUSED: operations.find: "module" must be a bundled handler path' })
    const bounded = manifest(stage)
    bounded.operations.find.input = { ...empty, properties: { word: { type: 'string', minLength: -1 } } }
    assert.throws(() => admitManifest(bounded, stage), { message: 'MANIFEST_REFUSED: operations.find.input.properties.word: "minLength" must be a non-negative integer' })
  }
})

test('server tree verifies file count, digest, confinement and missing module in that order', () => {
  const files = [file('conexus-server/manifest.json', JSON.stringify(manifest('server'))), file('conexus-server/handlers/a.mjs', 'export function find() { return true }')]
  const tree = admitServerTree(files, sha)
  assert.deepEqual(tree.manifest, manifest('server'))
  assert.deepEqual([...tree.modules.keys()], ['handlers/a.mjs'])
  for (const [candidate, message] of [
    [[], 'SERVER_TREE_REFUSED: tree: must hold between 1 and 128 files'],
    [Array(129).fill(files[0]), 'SERVER_TREE_REFUSED: tree: must hold between 1 and 128 files'],
    [[{ ...files[0], path: 'conexus-server/../manifest.json', sha256: '0'.repeat(64) }], 'SERVER_TREE_REFUSED: conexus-server/../manifest.json: a directory is ASCII letters, digits, "_", "." or "-" and starts with a lowercase letter or digit'],
    [[{ ...files[0], sha256: '0'.repeat(64) }], 'SERVER_TREE_REFUSED: conexus-server/manifest.json: content does not match its sha256'],
    [[files[0]], 'SERVER_TREE_REFUSED: operations.find: module conexus-server/handlers/a.mjs is not in the tree'],
  ]) assert.throws(() => admitServerTree(candidate, sha), { message })
})

test('server migration admission pins count, SQL length, digest grammar and name order', () => {
  const value = manifest('server')
  value.migrations = Array.from({ length: 64 }, (_, i) => ({ name: `${String(i + 1).padStart(3, '0')}_a.sql`, sha256: 'a'.repeat(64), sql: 'x' }))
  value.migrations[0].sql = 'x'.repeat(256 * 1024)
  assert.deepEqual(admitManifest(value, 'server'), value)
  const oversized = structuredClone(value)
  oversized.migrations.push(null)
  assert.throws(() => admitManifest(oversized, 'server'), { message: 'MANIFEST_REFUSED: migrations: must be a list of at most 64 migrations' })
  for (const sql of ['', 'x'.repeat(256 * 1024 + 1)]) {
    const invalid = structuredClone(value)
    invalid.migrations[0].sql = sql
    assert.throws(() => admitManifest(invalid, 'server'), { message: 'MANIFEST_REFUSED: migrations[0]: "sql" must be 1 byte to 256 KiB' })
  }
  const invalid = structuredClone(value)
  invalid.migrations[0].sha256 = 'A'.repeat(64)
  assert.throws(() => admitManifest(invalid, 'server'), { message: 'MANIFEST_REFUSED: migrations[0]: "sha256" must be a hex digest' })
  value.migrations.reverse()
  assert.throws(() => admitManifest(value, 'server'), { message: 'MANIFEST_REFUSED: migrations: must be in name order' })
})

test('server tree admits 128 files of at most 4 MiB and refuses the next byte', () => {
  const module = file('conexus-server/handlers/a.mjs', ' '.repeat(4 * 1024 * 1024))
  const files = [file('conexus-server/manifest.json', JSON.stringify(manifest('server'))), module, ...Array.from({ length: 126 }, (_, i) => file(`conexus-server/handlers/b${i}.mjs`, ''))]
  assert.deepEqual([...admitServerTree(files, sha).modules.keys()], ['handlers/a.mjs', ...Array.from({ length: 126 }, (_, i) => `handlers/b${i}.mjs`)])
  files[1] = file(module.path, ' '.repeat(4 * 1024 * 1024 + 1))
  assert.throws(() => admitServerTree(files, sha), { message: 'SERVER_TREE_REFUSED: conexus-server/handlers/a.mjs: larger than 4 MiB' })
})
