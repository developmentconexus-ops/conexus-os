import { createCodingAgent } from '@mastra/core/coding-agent'
import { AgentController } from '@mastra/core/agent-controller'
import type { AgentControllerEvent } from '@mastra/core/agent-controller'
import type { Agent } from '@mastra/core/agent'
import type { MastraLanguageModel } from '@mastra/core/agent'
import { RequestContext } from '@mastra/core/request-context'
import type { CommandResult, ExecuteCommandOptions } from '@mastra/core/workspace'
import { Workspace } from '@mastra/core/workspace'
import { E2BSandbox } from '@mastra/e2b'
import { Sandbox } from 'e2b'
import { BUILDER_BASE_AGENT_INSTRUCTIONS, BUILDER_MODE_DEFINITIONS, materializeFixedApplicationStarter } from './application-starter.js'

type CodingWorkerCommonInput = Readonly<{
  projectId: string
  intent: string
  mode?: 'BUILD' | 'PLAN'
  baseSourceRevision: string
  sourceBundle: Uint8Array
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  bindMessage?(messageId: string): Promise<void>
  signal?: AbortSignal
}>

export type CodingWorkerInput = CodingWorkerCommonInput & Readonly<{
  executionId: string
}>

type CodingWorkerResultScope = Readonly<{
  runtimeId: 'mastra-native-e2b-v1'
  projectId: string
  executionId: string
  sandboxId: string
  baseSourceRevision: string
  summary: string
}>

type CodingWorkerResultVariant<TScope> = TScope & (
  | Readonly<{ kind: 'SOURCE_CHANGED'; resultSourceRevision: string; resultBundle: Uint8Array }>
  | Readonly<{ kind: 'RESPONSE_ONLY' }>
)

export type CodingWorkerResult = CodingWorkerResultVariant<CodingWorkerResultScope>

export type CodingWorkerRuntime = Readonly<{
  kind: 'REMOTE_E2B'
  modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>
  execute(input: CodingWorkerInput): Promise<CodingWorkerResult>
  getSessionByResource?(resourceId: string, scope: string): Promise<BuilderSession | undefined>
}>

export type E2BBuilderRuntimeConfig = Readonly<{
  apiKey: string
  templateId: string
  model: MastraLanguageModel
  modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>
  validateModelCredential(): void
  sharedHarness?: Readonly<{
    agent: Agent
    controller: AgentController<Record<string, unknown>>
    ready: Promise<void>
  }>
  timeoutMs?: number
}>

class ConexusGuardedE2BSandbox extends E2BSandbox {
  override retryOnDead<T>(work: () => Promise<T>): Promise<T> {
    return work()
  }
}

const oid = /^[0-9a-f]{40}$/
const safeIdentity = (value: string): boolean => /^[0-9a-f-]{36}$/i.test(value)
const immutableE2BTemplate = /^[a-z0-9]+:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export const createBuilderUserMessage = (intent: string): Readonly<{ content: string }> => ({ content: intent })

type BuilderSession = Awaited<ReturnType<AgentController<Record<string, unknown>>['createSession']>>
type AgentEndReason = Extract<AgentControllerEvent, { type: 'agent_end' }>['reason']

export type BuilderLiveView = Readonly<{
  running: boolean
  message: Readonly<{ id: string; text: string }> | null
  activities: readonly Readonly<{
    id: string
    label: 'READ_FILES' | 'EDIT_FILES' | 'RUN_COMMAND' | 'WORKSPACE'
    detail?: string
    state: 'started' | 'succeeded' | 'failed' | 'interrupted'
  }>[]
}>

type BuilderDisplayState = Readonly<{
  isRunning: boolean
  currentMessage: Readonly<{ id?: string; role?: string; content?: Readonly<{ parts?: readonly unknown[] }> }> | null
  activeTools: ReadonlyMap<string, Readonly<{ name?: string; args?: unknown; status?: string }>>
}>

export const BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY = 'conexus.builder.workspace'

/** Resolve the per-run Workspace through Mastra's native dynamic workspace hook. */
export const resolveBuilderWorkspace = ({ requestContext }: { requestContext: RequestContext }): Workspace | undefined => {
  const workspace = requestContext.getRaw(BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY)
  return workspace instanceof Workspace ? workspace : undefined
}

const toolLabel = (toolName: string): BuilderLiveView['activities'][number]['label'] => {
  const value = toolName.toLowerCase()
  if (/(read|list|search|find|glob|grep|inspect|stat|cat|tree)/.test(value)) return 'READ_FILES'
  if (/(write|edit|patch|update|create|delete|remove|replace|modify|rename)/.test(value)) return 'EDIT_FILES'
  if (/(execute|exec|command|shell|run|test|build|install|git|npm|pnpm|yarn)/.test(value)) return 'RUN_COMMAND'
  return 'WORKSPACE'
}

