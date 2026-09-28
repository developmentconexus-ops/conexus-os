import { RequestContext } from '@mastra/core/request-context'
import type { CommandResult, ExecuteCommandOptions, SandboxFileInput } from '@mastra/core/workspace'
import { applyStoredMemorySettings } from '@mastra/factory/session/memory-settings-hydration'
import { primeTenantCredentials } from '@mastra/factory/routes/tenant-credentials'
import type { ModelCredentialsStorage } from '@mastra/factory/storage/domains/credentials/base'
import type { CustomProvidersStorage } from '@mastra/factory/storage/domains/custom-providers/base'
import type { MemorySettingsStorage } from '@mastra/factory/storage/domains/memory-settings/base'
import { buildApplicationInSandbox, RECIPE_SHA256, TEMPLATE_REF } from './application-artifact-runtime.js'
import type { CompiledApplication } from './application-artifact-runtime.js'
import { APPLICATION_CHECK_EXCLUDED, APPLICATION_CHECK_INSTRUCTION, BUILDER_SHARED_AGENT_INSTRUCTIONS, commandEvidence, EXTERNAL_DATA_INSTRUCTION, materializeApplicationCheck, materializeFixedApplicationStarter, removeStaleServerSkill } from './application-starter.js'
import { pullCandidate, seedSandbox } from './conexus-git.js'
import type { ConexusGit, RunSourceSandbox } from './conexus-git.js'
import { ConexusFactoryE2BSandbox, customProvidersPrimer, FACTORY_OPERATOR_ID, FACTORY_WORKING_DIRECTORY, SANDBOX_AGENT_USER, SANDBOX_CHECKOUT } from './factory.js'
import type { FactoryComposition } from './factory.js'
import { admitApplicationTree, isUserAuthoredMessage, messageText, sendBuilderSessionMessage, SERVER_SOURCE_ROOTS } from './runtime.js'
import { SERVER_BUILD_SCRIPT_PATH, serverBuildScriptSource } from './application-server-build.js'
import type { ApplicationBuildOutcome, CodingWorkerResult, SourceAdmittedResult } from './runtime.js'
import type { BuilderRunningPhase } from './store.js'

type FactoryRunSandbox = Readonly<{
  readonly sandboxId: string | undefined
  start(): Promise<void>
  executeCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>
  writeFiles(files: SandboxFileInput[]): Promise<void>
  runAsRoot(script: string, env: Record<string, string>): Promise<CommandResult>
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
  readAgentFile(path: string): Promise<Uint8Array>
  // Builds <buildRoot>/app as root, writing only under buildRoot.
  buildApplication(buildRoot: string, signal?: AbortSignal): Promise<CompiledApplication['files']>
  holdOpen(onLapse: (error: unknown) => void): Promise<() => void>
}>

type FactoryAgentTurn = Readonly<{
  reason: string
  endedAt: Date
  userMessageId: string | undefined
  summary: string
}>

/** One run's session on the Factory controller, scoped to builder:<runId> under the conversation. */
type FactoryRunSession = Readonly<{
  sandbox: FactoryRunSandbox
  configure(input: Readonly<{ mode: 'BUILD' | 'PLAN'; instructions: string }>): Promise<void>
  hasModelSelection(): boolean
  sendTurn(content: string, signal?: AbortSignal): Promise<FactoryAgentTurn>
  close(): Promise<void>
}>

/** One run's reach into its Project's bound Connections: the brief for its instructions and the scope its tool reads through. */
type ConnectorRun = Readonly<{ brief: string; bind(requestContext: RequestContext): void; end(): void }>

