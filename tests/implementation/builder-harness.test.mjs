import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'

const { BUILDER_MODES, DEFAULT_BUILDER_MODE, PLAN_WRITE_ROOT } = await import(hubModuleUrl('builder/harness/modes.js'))
const { CONEXUS_CONNECTOR_BRIEF_KEY, CONEXUS_PROJECT_KNOWLEDGE_KEY, CONEXUS_PROMPT_VARIANT_KEY } = await import(hubModuleUrl('builder/harness/request-context.js'))
const { conexusInstructions, DEFAULT_PROMPT_VARIANT, PROMPT_VARIANTS } = await import(hubModuleUrl('builder/harness/prompt.js'))
const { attachBuilderModeGuard, createBuilderModeGuard } = await import(hubModuleUrl('builder/harness/guard.js'))
const { createSubmitPlanTool } = await import(hubModuleUrl('builder/harness/tools.js'))
const { BUILDER_SKILL_NAMES, createBuilderController, defaultBuilderSkillsRoot } = await import(hubModuleUrl('builder/harness/controller.js'))

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
  assert.deepEqual([...BUILDER_MODES.build.availableTools].sort(), [...read, ...write, ...command, ...shared, 'conexus_check', 'conexus_run_operation'].sort())
  assert.equal(BUILDER_MODES.plan.availableTools.has('conexus_check'), false, 'Planejar lists no conexus_check')
  // No git remote, GitHub, source control, subagent or agent connection tool in either mode.
  for (const name of [...BUILDER_MODES.plan.availableTools, ...BUILDER_MODES.build.availableTools]) {
    assert.doesNotMatch(name, /git|github|source_control|subagent/i)
  }
  assert.equal(DEFAULT_BUILDER_MODE, 'plan')
})

const PASSING = { ok: true, steps: ['generate', 'typecheck', 'build', 'server', 'boot'].map((step) => ({ step, status: 'passed', durationMs: 1 })), facts: { operations: 0, migrations: 0, jsGzipBytes: 1 } }
const inMode = (modeId) => { const requestContext = new RequestContext(); requestContext.set('controller', { session: { modeId } }); return { requestContext } }

test('AC-8: conexus_check returns the run check report in Construir and refuses in Planejar', async () => {
  const { createCheckTool } = await import(hubModuleUrl('builder/harness/tools.js'))
  let ran = 0
  const tool = createCheckTool(async () => { ran += 1; return PASSING })
  assert.deepEqual(await tool.execute({}, inMode('build')), PASSING)
  await assert.rejects(() => tool.execute({}, inMode('plan')), /Construir/)
  assert.equal(ran, 1)
})

test('AC-8: the controller offers conexus_check to a turn whose run has a check, and conexus_run_operation when it can run one', async () => {
  const runs = { r1: { check: async () => PASSING, runOperation: async () => ({ ok: false, operation: 'x', code: 'NOT_USED' }) }, r3: { check: async () => PASSING } }
  const controller = createBuilderController({
    model: scriptedModel().model, storage: new InMemoryStore(), skillsPath: resolve(repositoryRoot, 'builder-skills'),
    runTools: ({ requestContext }) => runs[requestContext.getRaw('conexusBuilderRunId')],
  })
  const session = await controller.createSession({ resourceId: 'project:probe-check', scope: 'probe-check' })
  const agent = controller.getCurrentAgent(session)
  const names = async (runId) => {
    const requestContext = new RequestContext()
    if (runId) requestContext.setRaw('conexusBuilderRunId', runId)
    return Object.keys(await agent.listTools({ requestContext })).filter((name) => name.startsWith('conexus_')).sort()
  }
  assert.deepEqual([await names('r1'), await names('r3'), await names('r2'), await names()], [['conexus_check', 'conexus_run_operation'], ['conexus_check'], [], []])
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
  assert.equal(bareText.includes('## Project knowledge'), false)
})

test('the Conexões section has its own heading, after the mode text and above Project knowledge, and Precedence ranks it as instructions', () => {
  const requestContext = new RequestContext()
  requestContext.set('controller', { session: { modeId: 'build' } })
  requestContext.setRaw(CONEXUS_PROJECT_KNOWLEDGE_KEY, '# Notes\n\n## Verification\n\nThe list screen was read.')
  requestContext.setRaw(CONEXUS_CONNECTOR_BRIEF_KEY, 'Conexões bound to this Project: `erp`.')
  const text = conexusInstructions()({ requestContext })
  const mode = text.indexOf('## Mode: Construir')
  const conexoes = text.indexOf('## Conexões\n\nConexões bound to this Project: `erp`.')
  const knowledge = text.indexOf('## Project knowledge\n\n# Notes')
  assert.deepEqual([mode > 0, conexoes > mode, knowledge > conexoes], [true, true, true])
  assert.equal(text.endsWith('The list screen was read.'), true, 'nothing follows the notes')
  assert.equal(text.includes('These instructions come first, the Conexões section and its integrator guides included, then the\nperson\'s current request, then the Project knowledge.'), true)
})