const safePath = (args: unknown): string | undefined => {
  if (typeof args !== 'object' || args === null) return undefined
  const value = 'path' in args && typeof args.path === 'string' ? args.path
    : 'filePath' in args && typeof args.filePath === 'string' ? args.filePath
      : 'file_path' in args && typeof args.file_path === 'string' ? args.file_path : undefined
  if (!value || value.includes('\0') || value.includes('..')) return undefined
  const normalized = value.replaceAll('\\', '/').replace(/^\/workspace\/repo\//, '')
  return normalized.startsWith('app/') && normalized.length <= 220 ? normalized : undefined
}

const safeToolState = (status: string | undefined): BuilderLiveView['activities'][number]['state'] => {
  if (status === 'completed') return 'succeeded'
  if (status === 'error') return 'failed'
  return 'started'
}

/** Projects one native display snapshot at the Conexus disclosure boundary. */
export const toBuilderLiveView = (displayState: BuilderDisplayState): BuilderLiveView => {
  const currentMessage = displayState.currentMessage
  const text = currentMessage ? messageText(currentMessage) : ''
  const message = currentMessage?.role === 'assistant' && currentMessage.id && text
    ? { id: currentMessage.id, text }
    : null
  const activities = [...displayState.activeTools.values()].map((tool, index) => {
    const detail = safePath(tool.args)
    return {
      id: `activity-${index + 1}`,
      label: toolLabel(typeof tool.name === 'string' ? tool.name : ''),
      ...(detail ? { detail } : {}),
      state: safeToolState(tool.status),
    }
  })
  return { running: displayState.isRunning, message, activities }
}

export const sendBuilderSessionMessage = async (
  session: BuilderSession,
  message: Readonly<{ content: string }>,
  requestContext?: RequestContext,
): Promise<AgentEndReason> => {
  let terminalReason: AgentEndReason | undefined
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'agent_end') terminalReason = event.reason
  })
  try {
    await session.sendMessage({ ...message, ...(requestContext ? { requestContext } : {}) })
    if (!terminalReason) throw new Error('BUILDER_AGENT_COMPLETION_UNAVAILABLE')
    return terminalReason
  } finally {
    unsubscribe()
  }
}

const messageText = (message: Readonly<{ content?: Readonly<{ parts?: readonly unknown[] }> }>): string => {
  const parts = Array.isArray(message.content?.parts) ? message.content.parts : []
  return parts.flatMap((part) => {
    if (typeof part !== 'object' || part === null || !('type' in part) || part.type !== 'text' || !('text' in part) || typeof part.text !== 'string') return []
    return [part.text]
  }).join('')
}

export const classifyCodingResult = (input: Readonly<{ changed: boolean; summary: string }>): Readonly<{ kind: 'SOURCE_CHANGED' | 'RESPONSE_ONLY'; summary: string }> => Object.freeze({
  kind: input.changed ? 'SOURCE_CHANGED' : 'RESPONSE_ONLY',
  summary: input.summary,
})

export const shouldMaterializeApplicationStarter = (input: Readonly<{ mode?: 'BUILD' | 'PLAN' }>): boolean => input.mode === 'BUILD'

