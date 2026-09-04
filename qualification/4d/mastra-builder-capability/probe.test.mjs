import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { AgentController } from '@mastra/core/agent-controller'
import { createCodingAgent } from '@mastra/core/coding-agent'
import { RequestContext } from '@mastra/core/request-context'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'conexus-4d-mastra-builder-'))
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, 'skills', 'verify-change'), { recursive: true })
  await writeFile(join(root, 'src', 'math.ts'), 'export const add = (left: number, right: number) => left + right\n')
  await writeFile(
    join(root, 'skills', 'verify-change', 'SKILL.md'),
    '---\nname: verify-change\ndescription: Verify a bounded candidate.\n---\n\nRun exact required checks.\n',
  )
  return root
}

test('current createCodingAgent exposes real workspace mechanics without a provider call', async () => {
  const root = await fixture()
  const agent = createCodingAgent({
    id: 'probe-coder',
    name: 'Probe Coder',
    model: 'openai/probe-model',
    instructions: 'Mechanical probe only.',
    basePath: root,
  })
  const workspace = await agent.getWorkspace()
  await workspace.init()

  try {
    const tools = await agent.getToolsForExecution({})
    const names = Object.keys(tools).sort()
    assert.deepEqual(names, [
      'mastra_workspace_delete',
      'mastra_workspace_edit_file',
      'mastra_workspace_execute_command',
      'mastra_workspace_file_stat',
      'mastra_workspace_get_process_output',
      'mastra_workspace_grep',
      'mastra_workspace_kill_process',
      'mastra_workspace_list_files',
      'mastra_workspace_mkdir',
      'mastra_workspace_read_file',
      'mastra_workspace_write_file',
    ])

    const requestContext = new RequestContext()
    const read = await tools.mastra_workspace_read_file.execute(
      { path: 'src/math.ts' },
      { requestContext },
    )
    assert.match(read, /export const add/)

    const command = await tools.mastra_workspace_execute_command.execute(
      { command: 'node --version' },
      { requestContext },
    )
    assert.match(command, /^v24\.18\.0/u)

    const invalid = await tools.mastra_workspace_grep.execute(
      { query: 'add', path: 'src' },
      { requestContext },
    )
    assert.equal(invalid.error, true)
    assert.match(invalid.message, /pattern/u)
  } finally {
    await workspace.destroy()
    await rm(root, { recursive: true, force: true })
  }
})

test('current AgentController composes persistent mode, skills, search and Builder display state', async () => {
  const root = await fixture()
  const storage = new LibSQLStore({ id: 'probe-store', url: `file:${join(root, 'controller.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const workspace = new Workspace({
    id: 'probe-workspace',
    filesystem: new LocalFilesystem({ basePath: root }),
    sandbox: new LocalSandbox({ workingDirectory: root }),
    bm25: true,
    autoIndexPaths: ['src', 'skills'],
    skills: ['skills'],
  })
  const agent = createCodingAgent({
    id: 'probe-coding-agent',
    name: 'Probe Coding Agent',
    model: 'openai/probe-model',
    instructions: 'Mechanical probe only.',
    memory,
    workspace: undefined,
    goal: { description: 'Complete and verify the bounded task.' },
  })
  const config = {
    id: 'probe-controller',
    agent,
    storage,
    memory,
    workspace,
    defaultModeId: 'plan',
    modes: [
      { id: 'plan', name: 'Plan', instructions: 'Inspect and propose.', transitionsTo: 'build' },
      { id: 'build', name: 'Build', instructions: 'Implement and verify.' },
      { id: 'review', name: 'Review', instructions: 'Report findings only.' },
    ],
    subagents: [{
      id: 'reviewer',
      name: 'Reviewer',
      description: 'Review a bounded candidate.',
      instructions: 'Report findings only.',
      allowedWorkspaceTools: ['read_file', 'grep'],
      defaultModelId: 'openai/probe-reviewer',
    }],
  }

  const first = new AgentController(config)
  await first.init()
  try {
    const session = await first.createSession({
      resourceId: 'project-1',
      scope: 'change-1',
      threadId: 'coding-session-1',
    })
    assert.equal(session.mode.get(), 'plan')
    await session.mode.switch({ modeId: 'build' })
    assert.equal(session.mode.get(), 'build')
    await session.permissions.setForCategory({ category: 'execute', policy: 'ask' })

    const skills = await workspace.skills?.list()
    assert.deepEqual(skills?.map(skill => skill.name), ['verify-change'])
    await workspace.rebuildSearchIndex()
    const search = await workspace.search('add', { mode: 'bm25', topK: 5 })
    assert.ok(search.length > 0)

    const displayKeys = Object.keys(session.displayState.get())
    for (const key of [
      'tasks', 'modifiedFiles', 'pendingApproval', 'pendingSuspensions',
      'activeSubagents', 'activeTools', 'tokenUsage',
    ]) assert.ok(displayKeys.includes(key), `missing display-state key ${key}`)
  } finally {
    await first.destroy()
  }

  const second = new AgentController(config)
  await second.init()
  try {
    const rebound = await second.createSession({
      resourceId: 'project-1',
      scope: 'change-1',
      threadId: 'coding-session-1',
    })
    assert.equal(rebound.mode.get(), 'build')
    assert.equal((await rebound.thread.list()).length, 1)
  } finally {
    await second.destroy()
    await rm(root, { recursive: true, force: true })
  }
})
