import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/plan-starter-build-'))
const compiled = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/hub/src/builder/runtime.ts'), `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { shouldMaterializeApplicationStarter } = await import(pathToFileURL(resolve(buildRoot, 'runtime.js')).href)

test('starter materialization follows the ordinary mode boundary', () => {
  assert.equal(shouldMaterializeApplicationStarter({ legacy: false, mode: 'BUILD' }), true)
  assert.equal(shouldMaterializeApplicationStarter({ legacy: false, mode: 'PLAN' }), false)
  assert.equal(shouldMaterializeApplicationStarter({ legacy: true, mode: undefined }), true)
})

test.after(async () => { await rm(buildRoot, { recursive: true, force: true }) })
