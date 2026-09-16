import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const buildRoot = await mkdtemp(resolve(repositoryRoot, 'apps/hub/plan-starter-build-'))
const compiled = spawnSync(resolve(repositoryRoot, 'node_modules/.bin/esbuild'), [
  resolve(repositoryRoot, 'apps/hub/src/builder/runtime.ts'), `--outdir=${buildRoot}`, '--bundle', '--platform=node', '--format=esm', '--packages=external', '--log-level=error',
], { cwd: repositoryRoot, encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(compiled.stdout || compiled.stderr)
const { createBuilderUserMessage, resolveBuilderWorkspace, sendBuilderSessionMessage, shouldMaterializeApplicationStarter, BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY } = await import(pathToFileURL(resolve(buildRoot, 'runtime.js')).href)

test('starter materialization follows the ordinary mode boundary', () => {
  assert.equal(shouldMaterializeApplicationStarter({ mode: 'BUILD' }), true)
  assert.equal(shouldMaterializeApplicationStarter({ mode: 'PLAN' }), false)
})

test('the worker sends the operator content without a synthetic prompt prefix', () => {
  assert.deepEqual(createBuilderUserMessage('Crie um contador até 100 interativo'), {
    content: 'Crie um contador até 100 interativo',
  })
})

test('the worker uses sendMessage resolution as native run completion', async () => {
  let listener
  const events = []
  const session = {
    subscribe: (callback) => { listener = callback; return () => events.push('unsubscribed') },
    sendMessage: async () => { events.push('accepted'); listener({ type: 'agent_end', reason: 'complete' }); events.push('agent_end') },
  }
  assert.equal(await sendBuilderSessionMessage(session, { content: 'Crie um contador até 100 interativo' }), 'complete')
  assert.deepEqual(events, ['accepted', 'agent_end', 'unsubscribed'])
})

test('the shared coding agent resolves isolated Workspace tools from RequestContext', async () => {
  const { createCodingAgent } = await import('@mastra/core/coding-agent')
  const { RequestContext } = await import('@mastra/core/request-context')
  const { LocalFilesystem, Workspace } = await import('@mastra/core/workspace')
  const rootA = await mkdtemp(join(buildRoot, 'workspace-a-'))
  const rootB = await mkdtemp(join(buildRoot, 'workspace-b-'))
  try {
    await writeFile(join(rootA, 'marker-a.txt'), 'workspace A')
    await writeFile(join(rootB, 'marker-b.txt'), 'workspace B')
    const workspaceA = new Workspace({ filesystem: new LocalFilesystem({ basePath: rootA }) })
    const workspaceB = new Workspace({ filesystem: new LocalFilesystem({ basePath: rootB }) })
    const agent = createCodingAgent({
      id: 'builder-workspace-isolation', name: 'Builder Workspace Isolation', model: 'openai/gpt-4o',
      instructions: 'workspace isolation probe', workspace: resolveBuilderWorkspace, tools: {},
    })
    const read = async (workspace, path) => {
      const requestContext = new RequestContext()
      requestContext.setRaw(BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY, workspace)
      const tools = await agent.getToolsForExecution({ requestContext })
      return tools.mastra_workspace_read_file.execute({ path, showLineNumbers: false }, { requestContext })
    }
    assert.match(await read(workspaceA, 'marker-a.txt'), /workspace A/)
    await assert.rejects(() => read(workspaceA, 'marker-b.txt'))
    assert.match(await read(workspaceB, 'marker-b.txt'), /workspace B/)
    await assert.rejects(() => read(workspaceB, 'marker-a.txt'))
  } finally {
    await rm(rootA, { recursive: true, force: true })
    await rm(rootB, { recursive: true, force: true })
  }
})

test.after(async () => { await rm(buildRoot, { recursive: true, force: true }) })
