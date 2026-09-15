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
const { createBuilderUserMessage, sendBuilderSessionMessage, shouldMaterializeApplicationStarter } = await import(pathToFileURL(resolve(buildRoot, 'runtime.js')).href)

test('starter materialization follows the ordinary mode boundary', () => {
  assert.equal(shouldMaterializeApplicationStarter({ mode: 'BUILD' }), true)
  assert.equal(shouldMaterializeApplicationStarter({ mode: 'PLAN' }), false)
})

test('the worker sends the operator content without a synthetic prompt prefix', () => {
  assert.deepEqual(createBuilderUserMessage('Crie um contador até 100 interativo'), {
    content: 'Crie um contador até 100 interativo',
  })
})

test('the worker waits for native agent_end after sendMessage accepts the run', async () => {
  let listener
  const events = []
  const session = {
    subscribe: (callback) => { listener = callback; return () => events.push('unsubscribed') },
    sendMessage: async () => { events.push('accepted') },
  }
  const completion = sendBuilderSessionMessage(session, { content: 'Crie um contador até 100 interativo' }, (event) => events.push(event.type))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(events, ['accepted'])
  listener({ type: 'agent_end', reason: 'complete' })
  assert.equal(await completion, 'complete')
  assert.deepEqual(events, ['accepted', 'agent_end', 'unsubscribed'])
})

test.after(async () => { await rm(buildRoot, { recursive: true, force: true }) })
