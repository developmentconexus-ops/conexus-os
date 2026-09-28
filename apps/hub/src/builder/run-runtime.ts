import type { AgentController } from '@mastra/core/agent-controller'
import { RequestContext } from '@mastra/core/request-context'
import type { CommandResult, ExecuteCommandOptions, SandboxFileInput, Workspace } from '@mastra/core/workspace'
import { buildApplicationInSandbox, RECIPE_SHA256, TEMPLATE_REF } from './application-artifact-runtime.js'
import type { CompiledApplication } from './application-artifact-runtime.js'
import { APPLICATION_CHECK_EXCLUDED, commandEvidence, materializeApplicationCheck, materializeFixedApplicationStarter, removeStaleServerSkill } from './application-starter.js'
import { SERVER_BUILD_SCRIPT_PATH, serverBuildScriptSource } from './application-server-build.js'
import { pullCandidate, seedSandbox } from './conexus-git.js'
import type { ConexusGit, RunSourceSandbox } from './conexus-git.js'
import { projectResourceId } from './conversations.js'
import { CONEXUS_CONNECTOR_BRIEF_KEY, CONEXUS_PROJECT_KNOWLEDGE_KEY } from './harness/index.js'
import { PROJECT_KNOWLEDGE_PATH, PROJECT_KNOWLEDGE_READ_LIMIT, readProjectKnowledge, refuseCandidateKnowledge } from './project-knowledge.js'
import { admitApplicationTree, isUserAuthoredMessage, messageText, sendBuilderSessionMessage, SERVER_SOURCE_ROOTS } from './runtime.js'
import type { ApplicationBuildOutcome, CodingWorkerResult, SourceAdmittedResult } from './runtime.js'
import { createRunSandbox, createRunWorkspace, SANDBOX_AGENT_USER, SANDBOX_CHECKOUT } from './sandbox.js'
import type { BuilderRunningPhase } from './store.js'

/** What a run needs of its sandbox; the E2B one in production, a fake in tests. */
export type RunSandbox = Readonly<{
  readonly sandboxId: string | undefined
  start(): Promise<void>
  executeCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>
  writeFiles(files: SandboxFileInput[]): Promise<void>
  runAsRoot(script: string, env: Record<string, string>): Promise<CommandResult>
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
  readAgentFile(path: string): Promise<Uint8Array>
  // Builds <buildRoot>/app as root, writing only under buildRoot.
  buildApplication(buildRoot: string): Promise<CompiledApplication['files']>
  holdOpen(onLapse: (error: unknown) => void): Promise<() => void>
  /** The agent's workspace on this sandbox. */
  workspace: Workspace
  destroy(): Promise<void>
}>

type AgentTurn = Readonly<{ reason: string; userMessageId: string | undefined; summary: string }>

/** One run's session on the Builder controller, scoped to builder:<runId> on the conversation's thread. */
type RunSession = Readonly<{
  sendTurn(content: string, signal?: AbortSignal): Promise<AgentTurn>
  close(): Promise<void>
}>

/** One run's reach into its Project's bound Connections: the brief for its instructions and the scope its tool reads through. */
type ConnectorRun = Readonly<{ brief: string; bind(requestContext: RequestContext): void; end(): void }>

/** Everything a run's request context carries, set on every turn it takes, resumed ones included. */
export type RunContextBinder = (requestContext: RequestContext) => void

export type BuilderRunPorts = Readonly<{
  createSandbox(builderRunId: string): RunSandbox
  openSession(input: Readonly<{
    projectId: string; conversationId: string; builderRunId: string; workspace: Workspace; bindContext: RunContextBinder
  }>): Promise<RunSession>
  /**
   * Chooses the model account the run's calls use, for the provider of the model its conversation
   * runs in that mode, and holds it for the run; refuses when the person has none.
   */
  holdModelAccount(input: Readonly<{ builderRunId: string; accountId: string; projectId: string; conversationId: string; mode: 'BUILD' | 'PLAN' }>): Promise<Readonly<{ modelAccountId: string; release(): void }>>
  git: Pick<ConexusGit, 'seedBundle' | 'acceptCandidate' | 'fastForwardMain' | 'listFilesLong' | 'archive' | 'readBlob'>
  materializeStarter?(input: Readonly<{ repositoryRoot: string; directCommand(command: string, args: readonly string[]): Promise<CommandResult>; writeFiles(files: SandboxFileInput[]): Promise<void> }>): Promise<unknown>
  /** Opens the run's connector access; the run ends it on every exit. Absent, it adds nothing to the agent's instructions. */
  openConnectorRun?(input: Readonly<{ projectId: string; builderRunId: string }>): Promise<ConnectorRun>
  log(line: string): void
}>