const renderPrompt = ({ modeId, variant }) => {
  const requestContext = new RequestContext()
  requestContext.set('controller', { session: { modeId } })
  if (variant !== undefined) requestContext.setRaw(CONEXUS_PROMPT_VARIANT_KEY, variant)
  return conexusInstructions()({ requestContext })
}

test('a run that names no prompt variant gets v2, the same text as naming v2', () => {
  assert.deepEqual(PROMPT_VARIANTS, ['v2'])
  assert.equal(DEFAULT_PROMPT_VARIANT, 'v2')
  for (const modeId of ['plan', 'build']) {
    const text = renderPrompt({ modeId })
    assert.equal(text, renderPrompt({ modeId, variant: 'v2' }))
    assert.equal(text.startsWith('# Conexus Builder\n\nYou are the Conexus Builder, a coding agent.'), true)
  }
})

test('a prompt variant the Hub does not ship fails the turn instead of falling back, the removed v1 included', () => {
  assert.throws(() => renderPrompt({ modeId: 'plan', variant: 'v1' }), { message: 'BUILDER_PROMPT_VARIANT_UNKNOWN' })
  assert.throws(() => renderPrompt({ modeId: 'plan', variant: 'v9' }), { message: 'BUILDER_PROMPT_VARIANT_UNKNOWN' })
  assert.throws(() => renderPrompt({ modeId: 'build', variant: '../v2' }), { message: 'BUILDER_PROMPT_VARIANT_UNKNOWN' })
})

test('the prompt names the compiler stack, the three skills, the check and the generated client as they exist now', () => {
  const plan = renderPrompt({ modeId: 'plan' })
  const build = renderPrompt({ modeId: 'build' })
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'apps/hub/compiler-template/package.json'), 'utf8'))
  const tooling = new Set(['typescript', 'vite', '@vitejs/plugin-react', '@tailwindcss/vite'])
  const appPackages = Object.keys(manifest.dependencies).filter((name) => !name.startsWith('@types/') && !tooling.has(name)).sort()
  const listed = /The only packages are ([\s\S]*?)\. You cannot add packages/.exec(build)[1]
  assert.deepEqual([...listed.matchAll(/`([^`]+)`/g)].map(([, name]) => name).sort(), appPackages)

  assert.deepEqual([...BUILDER_SKILL_NAMES].sort(), ['conexus-app-code', 'conexus-app-ui', 'conexus-server'])
  for (const name of BUILDER_SKILL_NAMES) assert.equal(existsSync(resolve(repositoryRoot, 'builder-skills', name, 'SKILL.md')), true, `${name} exists`)
  assert.equal(build.includes('Load the `conexus-server` skill before you touch `conexus/`, and the `conexus-app-ui` and\n  `conexus-app-code` skills before you build screens.'), true)
  for (const text of [plan, build]) for (const [, name] of text.matchAll(/`(conexus-[a-z-]+)` skill/g)) assert.equal(BUILDER_SKILL_NAMES.includes(name), true, `${name} is a shipped skill`)

  assert.equal(build.includes('call `conexus_check`'), true)
  assert.equal(plan.includes('conexus_check'), false, 'Planejar has no check tool')
  assert.equal(BUILDER_MODES.plan.availableTools.has('conexus_check'), false)
  assert.equal(BUILDER_MODES.build.availableTools.has('conexus_check'), true)
  assert.equal(build.includes('never call a\n  server operation with `fetch`'), true)
  for (const text of [plan, build]) assert.doesNotMatch(text, /check\.sh|\bV1\b|REACT_VITE_V1|`fetch\(/)
})

test('v2 carries the Conexus layer and its mode rules, and no source notice, coding-tool identity or version-control text', () => {
  const plan = renderPrompt({ modeId: 'plan' })
  const build = renderPrompt({ modeId: 'build' })
  for (const text of [plan, build]) {
    for (const phrase of ['## What Conexus is', '## Data comes only from real sources', '`connector_fetch`', 'Integrações', 'Prévia', '`api.<operation>` from `@/conexus/api.gen`']) {
      assert.equal(text.includes(phrase), true, `v2 includes ${phrase}`)
    }
    assert.equal(text.includes('<!--'), false, 'the license notice never reaches the model')
    assert.equal(text.includes('Mastra Code'), false)
    assert.doesNotMatch(text, /\bgit\b|\bgh\b|pull request|\bcommit|npm install|@mastra/i)
    // Case-sensitive: without the `u` flag, the "Pr" of Prévia is a whole word to \b.
    assert.doesNotMatch(text, /\bPRs?\b/)
  }
  assert.equal(plan.includes('### First, see what the message asks'), true)
  assert.equal(plan.includes('call `submit_plan` with its `path`'), true)
  assert.equal(build.includes('call `conexus_check`'), true)
  assert.equal(build.includes('Never call the app or its operations "validados" or "testados"'), true)
})

