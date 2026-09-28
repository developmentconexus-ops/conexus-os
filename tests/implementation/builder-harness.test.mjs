import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

const {
  BUILDER_MODES, DEFAULT_BUILDER_MODE, PLAN_WRITE_ROOT,
  CONEXUS_CONNECTOR_BRIEF_KEY, CONEXUS_PROJECT_KNOWLEDGE_KEY,
  conexusInstructions, createBuilderController, defaultBuilderSkillsRoot,
} = await import(hubModuleUrl('builder/harness/index.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })

// AC-1's forbidden terms; 'gh' is checked as a whole word so prose like "through" never false-positives.
const FORBIDDEN_PHRASES = ['Mastra Code', 'pull request', 'npm install']
const containsForbiddenText = (text) => FORBIDDEN_PHRASES.some((phrase) => text.includes(phrase)) || /\bgh\b/.test(text)

test('AC-6: the mode table exposes exactly the tool lists in the Tool contract, by name', () => {
  const shared = ['task_write', 'task_update', 'task_complete', 'task_check', 'skill', 'skill_read', 'skill_search', 'ask_user', 'connector_fetch', 'web_search', 'web_fetch']
  const read = ['mastra_workspace_read_file', 'mastra_workspace_list_files', 'mastra_workspace_grep', 'mastra_workspace_file_stat']
  const write = ['mastra_workspace_write_file', 'mastra_workspace_edit_file', 'mastra_workspace_mkdir']
  const command = ['mastra_workspace_delete', 'mastra_workspace_execute_command', 'mastra_workspace_get_process_output', 'mastra_workspace_kill_process']

  assert.deepEqual([...BUILDER_MODES.plan.availableTools].sort(), [...read, ...write, ...shared, 'submit_plan'].sort())
  assert.deepEqual([...BUILDER_MODES.build.availableTools].sort(), [...read, ...write, ...command, ...shared].sort())
  // No git remote, GitHub, source control, subagent or agent connection tool in either mode.
  for (const name of [...BUILDER_MODES.plan.availableTools, ...BUILDER_MODES.build.availableTools]) {
    assert.doesNotMatch(name, /git|github|source_control|subagent/i)
  }
  assert.equal(DEFAULT_BUILDER_MODE, 'plan')
})

test('AC-3: plan mode may write only under .conexus/plans/', () => {
  assert.equal(PLAN_WRITE_ROOT, '.conexus/plans/')
  assert.equal(BUILDER_MODES.plan.writeRoot, PLAN_WRITE_ROOT)
  assert.equal(BUILDER_MODES.build.writeRoot, null)
})

test('AC-1: conexusInstructions carries the mode text and none of the banned terms, in both modes', () => {
  const instructions = conexusInstructions()
  for (const [modeId, marker] of [['plan', 'Mode: Planejar'], ['build', 'Mode: Construir']]) {
    const requestContext = new RequestContext()
    requestContext.set('controller', { session: { modeId } })
    requestContext.setRaw(CONEXUS_PROJECT_KNOWLEDGE_KEY, 'Loja de bairro, catálogo de produtos.')
    requestContext.setRaw(CONEXUS_CONNECTOR_BRIEF_KEY, 'Conexões disponíveis: sankhya.')
    const text = instructions({ requestContext })
    assert.ok(text.includes(marker), `instructions for ${modeId} include ${marker}`)
    assert.ok(text.includes('Loja de bairro'), 'project knowledge is included')
    assert.ok(text.includes('Conexões disponíveis'), 'connector brief is included')
    assert.equal(containsForbiddenText(text), false, `instructions for ${modeId} carry no forbidden text`)
  }
  // No caller-supplied project knowledge or connector brief: the sections are simply absent.
  const bare = new RequestContext()
  bare.set('controller', { session: { modeId: 'plan' } })
  const bareText = instructions({ requestContext: bare })
  assert.equal(bareText.includes('Project knowledge'), false)
})

test('the real builder-skills/conexus-server path resolves from the repository root', () => {
  assert.equal(defaultBuilderSkillsRoot(repositoryRoot), resolve(repositoryRoot, 'builder-skills', 'conexus-server'))
})

// A scripted turn: ask_user (suspends) -> resume "azul" -> execute_command (must be refused: still
// plan mode) -> submit_plan (suspends) -> approve -> execute_command (must succeed: now build mode).
// This is the exact resume path the blast radius of slices 0 and 1 proved loses `availableTools`.
const scriptedModel = () => {
  const calls = []
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream(options) {
      const step = calls.length
      calls.push({ tools: (options.tools ?? []).map((tool) => tool.name).sort() })
      const usePlanFile = { command: 'echo', args: ['hi'] }
      const parts = {
        0: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'ask_user', input: JSON.stringify({ question: 'Qual cor?' }) }],
        1: [{ type: 'tool-call', toolCallId: 'c2', toolName: 'mastra_workspace_execute_command', input: JSON.stringify(usePlanFile) }],
        2: [{ type: 'tool-call', toolCallId: 'c3', toolName: 'submit_plan', input: JSON.stringify({ path: '.conexus/plans/p.md' }) }],
        3: [{ type: 'tool-call', toolCallId: 'c4', toolName: 'mastra_workspace_execute_command', input: JSON.stringify(usePlanFile) }],
      }[step]
      const stream = parts
        ? [{ type: 'stream-start', warnings: [] }, ...parts, { type: 'finish', finishReason: 'tool-calls', usage }]
        : [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'ok' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
      return { stream: streamOf(stream) }
    },
  }
  return { model, calls }
}

