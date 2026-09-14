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
    assert.match(command, /^v24\.\d+\.\d+/u)

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

test('Project thread persists across controller/store rebind and a different sandbox', async () => {
  const firstRoot = await mkdtemp(join(tmpdir(), 'conexus-4d-session-first-'))
  const secondRoot = await mkdtemp(join(tmpdir(), 'conexus-4d-session-second-'))
  const storageFile = join(firstRoot, 'session.db')
  const threadId = 'conexus-builder:project-session-proof'
  const resourceId = 'project-session-proof'
  const workspace = (root, id) => new Workspace({
    id,
    filesystem: new LocalFilesystem({ basePath: root }),
    sandbox: new LocalSandbox({ workingDirectory: root }),
  })
  const createBinding = () => {
    const storage = new LibSQLStore({ id: `session-rebind-store-${crypto.randomUUID()}`, url: `file:${storageFile}` })
    const memory = new Memory({ storage, options: { lastMessages: 20 } })
    const controller = new AgentController({
      id: `session-rebind-controller-${crypto.randomUUID()}`,
      storage,
      memory,
      modes: [{ id: 'build', name: 'Build', instructions: 'Mechanical probe only.' }],
      defaultModeId: 'build',
      agent: createCodingAgent({
        id: 'session-rebind-agent',
        name: 'Session Rebind Probe',
        model: 'openai/probe-model',
        instructions: 'Mechanical probe only.',
        memory,
        workspace: undefined,
      }),
    })
    return { controller, memory, storage }
  }

  let firstBinding
  let secondBinding
  try {
    const firstWorkspace = workspace(firstRoot, 'session-first-sandbox')
    firstBinding = createBinding()
    const first = firstBinding.controller
    await first.init()
    const firstSession = await first.createSession({
      resourceId,
      ownerId: 'account-session-proof',
      scope: 'builder',
      threadId,
      workspace: firstWorkspace,
    })
    await firstBinding.memory.saveMessages({ messages: [{
      id: 'session-proof-user-message',
      role: 'user',
      createdAt: new Date(),
      threadId,
      resourceId,
      content: { format: 2, parts: [{ type: 'text', text: 'Mensagem persistida do Project.' }] },
    }] })
    assert.equal(firstSession.thread.getId(), threadId)
    assert.equal((await firstSession.thread.listActiveMessages()).length, 1)
    await first.destroy()
    await firstWorkspace.destroy()
    await firstBinding.storage.close()

    const secondWorkspace = workspace(secondRoot, 'session-second-sandbox')
    secondBinding = createBinding()
    const second = secondBinding.controller
    await second.init()
    try {
      const rebound = await second.createSession({
        resourceId,
        ownerId: 'account-session-proof',
        scope: 'builder',
        threadId,
        workspace: secondWorkspace,
      })
      const messages = await rebound.thread.listActiveMessages()
      assert.equal(rebound.thread.getId(), threadId)
      assert.equal(messages.length, 1)
      assert.equal(messages[0]?.content.parts[0]?.text, 'Mensagem persistida do Project.')
      assert.notEqual(firstRoot, secondRoot)
      assert.notEqual(firstWorkspace, secondWorkspace)
    } finally {
      await second.destroy()
      await secondWorkspace.destroy()
    }
  } finally {
    await secondBinding?.storage.close()
    await rm(firstRoot, { recursive: true, force: true })
    await rm(secondRoot, { recursive: true, force: true })
  }
})

