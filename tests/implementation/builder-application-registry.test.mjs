import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { seal, contentsOf } = await import(hubModuleUrl('registry/seal.js'))

const projectId = '22222222-2222-4222-8222-222222222222'
const executionId = '33333333-3333-4333-8333-333333333333'
const sourceRevision = 'a'.repeat(40)
const templateRef = '537fnzf4c16x9d7oz21k:3331a697-459d-44d8-bcdd-abade6ba1e81'
const recipeSha256 = 'ce2a48f54c08ccdd7641fac8208560963cf43ecdc16bd459a3f333786d1ed4b5'
const run = { projectId, builderRunId: executionId, sourceRevision }
const fileOf = (path, mediaType, text) => {
  const bytes = Buffer.from(text)
  return { path, mediaType, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const index = fileOf('index.html', 'text/html; charset=utf-8', '<!doctype html><title>Proof</title>')
const outcome = (files = [index], overrides = {}) => ({ compiledApplication: { projectId, executionId, sourceRevision, templateRef, recipeSha256, files, ...overrides }, thumbnail: null })
const refusal = (build, atRun = run) => assert.throws(() => seal(build, atRun), { id: 'APPLICATION_ARTIFACT_INPUT_REFUSED' })

test('seal names the build by its project, its source and the digest of its canonical payload', () => {
  const sealed = seal(outcome(), run)
  assert.equal(sealed.projectId, projectId)
  assert.equal(sealed.sourceRevision, sourceRevision)
  assert.match(sealed.digest, /^[a-f0-9]{64}$/)
  assert.equal(seal(outcome([fileOf('app.js', 'text/javascript; charset=utf-8', 'x'), index]), run).digest, seal(outcome([index, fileOf('app.js', 'text/javascript; charset=utf-8', 'x')]), run).digest)
})

test('seal refuses a build that is not the run, the template pin, or a well formed tree', () => {
  refusal(outcome(), { ...run, sourceRevision: 'b'.repeat(40) })
  refusal(outcome([index], { executionId: '44444444-4444-4444-8444-444444444444' }))
  refusal(outcome([index], { templateRef: '537fnzf4c16x9d7oz21k:5591435e-3021-436b-926b-366ddc7e7189', recipeSha256: '74a04791ab9691c48e3f4fbff7aa84e8e3ef1b600d38a585e243fff21e5adebf' }))
  refusal(outcome([fileOf('app.js', 'text/javascript; charset=utf-8', 'x')]))
  refusal(outcome([index, index]))
  refusal(outcome([{ ...index, sha256: 'f'.repeat(64) }]))
  refusal(outcome([index, fileOf('../escape.js', 'text/javascript; charset=utf-8', 'x')]))
  refusal(outcome([index, fileOf('app.js', 'text/plain', 'x')]))
  refusal(outcome(Array.from({ length: 257 }, (_, number) => fileOf(number === 0 ? 'index.html' : `f${number}.txt`, number === 0 ? index.mediaType : 'text/plain; charset=utf-8', `${number}`))))
})

test('seal keeps a PNG of 1 to 512000 bytes and drops anything else without failing the build', () => {
  const png = (length) => Uint8Array.from({ length }, (_, index) => [0x89, 0x50, 0x4e, 0x47][index] ?? 0)
  const kept = (bytes) => contentsOf(seal({ ...outcome(), thumbnail: { bytes } }, run)).thumbnail !== null
  assert.deepEqual([png(4), png(512000)].map(kept), [true, true])
  assert.deepEqual([new Uint8Array(0), png(512001), Uint8Array.from([1, 2, 3, 4, 5])].map(kept), [false, false, false])
})

test('seal gives the digest of the canonical payload of one file whatever the thumbnail', () => {
  const html = fileOf('index.html', 'text/html; charset=utf-8', '<html></html>')
  const digest = (thumbnail) => seal({ ...outcome([html]), thumbnail }, run).digest
  const D_E = '6f54e6f0ca33c0e20da4dd7fdd7ed10b89cb6a282d38768aed2c64329c11e36b'
  assert.equal(digest(null), D_E)
  assert.equal(digest({ bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0]) }), D_E)
})

test('seal keeps its own copy of the thumbnail: a caller that mutates its buffer afterwards cannot change what was hashed', () => {
  const source = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0])
  const sealed = seal({ ...outcome(), thumbnail: { bytes: source } }, run)
  source.fill(7)
  const kept = contentsOf(sealed).thumbnail
  assert.deepEqual([...kept.bytes], [0x89, 0x50, 0x4e, 0x47, 0])
  assert.equal(kept.sha256, 'ad91235e882292469812e16da0b8fc77075a7c6d6f8760c24be14a5c792508cf')
})

test('seal refuses a build of 12582913 bytes and accepts one of 12582912', () => {
  const sized = (total) => {
    const html = fileOf('index.html', 'text/html; charset=utf-8', '<html></html>')
    const parts = Array.from({ length: 11 }, (_, number) => fileOf(`part-${number}.txt`, 'text/plain; charset=utf-8', 'x'.repeat(1024 * 1024)))
    const rest = total - html.bytes.byteLength - 11 * 1024 * 1024
    return [html, ...parts, fileOf('part-11.txt', 'text/plain; charset=utf-8', 'x'.repeat(rest))]
  }
  assert.equal(seal(outcome(sized(12582912)), run).projectId, projectId)
  refusal(outcome(sized(12582913)))
})
