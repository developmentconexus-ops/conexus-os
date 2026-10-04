import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'
import { SHARED_LIBRARY_PROJECT, buildServerProject as project, serverFilesOf } from './server-build-fixture.mjs'

const { admitServerTree } = await import(hubModuleUrl('app-runner/server-manifest.js'))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const MANIFEST = {
  operations: {
    createNote: {
      handler: 'handlers/notes.ts', export: 'createNote',
      input: { type: 'object', properties: { purchaseOrderId: { type: 'string', maxLength: 40 }, note: { type: 'string', maxLength: 2000 } }, required: ['purchaseOrderId', 'note'], additionalProperties: false },
      output: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'], additionalProperties: false },
    },
  },
}
const HANDLER = `import { clean } from './shared'
enum Kind { Note = 'note' }
type Db = { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> }
export async function createNote(input: { purchaseOrderId: string; note: string }, { db }: { db: Db }) {
  const { rows } = await db.query('INSERT INTO follow_up_note (purchase_order_id, note, kind) VALUES ($1, $2, $3) RETURNING id', [clean(input.purchaseOrderId), input.note, Kind.Note])
  return { id: rows[0].id }
}
`

const valid = {
  'conexus/manifest.json': MANIFEST,
  'conexus/handlers/notes.ts': HANDLER,
  'conexus/handlers/shared.ts': 'export const clean = (value: string): string => value.trim()\n',
  'conexus/migrations/001_follow_up_note.sql': 'CREATE TABLE follow_up_note (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, purchase_order_id text NOT NULL, note text NOT NULL, kind text NOT NULL)',
  'conexus/migrations/002_created_at.sql': 'ALTER TABLE follow_up_note ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()',
}

test('the server command bundles the declared handlers and inlines the migrations in name order', async (t) => {
  const built = project(t, valid)
  assert.equal(built.status, 0, built.stderr)
  assert.equal(built.stdout, '')
  const manifest = JSON.parse(readFileSync(join(built.out, 'conexus-server/manifest.json'), 'utf8'))
  const { handler, ...declared } = MANIFEST.operations.createNote
  assert.equal(handler, 'handlers/notes.ts')
  assert.deepEqual(manifest.operations, { createNote: { module: 'handlers/notes.mjs', ...declared } })
  assert.deepEqual(manifest.migrations.map((migration) => migration.name), ['001_follow_up_note.sql', '002_created_at.sql'])
  assert.deepEqual(readdirSync(join(built.out, 'conexus-server'), { recursive: true }).map(String).filter((path) => path.endsWith('.mjs')), ['handlers/notes.mjs'])
  const queries = []
  const { createNote } = await import(pathToFileURL(join(built.out, 'conexus-server/handlers/notes.mjs')).href)
  const db = { query: async (_text, values) => { queries.push(values); return { rows: [{ id: 7 }] } } }
  assert.deepEqual(await createNote({ purchaseOrderId: ' PO-1 ', note: 'ligar' }, { db }), { id: 7 })
  assert.deepEqual(queries, [['PO-1', 'ligar', 'note']])
})

test('a Project without a server manifest has no server half', (t) => {
  const built = project(t, { 'app/index.html': '<!doctype html>' })
  assert.deepEqual([built.status, built.stdout, existsSync(join(built.out, 'conexus-server'))], [0, '', false])
})

