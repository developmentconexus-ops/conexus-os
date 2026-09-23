import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

// The same script the Conexus build and the Project check run in the build sandbox, pointed at this
// repository's vite instead of the template's copy of the same version.
const { serverBuildScriptSource } = await import(hubModuleUrl('builder/application-server-build.js'))
const repositoryVite = resolve(import.meta.dirname, '../../node_modules/vite/dist/node/index.js')
const script = serverBuildScriptSource().replace("'/opt/conexus/compiler/node_modules/vite/dist/node/index.js'", JSON.stringify(repositoryVite))

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

const project = (t, files) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-server-build-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
  writeFileSync(join(root, '.server-build.mjs'), script)
  const out = join(root, 'dist')
  const ran = spawnSync(process.execPath, [join(root, '.server-build.mjs'), root, out], { encoding: 'utf8', timeout: 60_000 })
  return { root, out, status: ran.status, stdout: ran.stdout.trim(), stderr: ran.stderr.trim() }
}

const valid = {
  'conexus/manifest.json': MANIFEST,
  'conexus/handlers/notes.ts': HANDLER,
  'conexus/handlers/shared.ts': 'export const clean = (value: string): string => value.trim()\n',
  'conexus/migrations/001_follow_up_note.sql': 'CREATE TABLE follow_up_note (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, purchase_order_id text NOT NULL, note text NOT NULL, kind text NOT NULL)',
  'conexus/migrations/002_created_at.sql': 'ALTER TABLE follow_up_note ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()',
}

test('the server build bundles the declared handlers and inlines the migrations in name order', async (t) => {
  const built = project(t, valid)
  assert.equal(built.status, 0, built.stderr)
  assert.equal(built.stdout, 'conexus server check: 1 operations, 2 migrations')
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

test('the check names what is wrong with the server source, in words the Builder can act on', (t) => {
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
})
