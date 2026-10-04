import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Mastra } from '@mastra/core/mastra'
import { LocalFilesystem, LocalSandbox, Workspace } from '@mastra/core/workspace'
import { Memory } from '@mastra/memory'
import { hubModuleUrl } from './hub-build.mjs'
import { conversationId, projectId } from './builder-run-harness.mjs'
import { testConversations } from './builder-conversation-fixture.mjs'

const { createBuilderController } = await import(hubModuleUrl('builder/harness/controller.js'))
const { createControllerRunSessions } = await import(hubModuleUrl('builder/run/turn.js'))
const { createLiveConversations } = await import(hubModuleUrl('builder/conversation.js'))

const repositoryRoot = resolve(import.meta.dirname, '../..')
export const resourceId = `project:${projectId}`
const conversationScope = `conversation:${conversationId}`
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
const streamOf = (parts) => new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } })
const textParts = (text) => [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: text }, { type: 'text-end', id: 't' }]
export const partsOf = (message) => (Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }])
export const ASK = 'Mostre UNIT1-nonce'

/**
 * The model reads only its prompt: the person's first request asks a question, a tool result last
 * answers `got`, and any other message is echoed. Every prompt is kept, so a test reads exactly
 * what the model received.
 */
export const scriptedModel = () => {
  const prompts = []
  let asked = 0
  const model = {
    specificationVersion: 'v2', provider: 'anthropic', modelId: 'probe-1', supportedUrls: {},
    async doGenerate() { throw new Error('doGenerate not used') },
    async doStream(options) {
      prompts.push(options.prompt)
      const last = options.prompt.at(-1)
      const part = partsOf(last).at(-1)
      let parts = textParts(`echo:${part?.text ?? '?'}`)
      let finishReason = 'stop'
      if (last.role === 'tool' || part?.type === 'tool-result') parts = textParts('got')
      else if (last.role === 'user' && part?.text?.startsWith(ASK)) {
        asked += 1
        parts = [{ type: 'tool-call', toolCallId: `ask-${asked}-${Date.now()}`, toolName: 'ask_user', input: JSON.stringify({ questions: [{ question: 'Qual cor?' }] }) }]
        finishReason = 'tool-calls'
      }
      return { stream: streamOf([{ type: 'stream-start', warnings: [] }, ...parts, { type: 'finish', finishReason, usage }]) }
    },
  }
  return { model, prompts }
}

// The Builder's controller on real Mastra, over one store a restarted Hub would find again. With
// `sandboxes`, each conversation's sandbox is a real one and its run counts as open.
export const builderOn = async (t, storage, model, options = {}) => {
  const workspace = scratchWorkspace(t)
  let conversations
  const controller = createBuilderController({
    workspace: (context) => conversations.workspace(context),
    model, storage, memory: new Memory({ storage, options: { lastMessages: 40, semanticRecall: false } }), skillsPath: resolve(repositoryRoot, 'builder-skills'),
  })
  const mastra = new Mastra({ storage, agentControllers: { 'conexus-builder': controller }, logger: false })
  await controller.init()
  t.after(() => controller.destroy?.())
  conversations = options.sandboxes
    ? createLiveConversations({ controller, sandboxes: options.sandboxes, readSandboxId: async () => null, runOpen: () => true })
    : testConversations(controller, () => workspace, options.sweep ?? {})
  t.after(() => conversations.close())
  const openSession = createControllerRunSessions({ controller, conversations, readDefaultModel: async () => 'anthropic/default-model', ...(options.questionReleaseMs ? { questionReleaseMs: options.questionReleaseMs } : {}) })
  return { controller, mastra, openSession, conversations }
}

const scratchWorkspace = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'builder-run-question-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return new Workspace({ id: 'question-ws', filesystem: new LocalFilesystem({ basePath: root }), sandbox: new LocalSandbox({ workingDirectory: root }) })
}

export const bindRun = (builderRunId) => (requestContext) => {
  requestContext.setRaw('conexusBuilderRunId', builderRunId)
  requestContext.setRaw('conexusBuilderConversationId', conversationId)
}

export const liveSession = (controller) => controller.getSessionByResource(resourceId, conversationScope)
export const agentOf = async (controller) => (await liveSession(controller)).machinery.getAgent()
export const suspendedRuns = async (session) => (await session.machinery.getAgent().listSuspendedRuns({ threadId: conversationId, resourceId })).runs.map((run) => run.runId)
// Mastra writes the question's snapshot rows a moment after the call itself.
export const snapshotOf = async (session) => {
  for (let waited = 0; waited < 5_000; waited += 10) {
    const [runId] = await suspendedRuns(session)
    if (runId) return runId
    await new Promise((wake) => { setTimeout(wake, 10) })
  }
  throw new Error('the question has no snapshot')
}
export const pendingCall = async (controller) => [...(await liveSession(controller)).displayState.get().pendingSuspensions.keys()][0]

// What Mastra keeps of a question's run: its loop registration and its two snapshot rows.
export const leftovers = async ({ mastra, storage }, runId) => {
  const workflows = await storage.getStore('workflows')
  const rows = await Promise.all(['agentic-loop', 'executionWorkflow'].map((workflowName) => workflows.getWorkflowRunById({ runId, workflowName })))
  return { registered: mastra.__hasInternalWorkflow('agentic-loop', runId), rows: rows.filter(Boolean).length }
}
