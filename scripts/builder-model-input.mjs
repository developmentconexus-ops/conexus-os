#!/usr/bin/env node
// Prints the input the Builder's model receives (spec 0002 AC-1, AC-30): the system messages in
// order, the tools with their descriptions and the first user message, exactly as the real
// Builder controller and Mastra's own agent code hand them to the model. A capturing language model
// takes the model's place, records what it is given and answers with a canned stop, so no
// model call and no network call happens.
//
//   node scripts/builder-model-input.mjs --project <git checkout> --thread <id> \
//     --mode planejar|construir --model provider/model [--revision <git revision>] [--message <text>]
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { RequestContext } from '@mastra/core/request-context'
import { InMemoryStore } from '@mastra/core/storage'
import { Memory } from '@mastra/memory'
import { connectorRecord } from '../tests/implementation/connector-record.mjs'
import { hubModuleUrl } from '../tests/implementation/hub-build.mjs'

const MODE_IDS = { planejar: 'plan', construir: 'build' }

const USAGE = 'usage: builder-model-input.mjs --project <git checkout> --thread <id> --mode planejar|construir --model provider/model [--revision <rev>] [--message <text>]'

/** The AGENTS.md at `revision` of the Project's repository, as the Hub reads it from `main`. */
const readAgentsBlob = (projectDir, revision) => {
  try {
    const bytes = new Uint8Array(execFileSync('git', ['-C', projectDir, 'cat-file', 'blob', `${revision}:AGENTS.md`], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 2 * 1024 * 1024 }))
    return { type: 'blob', size: bytes.length, bytes }
  } catch {
    return null
  }
}

const FIRST_MESSAGE = 'Quero uma tela que lista os pedidos do ERP.'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const RUN_ID = '11111111-1111-4111-8111-111111111111'
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const CANNED_STOP = [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't' },
  { type: 'text-delta', id: 't', delta: 'ok' },
  { type: 'text-end', id: 't' },
  { type: 'finish', finishReason: 'stop', usage },
]

/** A language model that records the call it is given and answers with a stop. `provider/model` is split the way the Hub's own model check reads it. */
const capturingModel = (model) => {
  const slash = model.indexOf('/')
  const captured = []
  return {
    captured,
    model: {
      specificationVersion: 'v2', provider: slash > 0 ? model.slice(0, slash) : model, modelId: slash > 0 ? model.slice(slash + 1) : model, supportedUrls: {},
      async doGenerate() { throw new Error('doGenerate is not used') },
      async doStream(options) {
        captured.push(options)
        return { stream: new ReadableStream({ start(controller) { for (const part of CANNED_STOP) controller.enqueue(part); controller.close() } }) }
      },
    },
  }
}

const textOf = (content) => typeof content === 'string' ? content : content.map((part) => part.type === 'text' ? part.text : JSON.stringify(part)).join('\n')

/** One bound Connection for the Project, so the run carries `connector_fetch` and the connector brief. */
const openConnectorRun = async () => {
  const { createBroker } = await import(hubModuleUrl('connectors/broker.js'))
  const { createConnectorBrief } = await import(hubModuleUrl('connectors/builder-brief.js'))
  const { createConnectorFetchTools, openBuilderRun } = await import(hubModuleUrl('connectors/builder-tool.js'))
  const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))
  const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))
  const binding = Object.freeze({ bindingId: 'binding-erp', name: 'erp', connectionId: '33333333-3333-4333-8333-333333333333', connectorId: 'sankhya' })
  const store = Object.freeze({ listBindings: async () => [binding], readConnectionCredential: async () => null })
  const { observability } = connectorRecord()
  const connectors = [{ definition: sankhyaDefinition, adapter: null }]
  const broker = createBroker({ connectors, store, envelope: createSecretEnvelope('ef'.repeat(32)), observability })
  const run = await openBuilderRun({ brief: createConnectorBrief({ connectors, store, observability }), projectId: PROJECT_ID, builderRunId: RUN_ID })
  return { run, connectorFetch: createConnectorFetchTools(broker) }
}