test('the real builder-skills path resolves from the repository root', () => {
  assert.equal(defaultBuilderSkillsRoot('/repo'), '/repo/builder-skills')
})

test('the Builder finds conexus-server, conexus-app-ui and conexus-app-code through its skill listing', async () => {
  const controller = createBuilderController({ model: scriptedModel().model, storage: new InMemoryStore() })
  const agent = controller.getCurrentAgent(await controller.createSession({ resourceId: 'project:probe-skills', scope: 'probe-skills' }))
  const skills = await agent.listSkills({ requestContext: new RequestContext() })
  assert.deepEqual(skills.map((skill) => skill.name).sort(), ['conexus-app-code', 'conexus-app-ui', 'conexus-server'])
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
    skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())

  const session = await controller.createSession({ resourceId: 'project:probe', scope: 'probe' })
  const toolResults = []
  const planSuspensions = []
  session.subscribe((event) => {
    if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    if (event.type === 'tool_end') toolResults.push({ toolCallId: event.toolCallId, result: event.result })
    if (event.type === 'tool_suspended' && event.toolName === 'ask_user') {
      setTimeout(() => { void session.respondToToolSuspension({ toolCallId: event.toolCallId, resumeData: 'azul' }) }, 10)
    }
    if (event.type === 'tool_suspended' && event.toolName === 'submit_plan') {
      planSuspensions.push(event.suspendPayload)
      setTimeout(() => { void session.respondToToolSuspension({ toolCallId: event.toolCallId, resumeData: { action: 'approved' } }) }, 10)
    }
  })

  await session.sendMessage({ content: 'faça um app' })
  for (let waited = 0; calls.length < 5 && waited < 5000; waited += 50) await new Promise((r) => setTimeout(r, 50))

  assert.equal(calls.length, 5, 'the model was called once per step, including the final answer')
  assert.deepEqual(planSuspensions, [{ toolId: 'submit_plan', path: '.conexus/plans/p.md', title: 'Plano', plan: '1. Fazer a tela.' }], 'the controller carries the plan text to the person')
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
    skillsPath: resolve(repositoryRoot, 'builder-skills'),
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

const modeContext = (modeId) => {
  const requestContext = new RequestContext()
  requestContext.set('controller', { session: { modeId } })
  return requestContext
}
const writeCall = (path, modeId = 'plan') => ({
  toolName: 'mastra_workspace_write_file', workspaceToolName: 'mastra_workspace_write_file',
  input: { path, content: 'x' }, context: { requestContext: modeContext(modeId) },
})
const PLAN_REFUSAL = Object.freeze({ proceed: false, output: 'Refused by the Conexus mode guard: Planejar may only write under .conexus/plans/' })

test('the plan write check reads the path inside the repository, so a .. escape or an outside absolute path is refused', async () => {
  const guard = createBuilderModeGuard()
  assert.deepEqual(await guard(writeCall('.conexus/plans/../../app/x.ts')), PLAN_REFUSAL)
  assert.deepEqual(await guard(writeCall('.conexus/plans/../app/x.ts')), PLAN_REFUSAL)
  assert.deepEqual(await guard(writeCall('/etc/passwd')), PLAN_REFUSAL)
  assert.deepEqual(await guard(writeCall('/workspace/repo/.conexus/plans/../../repo/app/x.ts')), PLAN_REFUSAL)
  assert.deepEqual(await guard(writeCall('/workspace/repo-other/.conexus/plans/p.md')), PLAN_REFUSAL)
  assert.equal(await guard(writeCall('.conexus/plans/p.md')), undefined)
  assert.equal(await guard(writeCall('./.conexus/plans/nested/p.md')), undefined)
  assert.equal(await guard(writeCall('/workspace/repo/.conexus/plans/p.md')), undefined)
  // The sandbox filesystem reads any other leading slash as the repository root.
  assert.equal(await guard(writeCall('/.conexus/plans/p.md')), undefined)
  assert.deepEqual(await guard(writeCall('/app/x.ts')), PLAN_REFUSAL)
  assert.equal(await guard(writeCall('app/x.ts', 'build')), undefined)
})

test('the mode guard runs before the workspace\'s own hook, and a hook that answers cannot skip it', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-hook-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const seen = []
  const workspace = new Workspace({ id: 'hook-order-ws', filesystem: new LocalFilesystem({ basePath: root }) })
  // A prior hook that answers every call, the way one that approves or logs by returning a value would.
  workspace.setToolsConfig({ hooks: { beforeToolCall: (context) => { seen.push(context.input.path); return { proceed: false, output: 'prior hook' } } } })
  attachBuilderModeGuard(workspace)
  const beforeToolCall = workspace.getToolsConfig().hooks.beforeToolCall

  assert.deepEqual(await beforeToolCall(writeCall('app/x.ts')), PLAN_REFUSAL)
  assert.deepEqual(seen, [], 'a call the guard refuses never reaches the prior hook')
  assert.deepEqual(await beforeToolCall(writeCall('.conexus/plans/p.md')), { proceed: false, output: 'prior hook' })
  assert.deepEqual(seen, ['.conexus/plans/p.md'], 'a call the guard allows still reaches the prior hook')
})

