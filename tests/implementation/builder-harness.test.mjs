import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { InMemoryStore } from '@mastra/core/storage'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { hubModuleUrl } from './hub-build.mjs'
import { testConversations } from './builder-conversation-fixture.mjs'

const {
  CONEXUS_CONNECTOR_BRIEF_KEY, CONEXUS_PROJECT_INSTRUCTIONS_KEY, CONEXUS_PROJECT_MEMORY_KEY, CONEXUS_PROJECT_NAME_KEY, CONEXUS_PROJECT_NEW_KEY, CONEXUS_TURN_CONFLICTS_KEY, CONEXUS_TURN_DATE_KEY,
} = await import(hubModuleUrl('builder/harness/request-context.js'))
const { conexusInstructions, turnDate } = await import(hubModuleUrl('builder/harness/prompt.js'))
const { BUILDER_SKILL_NAMES, createBuilderController, defaultBuilderSkillsRoot } = await import(hubModuleUrl('builder/harness/controller.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })

const PASSING = { ok: true, steps: ['generate', 'typecheck', 'build', 'server', 'boot'].map((step) => ({ step, status: 'passed', durationMs: 1 })), facts: { operations: 0, migrations: 0, jsGzipBytes: 1 } }

const PLACEHOLDERS = ['{project name}', '{date}', '{cutoff}', '`{name}`: {integrator}', '{AGENTS.md content}', '{index}']

const template = readFileSync(resolve(repositoryRoot, 'apps/hub/src/builder/harness/prompt/builder.md'), 'utf8')
const VALUES = {
  projectName: 'Compras', date: '2026-09-30', cutoff: 'Março 2026', isNew: true,
  connections: '- `erp`: sankhya (skill `conexus-sankhya`)', instructions: 'Responda sempre em inglês {index}.', memory: '## Regras\n- [Prazo](prazo.md): 30 dias',
}

const fill = (values) => {
  const requestContext = new RequestContext()
  for (const [key, value] of [
    [CONEXUS_PROJECT_NAME_KEY, values.projectName], [CONEXUS_PROJECT_NEW_KEY, String(values.isNew)], [CONEXUS_TURN_DATE_KEY, values.date], [CONEXUS_CONNECTOR_BRIEF_KEY, values.connections],
    [CONEXUS_PROJECT_INSTRUCTIONS_KEY, values.instructions], [CONEXUS_PROJECT_MEMORY_KEY, values.memory],
  ]) requestContext.setRaw(key, value)
  requestContext.set('controller', { session: { modelId: 'test/model' } })
  return conexusInstructions(undefined, values.cutoff ? { 'test/model': values.cutoff } : {})({ requestContext })
}

test('AC-1: builder.md holds every placeholder once, and filling them leaves none of the template behind', () => {
  for (const placeholder of PLACEHOLDERS) assert.equal(template.split(placeholder).length - 1, 1, `${placeholder} appears once`)
  const filled = fill(VALUES)
  assert.ok(filled.includes('- Project: Compras. Today: 2026-09-30. Your knowledge cutoff: Março 2026.'))
  assert.ok(filled.includes('- `erp`: sankhya (skill `conexus-sankhya`)\n'))
  assert.ok(filled.includes('<!-- AGENTS.md -->\nResponda sempre em inglês {index}.\n\n## Project memory'), 'text a placeholder brings in is never read as another placeholder')
  assert.ok(filled.includes('(this app\'s memory, persists across conversations):\n## Regras\n- [Prazo](prazo.md): 30 dias\n'))
  for (const placeholder of ['{project name}', '{date}', '{cutoff}', '{name}', '{integrator}', '{AGENTS.md content}']) assert.equal(filled.includes(placeholder), false, `${placeholder} is filled`)
})

test('AC-1: a model with no cutoff loses the cutoff clause and nothing else', () => {
  const without = fill({ ...VALUES, cutoff: null })
  assert.ok(without.includes('- Project: Compras. Today: 2026-09-30.\n'))
  assert.equal(without.includes('knowledge cutoff'), false)
  assert.equal(fill(VALUES).replace(' Your knowledge cutoff: Março 2026.', ''), without)
})

test('AC-1, AC-2: the model input holds the approved text and no word of a mode or of submit_plan', () => {
  const requestContext = new RequestContext()
  for (const [key, value] of [
    [CONEXUS_PROJECT_NAME_KEY, 'Compras'], [CONEXUS_PROJECT_NEW_KEY, 'true'], [CONEXUS_TURN_DATE_KEY, '2026-09-30'], [CONEXUS_CONNECTOR_BRIEF_KEY, VALUES.connections],
    [CONEXUS_PROJECT_INSTRUCTIONS_KEY, VALUES.instructions], [CONEXUS_PROJECT_MEMORY_KEY, VALUES.memory],
  ]) requestContext.setRaw(key, value)
  requestContext.set('controller', { session: { modelId: 'anthropic/known' } })
  const text = conexusInstructions(undefined, { 'anthropic/known': 'Março 2026' })({ requestContext })
  assert.ok(text.includes('- Project: Compras. Today: 2026-09-30. Your knowledge cutoff: Março 2026.'))
  assert.doesNotMatch(text, /Planejar|Construir|submit_plan/)
  assert.ok(text.startsWith('You are the Conexus Builder, running inside Conexus.'))
  requestContext.set('controller', { session: { modelId: 'anthropic/unknown' } })
  assert.equal(conexusInstructions(undefined, { 'anthropic/known': 'Março 2026' })({ requestContext }).includes('knowledge cutoff'), false)
})

test('an openai gpt-5.5 or gpt-5.4 conversation gets Mastra Code\'s model prompt after the Conexus prompt, and any other model gets none', () => {
  const instructionsFor = (modelId, conflicts = '') => {
    const requestContext = new RequestContext()
    for (const [key, value] of [
      [CONEXUS_PROJECT_NAME_KEY, VALUES.projectName], [CONEXUS_TURN_DATE_KEY, VALUES.date], [CONEXUS_PROJECT_NEW_KEY, 'true'],
      [CONEXUS_CONNECTOR_BRIEF_KEY, VALUES.connections], [CONEXUS_PROJECT_INSTRUCTIONS_KEY, VALUES.instructions], [CONEXUS_PROJECT_MEMORY_KEY, VALUES.memory],
      [CONEXUS_TURN_CONFLICTS_KEY, conflicts],
    ]) requestContext.setRaw(key, value)
    requestContext.set('controller', { session: { modelId } })
    return conexusInstructions(undefined, {})({ requestContext })
  }
  const plain = instructionsFor('anthropic/claude-opus-5-5')
  const gpt55 = instructionsFor('openai/gpt-5.5')
  assert.equal(gpt55.startsWith(`${plain.trimEnd()}\n\n<coding_behavior>\nWork outcome-first: infer the user's goal`), true)
  assert.equal(gpt55.endsWith('and comments that only explain the diff.\n</coding_behavior>'), true)
  const gpt54 = instructionsFor('openai/gpt-5.4')
  assert.equal(gpt54.startsWith(`${plain.trimEnd()}\n\n<autonomy_and_persistence>\nPersist until the task is fully handled`), true)
  assert.equal(instructionsFor('openai/gpt-5.3'), plain)
  const withConflicts = instructionsFor('openai/gpt-5.5', 'app/a.tsx')
  assert.equal(withConflicts.endsWith('</coding_behavior>\n\n## Merge conflicts\n\nBringing the Project\'s current main into these files left conflict markers; resolve them before any other change: `app/a.tsx`.'), true)
})

test('the new-app line is in the Environment of a new Project and absent, with no empty bullet, after a saved version', () => {
  const line = '- This app is new: it has only the starter screen.\n'
  const fresh = fill(VALUES)
  assert.ok(fresh.includes(`Your knowledge cutoff: Março 2026.\n${line}- The sandbox runs Debian 12`))
  const saved = fill({ ...VALUES, isNew: false })
  assert.equal(saved.includes('This app is new'), false)
  assert.ok(saved.includes('Your knowledge cutoff: Março 2026.\n- The sandbox runs Debian 12'))
  assert.equal(fresh.replace(line, ''), saved)
})

test('the paths a turn\'s start left in conflict are appended after the filled prompt', () => {
  const requestContext = new RequestContext()
  requestContext.setRaw(CONEXUS_TURN_CONFLICTS_KEY, 'app/a.tsx\napp/b.tsx')
  const text = conexusInstructions()({ requestContext })
  assert.ok(text.endsWith('resolve them before any other change: `app/a.tsx`, `app/b.tsx`.'))
})

test('the turn date is the date in America/Sao_Paulo, not in UTC', () => {
  assert.equal(turnDate(new Date('2026-09-30T02:30:00Z')), '2026-09-29')
  assert.equal(turnDate(new Date('2026-09-30T12:00:00Z')), '2026-09-30')
})

test('AC-3: the six skills the prompt and the guard name all ship, and the prompt names only shipped ones', () => {
  assert.deepEqual([...BUILDER_SKILL_NAMES].sort(), ['conexus-app', 'conexus-build', 'conexus-plan-change', 'conexus-plan-new', 'conexus-sankhya', 'conexus-server'])
  for (const name of BUILDER_SKILL_NAMES) assert.equal(existsSync(resolve(repositoryRoot, 'builder-skills', name, 'SKILL.md')), true, `${name} exists`)
  for (const [, name] of template.matchAll(/`(conexus-[a-z-]+)`/g)) if (name !== 'conexus-{integrator}') assert.equal(BUILDER_SKILL_NAMES.includes(name), true, `${name} is a shipped skill`)
})

test('AC-7: conexus_check runs the run check and says when to run it and what it does not prove', async () => {
  const { createCheckTool } = await import(hubModuleUrl('builder/harness/tools.js'))
  let ran = 0
  const tool = createCheckTool(async () => { ran += 1; return PASSING })
  assert.deepEqual(await tool.execute({}, { requestContext: new RequestContext() }), PASSING)
  assert.equal(ran, 1)
  assert.match(tool.description, /at the end of each step/)
  assert.match(tool.description, /does not prove/)
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

test('AC-2: the Builder has one mode, build', async () => {
  const controller = createBuilderController({ model: scriptedModel().model, storage: new InMemoryStore(), skillsPath: resolve(repositoryRoot, 'builder-skills') })
  const session = await controller.createSession({ resourceId: 'project:probe-mode', scope: 'probe-mode' })
  assert.equal(session.mode.get(), 'build')
  assert.deepEqual(controller.listModes().map((mode) => mode.id), ['build'])
})

test('the real builder-skills path resolves from the repository root', () => {
  assert.equal(defaultBuilderSkillsRoot('/repo'), '/repo/builder-skills')
})

test('the Builder finds its six skills through its skill listing', async () => {
  const controller = createBuilderController({ model: scriptedModel().model, storage: new InMemoryStore() })
  const agent = controller.getCurrentAgent(await controller.createSession({ resourceId: 'project:probe-skills', scope: 'probe-skills' }))
  const skills = await agent.listSkills({ requestContext: new RequestContext() })
  assert.deepEqual(skills.map((skill) => skill.name).sort(), [...BUILDER_SKILL_NAMES].sort())
})

test('the model sees each skill by name and never a path on the Hub host, and reads a skill reference through skill_read', async (t) => {
  const systemTexts = []
  const toolCalls = [
    { toolCallId: 's1', toolName: 'skill', input: { name: 'conexus-app' } },
    { toolCallId: 's2', toolName: 'skill_read', input: { skillName: 'conexus-app', path: 'references/form.tsx' } },
  ]
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream(options) {
      const step = systemTexts.length
      systemTexts.push(options.prompt.filter((message) => message.role === 'system').map((message) => message.content).join('\n'))
      const call = toolCalls[step]
      const parts = call
        ? [{ type: 'tool-call', toolCallId: call.toolCallId, toolName: call.toolName, input: JSON.stringify(call.input) }, { type: 'finish', finishReason: 'tool-calls', usage }]
        : [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'ok' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
      return { stream: streamOf([{ type: 'stream-start', warnings: [] }, ...parts]) }
    },
  }
  const controller = createBuilderController({ model, storage: new InMemoryStore(), skillsPath: resolve(repositoryRoot, 'builder-skills') })
  await controller.init()
  t.after(() => controller.destroy?.())
  const session = await controller.createSession({ resourceId: 'project:probe-skill-path', scope: 'probe-skill-path' })
  const toolResults = {}
  session.subscribe((event) => {
    if (event.type === 'tool_approval_required') session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'approve' })
    if (event.type === 'tool_end') toolResults[event.toolCallId] = String(event.result)
  })
  await session.sendMessage({ content: 'oi' })
  for (let waited = 0; systemTexts.length < 3 && waited < 5000; waited += 50) await new Promise((r) => setTimeout(r, 50))

  const catalog = systemTexts[0].match(/<available_skills>[\s\S]*<\/available_skills>/)?.[0] ?? ''
  assert.deepEqual([...catalog.matchAll(/<location>(.*?)<\/location>/g)].map((match) => match[1]), [...BUILDER_SKILL_NAMES].sort(), 'each skill is located by its name')
  assert.equal(systemTexts[0].split('<available_skills>').length - 1, 1, 'the catalog is injected once')
  assert.equal(systemTexts[0].includes(repositoryRoot), false, 'the system prompt carries no Hub host path')
  assert.equal(toolResults.s1.includes(repositoryRoot), false, 'the skill tool result carries no Hub host path')
  assert.match(toolResults.s1, /- references\/form\.tsx/, 'the activation lists the references relative to the skill')
  assert.equal(toolResults.s2, readFileSync(resolve(repositoryRoot, 'builder-skills/conexus-app/references/form.tsx'), 'utf8'), 'skill_read returns the reference file')
})

// A scripted turn: ask_user with three questions (suspends) -> resume with three answers -> a workspace command -> text.
const ASK_QUESTIONS = [
  { question: 'Qual cor?', options: [{ label: 'Azul (recomendado)' }, { label: 'Verde', description: 'Mais suave' }] },
  { question: 'Quais telas?', header: 'Telas', multiSelect: true, options: [{ label: 'Lista' }, { label: 'Detalhe' }] },
  { question: 'Algo mais?' },
]
const scriptedModel = () => {
  const calls = []
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream(options) {
      const step = calls.length
      calls.push({ tools: (options.tools ?? []).map((tool) => tool.name).sort(), prompt: JSON.stringify(options.prompt) })
      const parts = {
        0: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'ask_user', input: JSON.stringify({ questions: ASK_QUESTIONS }) }],
        1: [{ type: 'tool-call', toolCallId: 'c2', toolName: 'mastra_workspace_execute_command', input: JSON.stringify({ command: 'echo', args: ['hi'] }) }],
      }[step]
      const stream = parts
        ? [{ type: 'stream-start', warnings: [] }, ...parts, { type: 'finish', finishReason: 'tool-calls', usage }]
        : [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'ok' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage }]
      return { stream: streamOf(stream) }
    },
  }
  return { model, calls }
}