export const buildModelInput = async ({ project, thread, mode, model, revision = 'HEAD', message = FIRST_MESSAGE }) => {
  const modeId = MODE_IDS[mode]
  if (!modeId) throw new Error(`mode must be planejar or construir, got "${mode}"`)
  const projectDir = resolve(project)
  const resolvedRevision = execFileSync('git', ['-C', projectDir, 'rev-parse', '--verify', `${revision}^{commit}`], { encoding: 'utf8' }).trim()

  const { CONEXUS_CONNECTOR_BRIEF_KEY, CONEXUS_PROJECT_KNOWLEDGE_KEY } = await import(hubModuleUrl('builder/harness/request-context.js'))
  const { readProjectKnowledge } = await import(hubModuleUrl('builder/project-knowledge.js'))
  const { createBuilderController, defaultBuilderSkillsRoot } = await import(hubModuleUrl('builder/harness/controller.js'))
  const { sendBuilderSessionMessage } = await import(hubModuleUrl('builder/runtime.js'))
  const { createRunSandbox, createRunWorkspace } = await import(hubModuleUrl('builder/sandbox.js'))

  const { connectorFetch, run } = await openConnectorRun()
  const requestContext = new RequestContext()
  requestContext.setRaw(CONEXUS_PROJECT_KNOWLEDGE_KEY, readProjectKnowledge(readAgentsBlob(projectDir, resolvedRevision)))
  requestContext.setRaw(CONEXUS_CONNECTOR_BRIEF_KEY, run.brief)
  run.bind(requestContext)

  // The run's own workspace class over an E2B sandbox that is never started: Mastra reads its instructions from the objects alone.
  const workspace = createRunWorkspace(createRunSandbox({ apiKey: 'not-used', templateId: 'not-used', builderRunId: RUN_ID }))
  const { captured, model: capturing } = capturingModel(model)
  const controller = createBuilderController({
    model: capturing,
    workspace,
    storage: new InMemoryStore(),
    memory: new Memory({ options: { lastMessages: 40, semanticRecall: false } }),
    skillsPath: defaultBuilderSkillsRoot(),
    connectorFetch,
    // conexus_check is registered only for a turn with a run behind it.
    runCheck: modeId === 'build' ? () => async () => ({ ok: true, steps: [], facts: {} }) : undefined,
  })
  try {
    await controller.init()
    const session = await controller.createSession({ resourceId: `project:${thread}`, scope: thread, requestContext })
    if (session.mode.get() !== modeId) await session.mode.switch({ modeId })
    await sendBuilderSessionMessage(session, { content: message }, requestContext)
    for (let waited = 0; captured.length === 0 && waited < 30_000; waited += 50) await new Promise((r) => setTimeout(r, 50))
  } finally {
    run.end()
    await controller.destroy?.()
  }
  const [call] = captured
  if (!call) throw new Error('the model was never called')

  const system = call.prompt.filter((entry) => entry.role === 'system')
  const firstUser = call.prompt.find((entry) => entry.role === 'user')
  return [
    `Project: ${projectDir}`,
    `Thread: ${thread}`,
    `Mode: ${mode} (${modeId})`,
    `Model: ${model}`,
    `Revision: ${resolvedRevision}`,
    '',
    ...system.flatMap((entry, index) => [`=== SYSTEM MESSAGE ${index + 1} of ${system.length} ===`, textOf(entry.content), '']),
    '=== TOOLS (name: description) ===',
    ...(call.tools ?? []).flatMap((tool) => [`--- ${tool.name}`, tool.description || '(no description: the model provider defines this tool)']),
    '',
    '=== FIRST USER MESSAGE ===',
    firstUser ? textOf(firstUser.content) : '(none)',
    '',
    '=== NOT SHOWN HERE ===',
    'The wire request of an openai model on a ChatGPT subscription also carries the Codex `instructions` and reasoning options that the model wrapper in apps/hub/src/builder/openai-codex/model.ts adds after Mastra hands over the input. The tools\' input schemas are not printed.',
    '',
  ].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { project: { type: 'string' }, thread: { type: 'string' }, mode: { type: 'string' }, model: { type: 'string' }, revision: { type: 'string' }, message: { type: 'string' } } })
  if (!values.project || !values.thread || !values.mode || !values.model) { console.error(USAGE); process.exit(2) }
  try {
    process.stdout.write(await buildModelInput(values))
    process.exit(0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