type BuilderRunInput = Readonly<{
  projectId: string
  accountId: string
  conversationId: string
  executionId: string
  intent: string
  mode: 'BUILD' | 'PLAN'
  baseSourceRevision: string
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  bindModelAccount(modelAccountId: string): Promise<void>
  bindMessage(messageId: string): Promise<void>
  setPhase(phase: BuilderRunningPhase): Promise<void>
  recordCandidate(sourceRevision: string): Promise<void>
  signal?: AbortSignal
}>

export type BuilderRunRuntime = Readonly<{
  execute(input: BuilderRunInput): Promise<Extract<CodingWorkerResult, { kind: 'RESPONSE_ONLY' }> | SourceAdmittedResult>
}>

/** A candidate the Hub refuses before admission, with the reason the next turn reads. */
export class CandidateRefused extends Error {
  constructor(code: 'BUILDER_CHECK_FAILED' | 'BUILDER_AGENTS_MD_REFUSED', readonly detail: string) {
    super(code)
  }
}

const OID = /^[0-9a-f]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const materializeRunStarter: NonNullable<BuilderRunPorts['materializeStarter']> = async (input) => {
  await materializeFixedApplicationStarter(input)
  await removeStaleServerSkill(input)
  await materializeApplicationCheck(input)
}

// Root-only folders: the base bundle the checkout is seeded from, and the tree the build compiles.
const SEED_ROOT = '/var/lib/conexus-seed'
const BUILD_ROOT = '/var/lib/conexus-build'
// The agent user's own copy of the candidate, where the Hub runs the Project's check.
const CHECK_ROOT = '/tmp/conexus-candidate-check'