test('submit_plan called outside Planejar is refused on its first call, whatever the request context lists', async () => {
  const submitPlan = createSubmitPlanTool()
  assert.equal(
    await submitPlan.execute({ path: '.conexus/plans/p.md' }, { requestContext: modeContext('build') }),
    'Refused by the Conexus mode guard: submit_plan is only available in Planejar.',
  )
  assert.equal(
    await submitPlan.execute({ path: '.conexus/plans/../app/p.md' }, { requestContext: modeContext('plan') }),
    'Refused by the Conexus mode guard: the plan file must be under .conexus/plans/.',
  )
})

test('submit_plan suspends with the plan file read through the workspace, its title split off a leading heading', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-plan-text-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, '.conexus/plans'), { recursive: true })
  writeFileSync(resolve(root, '.conexus/plans/titled.md'), '# Tela de login\n\n1. Criar o formulário.\n2. Ligar ao Keycloak.\n')
  writeFileSync(resolve(root, '.conexus/plans/bare.md'), 'Só o corpo.\n\nSegundo parágrafo.\n')
  const workspace = new Workspace({ id: 'plan-text-ws', filesystem: new LocalFilesystem({ basePath: root }) })
  const suspended = []
  const call = async (path) => {
    const result = await createSubmitPlanTool().execute({ path }, { requestContext: modeContext('plan'), workspace, agent: { suspend: async (payload) => { suspended.push(payload) } } })
    return result
  }
  assert.equal(await call('.conexus/plans/titled.md'), undefined)
  assert.equal(await call('.conexus/plans/bare.md'), undefined)
  assert.deepEqual(suspended, [
    { toolId: 'submit_plan', path: '.conexus/plans/titled.md', title: 'Tela de login', plan: '1. Criar o formulário.\n2. Ligar ao Keycloak.' },
    { toolId: 'submit_plan', path: '.conexus/plans/bare.md', title: '', plan: 'Só o corpo.\n\nSegundo parágrafo.' },
  ])
  await call('.conexus/plans/missing.md')
  assert.deepEqual(suspended.at(-1), { toolId: 'submit_plan', path: '.conexus/plans/missing.md' }, 'an unreadable plan still suspends on its path')
})

test('a submit_plan refused outside Planejar never suspends, so answering it as approved changes nothing', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-resume-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, '.conexus/plans'), { recursive: true })
  writeFileSync(resolve(root, '.conexus/plans/p.md'), '# Plano\n')
  const calls = []
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream() {
      const step = calls.length
      calls.push(step)
      const parts = step === 0
        ? [{ type: 'stream-start', warnings: [] }, { type: 'tool-call', toolCallId: 's1', toolName: 'submit_plan', input: JSON.stringify({ path: '.conexus/plans/p.md' }) }, { type: 'finish', finishReason: 'tool-calls', usage }]
        : [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'ok' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
      return { stream: streamOf(parts) }
    },
  }
  const workspace = new Workspace({ id: 'resume-test-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const controller = createBuilderController({ workspace, model, storage: new InMemoryStore(), skillsPath: resolve(repositoryRoot, 'builder-skills') })
  await controller.init()
  t.after(() => controller.destroy?.())
  const session = await controller.createSession({ resourceId: 'project:probe-resume', scope: 'probe-resume' })
  await session.mode.switch({ modeId: 'build' })
  const events = []
  session.subscribe((event) => {
    if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    events.push(event.type === 'tool_end' ? { type: 'tool_end', toolCallId: event.toolCallId, result: String(event.result) } : { type: event.type })
  })
  await session.sendMessage({ content: 'aprove o plano' })
  for (let waited = 0; calls.length < 2 && waited < 5000; waited += 50) await new Promise((r) => setTimeout(r, 50))

  const ended = events.filter((event) => event.type === 'tool_end')
  assert.deepEqual(ended.map((event) => event.toolCallId), ['s1'])
  // Construir does not list submit_plan, so the call is refused before the tool's own check runs.
  assert.match(ended[0].result, /^Tool "submit_plan" not found\./)
  assert.equal(events.some((event) => event.type === 'tool_suspended'), false, 'the refused call never suspended')
  const before = events.length
  await session.respondToToolSuspension({ toolCallId: 's1', resumeData: { action: 'approved' } })
  await new Promise((r) => setTimeout(r, 200))
  assert.equal(events.length, before, 'answering a call that never suspended emits nothing')
  assert.deepEqual(calls, [0, 1], 'the model was not called again')
  assert.equal(session.mode.get(), 'build')
})