test('the guard refuses a plan-mode command after an ask_user resume, and build tools work after a plan approval', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-guard-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, '.conexus/plans'), { recursive: true })
  writeFileSync(resolve(root, '.conexus/plans/p.md'), '# Plano\n\n1. Fazer a tela.\n')

  const { model, calls } = scriptedModel()
  const workspace = new Workspace({
    id: 'guard-test-ws',
    filesystem: new LocalFilesystem({ basePath: root }),
    sandbox: new LocalSandbox({ workingDirectory: root }),
  })

  const controller = createBuilderController({
    workspace, model, storage: new InMemoryStore(),
    skillsPath: resolve(repositoryRoot, 'builder-skills', 'conexus-server'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())

  const session = await controller.createSession({ resourceId: 'project:probe', scope: 'probe' })
  const toolResults = []
  session.subscribe((event) => {
    if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    if (event.type === 'tool_end') toolResults.push({ toolCallId: event.toolCallId, result: event.result })
    if (event.type === 'tool_suspended' && event.toolName === 'ask_user') {
      setTimeout(() => { void session.respondToToolSuspension({ toolCallId: event.toolCallId, resumeData: 'azul' }) }, 10)
    }
    if (event.type === 'tool_suspended' && event.toolName === 'submit_plan') {
      setTimeout(() => { void session.respondToToolSuspension({ toolCallId: event.toolCallId, resumeData: { action: 'approved' } }) }, 10)
    }
  })

  await session.sendMessage({ content: 'faça um app' })
  for (let waited = 0; calls.length < 5 && waited < 5000; waited += 50) await new Promise((r) => setTimeout(r, 50))

  assert.equal(calls.length, 5, 'the model was called once per step, including the final answer')
  assert.equal(session.mode.get(), 'build', 'approving the plan switched the session to build')

  const commandInPlan = toolResults.find((result) => result.toolCallId === 'c2')
  assert.match(String(commandInPlan.result), /Refused by the Conexus mode guard/, 'a command in plan mode, right after the ask_user resume, was refused')

  const commandInBuild = toolResults.find((result) => result.toolCallId === 'c4')
  assert.doesNotMatch(String(commandInBuild.result), /Refused by the Conexus mode guard/, 'the same command in build mode, right after the plan approval, ran')

  // Skill tools are present in both modes (AC-10): the first model call is plan mode.
  assert.ok(calls[0].tools.includes('skill'), 'skill tool present')
  assert.ok(calls[0].tools.includes('skill_read'), 'skill_read tool present')
  assert.ok(calls[0].tools.includes('skill_search'), 'skill_search tool present')
  assert.ok(calls[0].tools.includes('submit_plan'), 'submit_plan is offered in plan mode')
  assert.ok(!calls[0].tools.includes('mastra_workspace_execute_command'), 'execute_command is not offered in plan mode')
})

test('AC-3: a plan-mode write outside .conexus/plans/ is refused; a write inside it succeeds', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-write-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, '.conexus/plans'), { recursive: true })

  const calls = []
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream() {
      const step = calls.length
      calls.push({})
      const targets = ['app/index.ts', '.conexus/plans/p.md']
      const parts = step < targets.length
        ? [{ type: 'stream-start', warnings: [] }, { type: 'tool-call', toolCallId: `w${step}`, toolName: 'mastra_workspace_write_file', input: JSON.stringify({ path: targets[step], content: 'x' }) }, { type: 'finish', finishReason: 'tool-calls', usage }]
        : [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'ok' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
      return { stream: streamOf(parts) }
    },
  }
  const workspace = new Workspace({
    id: 'write-test-ws',
    filesystem: new LocalFilesystem({ basePath: root }),
    sandbox: new LocalSandbox({ workingDirectory: root }),
  })
  const controller = createBuilderController({
    workspace, model, storage: new InMemoryStore(),
    skillsPath: resolve(repositoryRoot, 'builder-skills', 'conexus-server'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  const session = await controller.createSession({ resourceId: 'project:probe-write', scope: 'probe-write' })
  const toolResults = []
  session.subscribe((event) => {
    if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    if (event.type === 'tool_end') toolResults.push({ toolCallId: event.toolCallId, result: event.result })
  })
  await session.sendMessage({ content: 'escreva' })
  for (let waited = 0; calls.length < 3 && waited < 5000; waited += 50) await new Promise((r) => setTimeout(r, 50))

  const outside = toolResults.find((result) => result.toolCallId === 'w0')
  assert.match(String(outside.result), /Refused by the Conexus mode guard/, 'write outside .conexus/plans/ was refused')
  const inside = toolResults.find((result) => result.toolCallId === 'w1')
  assert.doesNotMatch(String(inside.result), /Refused by the Conexus mode guard/, 'write inside .conexus/plans/ ran')
})