test('the server command names what is wrong with the server source, in words the Builder can act on', (t) => {
  const refused = (files, message) => {
    const built = project(t, files)
    assert.equal(built.status, 1, built.stdout)
    assert.match(built.stderr, message)
  }
  refused({ 'conexus/handlers/notes.ts': HANDLER }, /conexus\/handlers or conexus\/migrations exists, but conexus\/manifest\.json is missing/)
  refused({ ...valid, 'conexus/manifest.json': '{ "operations": ' }, /conexus\/manifest\.json is not valid JSON/)
  const withFormat = structuredClone(MANIFEST)
  withFormat.operations.createNote.input.properties.note.format = 'email'
  refused({ ...valid, 'conexus/manifest.json': withFormat }, /MANIFEST_REFUSED: operations\.createNote\.input\.properties\.note: unknown key "format"/)
  const open = structuredClone(MANIFEST)
  delete open.operations.createNote.output.additionalProperties
  refused({ ...valid, 'conexus/manifest.json': open }, /"additionalProperties" must be false/)
  const escaping = structuredClone(MANIFEST)
  escaping.operations.createNote.handler = '../app/src/main.ts'
  refused({ ...valid, 'conexus/manifest.json': escaping }, /"handler" must be a path like handlers\/notes\.ts inside conexus\//)
  refused({ ...valid, 'conexus/handlers/notes.ts': `import React from 'react'\nexport const version = React.version\n${HANDLER}` }, /imports "react": a handler may import only/)
  refused({ ...valid, 'app/src/secret.ts': 'export const secret = 1\n', 'conexus/handlers/notes.ts': `import { secret } from '../../app/src/secret'\nexport const x = secret\n${HANDLER}` }, /imports "\.\.\/\.\.\/app\/src\/secret"/)
  refused({ ...valid, 'conexus/migrations/second.sql': 'SELECT 1' }, /conexus\/migrations\/second\.sql must be a file named like 001_create_notes\.sql/)
  refused({ 'conexus/manifest.json': MANIFEST, 'conexus/handlers/shared.ts': 'export {}\n' },/conexus\/handlers\/notes\.ts does not exist/)
  refused({ ...valid, 'conexus/handlers/notes.ts': `import { readFileSync } from 'node:fs'\nexport const read = () => readFileSync('/etc/passwd')\n${HANDLER}` }, /imports "node:fs": among Node built-ins a handler may import only .*node:crypto/)
  refused({ ...valid, 'conexus/handlers/notes.ts': HANDLER.replace('createNote(', 'makeNote(') }, /operations\.createNote: conexus\/handlers\/notes\.ts does not export "createNote" \(it exports: makeNote\)/)
  refused({ ...valid, 'conexus/handlers/shared.ts': `export const clean = (value: string): string => { void fetch('https://example.com/' + value); return value.trim() }\n` }, /conexus\/handlers\/notes\.ts uses the global "fetch": a handler has no network/)
  refused({ ...valid, 'conexus/handlers/shared.ts': `export const clean = (value: string): string => { void new globalThis['WebSocket']('wss://example.com'); return value.trim() }\n` }, /uses the global "globalThis\.WebSocket"/)
  refused({ ...valid, 'conexus/handlers/shared.ts': `export const clean = (value: string): string => {\n  const size = (): number => { const fetch = (text: string) => text.length; return fetch(value) }\n  void fetch('https://example.com/' + size())\n  return value.trim()\n}\n` }, /uses the global "fetch"/)
})

test('a handler may use its own fetch or a property named fetch, and the supported built-ins', (t) => {
  const handler = `import { createHash } from 'node:crypto'
export async function createNote(input: { note: string }, { connectors }: { connectors: { fetch(x: string): string } }) {
  const fetch = (value: string) => createHash('sha256').update(value).digest('hex')
  return { id: fetch(input.note).length + connectors.fetch('x').length }
}
`
  const built = project(t, { ...valid, 'conexus/handlers/notes.ts': handler })
  assert.equal(built.status, 0, built.stderr)
})

test('what the check builds, the runner admits: shared chunks carry hash-only names', (t) => {
  const built = project(t, SHARED_LIBRARY_PROJECT)
  assert.equal(built.status, 0, built.stderr)
  const files = serverFilesOf(built.out)
  const chunks = files.map((file) => file.path).filter((path) => path.startsWith('conexus-server/chunks/'))
  assert.ok(chunks.length > 0, 'the shared library is split into a chunk')
  for (const path of chunks) assert.match(path, /^conexus-server\/chunks\/c-[A-Za-z0-9_-]+\.mjs$/)
  assert.doesNotThrow(() => admitServerTree(files, sha256))
})