export const createMastraE2BCodingWorkerRuntime = (
  config: E2BBuilderRuntimeConfig,
): CodingWorkerRuntime => {
  if (!config.apiKey || !immutableE2BTemplate.test(config.templateId) ||
    !config.modelIdentity.admissionId || !config.modelIdentity.providerId || !config.modelIdentity.modelId ||
    /latest|\*/i.test(config.modelIdentity.modelId) || config.model.modelId !== config.modelIdentity.modelId ||
    typeof config.validateModelCredential !== 'function') {
    throw new Error('BUILDER_RUNTIME_CONFIG_REFUSED')
  }
  const sharedHarness = config.sharedHarness
  const getSessionByResource = sharedHarness
    ? (resourceId: string, scope: string): Promise<BuilderSession | undefined> => sharedHarness.controller.getSessionByResource(resourceId, scope)
    : undefined
  return Object.freeze({
    kind: 'REMOTE_E2B' as const,
    modelIdentity: Object.freeze({ ...config.modelIdentity }),
    ...(getSessionByResource ? { getSessionByResource } : {}),
    execute: async (input: CodingWorkerInput) => {
      const executionId = input.executionId
      if (![input.projectId, executionId].every(safeIdentity) ||
        !oid.test(input.baseSourceRevision) || !input.intent.trim() || input.sourceBundle.byteLength === 0 ||
        input.sourceBundle.byteLength > 256 * 1024 * 1024) throw new Error('BUILDER_RUNTIME_INPUT_REFUSED')

      config.validateModelCredential()

      const logicalSandboxId = `conexus-builder-${executionId}`
      const timeoutMs = config.timeoutMs ?? 15 * 60_000
      const metadata = {
        'mastra-sandbox-id': logicalSandboxId,
        'conexus-project-id': input.projectId,
        'conexus-execution-id': executionId,
      }
      const physical = await Sandbox.create(config.templateId, {
        apiKey: config.apiKey,
        timeoutMs,
        envs: {},
        metadata,
        allowInternetAccess: false,
        network: { denyOut: ({ allTraffic }) => [allTraffic] },
        lifecycle: { onTimeout: 'kill' },
      })
      const sandbox = new ConexusGuardedE2BSandbox({
        id: logicalSandboxId,
        sandboxId: physical.sandboxId,
        template: config.templateId,
        apiKey: config.apiKey,
        timeout: timeoutMs,
        lifecycle: { onTimeout: 'kill' },
        env: {},
        metadata,
        network: { denyOut: ({ allTraffic }) => [allTraffic] },
        instructions: 'Remote Conexus Builder sandbox. No host fallback, remote credentials, or owner-state authority.',
      })
      let observedSandboxId: string | undefined
      try {
        await sandbox.start()
        if (!sandbox.sandboxId || sandbox.sandboxId !== physical.sandboxId) throw new Error('BUILDER_SANDBOX_FRESH_CREATE_REQUIRED')
        observedSandboxId = sandbox.sandboxId
        await input.bindPhysicalSandbox(observedSandboxId)
        const providerExecuteCommand = sandbox.executeCommand?.bind(sandbox)
        if (!providerExecuteCommand) throw new Error('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')

        const direct = async (command: string, args: string[] = [], options: ExecuteCommandOptions = {}): Promise<CommandResult> => {
          if (input.signal?.aborted) throw new Error('BUILDER_RUN_CANCELLED')
          if (!observedSandboxId || sandbox.sandboxId !== observedSandboxId) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
          const value = await providerExecuteCommand(command, args, {
            ...options,
            cwd: options.cwd ?? '/workspace',
            timeout: options.timeout ?? 120_000,
            env: {},
          })
          if (sandbox.sandboxId !== observedSandboxId) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
          return value
        }
        // Override Mastra's provider retry path. Every agent command remains
        // bound to the one physical E2B incarnation admitted above.
        sandbox.executeCommand = direct
        await sandbox.writeFiles([{ path: '/workspace/source.bundle', content: Buffer.from(input.sourceBundle) }])
        const prepared = await direct('sh', ['-lc', [
          'rm -rf /workspace/repo',
          'git init --quiet --initial-branch=main /workspace/repo',
          'git -C /workspace/repo fetch --quiet --no-tags /workspace/source.bundle refs/heads/main:refs/heads/conexus-source',
          `git -C /workspace/repo checkout --detach ${input.baseSourceRevision}`,
          'test -z "$(git -C /workspace/repo remote)"',
        ].join(' && ')])
        if (!prepared.success) throw new Error('BUILDER_SOURCE_MATERIALIZATION_REFUSED')

        if (shouldMaterializeApplicationStarter(input)) {
          await materializeFixedApplicationStarter({
            repositoryRoot: '/workspace/repo',
            directCommand: (command, args) => direct(command, [...args]),
            writeFiles: sandbox.writeFiles.bind(sandbox),
          })
        }

        const workspace = new Workspace({ sandbox })
        const agent = config.sharedHarness?.agent ?? createCodingAgent({
          id: `builder-${executionId}`,
          name: 'Conexus Coding Worker',
          model: config.model,
          workspace: resolveBuilderWorkspace,
          editor: false,
          instructions: BUILDER_BASE_AGENT_INSTRUCTIONS,
          tools: {},
        })
        const controller = config.sharedHarness?.controller ?? new AgentController<Record<string, unknown>>({
          id: `builder-controller-${executionId}`,
          initialState: { yolo: true },
          modes: BUILDER_MODE_DEFINITIONS.map((mode) => ({ ...mode, availableTools: [...mode.availableTools] })),
          defaultModeId: 'build',
          agent,
          workspace: undefined,
        })
        const controllerReady = config.sharedHarness?.ready ?? controller.init()
        const prompt = createBuilderUserMessage(input.intent)
        let summaryText = ''
        let abortListener: (() => void) | undefined
        let activeSession: Awaited<ReturnType<AgentController<Record<string, unknown>>['createSession']>> | undefined
        let runError: unknown
        let cleanupError: unknown
        const runScope = config.sharedHarness ? `builder:${executionId}` : 'builder'
        try {
          await controllerReady
          const requestContext = new RequestContext()
          requestContext.setRaw(BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY, workspace)
          const session = await controller.createSession({
            resourceId: input.projectId,
            ownerId: input.projectId,
            scope: runScope,
            threadId: `conexus-builder:${input.projectId}`,
            workspace,
            requestContext,
          })
          activeSession = session
          if (input.mode) await session.mode.switch({ modeId: input.mode.toLowerCase() })
          if (input.signal) {
            abortListener = () => session.abort()
            if (input.signal.aborted) abortListener()
            else input.signal.addEventListener('abort', abortListener, { once: true })
          }
          const agentEndReason: AgentEndReason | undefined = await sendBuilderSessionMessage(session, prompt, requestContext)
          const messages = await session.thread.listActiveMessages()
          if (input.bindMessage) {
            const userMessage = [...messages].reverse().find((message) => message.role === 'signal' && message.type === 'user')
            if (!userMessage?.id) throw new Error('BUILDER_MESSAGE_ID_UNAVAILABLE')
            await input.bindMessage(userMessage.id)
          }
          if (input.signal?.aborted) throw new Error('BUILDER_RUN_CANCELLED')
          if (agentEndReason !== 'complete') throw new Error(agentEndReason === 'error' ? 'BUILDER_MODEL_STREAM_FAILED' : 'BUILDER_MODEL_INCOMPLETE')
          summaryText = messages.filter((message) => message.role === 'assistant').map(messageText).filter(Boolean).join('\n')
        } catch (error) {
          runError = error
          throw error
        } finally {
          if (input.signal && abortListener) input.signal.removeEventListener('abort', abortListener)
          abortListener = undefined
          if (activeSession) {
            try {
              const deleted = await controller.deleteSession({ resourceId: input.projectId, scope: runScope })
              if (!deleted) cleanupError = new Error('BUILDER_SESSION_DELETE_FAILED')
            } catch (error) {
              if (!runError) cleanupError = error
            }
            activeSession = undefined
          }
          if (!config.sharedHarness) await controller.destroy()
        }
        if (cleanupError) throw cleanupError
        const finalized = await direct('sh', ['-lc', [
          'test -z "$(git -C /workspace/repo remote)"',
          `test "$(git -C /workspace/repo rev-parse HEAD)" = "${input.baseSourceRevision}"`,
          'git -C /workspace/repo add --all',
        ].join(' && ')])
        if (!finalized.success) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
        const staged = await direct('git', ['-C', '/workspace/repo', 'diff', '--cached', '--name-only', '-z'])
        if (!staged.success || staged.stdout.length > 4 * 1024 * 1024) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
        const summary = summaryText.trim() || (staged.stdout.length === 0
          ? 'Coding worker produced a response without source changes.'
          : 'Coding worker produced a candidate result.')
        const classification = classifyCodingResult({ changed: staged.stdout.length > 0, summary })
        const scope = {
          runtimeId: 'mastra-native-e2b-v1' as const,
          projectId: input.projectId,
          executionId,
          sandboxId: observedSandboxId,
          baseSourceRevision: input.baseSourceRevision,
          summary: classification.summary,
        }
        if (classification.kind === 'RESPONSE_ONLY') {
          if (sandbox.sandboxId !== observedSandboxId || input.signal?.aborted) throw new Error('BUILDER_LATE_RESULT_REFUSED')
          return Object.freeze({ ...scope, kind: 'RESPONSE_ONLY' as const })
        }
        const committed = await direct('sh', ['-lc', [
          'git -C /workspace/repo -c user.name="Conexus Coding Worker" -c user.email="worker@conexus.invalid" commit -m "Conexus Builder candidate"',
          'git -C /workspace/repo branch -f conexus-result HEAD',
          `test "$(git -C /workspace/repo rev-parse HEAD^)" = "${input.baseSourceRevision}"`,
          'git -C /workspace/repo bundle create /workspace/result.bundle refs/heads/conexus-result',
        ].join(' && ')])
        if (!committed.success) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
        const resultSourceRevision = (await direct('git', ['-C', '/workspace/repo', 'rev-parse', 'HEAD'])).stdout.trim()
        if (!oid.test(resultSourceRevision)) throw new Error('BUILDER_RESULT_IDENTITY_REFUSED')
        const resultBundle = await sandbox.e2b.files.read('/workspace/result.bundle', { format: 'bytes' })
        if (sandbox.sandboxId !== observedSandboxId || input.signal?.aborted) throw new Error('BUILDER_LATE_RESULT_REFUSED')
        return Object.freeze({ ...scope, kind: 'SOURCE_CHANGED' as const, resultSourceRevision, resultBundle })
      } finally {
        await sandbox.destroy().catch(() => undefined)
      }
    },
  })
}
