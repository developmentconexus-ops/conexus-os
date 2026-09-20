import type { AgentController, AgentControllerEvent } from '@mastra/core/agent-controller'
import { RequestContext } from '@mastra/core/request-context'
import type { CommandResult, ExecuteCommandOptions } from '@mastra/core/workspace'
import { Workspace } from '@mastra/core/workspace'
import { E2BSandbox } from '@mastra/e2b'
import { Sandbox } from 'e2b'
import { materializeFixedApplicationStarter } from './application-starter.js'
import type { BuilderRunningPhase } from './store.js'

type CodingWorkerCommonInput = Readonly<{
  projectId: string
  intent: string
  mode?: 'BUILD' | 'PLAN'
  baseSourceRevision: string
  // A promise, not the bytes: exporting the bundle and creating the sandbox do not depend on each
  // other, and each costs an out-of-process start.
  sourceBundle: Promise<Uint8Array>
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  bindMessage?(messageId: string): Promise<void>
  credentialReference?: Readonly<{ connectionId: string; generation: string }>
  modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>
  setPhase?(phase: BuilderRunningPhase): Promise<void>
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
  | Readonly<{ kind: 'SOURCE_CHANGED'; claimedResultSourceRevision: string; resultBundle: Uint8Array }>
  | Readonly<{ kind: 'RESPONSE_ONLY' }>
)

export type CodingWorkerResult = CodingWorkerResultVariant<CodingWorkerResultScope>

type BuilderSession = Awaited<ReturnType<AgentController<Record<string, unknown>>['createSession']>>

export type CodingWorkerRuntime = Readonly<{
  kind: 'REMOTE_E2B'
  execute(input: CodingWorkerInput): Promise<CodingWorkerResult>
}>