test('a Google AI Pro model lists its tools without throwing and has no web_search; a native provider model keeps it', async () => {
  const skillsPath = resolve(repositoryRoot, 'builder-skills', 'conexus-server')
  // The exact MastraModelConfig shape module.ts's createModelResolver returns for every run today
  // (Only Google AI Pro is wired in slice 1): an OpenAICompatibleConfig routed through CLIProxy,
  // whose provider id Mastra's built-in webSearchTool cannot infer as OpenAI, Anthropic, Google, or xAI.
  const googleAiProModel = { providerId: 'google-ai-pro', modelId: 'gemini-3.1-pro-low', url: 'http://127.0.0.1:1/v1', apiKey: 'test-key' }
  const googleController = createBuilderController({ model: googleAiProModel, storage: new InMemoryStore(), skillsPath })
  const googleSession = await googleController.createSession({ resourceId: 'project:probe-google-ai-pro', scope: 'probe-google-ai-pro' })
  const googleTools = await googleController.getCurrentAgent(googleSession).listTools({ requestContext: new RequestContext() })
  assert.equal('web_search' in googleTools, false, 'a provider Mastra cannot infer gets no web_search tool')
  assert.equal('web_fetch' in googleTools, true, 'web_fetch stays available regardless of provider')

  const nativeController = createBuilderController({ model: scriptedModel().model, storage: new InMemoryStore(), skillsPath })
  const nativeSession = await nativeController.createSession({ resourceId: 'project:probe-native-search', scope: 'probe-native-search' })
  const nativeTools = await nativeController.getCurrentAgent(nativeSession).listTools({ requestContext: new RequestContext() })
  assert.equal('web_search' in nativeTools, true, 'a model on a native-search provider keeps web_search')
})

test('a ChatGPT subscription model lists its tools without throwing and gets OpenAI\'s Responses web_search: it reports provider openai.responses, which Mastra\'s webSearchTool cannot map', async () => {
  const { codexModel } = await import('./codex-model.mjs')
  const skillsPath = resolve(repositoryRoot, 'builder-skills', 'conexus-server')
  const unused = { access: 'unused', refresh: 'unused', expires: Date.now() + 3_600_000, accountId: 'unused' }
  // The model module.ts's resolver returns for an `openai/*` selection on a ChatGPT subscription.
  const model = () => codexModel('gpt-5.6-sol', unused)
  const controller = createBuilderController({ model, storage: new InMemoryStore(), skillsPath })
  const session = await controller.createSession({ resourceId: 'project:probe-chatgpt', scope: 'probe-chatgpt' })
  const tools = await controller.getCurrentAgent(session).listTools({ requestContext: new RequestContext() })
  assert.deepEqual(['web_search' in tools, 'web_fetch' in tools, (await model()).provider], [true, true, 'openai.responses'])
  assert.deepEqual(tools.web_search, { type: 'provider-defined', id: 'openai.web_search', name: 'web_search', args: {} })
})

test('both kinds of Anthropic account get web search: Anthropic\'s own web_search tool', async () => {
  const { createAnthropicRoute } = await import(hubModuleUrl('builder/anthropic/route.js'))
  const { createClaudeHolds, serializeClaudeTokens } = await import(hubModuleUrl('builder/anthropic/credential.js'))
  const skillsPath = resolve(repositoryRoot, 'builder-skills', 'conexus-server')
  const route = createAnthropicRoute(createClaudeHolds({ store: { readById: async () => null, rewrite: async () => false } }))
  const toolsOf = async (account) => {
    const model = () => route.take(account).model('claude-sonnet-5')
    const controller = createBuilderController({ model, storage: new InMemoryStore(), skillsPath })
    const session = await controller.createSession({ resourceId: `project:probe-${account.kind}`, scope: `probe-${account.kind}` })
    return { tools: await controller.getCurrentAgent(session).listTools({ requestContext: new RequestContext() }), resolved: await model() }
  }
  const key = await toolsOf({ modelAccountId: 'row-1', kind: 'api_key', secret: `sk-ant-api03-${'x'.repeat(40)}` })
  const subscription = await toolsOf({ modelAccountId: 'row-2', kind: 'oauth', secret: serializeClaudeTokens({ access: 'unused', refresh: 'unused', expires: 9_999_999_999_999 }) })
  const anthropicSearch = { type: 'provider-defined', id: 'anthropic.web_search_20250305', name: 'web_search', args: {} }
  assert.deepEqual([key.resolved.id, key.tools.web_search], ['anthropic/claude-sonnet-5', anthropicSearch], 'Mastra maps webSearchTool for a router model id')
  assert.deepEqual([subscription.resolved.provider, subscription.tools.web_search], ['anthropic.messages', anthropicSearch])
})

