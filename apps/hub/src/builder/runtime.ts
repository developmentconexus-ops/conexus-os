import type { AgentController, AgentControllerEvent } from '@mastra/core/agent-controller'
import type { MastraCodeState } from '@mastra/code-sdk/schema'
import { SandboxFilesystem } from '@mastra/code-sdk/agents/sandbox-filesystem'
import { TOOL_NAME_OVERRIDES } from '@mastra/code-sdk/tool-names'
import { RequestContext } from '@mastra/core/request-context'
import type { CommandResult, ExecuteCommandOptions } from '@mastra/core/workspace'
import { Workspace } from '@mastra/core/workspace'
import { E2BSandbox } from '@mastra/e2b'
import { Sandbox } from 'e2b'
import { materializeFixedApplicationStarter } from './application-starter.js'
import { buildApplicationInSandbox, RECIPE_SHA256, TEMPLATE_REF } from './application-artifact-runtime.js'
import type { CompiledApplication } from './application-artifact-runtime.js'
import type { BuilderRunningPhase } from './store.js'

type CodingWorkerCommonInput = Readonly<{
  projectId: string
  accountId: string
  conversationId: string
  intent: string
  mode?: 'BUILD' | 'PLAN'
  baseSourceRevision: string
  // A promise, not the bytes: exporting the bundle and creating the sandbox do not depend on each
  // other, and each costs an out-of-process start.
  sourceBundle: Promise<Uint8Array>
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  bindMessage?(messageId: string): Promise<void>
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

// The compile now runs inside the agent's own sandbox, before source admission (apps/hub/src/builder/service.ts
// commits the source only after `execute` returns). A thrown build or smoke failure would therefore
// discard the already-committed result bundle instead of settling the run, so a failure the agent's
// work itself caused travels back as data, not as a rejected promise: service.ts still admits the
// source and settles SOURCE_CHANGED_BUILD_FAILED, the same shape a build failure produced before the
// compile moved in-sandbox. Anything else (a workspace fault, cancellation) is still a thrown failure.
export type ApplicationBuildOutcome =
  | Readonly<{ kind: 'BUILT'; compiledApplication: CompiledApplication }>
  | Readonly<{ kind: 'BUILD_FAILED'; code: string }>

type CodingWorkerResultVariant<TScope> = TScope & (
  | Readonly<{ kind: 'SOURCE_CHANGED'; claimedResultSourceRevision: string; resultBundle: Uint8Array; applicationBuild: ApplicationBuildOutcome }>
  | Readonly<{ kind: 'RESPONSE_ONLY' }>
)

export type CodingWorkerResult = CodingWorkerResultVariant<CodingWorkerResultScope>

/** The Builder's controller is Mastra Code's, so it carries Mastra Code's own session state. */
export type BuilderAgentController = AgentController<MastraCodeState>
type BuilderSession = Awaited<ReturnType<BuilderAgentController['createSession']>>

export type CodingWorkerRuntime = Readonly<{
  kind: 'REMOTE_E2B'
  execute(input: CodingWorkerInput): Promise<CodingWorkerResult>
}>

export type E2BBuilderRuntimeConfig = Readonly<{
  apiKey: string
  templateId: string
  sharedHarness: Readonly<{
    ready: Promise<Readonly<{ controller: BuilderAgentController }>>
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

export const BUILDER_REPOSITORY_ROOT = '/workspace/repo'
export const BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY = 'conexus.builder.workspace'
export const BUILDER_TRACE_REQUEST_CONTEXT_KEYS = Object.freeze([
  'conexusBuilderProjectId',
  'conexusBuilderRunId',
])

export type BuilderRequestContext = RequestContext

export const createBuilderRequestContext = ({
  workspace,
  projectId,
  accountId,
  runId,
}: Readonly<{
  workspace: Workspace
  projectId: string
  accountId: string
  runId: string
}>): BuilderRequestContext => {
  const requestContext = new RequestContext()
  requestContext.setRaw(BUILDER_WORKSPACE_REQUEST_CONTEXT_KEY, workspace)
  requestContext.setRaw('conexusBuilderProjectId', projectId)
  requestContext.setRaw('conexusBuilderRunId', runId)
  // Mastra Code scopes a session to the caller the host supplies and refuses one without it. The
  // Account that Conexus already admitted for this Project is what fills that slot.
  requestContext.set('user', { id: accountId, organizationId: projectId })
  return requestContext
}

// Mastra Code's file tools act on a workspace filesystem and are exposed under its own names, which
// the Builder's modes allow. A sandbox alone gave the agent no file tools, and the core names an
// unmapped workspace offers matched nothing in those allowlists.
export const createBuilderWorkspace = ({ sandbox, executeCommand }: Readonly<{
  sandbox: E2BSandbox
  executeCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>
}>): Workspace => new Workspace({
  sandbox,
  filesystem: new SandboxFilesystem({ sandbox: { id: sandbox.id, executeCommand }, workdir: BUILDER_REPOSITORY_ROOT }),
  tools: TOOL_NAME_OVERRIDES,
})

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

/** `git ls-tree -r -l HEAD app/` output, held to the limits the compile input has always had. */
export const admitApplicationTree = (listing: string): readonly string[] => {
  const paths: string[] = []
  let totalBytes = 0
  for (const line of listing.split('\n').filter(Boolean)) {
    // The modes source admission accepts. A symlink or a submodule refuses here rather than
    // compiling into an artifact the admission that follows would reject.
    const entry = /^(?:100644|100755) blob [0-9a-f]{40} +(\d+)\t(.+)$/.exec(line)
    if (!entry) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
    const bytes = Number(entry[1])
    if (!Number.isSafeInteger(bytes) || bytes > 1024 * 1024) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
    totalBytes += bytes
    paths.push(entry[2] as string)
  }
  if (paths.length > 256 || totalBytes > 12 * 1024 * 1024) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  if (new Set(paths).size !== paths.length || !paths.includes('app/index.html')) {
    throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
  }
  return Object.freeze(paths)
}

export const classifyCodingResult =(input: Readonly<{ changed: boolean; summary: string }>): Readonly<{ kind: 'SOURCE_CHANGED' | 'RESPONSE_ONLY'; summary: string }> => Object.freeze({
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

        const workspace = createBuilderWorkspace({ sandbox, executeCommand: direct })
        const prompt = createBuilderUserMessage(input.intent)
        let summaryText = ''
        let abortListener: (() => void) | undefined
        let activeSession: Awaited<ReturnType<BuilderAgentController['createSession']>> | undefined
        let submittedUserMessageId: string | undefined
        let detachMessageCapture: (() => void) | undefined
        let runError: unknown
        let cleanupError: unknown
        const runScope = `builder:${executionId}`
        let controller: BuilderAgentController | undefined
        try {
          controller = (await sharedHarness.ready).controller
          const requestContext = createBuilderRequestContext({
            workspace,
            projectId: input.projectId,
            accountId: input.accountId,
            runId: executionId,
          })
          await input.setPhase?.('AGENT')
          const session = await controller.createSession({
            resourceId: input.projectId,
            ownerId: input.projectId,
            scope: runScope,
            threadId: input.conversationId,
            workspace,
            requestContext,
          })
          activeSession = session
          if (input.mode) await session.mode.switch({ modeId: input.mode.toLowerCase() })
          // Which model runs, and who pays for it, is the operator's choice through Mastra's own
          // selection. A Project that has never been given one is refused here rather than guessed at.
          if (!session.model.hasSelection()) throw new Error('BUILDER_MODEL_NOT_SELECTED')
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
          if (activeSession && controller) {
            const live = controller
            try {
              const deleted = await live.deleteSession({ resourceId: input.projectId, scope: runScope })
              if (!deleted || await live.getSessionByResource(input.projectId, runScope)) cleanupError = new Error('BUILDER_SESSION_DELETE_FAILED')
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

        // The artifact has to equal the revision that gets admitted, so the tree is
        // checked clean before anything (the node_modules symlink included) touches it.
        const clean = await direct('git', ['-C', '/workspace/repo', 'status', '--porcelain'])
        if (!clean.success || clean.stdout.length > 0) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')

        await input.setPhase?.('COMPILING')
        let applicationBuild: ApplicationBuildOutcome
        try {
          // A tree the compile input cannot accept is a build failure like any other, so the
          // operator keeps the source and is told it did not build.
          const listed = await direct('git', ['-C', '/workspace/repo', 'ls-tree', '-r', '-l', 'HEAD', 'app/'])
          if (!listed.success) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
          admitApplicationTree(listed.stdout)
          const compiledFiles = await buildApplicationInSandbox(sandbox.e2b, { appRoot: '/workspace/repo/app', ...(input.signal ? { signal: input.signal } : {}) })
          const compiledApplication: CompiledApplication = {
            projectId: input.projectId,
            executionId,
            sourceRevision: claimedResultSourceRevision,
            templateRef: TEMPLATE_REF,
            recipeSha256: RECIPE_SHA256,
            files: compiledFiles,
          }
          applicationBuild = { kind: 'BUILT', compiledApplication }
        } catch (error) {
          const code = error instanceof Error ? error.message : ''
          if (code !== 'APPLICATION_COMPILATION_FAILED' && code !== 'BUILDER_APPLICATION_SOURCE_REFUSED' &&
            !code.startsWith('APPLICATION_SMOKE_')) throw error
          applicationBuild = { kind: 'BUILD_FAILED', code }
        }
        return Object.freeze({ ...scope, kind: 'SOURCE_CHANGED' as const, claimedResultSourceRevision, resultBundle, applicationBuild })
      } finally {
        await sandbox.destroy().catch(() => undefined)
      }
    },
  })
}
