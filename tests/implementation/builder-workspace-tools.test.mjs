import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { Mastra } from '@mastra/core/mastra'
import { Workspace, createWorkspaceTools } from '@mastra/core/workspace'
import { E2BSandbox } from '@mastra/e2b'
import { prepareAgentControllerMount } from '@mastra/code-sdk'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const hubBuild = mkdtempSync(resolve(repositoryRoot, 'apps/hub/builder-workspace-tools-build-'))
process.once('exit', () => rmSync(hubBuild, { recursive: true, force: true }))
const compiled = spawnSync(process.execPath, [
  resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
  '--project', resolve(repositoryRoot, 'apps/hub/tsconfig.json'),
  '--noEmit', 'false', '--outDir', hubBuild,
], { encoding: 'utf8' })
if (compiled.status !== 0) throw new Error(`HUB_COMPILE_FAILED\n${compiled.stdout}\n${compiled.stderr}`)
const built = (path) => pathToFileURL(resolve(hubBuild, path)).href
const { createBuilderMountOptions } = await import(built('builder/module.js'))
const { BUILDER_REPOSITORY_ROOT, createBuilderRequestContext, createBuilderWorkspace } = await import(built('builder/runtime.js'))
const { BUILDER_MODE_DEFINITIONS } = await import(built('builder/application-starter.js'))

// Constructing the E2B sandbox opens nothing; only a command would.
const sandbox = () => new E2BSandbox({ apiKey: 'unused', template: 'unused' })
const noCommand = async () => ({ success: true, exitCode: 0, stdout: '', stderr: '', executionTimeMs: 0 })
const missingFrom = async (workspace, allowed) => {
  const offered = new Set(Object.keys(await createWorkspaceTools(workspace)))
  return allowed.filter((name) => !offered.has(name))
}

test("every tool each Builder mode allows is one the run's workspace actually offers", async () => {
  const workspace = createBuilderWorkspace({ sandbox: sandbox(), executeCommand: noCommand })
  for (const mode of BUILDER_MODE_DEFINITIONS) {
    assert.deepEqual(await missingFrom(workspace, [...mode.availableTools]), [], mode.id)
  }
})

test('a workspace holding only the sandbox offers none of them, which is the failure this guards', async () => {
  const build = BUILDER_MODE_DEFINITIONS.find((mode) => mode.id === 'build')
  const missing = await missingFrom(new Workspace({ sandbox: sandbox() }), [...build.availableTools])
  assert.deepEqual(missing, [...build.availableTools])
})

test("the agent is told the sandbox's repository is its project, not the Hub's storage", async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'builder-workspace-tools-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const storage = new LibSQLStore({ id: 'builder-workspace-tools', url: `file:${join(root, 'session.db')}` })
  const prepared = await prepareAgentControllerMount(createBuilderMountOptions({ storage, memory: new Memory({ storage }), storageRoot: root }))
  new Mastra({ ...prepared.mastraArgs, logger: false })
  await prepared.finalize()
  t.after(() => prepared.base.controller.destroy())
  const workspace = createBuilderWorkspace({ sandbox: sandbox(), executeCommand: noCommand })
  const session = await prepared.base.controller.createSession({
    resourceId: 'project', scope: 'builder:run', workspace,
    requestContext: createBuilderRequestContext({ workspace, projectId: 'project', accountId: 'account', runId: 'run' }),
  })
  assert.equal(session.state.get().projectPath, BUILDER_REPOSITORY_ROOT)
  assert.equal(BUILDER_REPOSITORY_ROOT, '/workspace/repo')
})