test('connector_fetch reaches a turn whose request context carries a run the Connector module opened, and no other', async () => {
  const { createConnectorFetchTools, openBuilderRun } = await import(hubModuleUrl('connectors/builder-tool.js'))
  const broker = { fetch: async () => ({ ok: false, code: 'NOT_GRANTED' }), describe: async () => ({ integrator: null, service: null }) }
  const controller = createBuilderController({
    model: scriptedModel().model, storage: new InMemoryStore(), connectorFetch: createConnectorFetchTools(broker),
    skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  const session = await controller.createSession({ resourceId: 'project:probe-connector', scope: 'probe-connector' })
  const agent = controller.getCurrentAgent(session)
  const toolsFor = async (bind) => {
    const requestContext = new RequestContext()
    bind?.(requestContext)
    return Object.keys(await agent.listTools({ requestContext })).filter((name) => name === 'connector_fetch')
  }
  const run = await openBuilderRun({ brief: async () => '', projectId: '22222222-2222-4222-8222-222222222222', builderRunId: '11111111-1111-4111-8111-111111111111' })
  assert.deepEqual([await toolsFor(run.bind), await toolsFor()], [['connector_fetch'], []])
})

test("a run's turn lasts through the person's answer and the plan approval, on the run's own session and workspace, and closing it forgets both (AC-16)", async (t) => {
  const { createControllerRunSessions } = await import(hubModuleUrl('builder/run-runtime.js'))
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-run-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, '.conexus/plans'), { recursive: true })
  writeFileSync(resolve(root, '.conexus/plans/p.md'), '# Plano\n\n1. Fazer a tela.\n')
  const workspace = new Workspace({ id: 'run-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const runContexts = new Map()
  const runWorkspaces = new Map()
  const { model, calls } = scriptedModel()
  const { Memory } = await import('@mastra/memory')
  const storage = new InMemoryStore()
  const controller = createBuilderController({
    workspace: ({ requestContext }) => runWorkspaces.get(requestContext.getRaw('conexusBuilderRunId')),
    model, storage, memory: new Memory({ storage, options: { lastMessages: 40, semanticRecall: false } }), skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  const projectId = '22222222-2222-4222-8222-222222222222'
  const builderRunId = '11111111-1111-4111-8111-111111111111'
  const openSession = createControllerRunSessions({ controller, runContexts, runWorkspaces, runTools: new Map() })
  const run = await openSession({
    projectId, conversationId: '44444444-4444-4444-8444-444444444444', builderRunId, workspace,
    runCheck: async () => PASSING,
    bindContext: (requestContext) => requestContext.setRaw('conexusBuilderRunId', builderRunId),
  })
  const live = await controller.getSessionByResource(`project:${projectId}`, `builder:${builderRunId}`)
  const answered = []
  live.subscribe((event) => {
    if (event.type !== 'tool_suspended') return
    answered.push(event.toolName)
    const resumeData = event.toolName === 'ask_user' ? 'azul' : { action: 'approved' }
    setTimeout(() => { void live.respondToToolSuspension({ toolCallId: event.toolCallId, resumeData }) }, 20)
  })
  const turn = await run.sendTurn('faça um app')
  assert.deepEqual({ reason: turn.reason, summary: turn.summary, answered, calls: calls.length, mode: live.mode.get() }, { reason: 'complete', summary: 'ok', answered: ['ask_user', 'submit_plan'], calls: 5, mode: 'build' })
  assert.equal(typeof turn.userMessageId, 'string')
  assert.deepEqual([[...runContexts.keys()], [...runWorkspaces.keys()]], [[`builder:${builderRunId}`], [builderRunId]])
  await run.close()
  assert.deepEqual([runContexts.size, runWorkspaces.size, await controller.getSessionByResource(`project:${projectId}`, `builder:${builderRunId}`)], [0, 0, undefined])
})

test("a run's plan waits for the person: ordinary tools never ask, Pedir ajustes keeps Planejar, and the approval builds in the same run (AC-4, AC-16)", async (t) => {
  const { createControllerRunSessions } = await import(hubModuleUrl('builder/run-runtime.js'))
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-plan-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspace = new Workspace({ id: 'plan-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const steps = [
    { toolCallId: 'w1', toolName: 'mastra_workspace_write_file', input: { path: '.conexus/plans/p.md', content: '# Plano\n\n1. Botão.\n' } },
    { toolCallId: 'p1', toolName: 'submit_plan', input: { path: '.conexus/plans/p.md' } },
    { toolCallId: 'p2', toolName: 'submit_plan', input: { path: '.conexus/plans/p.md' } },
    { toolCallId: 'c1', toolName: 'mastra_workspace_execute_command', input: { command: 'echo', args: ['construído'] } },
  ]
  const calls = []
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream() {
      const step = steps[calls.length]
      calls.push(calls.length)
      const parts = step
        ? [{ type: 'tool-call', toolCallId: step.toolCallId, toolName: step.toolName, input: JSON.stringify(step.input) }, { type: 'finish', finishReason: 'tool-calls', usage }]
        : [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'pronto' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
      return { stream: streamOf([{ type: 'stream-start', warnings: [] }, ...parts]) }
    },
  }
  const runWorkspaces = new Map()
  const { Memory } = await import('@mastra/memory')
  const storage = new InMemoryStore()
  const controller = createBuilderController({
    workspace: ({ requestContext }) => runWorkspaces.get(requestContext.getRaw('conexusBuilderRunId')),
    model, storage, memory: new Memory({ storage, options: { lastMessages: 40, semanticRecall: false } }), skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  const projectId = '22222222-2222-4222-8222-222222222222'
  const builderRunId = '66666666-6666-4666-8666-666666666666'
  const run = await createControllerRunSessions({ controller, runContexts: new Map(), runWorkspaces, runTools: new Map() })({
    projectId, conversationId: '77777777-7777-4777-8777-777777777777', builderRunId, workspace,
    runCheck: async () => PASSING,
    bindContext: (requestContext) => requestContext.setRaw('conexusBuilderRunId', builderRunId),
  })
  const live = await controller.getSessionByResource(`project:${projectId}`, `builder:${builderRunId}`)
  const seen = []
  const suspended = []
  live.subscribe((event) => {
    if (event.type === 'tool_approval_required') seen.push(['approval', event.toolName])
    if (event.type === 'tool_suspended') suspended.push(event.toolCallId)
    if (event.type === 'tool_end') seen.push(['end', event.toolCallId, String(event.result?.content ?? event.result), live.mode.get()])
  })
  let ended = false
  const turn = run.sendTurn('quero um botão').then((result) => { ended = true; return result })
  const waitFor = async (predicate) => { for (let waited = 0; !predicate() && waited < 5000; waited += 20) await new Promise((r) => setTimeout(r, 20)) }

  await waitFor(() => suspended.length === 1)
  await new Promise((r) => setTimeout(r, 300))
  assert.deepEqual({ suspended, ended, mode: live.mode.get() }, { suspended: ['p1'], ended: false, mode: 'plan' }, 'the plan waits for the person and the turn stays open')
  await live.respondToToolSuspension({ toolCallId: 'p1', resumeData: { action: 'rejected', feedback: 'Coloque o botão no rodapé.' } })
  await waitFor(() => suspended.length === 2)
  await new Promise((r) => setTimeout(r, 300))
  assert.deepEqual({ suspended, ended, mode: live.mode.get() }, { suspended: ['p1', 'p2'], ended: false, mode: 'plan' }, 'Pedir ajustes keeps Planejar and the revised plan waits again')
  await live.respondToToolSuspension({ toolCallId: 'p2', resumeData: { action: 'approved' } })
  const result = await turn

  assert.deepEqual({ reason: result.reason, summary: result.summary, mode: live.mode.get(), calls: calls.length }, { reason: 'complete', summary: 'pronto', mode: 'build', calls: 5 })
  assert.deepEqual(seen.map(([kind, id, , mode]) => [kind, id, mode]), [['end', 'w1', 'plan'], ['end', 'p1', 'plan'], ['end', 'p2', 'build'], ['end', 'c1', 'build']], 'no tool asked for approval')
  assert.match(seen[1][2], /User feedback: Coloque o botão no rodapé\./)
  assert.equal(seen[2][2], 'Plan approved. Proceed with implementation following the approved plan.')
  await run.close()
})

test('a model switched while the plan card waits is the model the build runs on', async (t) => {
  const { createControllerRunSessions } = await import(hubModuleUrl('builder/run-runtime.js'))
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-switch-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspace = new Workspace({ id: 'switch-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const steps = [
    { toolCallId: 'w1', toolName: 'mastra_workspace_write_file', input: { path: '.conexus/plans/p.md', content: '# Plano\n\n1. Botão.\n' } },
    { toolCallId: 'p1', toolName: 'submit_plan', input: { path: '.conexus/plans/p.md' } },
    { toolCallId: 'c1', toolName: 'mastra_workspace_execute_command', input: { command: 'echo', args: ['construído'] } },
  ]
  const calls = []
  const scripted = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream() {
      const step = steps[calls.length]
      calls.push(calls.length)
      const parts = step
        ? [{ type: 'tool-call', toolCallId: step.toolCallId, toolName: step.toolName, input: JSON.stringify(step.input) }, { type: 'finish', finishReason: 'tool-calls', usage }]
        : [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'pronto' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
      return { stream: streamOf([{ type: 'stream-start', warnings: [] }, ...parts]) }
    },
  }
  const modelIds = []
  const model = ({ requestContext }) => {
    modelIds.push(requestContext.get('controller')?.session?.modelId)
    return scripted
  }
  const runWorkspaces = new Map()
  const { Memory } = await import('@mastra/memory')
  const storage = new InMemoryStore()
  const controller = createBuilderController({
    workspace: ({ requestContext }) => runWorkspaces.get(requestContext.getRaw('conexusBuilderRunId')),
    model, storage, memory: new Memory({ storage, options: { lastMessages: 40, semanticRecall: false } }), skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  const projectId = '22222222-2222-4222-8222-222222222222'
  const conversationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const builderRunId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  const conversation = await controller.createSession({ resourceId: `project:${projectId}`, scope: `conversation:${conversationId}`, threadId: conversationId })
  await conversation.model.switch({ modelId: 'openai/gpt-5.6-sol', scope: 'thread' })

  const run = await createControllerRunSessions({ controller, runContexts: new Map(), runWorkspaces, runTools: new Map() })({
    projectId, conversationId, builderRunId, workspace,
    runCheck: async () => PASSING,
    bindContext: (requestContext) => requestContext.setRaw('conexusBuilderRunId', builderRunId),
  })
  const live = await controller.getSessionByResource(`project:${projectId}`, `builder:${builderRunId}`)
  live.subscribe((event) => {
    if (event.type !== 'tool_suspended' || event.toolName !== 'submit_plan') return
    void (async () => {
      await live.model.switch({ modelId: 'google-ai-pro/gemini-3-flash', scope: 'thread' })
      await live.model.switch({ modelId: 'google-ai-pro/gemini-3-flash', scope: 'thread', modeId: 'build' })
      await live.respondToToolSuspension({ toolCallId: event.toolCallId, resumeData: { action: 'approved' } })
    })()
  })
  const turn = await run.sendTurn('quero um botão')
  assert.equal(turn.reason, 'complete')
  assert.equal(live.mode.get(), 'build')
  assert.deepEqual(modelIds, [
    ...Array(4).fill('openai/gpt-5.6-sol'),
    ...Array(4).fill('google-ai-pro/gemini-3-flash'),
  ], 'every call after the approval runs on the model chosen while the card waited')
  const thread = await (await storage.getStore('memory')).getThreadById({ threadId: conversationId })
  assert.deepEqual(
    { plan: thread.metadata.modeModelId_plan, build: thread.metadata.modeModelId_build },
    { plan: 'google-ai-pro/gemini-3-flash', build: 'google-ai-pro/gemini-3-flash' },
  )
  await run.close()
})

test("the conversation's mode follows a plan approval, once the run closes (item C)", async (t) => {
  const { createControllerRunSessions } = await import(hubModuleUrl('builder/run-runtime.js'))
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-chip-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspace = new Workspace({ id: 'chip-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const steps = [
    { toolCallId: 'w1', toolName: 'mastra_workspace_write_file', input: { path: '.conexus/plans/p.md', content: '# Plano\n\n1. Botão.\n' } },
    { toolCallId: 'p1', toolName: 'submit_plan', input: { path: '.conexus/plans/p.md' } },
    { toolCallId: 'c1', toolName: 'mastra_workspace_execute_command', input: { command: 'echo', args: ['construído'] } },
  ]
  const calls = []
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream() {
      const step = steps[calls.length]
      calls.push(calls.length)
      const parts = step
        ? [{ type: 'tool-call', toolCallId: step.toolCallId, toolName: step.toolName, input: JSON.stringify(step.input) }, { type: 'finish', finishReason: 'tool-calls', usage }]
        : [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'pronto' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
      return { stream: streamOf([{ type: 'stream-start', warnings: [] }, ...parts]) }
    },
  }
  const runWorkspaces = new Map()
  const { Memory } = await import('@mastra/memory')
  const storage = new InMemoryStore()
  const controller = createBuilderController({
    workspace: ({ requestContext }) => runWorkspaces.get(requestContext.getRaw('conexusBuilderRunId')),
    model, storage, memory: new Memory({ storage, options: { lastMessages: 40, semanticRecall: false } }), skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  const projectId = '22222222-2222-4222-8222-222222222222'
  const conversationId = '88888888-8888-4888-8888-888888888888'
  const builderRunId = '99999999-9999-4999-8999-999999999999'

  // The conversation session the browser keeps mounted while the person watches the run, the way
  // the web app's mastra-session-routes GET does.
  const conversation = await controller.createSession({ resourceId: `project:${projectId}`, scope: `conversation:${conversationId}`, threadId: conversationId })
  assert.equal(conversation.mode.get(), 'plan', 'a new conversation starts in Planejar')

  const run = await createControllerRunSessions({ controller, runContexts: new Map(), runWorkspaces, runTools: new Map() })({
    projectId, conversationId, builderRunId, workspace,
    runCheck: async () => PASSING,
    bindContext: (requestContext) => requestContext.setRaw('conexusBuilderRunId', builderRunId),
  })
  const live = await controller.getSessionByResource(`project:${projectId}`, `builder:${builderRunId}`)
  live.subscribe((event) => {
    if (event.type === 'tool_suspended' && event.toolName === 'submit_plan') {
      void live.respondToToolSuspension({ toolCallId: event.toolCallId, resumeData: { action: 'approved' } })
    }
  })
  const turn = await run.sendTurn('quero um botão')
  assert.equal(turn.reason, 'complete')
  assert.equal(live.mode.get(), 'build', 'the run session itself is on Construir once the plan is approved')
  assert.equal(conversation.mode.get(), 'plan', 'before the run closes, the conversation session the browser reads is still stale')

  await run.close()
  assert.equal(conversation.mode.get(), 'build', 'closing the run rehydrates the conversation session from the thread')
})