export type FactoryRunPorts = Readonly<{
  openSession(input: Readonly<{
    conversationId: string; builderRunId: string; projectId: string; accountId: string
    /** Gives the session's request context what the run's tools need. */
    bindContext?(requestContext: RequestContext): void
  }>): Promise<FactoryRunSession>
  git: Pick<ConexusGit, 'seedBundle' | 'acceptCandidate' | 'fastForwardMain' | 'listFilesLong' | 'archive'>
  materializeStarter?(input: Readonly<{ repositoryRoot: string; directCommand(command: string, args: readonly string[]): Promise<CommandResult>; writeFiles(files: SandboxFileInput[]): Promise<void> }>): Promise<unknown>
  /** Opens the run's connector access; the run ends it on every exit. Absent, it adds nothing to the agent's instructions. */
  openConnectorRun?(input: Readonly<{ projectId: string; builderRunId: string }>): Promise<ConnectorRun>
  log(line: string): void
}>

type FactoryCodingWorkerInput = Readonly<{
  projectId: string
  accountId: string
  conversationId: string
  executionId: string
  intent: string
  mode: 'BUILD' | 'PLAN'
  baseSourceRevision: string
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  bindMessage(messageId: string): Promise<void>
  setPhase(phase: BuilderRunningPhase): Promise<void>
  recordCandidate(sourceRevision: string): Promise<void>
  signal?: AbortSignal
}>

export type FactoryCodingWorkerRuntime = Readonly<{
  execute(input: FactoryCodingWorkerInput): Promise<Extract<CodingWorkerResult, { kind: 'RESPONSE_ONLY' }> | SourceAdmittedResult>
}>

const OID = /^[0-9a-f]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** @public Tests import this at runtime from the built module. */
export const factoryAgentInstructions = (workdir: string, connectorBrief = ''): string => [
  ...BUILDER_SHARED_AGENT_INSTRUCTIONS.map((line) => line.replaceAll('/workspace/repo', workdir)),
  'The conversation history can describe edits from earlier turns that were discarded; trust the files in the workspace over the history.',
  APPLICATION_CHECK_INSTRUCTION,
  EXTERNAL_DATA_INSTRUCTION,
  ...(connectorBrief ? [connectorBrief] : []),
].join(' ')

const materializeFactoryStarter: NonNullable<FactoryRunPorts['materializeStarter']> = async (input) => {
  await materializeFixedApplicationStarter(input)
  await removeStaleServerSkill(input)
  await materializeApplicationCheck(input)
}

// Root-only folders: the base bundle the checkout is seeded from, and the tree the build compiles.
const SEED_ROOT = '/var/lib/conexus-seed'
const BUILD_ROOT = '/var/lib/conexus-build'

