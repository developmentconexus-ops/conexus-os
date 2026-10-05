import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { serveOutput } = await import(hubModuleUrl('builder/check/steps/boot-server.js'))

const OUTPUT = { type: 'object', properties: { id: { type: 'integer', minimum: 7 }, label: { type: 'string', minLength: 2 } }, required: ['id', 'label'], additionalProperties: false }
const manifest = (version) => ({
  version,
  operations: { findNote: { module: 'handlers/notes.mjs', export: 'findNote', input: { type: 'object', properties: {}, additionalProperties: false }, output: OUTPUT } },
  migrations: [],
})

const answerOf = async (t, serverManifest) => {
  const out = mkdtempSync(join(tmpdir(), 'cx-boot-stub-'))
  mkdirSync(join(out, 'conexus-server'), { recursive: true })
  writeFileSync(join(out, 'conexus-server', 'manifest.json'), JSON.stringify(serverManifest))
  writeFileSync(join(out, 'index.html'), '<!doctype html>')
  const server = serveOutput(out)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/__conexus/api/findNote`, { method: 'POST' })
  return { status: response.status, body: await response.text() }
}

test('a declared operation answers the value its output schema names first', async (t) => {
  assert.deepEqual(await answerOf(t, manifest(1)), { status: 200, body: '{"id":7,"label":"xx"}' })
})

test('a server manifest the platform would refuse declares no operation, so every operation answers 404', async (t) => {
  assert.deepEqual(await answerOf(t, manifest(2)), { status: 404, body: '{"error":{"code":"OPERATION_NOT_FOUND"}}' })
})
