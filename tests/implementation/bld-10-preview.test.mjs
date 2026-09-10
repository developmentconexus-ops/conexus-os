import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildCacheRoot = resolve(repositoryRoot, 'node_modules/.cache')
mkdirSync(buildCacheRoot, { recursive: true })
const buildRoot = mkdtempSync(resolve(buildCacheRoot, 'conexus-bld-10-preview-build-'))
test.after(() => rmSync(buildRoot, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', buildRoot,
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { projectBuildPreview } = await import(pathToFileURL(resolve(buildRoot, 'builder/preview.js')).href)

test('BLD-10 keeps subject identity, verified state and honest non-readiness independent', () => {
  const preview = projectBuildPreview({
    subjectKind: 'CHANGE_CANDIDATE', subjectDigest: 'b'.repeat(40), sourceRevision: 'b'.repeat(40), verified: true,
  }, { previewId: 'preview-server-owned' })
  assert.deepEqual(preview, {
    previewId: 'preview-server-owned', subjectKind: 'CHANGE_CANDIDATE', subjectDigest: 'b'.repeat(40),
    ready: false, verified: true, live: false,
  })
})

test('BLD-10 current subject defaults to non-ready without an admitted artifact', () => {
  const preview = projectBuildPreview({
    subjectKind: 'CURRENT_PROJECT', subjectDigest: 'c'.repeat(64), sourceRevision: 'a'.repeat(40), verified: false,
  })
  assert.equal(preview.subjectKind, 'CURRENT_PROJECT')
  assert.equal(preview.subjectDigest, 'c'.repeat(64))
  assert.equal(preview.ready, false)
  assert.equal(preview.verified, false)
  assert.equal(preview.live, false)
  assert.match(preview.previewId, /^[0-9a-f-]{36}$/)
})