export const createFactoryCodingWorkerRuntime = (ports: FactoryRunPorts): FactoryCodingWorkerRuntime => Object.freeze({
  execute: async (input) => {
    if (!UUID.test(input.executionId) || !UUID.test(input.projectId) || !UUID.test(input.conversationId) ||
      !OID.test(input.baseSourceRevision) || !input.intent.trim()) throw new Error('BUILDER_RUNTIME_INPUT_REFUSED')
    const base = input.baseSourceRevision
    const cancelled = (): boolean => input.signal?.aborted === true

    const connectorRun = ports.openConnectorRun ? await ports.openConnectorRun({ projectId: input.projectId, builderRunId: input.executionId }) : null
    let session: FactoryRunSession
    try {
      session = await ports.openSession({
        conversationId: input.conversationId, builderRunId: input.executionId, projectId: input.projectId, accountId: input.accountId,
        ...(connectorRun ? { bindContext: connectorRun.bind } : {}),
      })
    } catch (error) {
      connectorRun?.end()
      throw error
    }
    let sessionOpen = true
    // The agent's turn is the only reader of the run's connector scope, so it ends with the session.
    const closeSession = async (): Promise<void> => {
      connectorRun?.end()
      if (!sessionOpen) return
      sessionOpen = false
      await session.close()
    }
    let release: (() => void) | undefined
    try {
      const { sandbox } = session
      await sandbox.start()
      // start() returns at once for a sandbox this process already started, even when E2B's idle
      // timeout killed its VM since. A first command replaces a dead VM (and reclones), so the
      // run records the incarnation that will actually run it.
      await sandbox.executeCommand('true', [], { env: {} })
      const incarnation = sandbox.sandboxId
      if (!incarnation) throw new Error('BUILDER_SANDBOX_FRESH_CREATE_REQUIRED')
      await input.bindPhysicalSandbox(incarnation)
      release = await sandbox.holdOpen((error: unknown) =>
        ports.log(`BUILDER_SANDBOX_KEEPALIVE_FAILED:${input.executionId}:${error instanceof Error ? error.message : String(error)}`),
      ).catch((error: unknown) => {
        throw new Error('BUILDER_SANDBOX_KEEPALIVE_FAILED', { cause: { message: error instanceof Error ? error.message : String(error) } })
      })
      // Every command stays on the one E2B incarnation the run recorded. A replaced VM has lost the
      // pinned checkout, so the run fails rather than acting on whatever the new one holds.
      const onIncarnation = async (work: () => Promise<CommandResult>): Promise<CommandResult> => {
        if (sandbox.sandboxId !== incarnation) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
        const result = await work()
        if (sandbox.sandboxId !== incarnation) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
        return result
      }
      // Commands in the checkout run as the agent's user with an empty environment.
      const direct = (command: string, args: string[] = [], options: ExecuteCommandOptions = {}): Promise<CommandResult> =>
        onIncarnation(() => sandbox.executeCommand(command, args, { ...options, env: {} }))
      const sh = (script: string): Promise<CommandResult> => direct('sh', ['-c', script])
      const asRoot = (script: string): Promise<CommandResult> => onIncarnation(() => sandbox.runAsRoot(script, {}))
      const writeRootFile = async (path: string, bytes: Uint8Array): Promise<void> => {
        if (sandbox.sandboxId !== incarnation) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
        await sandbox.writeRootFile(path, bytes)
      }
      const source: RunSourceSandbox = { direct, writeRootFile, readAgentFile: (path) => sandbox.readAgentFile(path) }
      // A VM from an older template, adopted after a Hub restart, would still run the agent as root.
      if ((await direct('id', ['-un'])).stdout.trim() !== SANDBOX_AGENT_USER) throw new Error('BUILDER_SANDBOX_AGENT_USER_REQUIRED')

      // Every run starts from its own base, which also discards whatever a stopped or stale run left
      // in the checkout.
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      await seedSandbox({ git: ports.git, projectId: input.projectId, base, sandbox: source, checkout: SANDBOX_CHECKOUT, seedFile: `${SEED_ROOT}/${input.executionId}.bundle` })

      if (input.mode === 'BUILD') {
        // The Project check runs the Hub's server build from a path only root can write, so the
        // agent sees exactly the refusal the Conexus build would give.
        const installed = await asRoot([
          `cat > '${SERVER_BUILD_SCRIPT_PATH}.next' <<'CONEXUS_SERVER_BUILD_EOF'`,
          serverBuildScriptSource(),
          'CONEXUS_SERVER_BUILD_EOF',
          `chmod 644 '${SERVER_BUILD_SCRIPT_PATH}.next' && mv '${SERVER_BUILD_SCRIPT_PATH}.next' '${SERVER_BUILD_SCRIPT_PATH}'`,
        ].join('\n'))
        if (installed.exitCode !== 0) throw new Error('BUILDER_CHECK_INSTALL_REFUSED', { cause: { stderr: commandEvidence(installed.stderr) } })
        await (ports.materializeStarter ?? materializeFactoryStarter)({
          repositoryRoot: SANDBOX_CHECKOUT,
          directCommand: (command, args) => direct(command, [...args]),
          writeFiles: (files) => sandbox.writeFiles(files),
        })
      }
      await session.configure({ mode: input.mode, instructions: factoryAgentInstructions(SANDBOX_CHECKOUT, connectorRun?.brief) })
      if (!session.hasModelSelection()) throw new Error('BUILDER_MODEL_NOT_SELECTED')

      await input.setPhase('AGENT')
      const turn = await session.sendTurn(input.intent, input.signal)
      if (turn.reason === 'aborted') ports.log(`BUILDER_FACTORY_AGENT_END:aborted:${input.executionId}:${turn.endedAt.toISOString()}`)
      if (!turn.userMessageId) throw new Error('BUILDER_MESSAGE_ID_UNAVAILABLE')
      await input.bindMessage(turn.userMessageId)
      // An agent that ends aborted without the person's stop failed on its own, for example a model
      // call it could not authenticate; reporting that as their cancellation would be false.
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      if (turn.reason !== 'complete') throw new Error('BUILDER_MODEL_INCOMPLETE')
      // Closing the session flushes secondary, best-effort model work (observational memory among
      // it). The turn already changed the source; a failure here is a diagnostic, not a reason to
      // discard a candidate the commit and build below have not even attempted yet.
      await closeSession().catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        ports.log(`BUILDER_OM_OBSERVATION_FAILED:${input.executionId}:${message}`)
      })

      const result = await pullCandidate({ git: ports.git, projectId: input.projectId, runId: input.executionId, base, sandbox: source, checkout: SANDBOX_CHECKOUT, excluded: APPLICATION_CHECK_EXCLUDED })
      const scope = {
        runtimeId: 'mastra-factory-e2b-v1' as const,
        projectId: input.projectId,
        executionId: input.executionId,
        sandboxId: incarnation,
        baseSourceRevision: base,
        summary: turn.summary.trim() || (result ? 'Coding worker produced a candidate result.' : 'Coding worker produced a response without source changes.'),
      }
      if (!result) {
        if (cancelled()) throw new Error('BUILDER_LATE_RESULT_REFUSED')
        return Object.freeze({ ...scope, kind: 'RESPONSE_ONLY' as const })
      }
      if (input.mode === 'PLAN') throw new Error('BUILDER_PLAN_SOURCE_RESULT_REFUSED')
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')

      await input.setPhase('COMPILING')
      let applicationBuild: ApplicationBuildOutcome
      try {
        // The agent's processes can outlive its turn and keep writing the checkout, so the build
        // takes the candidate's own tree from the Conexus Git into a directory only root can enter,
        // once every process of the agent's user is gone.
        const admitted = admitApplicationTree(await ports.git.listFilesLong(input.projectId, result, ['app/', 'conexus/']))
        const archived = ['app', ...SERVER_SOURCE_ROOTS.filter((root) => admitted.some((path) => path === root || path.startsWith(`${root}/`)))]
        await sh('kill -KILL -1 2>/dev/null; true')
        const buildRoot = `${BUILD_ROOT}/${input.executionId}`
        const tree = `${BUILD_ROOT}/${input.executionId}.tar`
        const prepared = await asRoot([
          `rm -rf '${BUILD_ROOT}'`,
          `mkdir -p -m 700 '${BUILD_ROOT}'`,
          `mkdir -m 700 '${buildRoot}'`,
          // The recipe's cache directory is in the agent's workspace; root must not follow what it left there.
          `rm -rf '${FACTORY_WORKING_DIRECTORY}/.vite'`,
        ].join(' && '))
        if (prepared.exitCode !== 0) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
        await writeRootFile(tree, await ports.git.archive(input.projectId, result, archived))
        const unpacked = await asRoot(`tar -x -C '${buildRoot}' -f '${tree}' && rm -f '${tree}'`)
        if (unpacked.exitCode !== 0) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
        const files = await sandbox.buildApplication(buildRoot, input.signal)
        applicationBuild = { kind: 'BUILT', compiledApplication: {
          projectId: input.projectId, executionId: input.executionId, sourceRevision: result,
          templateRef: TEMPLATE_REF, recipeSha256: RECIPE_SHA256, files,
        } }
      } catch (error) {
        const code = error instanceof Error ? error.message : ''
        if (code !== 'APPLICATION_COMPILATION_FAILED' && code !== 'BUILDER_APPLICATION_SOURCE_REFUSED' &&
          !code.startsWith('APPLICATION_SMOKE_')) throw error
        applicationBuild = { kind: 'BUILD_FAILED', code }
      }

      // The last step a stop can prevent. The candidate is recorded before `main` moves, so a restart
      // finds what may be on main; a stopped run is refused and stops here.
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      await input.recordCandidate(result)
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      // The compare-and-swap: `main` moves from exactly the run's base, under git's ref lock.
      await ports.git.fastForwardMain(input.projectId, { base, candidate: result })
      return Object.freeze({ ...scope, kind: 'SOURCE_ADMITTED' as const, resultSourceRevision: result, applicationBuild })
    } catch (error) {
      // The run records only its failure code; a failure that carries command evidence says why.
      if (error instanceof Error && error.cause !== undefined) ports.log(`BUILDER_FACTORY_RUN_FAILED:${input.executionId}:${error.message} ${JSON.stringify(error.cause)}`)
      throw error
    } finally {
      release?.()
      await closeSession().catch(() => undefined)
    }
  },
})

