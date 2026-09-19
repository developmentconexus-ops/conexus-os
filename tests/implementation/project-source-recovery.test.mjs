import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/r1-s3-recovery-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`S3_HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const { createProjectSourceRecovery } = await import(pathToFileURL(resolve(hubBuild, 'project/source-recovery.js')).href)

const projectId = '30000000-0000-8000-8000-000000000051'
const siblingId = '30000000-0000-4000-8000-000000000052'

test('S3-P4-B recovery removes only one claimed uncommitted Project identity', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-s3-recovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const category of ['staging', 'quarantine', 'bundles', 'projects']) {
    for (const identity of [projectId, siblingId]) {
      const path = join(root, category, identity)
      mkdirSync(path, { recursive: true })
      writeFileSync(join(path, 'sentinel'), identity)
    }
  }

  assert.deepEqual(await createProjectSourceRecovery(root).cleanupClaimedProjectSource(projectId), {
    status: 'CLEANED',
    projectId,
    removed: ['staging', 'quarantine', 'bundles', 'projects'],
  })
  for (const category of ['staging', 'quarantine', 'bundles', 'projects']) {
    assert.equal(existsSync(join(root, category, projectId)), false)
    assert.equal(existsSync(join(root, category, siblingId, 'sentinel')), true)
  }
})

test('S3-P4-B recovery refuses traversal, symlink roots and symlink candidates', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-s3-recovery-refusal-'))
  const outside = mkdtempSync(join(tmpdir(), 'conexus-s3-recovery-outside-'))
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })
  const recovery = createProjectSourceRecovery(root)
  assert.deepEqual(await recovery.cleanupClaimedProjectSource('../outside'), {
    status: 'REFUSED',
    code: 'IDENTITY_REFUSED',
  })
  assert.deepEqual(await recovery.cleanupClaimedProjectSource('30000000-0000-9000-8000-000000000051'), {
    status: 'REFUSED',
    code: 'IDENTITY_REFUSED',
  })
  mkdirSync(join(root, 'staging'), { recursive: true })
  symlinkSync(outside, join(root, 'staging', projectId), 'dir')
  assert.deepEqual(await recovery.cleanupClaimedProjectSource(projectId), {
    status: 'REFUSED',
    code: 'CANDIDATE_PATH_REFUSED',
  })
  assert.equal(existsSync(outside), true)

  const rootLink = join(tmpdir(), `conexus-s3-recovery-root-link-${process.pid}`)
  symlinkSync(root, rootLink, 'dir')
  t.after(() => rmSync(rootLink, { force: true }))
  assert.deepEqual(await createProjectSourceRecovery(rootLink).cleanupClaimedProjectSource(projectId), {
    status: 'REFUSED',
    code: 'STORAGE_ROOT_REFUSED',
  })
})