test('one shared AgentController isolates Project threads, modes and workspaces', async () => {
  const projectARoot = await mkdtemp(join(tmpdir(), 'conexus-4d-project-a-'))
  const projectBRoot = await mkdtemp(join(tmpdir(), 'conexus-4d-project-b-'))
  const storage = new LibSQLStore({ id: 'shared-controller-store', url: `file:${join(projectARoot, 'controller.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const workspace = (root, id) => new Workspace({
    id,
    filesystem: new LocalFilesystem({ basePath: root }),
    sandbox: new LocalSandbox({ workingDirectory: root }),
  })
  const projectAWorkspace = workspace(projectARoot, 'project-a-workspace')
  const projectBWorkspace = workspace(projectBRoot, 'project-b-workspace')
  const agent = createCodingAgent({
    id: 'shared-controller-agent',
    name: 'Shared Controller Probe',
    model: 'openai/probe-model',
    instructions: 'Mechanical isolation probe.',
    memory,
    workspace: undefined,
  })
  const controller = new AgentController({
    id: 'shared-controller',
    storage,
    memory,
    agent,
    modes: [
      { id: 'plan', name: 'Plan', availableTools: ['mastra_workspace_read_file', 'mastra_workspace_list_files', 'mastra_workspace_grep', 'mastra_workspace_file_stat'] },
      { id: 'build', name: 'Build', availableTools: [
        'mastra_workspace_read_file', 'mastra_workspace_list_files', 'mastra_workspace_grep', 'mastra_workspace_file_stat',
        'mastra_workspace_write_file', 'mastra_workspace_edit_file', 'mastra_workspace_delete', 'mastra_workspace_execute_command',
      ] },
    ],
    defaultModeId: 'plan',
  })

  await controller.init()
  try {
    const projectA = await controller.createSession({
      resourceId: 'project-a', ownerId: 'account-a', scope: 'builder', threadId: 'conexus-builder:project-a', workspace: projectAWorkspace,
    })
    const projectB = await controller.createSession({
      resourceId: 'project-b', ownerId: 'account-b', scope: 'builder', threadId: 'conexus-builder:project-b', workspace: projectBWorkspace,
    })
    await projectAWorkspace.filesystem.writeFile('project-a.txt', 'A only')
    await projectBWorkspace.filesystem.writeFile('project-b.txt', 'B only')
    await memory.saveMessages({ messages: [{
      id: 'project-a-message', role: 'user', createdAt: new Date(), threadId: 'conexus-builder:project-a', resourceId: 'project-a',
      content: { format: 2, parts: [{ type: 'text', text: 'Project A message' }] },
    }, {
      id: 'project-b-message', role: 'user', createdAt: new Date(), threadId: 'conexus-builder:project-b', resourceId: 'project-b',
      content: { format: 2, parts: [{ type: 'text', text: 'Project B message' }] },
    }] })

    assert.notEqual(projectA.thread.getId(), projectB.thread.getId())
    assert.equal((await projectA.thread.listActiveMessages()).map(message => message.id).includes('project-a-message'), true)
    assert.equal((await projectA.thread.listActiveMessages()).map(message => message.id).includes('project-b-message'), false)
    assert.equal((await projectB.thread.listActiveMessages()).map(message => message.id).includes('project-b-message'), true)
    assert.equal((await projectB.thread.listActiveMessages()).map(message => message.id).includes('project-a-message'), false)
    assert.equal((await projectAWorkspace.filesystem.readFile('project-a.txt')).toString(), 'A only')
    await assert.rejects(projectAWorkspace.filesystem.readFile('project-b.txt'))
    await assert.rejects(projectBWorkspace.filesystem.readFile('project-a.txt'))
    assert.equal(projectA.mode.get(), 'plan')
    assert.equal(projectB.mode.get(), 'plan')
    await projectA.mode.switch({ modeId: 'build' })
    assert.equal(projectA.mode.get(), 'build')
    assert.equal(projectB.mode.get(), 'plan')
  } finally {
    await controller.destroy()
    await projectAWorkspace.destroy()
    await projectBWorkspace.destroy()
    await storage.close()
    await rm(projectARoot, { recursive: true, force: true })
    await rm(projectBRoot, { recursive: true, force: true })
  }
})

test('AgentController PLAN mode applies the exact read-only workspace allowlist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conexus-4d-plan-mode-'))
  const storage = new LibSQLStore({ id: 'plan-mode-store', url: `file:${join(root, 'controller.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const workspace = new Workspace({
    id: 'plan-mode-workspace',
    filesystem: new LocalFilesystem({ basePath: root }),
    sandbox: new LocalSandbox({ workingDirectory: root }),
  })
  const activeTools = []
  const model = {
    specificationVersion: 'v2',
    provider: 'conexus-task-0',
    modelId: 'plan-mode-probe',
    supportedUrls: {},
    async doGenerate() {
      return { content: [{ type: 'text', text: 'probe response' }], finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 }, warnings: [] }
    },
    async doStream(options) {
      activeTools.push({ activeTools: options.activeTools, tools: options.tools?.map(tool => tool.name) ?? [] })
      return {
        stream: new ReadableStream({
          start(stream) {
            stream.enqueue({ type: 'stream-start', warnings: [] })
            stream.enqueue({ type: 'text-start', id: 'task-0-text' })
            stream.enqueue({ type: 'text-delta', id: 'task-0-text', delta: 'probe response' })
            stream.enqueue({ type: 'text-end', id: 'task-0-text' })
            stream.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 } })
            stream.close()
          },
        }),
      }
    },
  }
  const agent = createCodingAgent({
    id: 'plan-mode-agent', name: 'Plan Mode Probe', model, instructions: 'Mechanical mode probe.', memory, workspace: undefined,
  })
  const readOnlyTools = ['mastra_workspace_read_file', 'mastra_workspace_list_files', 'mastra_workspace_grep', 'mastra_workspace_file_stat']
  const codingTools = [...readOnlyTools, 'mastra_workspace_write_file', 'mastra_workspace_edit_file', 'mastra_workspace_delete', 'mastra_workspace_execute_command']
  const controller = new AgentController({
    id: 'plan-mode-controller', storage, memory, agent, workspace,
    modes: [
      { id: 'plan', name: 'Plan', availableTools: readOnlyTools },
      { id: 'build', name: 'Build', availableTools: codingTools },
    ],
    defaultModeId: 'plan',
  })

  await controller.init()
  try {
    const session = await controller.createSession({ resourceId: 'project-plan', scope: 'builder', threadId: 'conexus-builder:project-plan', workspace })
    await session.sendMessage({ content: 'Planeje uma mudança.' })
    await session.mode.switch({ modeId: 'build' })
    await session.sendMessage({ content: 'Implemente a mudança.' })
    assert.deepEqual(activeTools[0].tools.toSorted(), readOnlyTools.toSorted())
    assert.deepEqual(activeTools[1].tools.toSorted(), codingTools.toSorted())
    assert.equal(activeTools[0].tools.includes('mastra_workspace_write_file'), false)
    assert.equal(activeTools[0].tools.includes('mastra_workspace_edit_file'), false)
    assert.equal(activeTools[0].tools.includes('mastra_workspace_delete'), false)
    assert.equal(activeTools[0].tools.includes('mastra_workspace_execute_command'), false)
  } finally {
    await controller.destroy()
    await workspace.destroy()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('Session sendMessage exposes the persisted user message ID for BuilderRun correlation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'conexus-4d-message-id-'))
  const storageFile = join(root, 'controller.db')
  const workspace = new Workspace({
    id: 'message-id-workspace',
    filesystem: new LocalFilesystem({ basePath: root }),
    sandbox: new LocalSandbox({ workingDirectory: root }),
  })
  const model = {
    specificationVersion: 'v2', provider: 'conexus-task-0', modelId: 'message-id-probe', supportedUrls: {},
    async doGenerate() {
      return { content: [{ type: 'text', text: 'persisted response' }], finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 }, warnings: [] }
    },
    async doStream() {
      return {
        stream: new ReadableStream({
          start(stream) {
            stream.enqueue({ type: 'stream-start', warnings: [] })
            stream.enqueue({ type: 'text-start', id: 'message-id-text' })
            stream.enqueue({ type: 'text-delta', id: 'message-id-text', delta: 'persisted response' })
            stream.enqueue({ type: 'text-end', id: 'message-id-text' })
            stream.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 } })
            stream.close()
          },
        }),
      }
    },
  }
  const createController = () => {
    const storage = new LibSQLStore({ id: `message-id-store-${crypto.randomUUID()}`, url: `file:${storageFile}` })
    const memory = new Memory({ storage, options: { lastMessages: 20 } })
    const agent = createCodingAgent({
      id: 'message-id-agent', name: 'Message ID Probe', model, instructions: 'Mechanical message identity probe.', memory, workspace: undefined,
    })
    const controller = new AgentController({
      id: `message-id-controller-${crypto.randomUUID()}`, storage, memory, agent, workspace,
      modes: [{ id: 'build', name: 'Build', availableTools: [] }], defaultModeId: 'build',
    })
    return { controller, storage }
  }

  const firstBinding = createController()
  await firstBinding.controller.init()
  try {
    const session = await firstBinding.controller.createSession({ resourceId: 'project-message-id', scope: 'builder', threadId: 'conexus-builder:project-message-id', workspace })
    const events = []
    const unsubscribe = session.subscribe(event => events.push(event))
    await session.sendMessage({ content: 'Mensagem real do operador.' })
    unsubscribe()
    const persisted = await session.thread.listActiveMessages()
    const userMessage = persisted.find(message => message.role === 'signal' && message.type === 'user' && message.content.parts?.some(part => part.type === 'text' && part.text === 'Mensagem real do operador.'))
    assert.ok(userMessage)
    assert.match(userMessage.id, /^[a-z0-9-]+$/u)
    assert.equal(events.some(event => event.type === 'message_start' && event.message.type === 'user'), false)
    await firstBinding.controller.destroy()
    await firstBinding.storage.close()

    const secondBinding = createController()
    await secondBinding.controller.init()
    try {
      const rebound = await secondBinding.controller.createSession({ resourceId: 'project-message-id', scope: 'builder', threadId: 'conexus-builder:project-message-id', workspace })
      assert.equal((await rebound.thread.listActiveMessages()).some(message => message.id === userMessage.id), true)
    } finally {
      await secondBinding.controller.destroy()
      await secondBinding.storage.close()
    }
  } finally {
    await workspace.destroy()
    await rm(root, { recursive: true, force: true })
  }
})

