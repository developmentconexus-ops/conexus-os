import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { invariant } from './failure-matchers.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const { dependencyClosure, stageWorkerRuntime } = await import(hubModuleUrl('app-runner/sandbox.js'))

const temporary = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'cx-staging-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('the staged runtime holds the worker, its wire, the data plane, the caller, zod and pg, and nothing of the failure table', (t) => {
  const runtime = stageWorkerRuntime(join(temporary(t), 'runtime'))
  for (const path of ['app-runner/worker.js', 'app-runner/wire.js', 'app-runner/data-plane.js', 'platform/caller.js', 'node_modules/zod/package.json', 'node_modules/pg/package.json']) {
    assert.equal(existsSync(join(runtime, path)), true, path)
  }
  assert.equal(existsSync(join(runtime, 'platform/failure.js')), false)
})

test('a package.json whose dependencies are not a map of names to ranges refuses the closure', (t) => {
  const root = temporary(t)
  mkdirSync(join(root, 'node_modules/x'), { recursive: true })
  writeFileSync(join(root, 'node_modules/x/package.json'), '{"dependencies":["pg"]}')
  assert.throws(() => dependencyClosure('x', root), invariant('RUNNER_PACKAGE_JSON_INVALID', { name: 'x' }))
})