const quoted = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`

export const createBuilderRunRuntime = (ports: BuilderRunPorts): BuilderRunRuntime => Object.freeze({
  execute: async (input) => {
    if (!UUID.test(input.executionId) || !UUID.test(input.projectId) || !UUID.test(input.conversationId) ||
      !OID.test(input.baseSourceRevision) || !input.intent.trim()) throw new Error('BUILDER_RUNTIME_INPUT_REFUSED')
    const base = input.baseSourceRevision
    const cancelled = (): boolean => input.signal?.aborted === true

    // The person's own account, else the installation's shared one; none refuses the run before a
    // sandbox exists, with the same "connect a model" answer as before.
    const modelAccount = await ports.holdModelAccount({
      builderRunId: input.executionId, accountId: input.accountId, projectId: input.projectId, conversationId: input.conversationId, mode: input.mode,
    })
    const connectorRun = ports.openConnectorRun ? await ports.openConnectorRun({ projectId: input.projectId, builderRunId: input.executionId }).catch((error: unknown) => {
      modelAccount.release()
      throw error
    }) : null
    const sandbox = ports.createSandbox(input.executionId)
    let session: RunSession | undefined
    let release: (() => void) | undefined
    // The agent's turn is the only reader of the run's connector scope and model account, so both
    // end with the session.
    const closeSession = async (): Promise<void> => {
      connectorRun?.end()
      modelAccount.release()
      const open = session
      session = undefined
      await open?.close()
    }
    try {
      await input.bindModelAccount(modelAccount.modelAccountId)
      // Project knowledge is read by the Hub from the base in the Conexus Git, never from the sandbox (AC-8).
      const knowledge = readProjectKnowledge(await ports.git.readBlob(input.projectId, base, PROJECT_KNOWLEDGE_PATH, PROJECT_KNOWLEDGE_READ_LIMIT))
      const bindContext: RunContextBinder = (requestContext) => {
        requestContext.setRaw('conexusBuilderProjectId', input.projectId)
        requestContext.setRaw('conexusBuilderRunId', input.executionId)
        requestContext.setRaw(CONEXUS_PROJECT_KNOWLEDGE_KEY, knowledge)
        requestContext.setRaw(CONEXUS_CONNECTOR_BRIEF_KEY, connectorRun?.brief ?? '')
        connectorRun?.bind(requestContext)
      }

      await sandbox.start()
      // The first command replaces a VM E2B already reaped, so the run records the incarnation
      // that will actually run it.
      await sandbox.executeCommand('true', [], { env: {}, cwd: '/' })
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
      // The Hub's own commands run as the agent's user with an empty environment, from a folder
      // that exists before the checkout does.
      const direct = (command: string, args: string[] = [], options: ExecuteCommandOptions = {}): Promise<CommandResult> =>
        onIncarnation(() => sandbox.executeCommand(command, args, { timeout: 120_000, ...options, cwd: options.cwd ?? '/', env: {} }))
      const sh = (script: string, timeout?: number): Promise<CommandResult> => direct('sh', ['-c', script], timeout ? { timeout } : {})
      const asRoot = (script: string): Promise<CommandResult> => onIncarnation(() => sandbox.runAsRoot(script, {}))
      const writeRootFile = async (path: string, bytes: Uint8Array): Promise<void> => {
        if (sandbox.sandboxId !== incarnation) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
        await sandbox.writeRootFile(path, bytes)
      }
      const source: RunSourceSandbox = { direct, writeRootFile, readAgentFile: (path) => sandbox.readAgentFile(path) }
      if ((await direct('id', ['-un'])).stdout.trim() !== SANDBOX_AGENT_USER) throw new Error('BUILDER_SANDBOX_AGENT_USER_REQUIRED')

      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      await seedSandbox({ git: ports.git, projectId: input.projectId, base, sandbox: source, checkout: SANDBOX_CHECKOUT, seedFile: `${SEED_ROOT}/${input.executionId}.bundle` })

      // The Project check runs the Hub's server build from a path only root can write, so the agent
      // and the admission below see exactly the refusal the Conexus build would give.
      const installed = await asRoot([
        `cat > '${SERVER_BUILD_SCRIPT_PATH}.next' <<'CONEXUS_SERVER_BUILD_EOF'`,
        serverBuildScriptSource(),
        'CONEXUS_SERVER_BUILD_EOF',
        `chmod 644 '${SERVER_BUILD_SCRIPT_PATH}.next' && mv '${SERVER_BUILD_SCRIPT_PATH}.next' '${SERVER_BUILD_SCRIPT_PATH}'`,
      ].join('\n'))
      if (installed.exitCode !== 0) throw new Error('BUILDER_CHECK_INSTALL_REFUSED', { cause: { stderr: commandEvidence(installed.stderr) } })
      // A run that starts in Planejar builds in the same run once its plan is approved (AC-4).
      await (ports.materializeStarter ?? materializeRunStarter)({
        repositoryRoot: SANDBOX_CHECKOUT,
        directCommand: (command, args) => direct(command, [...args]),
        writeFiles: (files) => sandbox.writeFiles(files),
      })

      session = await ports.openSession({
        projectId: input.projectId, conversationId: input.conversationId, builderRunId: input.executionId,
        workspace: sandbox.workspace, bindContext,
      })
      await input.setPhase('AGENT')
      const turn = await session.sendTurn(input.intent, input.signal)
      if (turn.reason === 'aborted') ports.log(`BUILDER_AGENT_END:aborted:${input.executionId}`)
      if (!turn.userMessageId) throw new Error('BUILDER_MESSAGE_ID_UNAVAILABLE')
      await input.bindMessage(turn.userMessageId)
      // An agent that ends aborted without the person's stop failed on its own, for example a model
      // call it could not authenticate; reporting that as their cancellation would be false.
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      if (turn.reason !== 'complete') throw new Error('BUILDER_MODEL_INCOMPLETE')
      await closeSession().catch((error: unknown) => {
        ports.log(`BUILDER_SESSION_CLOSE_FAILED:${input.executionId}:${error instanceof Error ? error.message : String(error)}`)
      })

      const result = await pullCandidate({ git: ports.git, projectId: input.projectId, runId: input.executionId, base, sandbox: source, checkout: SANDBOX_CHECKOUT, excluded: APPLICATION_CHECK_EXCLUDED })
      const scope = {
        runtimeId: 'conexus-builder-e2b-v1' as const,
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
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')

      // Admission (AC-9, AC-14): the candidate's AGENTS.md is within the rule and its own check
      // passes on the candidate's tree, taken from the Conexus Git once every process of the
      // agent's user is gone.
      await input.setPhase('SOURCE_ADMISSION')
      const refusal = refuseCandidateKnowledge(await ports.git.readBlob(input.projectId, result, PROJECT_KNOWLEDGE_PATH, PROJECT_KNOWLEDGE_READ_LIMIT))
      if (refusal) throw new CandidateRefused('BUILDER_AGENTS_MD_REFUSED', refusal)
      await sh('kill -KILL -1 2>/dev/null; true')
      const candidateTar = `${SEED_ROOT}/${input.executionId}.candidate.tar`
      await writeRootFile(candidateTar, await ports.git.archive(input.projectId, result, []))
      const check = await sh([
        `rm -rf ${quoted(CHECK_ROOT)} && mkdir -p ${quoted(CHECK_ROOT)}`,
        `tar -x -C ${quoted(CHECK_ROOT)} -f ${quoted(candidateTar)}`,
        `cd ${quoted(CHECK_ROOT)} && sh conexus/check.sh`,
      ].join(' && '), 600_000)
      if (check.exitCode !== 0) throw new CandidateRefused('BUILDER_CHECK_FAILED', commandEvidence(`${check.stdout}\n${check.stderr}`.trim()))

      // The last step a stop can prevent. The candidate is recorded before `main` moves, so a restart
      // finds what may be on main; a stopped run is refused and stops here.
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      await input.recordCandidate(result)
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      // The compare-and-swap and the moment of admission: `main` moves from exactly the run's base.
      await ports.git.fastForwardMain(input.projectId, { base, candidate: result })

      // Past admission a stop is too late, so the build takes no signal. A build the source broke
      // settles as a build failure; the admitted source stays and the Preview is unavailable.
      await input.setPhase('COMPILING').catch(() => undefined)
      let applicationBuild: ApplicationBuildOutcome
      try {
        const admitted = admitApplicationTree(await ports.git.listFilesLong(input.projectId, result, ['app/', 'conexus/']))
        const archived = ['app', ...SERVER_SOURCE_ROOTS.filter((root) => admitted.some((path) => path === root || path.startsWith(`${root}/`)))]
        const buildRoot = `${BUILD_ROOT}/${input.executionId}`
        const tree = `${BUILD_ROOT}/${input.executionId}.tar`
        const prepared = await asRoot([
          `rm -rf '${BUILD_ROOT}'`,
          `mkdir -p -m 700 '${BUILD_ROOT}'`,
          `mkdir -m 700 '${buildRoot}'`,
        ].join(' && '))
        if (prepared.exitCode !== 0) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
        await writeRootFile(tree, await ports.git.archive(input.projectId, result, archived))
        const unpacked = await asRoot(`tar -x -C '${buildRoot}' -f '${tree}' && rm -f '${tree}'`)
        if (unpacked.exitCode !== 0) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
        const files = await sandbox.buildApplication(buildRoot)
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
      return Object.freeze({ ...scope, kind: 'SOURCE_ADMITTED' as const, resultSourceRevision: result, applicationBuild })
    } catch (error) {
      // The run records only its failure code; a failure that carries command evidence says why.
      if (error instanceof Error && error.cause !== undefined) ports.log(`BUILDER_RUN_FAILED:${input.executionId}:${error.message} ${JSON.stringify(error.cause)}`)
      throw error
    } finally {
      release?.()
      await closeSession().catch(() => undefined)
      await sandbox.destroy().catch((error: unknown) => {
        ports.log(`BUILDER_SANDBOX_DESTROY_FAILED:${input.executionId}:${error instanceof Error ? error.message : String(error)}`)
      })
    }
  },
})

type RecordedMessage = Readonly<{ id: string; role?: string; content?: unknown }>

const builderRunScope = (builderRunId: string): string => `builder:${builderRunId}`

/**
 * A run's session on the Builder controller: its own scope on the conversation's thread, its
 * sandbox's workspace, every tool allowed without asking (the mode guard is the enforcement), and a
 * turn that lasts until the agent is done, including while it waits for the person to approve a
 * plan or answer a question (AC-16).
 */
export const createControllerRunSessions = ({ controller, runContexts, runWorkspaces }: Readonly<{
  controller: AgentController
  /** The live runs' context binders by session scope, which the browser mount applies to every request it serves a run. */
  runContexts: Map<string, RunContextBinder>
  /** The live runs' workspaces by run id, which the controller's workspace resolver hands a run's session. */
  runWorkspaces: Map<string, Workspace>
}>): BuilderRunPorts['openSession'] => async ({ projectId, conversationId, builderRunId, workspace, bindContext }) => {
  const resourceId = projectResourceId(projectId)
  const scope = builderRunScope(builderRunId)
  const requestContext = new RequestContext()
  bindContext(requestContext)
  runWorkspaces.set(builderRunId, workspace)
  runContexts.set(scope, bindContext)
  const forget = (): void => {
    runContexts.delete(scope)
    runWorkspaces.delete(builderRunId)
  }
  const close = async (): Promise<void> => {
    forget()
    const deleted = await controller.deleteSession({ resourceId, scope })
    if (!deleted || await controller.getSessionByResource(resourceId, scope)) throw new Error('BUILDER_SESSION_DELETE_FAILED')
  }
  let session: Awaited<ReturnType<AgentController['createSession']>>
  try {
    session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext })
    if (session.getWorkspace() !== workspace) throw new Error('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')
    await session.state.set({ yolo: true })
  } catch (error) {
    await close().catch(() => forget())
    throw error
  }
  return Object.freeze({
    sendTurn: async (content: string, signal?: AbortSignal): Promise<AgentTurn> => {
      let userMessageId: string | undefined
      const detach = session.subscribe((event) => {
        if (event.type === 'message_start' && isUserAuthoredMessage(event.message)) userMessageId = event.message.id
      })
      const abort = (): void => { session.abort() }
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
      try {
        let reason: string = await sendBuilderSessionMessage(session, { content }, requestContext) ?? 'unknown'
        // A plan waiting for approval, or a question waiting for an answer, keeps the run active: the
        // person answers through the browser, and the turn goes on until the agent ends for good.
        while (reason === 'suspended') reason = await nextAgentEnd(session, signal)
        const messages = await session.thread.listActiveMessages() as readonly RecordedMessage[]
        userMessageId ??= [...messages].reverse().find(isUserAuthoredMessage)?.id
        const summary = messages.slice(messages.findIndex((message) => message.id === userMessageId) + 1)
          .filter((message) => message.role === 'assistant').map((message) => messageText(message as Parameters<typeof messageText>[0])).filter(Boolean).join('\n')
        return { reason, userMessageId, summary }
      } finally {
        detach()
        signal?.removeEventListener('abort', abort)
      }
    },
    close,
  })
}


// A stop while the turn waits on the person ends the wait, since no agent run is there to end.
const nextAgentEnd = (session: Awaited<ReturnType<AgentController['createSession']>>, signal: AbortSignal | undefined): Promise<string> => new Promise((resolve) => {
  const settle = (reason: string): void => {
    detach()
    signal?.removeEventListener('abort', stopped)
    resolve(reason)
  }
  const stopped = (): void => settle('aborted')
  const detach = session.subscribe((event) => { if (event.type === 'agent_end') settle(event.reason ?? 'unknown') })
  if (signal?.aborted) stopped()
  else signal?.addEventListener('abort', stopped, { once: true })
})

/** The production sandbox for a run: a fresh E2B VM with the agent's workspace on its checkout. */
export const e2bRunSandboxes = ({ apiKey, templateId }: Readonly<{ apiKey: string; templateId: string }>) => (builderRunId: string): RunSandbox => {
  const sandbox = createRunSandbox({ apiKey, templateId, builderRunId })
  const workspace = createRunWorkspace(sandbox)
  return Object.freeze({
    get sandboxId() { return sandbox.sandboxId },
    workspace,
    start: async () => { await sandbox.start() },
    executeCommand: (command: string, args: string[] = [], options: ExecuteCommandOptions = {}) => sandbox.runCommand(command, args, options),
    writeFiles: (files: SandboxFileInput[]) => sandbox.writeFiles(files),
    runAsRoot: (script: string, env: Record<string, string>) => sandbox.runAsRoot(script, env),
    writeRootFile: (path: string, bytes: Uint8Array) => sandbox.writeRootFile(path, bytes),
    readAgentFile: (path: string) => sandbox.readAgentFile(path),
    buildApplication: (buildRoot: string) => buildApplicationInSandbox(sandbox.e2b, { workRoot: buildRoot, appRoot: `${buildRoot}/app`, user: 'root' }),
    holdOpen: (onLapse: (error: unknown) => void) => sandbox.holdOpen(onLapse),
    destroy: () => sandbox.destroy(),
  })
}