test('native deleteSession removes live state while preserving the Project Thread', async () => {
  const firstRoot = await mkdtemp(join(tmpdir(), 'conexus-4d-delete-session-first-'))
  const secondRoot = await mkdtemp(join(tmpdir(), 'conexus-4d-delete-session-second-'))
  const storage = new LibSQLStore({ id: `delete-session-store-${crypto.randomUUID()}`, url: `file:${join(firstRoot, 'controller.db')}` })
  const memory = new Memory({ storage, options: { lastMessages: 20 } })
  const model = {
    specificationVersion: 'v2', provider: 'conexus-delete-session', modelId: 'delete-session-probe', supportedUrls: {},
    async doGenerate() { return { content: [{ type: 'text', text: 'Resposta de lifecycle.' }], finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 }, warnings: [] } },
    async doStream() { return { stream: new ReadableStream({ start(stream) { stream.enqueue({ type: 'stream-start', warnings: [] }); stream.enqueue({ type: 'text-start', id: 'delete-session-text' }); stream.enqueue({ type: 'text-delta', id: 'delete-session-text', delta: 'Resposta de lifecycle.' }); stream.enqueue({ type: 'text-end', id: 'delete-session-text' }); stream.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 1, totalTokens: 1 } }); stream.close() } }) } },
  }
  const controller = new AgentController({
    id: `delete-session-controller-${crypto.randomUUID()}`, storage, memory,
    agent: createCodingAgent({ id: 'delete-session-agent', name: 'Delete Session Probe', model, instructions: 'Mechanical probe.', memory, workspace: undefined }),
    modes: [{ id: 'build', name: 'Build', availableTools: [] }], defaultModeId: 'build',
  })
  const workspace = (root, id) => new Workspace({ id, filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const threadId = 'conexus-builder:delete-session-project'
  const resourceId = 'delete-session-project'
  await controller.init()
  const firstWorkspace = workspace(firstRoot, 'delete-session-workspace-a')
  const secondWorkspace = workspace(secondRoot, 'delete-session-workspace-b')
  try {
    const first = await controller.createSession({ resourceId, ownerId: resourceId, scope: 'builder:run-1', threadId, workspace: firstWorkspace })
    await first.sendMessage({ content: 'Mensagem preservada do operador.' })
    const persisted = await first.thread.listActiveMessages()
    const userMessage = persisted.find((message) => message.role === 'signal' && message.type === 'user' && message.content.parts?.some((part) => part.type === 'text' && part.text === 'Mensagem preservada do operador.'))
    assert.ok(userMessage)
    assert.equal(await controller.deleteSession({ resourceId, scope: 'builder:run-1' }), true)
    assert.equal(await controller.getSessionByResource(resourceId, 'builder:run-1'), undefined)

    const second = await controller.createSession({ resourceId, ownerId: resourceId, scope: 'builder:run-2', threadId, workspace: secondWorkspace })
    const messages = await second.thread.listActiveMessages()
    assert.equal(second.thread.getId(), threadId)
    assert.equal(messages.some((message) => message.id === userMessage.id && message.content.parts?.some((part) => part.type === 'text' && part.text === 'Mensagem preservada do operador.')), true)
    assert.notEqual(firstWorkspace, secondWorkspace)
  } finally {
    await controller.destroy()
    await firstWorkspace.destroy()
    await secondWorkspace.destroy()
    await storage.close()
    await rm(firstRoot, { recursive: true, force: true })
    await rm(secondRoot, { recursive: true, force: true })
  }
})