// Every tool the Factory's GitHub integration contributes reaches GitHub with an installation token,
// and web tools reach anything; the agent's work is the checkout in front of it. The integration
// contributes its tools only to a session on a repository thread, so they are listed against one.
const deniedTools = (github: FactoryComposition['github'], orgId: string): Record<string, 'deny'> => {
  const listing = new RequestContext()
  listing.set('user', { id: FACTORY_OPERATOR_ID, organizationId: orgId })
  listing.set('controller', { threadId: 'conexus-tool-listing', getState: () => ({ projectRepositoryId: 'conexus-tool-listing' }) })
  const githubTools = Object.keys(github.sessionTools({ requestContext: listing }))
  if (githubTools.length === 0) throw new Error('FACTORY_GITHUB_TOOLS_UNLISTED')
  return Object.fromEntries([...githubTools, 'web_search', 'web_extract'].map((name) => [name, 'deny' as const]))
}

type RecordedMessage = Readonly<{ id: string; role?: string; content?: unknown }>

export const createMastraFactoryRunPorts = ({ composition, orgId, log }: Readonly<{
  composition: FactoryComposition
  orgId: string
  log(line: string): void
}>): Omit<FactoryRunPorts, 'git'> => {
  const tools = deniedTools(composition.github, orgId)
  const memorySettings = composition.storage.getDomain<MemorySettingsStorage>('memory-settings')
  const credentials = composition.storage.getDomain<ModelCredentialsStorage>('model-credentials')
  const primeCustomProviders = customProvidersPrimer(composition.storage.getDomain<CustomProvidersStorage>('custom-providers'), orgId)
  return Object.freeze({
    log,
    openSession: async ({ conversationId, builderRunId, projectId, accountId, bindContext }) => {
      const { controller } = composition
      const requestContext = new RequestContext()
      requestContext.set('user', { id: accountId, organizationId: orgId })
      requestContext.setRaw('conexusBuilderProjectId', projectId)
      requestContext.setRaw('conexusBuilderRunId', builderRunId)
      bindContext?.(requestContext)
      const scope = `builder:${builderRunId}`
      const session = await controller.createSession({ resourceId: conversationId, ownerId: conversationId, scope, threadId: conversationId, requestContext })
      const close = async (): Promise<void> => {
        const deleted = await controller.deleteSession({ resourceId: conversationId, scope })
        if (!deleted || await controller.getSessionByResource(conversationId, scope)) throw new Error('BUILDER_SESSION_DELETE_FAILED')
      }
      const sandbox = session.getWorkspace()?.sandbox
      if (!(sandbox instanceof ConexusFactoryE2BSandbox) || !sandbox.executeCommand) {
        await close().catch(() => undefined)
        throw new Error('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')
      }
      const execute = sandbox.executeCommand.bind(sandbox)
      return Object.freeze({
        sandbox: Object.freeze({
          get sandboxId() { return sandbox.sandboxId },
          start: async () => { await sandbox.start() },
          executeCommand: (command: string, args: string[] = [], options: ExecuteCommandOptions = {}) =>
            execute(command, args, { ...options, cwd: options.cwd ?? FACTORY_WORKING_DIRECTORY, timeout: options.timeout ?? 120_000 }),
          writeFiles: (files: SandboxFileInput[]) => sandbox.writeFiles(files),
          runAsRoot: (script: string, env: Record<string, string>) => sandbox.runAsRoot(script, env),
          writeRootFile: (path: string, bytes: Uint8Array) => sandbox.writeRootFile(path, bytes),
          readAgentFile: (path: string) => sandbox.readAgentFile(path),
          buildApplication: (buildRoot: string, signal?: AbortSignal) =>
            buildApplicationInSandbox(sandbox.e2b, { workRoot: buildRoot, appRoot: `${buildRoot}/app`, user: 'root', ...(signal ? { signal } : {}) }),
          holdOpen: (onLapse: (error: unknown) => void) => sandbox.holdOpen(onLapse),
        }),
        configure: async ({ mode, instructions }) => {
          await session.state.set({ yolo: true, permissionRules: { categories: {}, tools }, pluginInstructions: [instructions] })
          // The model gateway reads a credential and a custom provider synchronously from snapshots,
          // which only an awaited hydration fills. A stored memory row can name a custom-provider
          // model (the Google AI Pro gateway's `mastracode/<provider>/<model>` ids); switching the
          // observer or reflector onto one before this hydration runs resolves it against an empty
          // snapshot and fails the first time observation actually calls it, later in the run.
          await Promise.all([primeTenantCredentials({ tenant: { orgId, userId: accountId }, credentials }), primeCustomProviders()])
          // Memory calls resolve credentials from this run's request context, so the person who
          // started the run pays for them. Their own row (the Factory fills it from the first provider
          // they connect) names a model they can reach; the installation's row, which
          // `hub-factory memory` writes, is the fallback. The Factory seeded this session from the
          // conversation owner's row, who may be someone else.
          const memory = await memorySettings.get({ orgId, userId: accountId }) ?? await memorySettings.get({ orgId, userId: FACTORY_OPERATOR_ID })
          if (memory) await applyStoredMemorySettings(session, memory)
          await session.mode.switch({ modeId: mode.toLowerCase() })
        },
        hasModelSelection: () => session.model.hasSelection(),
        sendTurn: async (content, signal) => {
          let endedAt = new Date()
          let userMessageId: string | undefined
          const detach = session.subscribe((event) => {
            if (event.type === 'agent_end') endedAt = new Date()
            if (event.type === 'message_start' && isUserAuthoredMessage(event.message)) userMessageId = event.message.id
          })
          // The model gateway reads a credential and a custom provider synchronously from snapshots,
          // which only an awaited hydration fills.
          await Promise.all([primeTenantCredentials({ tenant: { orgId, userId: accountId }, credentials }), primeCustomProviders()])
          const abort = (): void => { session.abort() }
          if (signal?.aborted) abort()
          else signal?.addEventListener('abort', abort, { once: true })
          try {
            const reason = await sendBuilderSessionMessage(session, { content }, requestContext)
            const messages = await session.thread.listActiveMessages() as readonly RecordedMessage[]
            userMessageId ??= [...messages].reverse().find(isUserAuthoredMessage)?.id
            const summary = messages.slice(messages.findIndex((message) => message.id === userMessageId) + 1)
              .filter((message) => message.role === 'assistant').map((message) => messageText(message as Parameters<typeof messageText>[0])).filter(Boolean).join('\n')
            return { reason: reason ?? 'unknown', endedAt, userMessageId, summary }
          } finally {
            detach()
            signal?.removeEventListener('abort', abort)
          }
        },
        close,
      })
    },
  })
}