export type E2BBuilderRuntimeConfig = Readonly<{
  apiKey: string
  templateId: string
  sharedHarness: Readonly<{
    controller: AgentController<Record<string, unknown>>
    ready: Promise<void>
    flushObservability(): Promise<void>
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

type AgentEndReason = Extract<AgentControllerEvent, { type: 'agent_end' }>['reason']
type SendableAgentEndReason = Exclude<AgentEndReason, 'error'>

export const BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY = 'conexus.builder.workspace'
export const BUILDER_CREDENTIAL_REQUEST_CONTEXT_KEY = 'conexus.builder.credential'
export const BUILDER_MODEL_REQUEST_CONTEXT_KEY = 'conexus.builder.model'
export const BUILDER_TRACE_REQUEST_CONTEXT_KEYS = Object.freeze([
  'conexusBuilderProjectId',
  'conexusBuilderRunId',
])

export type BuilderRequestContext = RequestContext

export const createBuilderRequestContext = ({
  workspace,
  projectId,
  runId,
  credentialReference,
  modelIdentity,
}: Readonly<{
  workspace: Workspace
  projectId: string
  runId: string
  credentialReference?: Readonly<{ connectionId: string; generation: string }>
  modelIdentity: Readonly<{ admissionId: string; providerId: string; modelId: string }>
}>): BuilderRequestContext => {
  const requestContext = new RequestContext()
  requestContext.setRaw(BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY, workspace)
  requestContext.setRaw('conexusBuilderProjectId', projectId)
  requestContext.setRaw('conexusBuilderRunId', runId)
  if (credentialReference) requestContext.setRaw(BUILDER_CREDENTIAL_REQUEST_CONTEXT_KEY, credentialReference)
  requestContext.setRaw(BUILDER_MODEL_REQUEST_CONTEXT_KEY, modelIdentity)
  return requestContext
}

/** Resolve the per-run Workspace through Mastra's native dynamic workspace hook. */
export const resolveBuilderWorkspace = ({ requestContext }: { requestContext: RequestContext }): Workspace | undefined => {
  const workspace = requestContext.getRaw(BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY)
  return workspace instanceof Workspace ? workspace : undefined
}

const isRateLimitError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false
  const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : undefined
  const messageText = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return statusCode === 429 || /rate.?limit|too many requests/i.test(messageText)
}

const classifyAgentError = (error: Error): string => {
  const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : undefined
  if (statusCode === 401 || statusCode === 403) return 'BUILDER_MODEL_AUTH_FAILED'
  return 'BUILDER_MODEL_STREAM_FAILED'
}

export const sendBuilderSessionMessage = async (
  session: BuilderSession,
  message: Readonly<{ content: string }>,
  requestContext?: RequestContext,
): Promise<SendableAgentEndReason> => {
  let terminalReason: AgentEndReason | undefined
  let agentError: Error | undefined
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'agent_end') terminalReason = event.reason
    if (event.type === 'error') agentError = event.error
  })
  try {
    try {
      await session.sendMessage({ ...message, ...(requestContext ? { requestContext } : {}) })
    } catch (error) {
      if (isRateLimitError(error)) throw new Error('BUILDER_MODEL_RATE_LIMITED')
      throw error
    }
    if (!terminalReason) throw new Error('BUILDER_AGENT_COMPLETION_UNAVAILABLE')
    if (terminalReason === 'error') {
      if (agentError && isRateLimitError(agentError)) throw new Error('BUILDER_MODEL_RATE_LIMITED')
      throw new Error(agentError ? classifyAgentError(agentError) : 'BUILDER_MODEL_STREAM_FAILED')
    }
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

const isUserAuthoredMessage = (message: Readonly<{ role?: string; content?: unknown }>): boolean => {
  if (message.role === 'user') return true
  if (message.role !== 'signal' || typeof message.content !== 'object' || message.content === null) return false
  const content = message.content as Record<string, unknown>
  const metadata = content.metadata
  if (typeof metadata !== 'object' || metadata === null) return false
  const signal = (metadata as Record<string, unknown>).signal
  if (typeof signal !== 'object' || signal === null) return false
  const type = (signal as Record<string, unknown>).type
  return type === 'user' || type === 'user-message'
}

export const classifyCodingResult = (input: Readonly<{ changed: boolean; summary: string }>): Readonly<{ kind: 'SOURCE_CHANGED' | 'RESPONSE_ONLY'; summary: string }> => Object.freeze({
  kind: input.changed ? 'SOURCE_CHANGED' : 'RESPONSE_ONLY',
  summary: input.summary,
})

export const shouldMaterializeApplicationStarter = (input: Readonly<{ mode?: 'BUILD' | 'PLAN' }>): boolean => input.mode === 'BUILD'

export const createMastraE2BCodingWorkerRuntime = (
  config: E2BBuilderRuntimeConfig,
): CodingWorkerRuntime => {
  if (!config.apiKey || !immutableE2BTemplate.test(config.templateId)) {
    throw new Error('BUILDER_RUNTIME_CONFIG_REFUSED')
  }
  const sharedHarness = config.sharedHarness
  if (!sharedHarness) throw new Error('BUILDER_RUNTIME_SHARED_COMPOSITION_REQUIRED')
  return Object.freeze({
    kind: 'REMOTE_E2B' as const,
    execute: async (input: CodingWorkerInput) => {
      const executionId = input.executionId
      if (![input.projectId, executionId].every(safeIdentity) ||
        !oid.test(input.baseSourceRevision) || !input.intent.trim()) throw new Error('BUILDER_RUNTIME_INPUT_REFUSED')

      const logicalSandboxId = `conexus-builder-${executionId}`
      const timeoutMs = config.timeoutMs ?? 15 * 60_000
      const metadata = {
        'mastra-sandbox-id': logicalSandboxId,
        'conexus-project-id': input.projectId,
        'conexus-execution-id': executionId,
      }
      // Both starts are paid at once, and a bundle that never arrives still refuses the run with its
      // own code, taking the sandbox down with it.
      const [created, delivered] = await Promise.allSettled([
        Sandbox.create(config.templateId, {
          apiKey: config.apiKey,
          timeoutMs,
          envs: {},
          metadata,
          allowInternetAccess: false,
          network: { denyOut: ({ allTraffic }) => [allTraffic] },
          lifecycle: { onTimeout: 'kill' },
        }),
        input.sourceBundle,
      ])
      if (delivered.status === 'rejected') {
        if (created.status === 'fulfilled') await created.value.kill().catch(() => undefined)
        throw delivered.reason
      }
      if (created.status === 'rejected') throw created.reason
      const physical = created.value
      const sourceBundle = delivered.value
      if (sourceBundle.byteLength === 0 || sourceBundle.byteLength > 256 * 1024 * 1024) {
        await physical.kill().catch(() => undefined)
        throw new Error('BUILDER_RUNTIME_INPUT_REFUSED')
      }
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
        await sandbox.writeFiles([{ path: '/workspace/source.bundle', content: Buffer.from(sourceBundle) }])
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
        const controller = sharedHarness.controller
        const controllerReady = sharedHarness.ready
        const prompt = createBuilderUserMessage(input.intent)
        let summaryText = ''
        let abortListener: (() => void) | undefined
        let activeSession: Awaited<ReturnType<AgentController<Record<string, unknown>>['createSession']>> | undefined
        let submittedUserMessageId: string | undefined
        let detachMessageCapture: (() => void) | undefined
        let runError: unknown
        let cleanupError: unknown
        const runScope = `builder:${executionId}`
        try {
          await controllerReady
          const requestContext = createBuilderRequestContext({
            workspace,
            projectId: input.projectId,
            runId: executionId,
            ...(input.credentialReference ? { credentialReference: input.credentialReference } : {}),
            modelIdentity: input.modelIdentity,
          })
          await input.setPhase?.('AGENT')
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
          detachMessageCapture = session.subscribe((event) => {
            if (event.type === 'message_end' && isUserAuthoredMessage(event.message)) submittedUserMessageId = event.message.id
          })
          const agentEndReason = await sendBuilderSessionMessage(
            session,
            prompt,
            requestContext,
          )
          detachMessageCapture()
          detachMessageCapture = undefined
          const messages = await session.thread.listActiveMessages()
          if (input.bindMessage) {
            const userMessage = [...messages].reverse().find(isUserAuthoredMessage)
            const messageId = submittedUserMessageId ?? userMessage?.id
            if (!messageId) throw new Error('BUILDER_MESSAGE_ID_UNAVAILABLE')
            await input.bindMessage(messageId)
          }
          if (input.signal?.aborted || agentEndReason === 'aborted') throw new Error('BUILDER_RUN_CANCELLED')
          if (agentEndReason !== 'complete') throw new Error('BUILDER_MODEL_INCOMPLETE')
          summaryText = messages.filter((message) => message.role === 'assistant').map(messageText).filter(Boolean).join('\n')
        } catch (error) {
          runError = error
          throw error
        } finally {
          detachMessageCapture?.()
          detachMessageCapture = undefined
          if (input.signal && abortListener) input.signal.removeEventListener('abort', abortListener)
          abortListener = undefined
          if (activeSession) {
            try {
              const deleted = await controller.deleteSession({ resourceId: input.projectId, scope: runScope })
              if (!deleted || await controller.getSessionByResource(input.projectId, runScope)) cleanupError = new Error('BUILDER_SESSION_DELETE_FAILED')
            } catch (error) {
              if (!runError) cleanupError = error
            }
            activeSession = undefined
          }
          await sharedHarness.flushObservability()
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
        const claimedResultSourceRevision = (await direct('git', ['-C', '/workspace/repo', 'rev-parse', 'HEAD'])).stdout.trim()
        if (!oid.test(claimedResultSourceRevision)) throw new Error('BUILDER_RESULT_IDENTITY_REFUSED')
        const resultBundle = await sandbox.e2b.files.read('/workspace/result.bundle', { format: 'bytes' })
        if (sandbox.sandboxId !== observedSandboxId || input.signal?.aborted) throw new Error('BUILDER_LATE_RESULT_REFUSED')
        return Object.freeze({ ...scope, kind: 'SOURCE_CHANGED' as const, claimedResultSourceRevision, resultBundle })
      } finally {
        await sandbox.destroy().catch(() => undefined)
      }
    },
  })
}
