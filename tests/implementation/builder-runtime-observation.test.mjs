import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/runtime-observation-build-'))
const compiled = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/hub/src/builder/runtime.ts'), `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { toBuilderLiveView } = await import(pathToFileURL(resolve(buildRoot, 'runtime.js')).href)

test('projects the native display state into a stateless safe live view', () => {
  const displayState = {
    isRunning: true,
    currentMessage: {
      id: 'assistant-message-1',
      role: 'assistant',
      content: { parts: [{ type: 'text', text: 'Vou inspecionar o app.' }] },
    },
    activeTools: new Map([
      ['provider-secret-tool-id', {
        name: 'mastra_workspace_read_file',
        args: { path: '/workspace/repo/app/src/main.tsx', token: 'must-not-leak' },
        status: 'completed',
        result: { content: 'private tool result' },
      }],
      ['provider-command-id', {
        name: 'mastra_workspace_execute_command',
        args: { command: 'npm test', env: { SECRET: 'must-not-leak' } },
        status: 'running',
        shellOutput: 'private shell output',
      }],
    ]),
  }

  assert.deepEqual(toBuilderLiveView(displayState), {
    running: true,
    message: { id: 'assistant-message-1', text: 'Vou inspecionar o app.' },
    activities: [
      { id: 'activity-1', label: 'READ_FILES', detail: 'app/src/main.tsx', state: 'succeeded' },
      { id: 'activity-2', label: 'RUN_COMMAND', state: 'started' },
    ],
  })
  const serialized = JSON.stringify(toBuilderLiveView(displayState))
  for (const forbidden of ['provider-secret-tool-id', 'must-not-leak', 'private tool result', 'private shell output', 'npm test']) {
    assert.equal(serialized.includes(forbidden), false)
  }
})

test('retains completed tool activity and turns native error into a safe failed state', () => {
  const view = toBuilderLiveView({
    isRunning: false,
    currentMessage: null,
    activeTools: new Map([
      ['tool-1', { name: 'mastra_workspace_write_file', args: { path: '/workspace/repo/app/App.tsx' }, status: 'error', isError: true }],
    ]),
  })
  assert.deepEqual(view.activities, [{ id: 'activity-1', label: 'EDIT_FILES', detail: 'app/App.tsx', state: 'failed' }])
})

test.after(async () => { await rm(buildRoot, { recursive: true, force: true }) })