test("a Google AI Pro run's web_search is a search-only agent on the person's own model, and Google's search never sits beside the Builder's function tools", async (t) => {
  const { createGoogleAiProRoute } = await import(hubModuleUrl('builder/google-ai-pro/route.js'))
  const { encodeKey } = await import(hubModuleUrl('builder/google-ai-pro/credential.js'))
  const key = encodeKey({ fileName: 'antigravity-ana@example.com.json', bytes: new TextEncoder().encode('{"type":"antigravity"}') })
  const route = createGoogleAiProRoute({ routerUrl: async () => 'http://127.0.0.1:9', track: () => {} })
  const model = () => route.take({ modelAccountId: 'row-1', kind: 'google_ai_pro', secret: key }).model('gemini-3-flash', 'low')
  const controller = createBuilderController({ model, storage: new InMemoryStore(), skillsPath: resolve(repositoryRoot, 'builder-skills', 'conexus-server') })
  const session = await controller.createSession({ resourceId: 'project:probe-google-ai-pro', scope: 'probe-google-ai-pro' })
  const agent = controller.getCurrentAgent(session)
  const tools = await agent.listTools({ requestContext: new RequestContext() })

  // Gemini's API, answering one grounded search; every request is recorded.
  const sent = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const body = await request.json()
    sent.push({ url: request.url, tools: body.tools, thinking: body.generationConfig?.thinkingConfig })
    const answer = { candidates: [{ content: { role: 'model', parts: [{ text: 'O Node 24 é a LTS atual.' }] }, finishReason: 'STOP', groundingMetadata: { groundingChunks: [{ web: { uri: 'https://nodejs.org/en/about/previous-releases', title: 'nodejs.org' } }] } }] }
    return request.url.includes(':streamGenerateContent')
      ? new Response(`data: ${JSON.stringify(answer)}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
      : Response.json(answer)
  }
  t.after(() => { globalThis.fetch = original })

  assert.deepEqual([tools.web_search.id, 'type' in tools.web_search, 'web_fetch' in tools], ['web_search', false, true], 'web_search is a function tool of the Builder, not a provider search')
  assert.deepEqual(await tools.web_search.execute({ query: 'qual a LTS atual do Node?' }, {}), {
    text: 'O Node 24 é a LTS atual.',
    sources: [{ title: 'nodejs.org', url: 'https://nodejs.org/en/about/previous-releases' }],
  })
  assert.deepEqual(sent, [{
    url: 'http://127.0.0.1:9/v1beta/models/gemini-3-flash:generateContent', tools: [{ googleSearch: {} }], thinking: { thinkingLevel: 'low', includeThoughts: true },
  }], 'one call per query, with Google search as its only tool')

  sent.length = 0
  await (await agent.stream('pesquise a LTS do Node', { requestContext: new RequestContext(), maxSteps: 1 })).consumeStream()
  const [builderCall] = sent
  const declared = builderCall.tools.flatMap((tool) => tool.functionDeclarations?.map(({ name }) => name) ?? [])
  assert.deepEqual([declared.includes('web_search'), builderCall.tools.some((tool) => 'googleSearch' in tool)], [true, false], 'the Builder declares web_search as a function and never asks for Google search itself')
})

// What the model receives as tools on one turn, with the provider's own stream replaced by a canned reply.
const toolsSentToModel = async (model, resourceId) => {
  const sent = []
  const v3Usage = { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } }
  const { wrapLanguageModel } = await import('ai')
  const recorded = wrapLanguageModel({
    model: await model(),
    middleware: {
      specificationVersion: 'v3',
      wrapStream: async ({ params }) => {
        sent.push(params.tools)
        return { stream: streamOf([{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'ok' }, { type: 'text-end', id: 't' }, { type: 'finish', finishReason: 'stop', usage: v3Usage }]) }
      },
    },
  })
  const controller = createBuilderController({ model: () => recorded, storage: new InMemoryStore(), skillsPath: resolve(repositoryRoot, 'builder-skills', 'conexus-server') })
  const session = await controller.createSession({ resourceId, scope: resourceId })
  await (await controller.getCurrentAgent(session).stream('pesquise', { requestContext: new RequestContext(), maxSteps: 1 })).consumeStream()
  return { provider: recorded.provider, search: sent[0].filter((tool) => tool.name === 'web_search'), names: sent[0].map((tool) => tool.name) }
}

test("the Google search agent is built once however many runs ask for web_search, and each search resolves the model of the run that made it", async (t) => {
  const { createGoogleAiProRoute } = await import(hubModuleUrl('builder/google-ai-pro/route.js'))
  const { encodeKey } = await import(hubModuleUrl('builder/google-ai-pro/credential.js'))
  const key = encodeKey({ fileName: 'antigravity-ana@example.com.json', bytes: new TextEncoder().encode('{"type":"antigravity"}') })
  const route = createGoogleAiProRoute({ routerUrl: async () => 'http://127.0.0.1:9', track: () => {} })
  const resolvedFor = []
  const model = ({ requestContext }) => {
    resolvedFor.push(requestContext.getRaw('conexusRunOwner'))
    return route.take({ modelAccountId: 'row-1', kind: 'google_ai_pro', secret: key }).model('gemini-3-flash', 'low')
  }
  const controller = createBuilderController({ model, storage: new InMemoryStore(), skillsPath: resolve(repositoryRoot, 'builder-skills', 'conexus-server') })
  const session = await controller.createSession({ resourceId: 'project:probe-search-once', scope: 'probe-search-once' })
  const agent = controller.getCurrentAgent(session)
  const requestContextOf = (owner) => { const requestContext = new RequestContext(); requestContext.setRaw('conexusRunOwner', owner); return requestContext }
  const searchTools = []
  for (let run = 0; run < 25; run += 1) searchTools.push((await agent.listTools({ requestContext: requestContextOf(`run-${run}`) })).web_search)
  assert.equal(new Set(searchTools).size, 1, 'twenty-five runs were offered the same search tool, so the same agent behind it')

  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    await request.json()
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] })
  }
  t.after(() => { globalThis.fetch = original })
  resolvedFor.length = 0
  await searchTools[0].execute({ query: 'a' }, { requestContext: requestContextOf('ana') })
  await searchTools[0].execute({ query: 'b' }, { requestContext: requestContextOf('bia') })
  assert.deepEqual([...new Set(resolvedFor)], ['ana', 'bia'], "each search resolved the model through its own run's context, not the first run's")
})

test('a ChatGPT subscription model, which reports provider openai.responses and which webSearchTool cannot map, asks OpenAI for its own web_search', async () => {
  const { codexModel } = await import('./codex-model.mjs')
  const unused = { access: 'unused', refresh: 'unused', expires: Date.now() + 3_600_000, accountId: 'unused' }
  const { provider, search, names } = await toolsSentToModel(() => codexModel('gpt-5.6-sol', unused), 'project:probe-chatgpt')
  assert.equal(provider, 'openai.responses')
  assert.deepEqual(search, [{ type: 'provider', name: 'web_search', id: 'openai.web_search', args: {} }])
  assert.equal(names.includes('web_fetch'), true)
})

test('both kinds of Anthropic account ask Anthropic for its own web_search', async () => {
  const { createAnthropicRoute } = await import(hubModuleUrl('builder/anthropic/route.js'))
  const { createClaudeHolds, serializeClaudeTokens } = await import(hubModuleUrl('builder/anthropic/credential.js'))
  const route = createAnthropicRoute(createClaudeHolds({ store: { readById: async () => null, rewrite: async () => false } }))
  const sentFor = (account, resourceId) => toolsSentToModel(() => route.take(account).model('claude-sonnet-5'), resourceId)
  const key = await sentFor({ modelAccountId: 'row-1', kind: 'api_key', secret: `sk-ant-api03-${'x'.repeat(40)}` }, 'project:probe-api_key')
  const subscription = await sentFor({ modelAccountId: 'row-2', kind: 'oauth', secret: serializeClaudeTokens({ access: 'unused', refresh: 'unused', expires: 9_999_999_999_999 }) }, 'project:probe-oauth')
  const anthropicSearch = [{ type: 'provider', name: 'web_search', id: 'anthropic.web_search_20250305', args: {} }]
  assert.deepEqual([key.provider, key.search], ['anthropic.messages', anthropicSearch])
  assert.deepEqual([subscription.provider, subscription.search], ['anthropic.messages', anthropicSearch])
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

test("a run's question waits on the conversation's one session, the browser's, the answer resumes it there, and a new conversation starts on the installation default (AC-7, AC-12, AC-16)", async (t) => {
  const { createControllerRunSessions } = await import(hubModuleUrl('builder/run/turn.js'))
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-run-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  let vm = 0
  const workspaceOf = () => new Workspace({ id: `run-ws-${++vm}`, filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  const { model, calls } = scriptedModel()
  const { Memory } = await import('@mastra/memory')
  const storage = new InMemoryStore()
  let conversations
  const controller = createBuilderController({
    workspace: (context) => conversations.workspace(context),
    model, storage, memory: new Memory({ storage, options: { lastMessages: 40, semanticRecall: false } }), skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  conversations = testConversations(controller, workspaceOf)
  t.after(() => conversations.close())
  const projectId = '22222222-2222-4222-8222-222222222222'
  const builderRunId = '11111111-1111-4111-8111-111111111111'
  const conversationId = '44444444-4444-4444-8444-444444444444'
  const openSession = createControllerRunSessions({ controller, conversations, readDefaultModel: async () => 'anthropic/default-model' })
  const bind = (runId) => (requestContext) => { requestContext.setRaw('conexusBuilderRunId', runId); requestContext.setRaw('conexusBuilderConversationId', conversationId) }
  // The browser's session, made before the first run the way the route guard makes it.
  const conversation = await conversations.open({ projectId, conversationId })
  assert.equal(conversation.model.hasSelection(), false, 'a new conversation has no model of its own')
  assert.equal(conversation.getWorkspace()?.id, 'run-ws-1', 'the session stands on the conversation\'s sandbox from the start')
  const run = await openSession({ projectId, conversationId, builderRunId, bindContext: bind(builderRunId) })
  assert.equal(await controller.getSessionByResource(`project:${projectId}`, `conversation:${conversationId}`), conversation, 'the run steps on the browser\'s session')
  assert.equal(conversation.model.get(), 'anthropic/default-model', 'the first turn starts on the installation default')
  const answered = []
  const payloads = []
  let askedCallId = ''
  conversation.subscribe((event) => {
    if (event.type !== 'tool_suspended') return
    answered.push(event.toolName)
    payloads.push(event.suspendPayload)
    askedCallId = event.toolCallId
  })
  const signal = new AbortController().signal
  const asked = await run.takeStep({ kind: 'SEND', content: 'faça um app' }, signal)
  assert.equal(asked.reason, 'suspended', 'the step ends at the question')
  assert.equal(typeof asked.userMessageId, 'string')
  await run.untilQuestionStored()
  assert.deepEqual(run.pendingCalls(), [askedCallId], 'the question waits on the live session')
  assert.equal(conversation.displayState.get().pendingSuspensions.has(askedCallId), true, 'the browser\'s session shows the card')
  const turn = await run.takeStep({ kind: 'ANSWER', toolCallId: askedCallId, resumeData: ['Azul (recomendado)', ['Lista', 'Detalhe'], 'Nada'] }, signal)
  assert.deepEqual({ reason: turn.reason, answered, calls: calls.length, pending: run.pendingCalls() }, { reason: 'complete', answered: ['ask_user'], calls: 3, pending: [] })
  assert.equal(typeof turn.userMessageId, 'string')
  assert.deepEqual(payloads, [{ questions: ASK_QUESTIONS }])
  assert.equal(calls[1].prompt.includes('User answered:\\nQual cor?: Azul (recomendado)\\nQuais telas?: Lista, Detalhe\\nAlgo mais?: Nada'), true, 'the model reads one line per answered question')
  // With no allowlist on the one mode, every tool the controller registers reaches the model, submit_plan included.
  for (const name of ['ask_user', 'task_write', 'task_update', 'task_complete', 'task_check', 'skill', 'submit_plan', 'mastra_workspace_execute_command']) assert.equal(calls[0].tools.includes(name), true, `${name} reaches the model`)
  await run.release()
  assert.equal(await controller.getSessionByResource(`project:${projectId}`, `conversation:${conversationId}`), conversation, 'the session stays with the conversation after the run')

  // The person changes the model between messages, through the conversation's session; the next turn runs on it.
  await conversation.model.switch({ modelId: 'anthropic/chosen-model' })
  const nextRunId = '55555555-5555-4555-8555-555555555555'
  const next = await openSession({ projectId, conversationId, builderRunId: nextRunId, bindContext: bind(nextRunId) })
  assert.equal(conversation.model.get(), 'anthropic/chosen-model', 'the next run keeps the conversation\'s model')
  await next.release()
  // A killed VM ends the conversation's instance and its session; the next open stands on a new one.
  await (await conversations.sandbox({ projectId, conversationId })).kill()
  assert.equal(await controller.getSessionByResource(`project:${projectId}`, `conversation:${conversationId}`), undefined)
  const remade = await conversations.open({ projectId, conversationId })
  assert.deepEqual({ same: remade === conversation, workspace: remade.getWorkspace()?.id }, { same: false, workspace: 'run-ws-2' })
})

test('a conversation with no model and no installation default fails the run before any turn', async (t) => {
  const { createControllerRunSessions } = await import(hubModuleUrl('builder/run/turn.js'))
  const root = mkdtempSync(resolve(tmpdir(), 'builder-harness-nomodel-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspace = new Workspace({ id: 'nomodel-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
  let conversations
  const controller = createBuilderController({
    workspace: (context) => conversations.workspace(context),
    model: scriptedModel().model, storage: new InMemoryStore(), skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  await controller.init()
  t.after(() => controller.destroy?.())
  conversations = testConversations(controller, () => workspace)
  t.after(() => conversations.close())
  const openSession = createControllerRunSessions({ controller, conversations, readDefaultModel: async () => null })
  await assert.rejects(() => openSession({
    projectId: '22222222-2222-4222-8222-222222222222', conversationId: '44444444-4444-4444-8444-444444444444', builderRunId: '11111111-1111-4111-8111-111111111111',
    bindContext: (requestContext) => requestContext.setRaw('conexusBuilderConversationId', '44444444-4444-4444-8444-444444444444'),
  }), /BUILDER_MODEL_NOT_SELECTED/)
})
