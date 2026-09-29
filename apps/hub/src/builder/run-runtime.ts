import type { AgentController } from '@mastra/core/agent-controller'
import { RequestContext } from '@mastra/core/request-context'
import { WORKSPACE_TOOLS } from '@mastra/core/workspace'
import type { CommandResult, ExecuteCommandOptions, SandboxFileInput, Workspace } from '@mastra/core/workspace'
import { checkApplicationInSandbox, RECIPE_SHA256, TEMPLATE_REF } from './application-artifact-runtime.js'
import type { ApplicationCheckRun } from './application-artifact-runtime.js'
import type { CheckReport } from './application-check.js'
import { CHECK_NODE_PATH, CHECK_SCRIPT_PATH, checkScriptSource, checkSummary, failedBootStep, failedStepEvidence, refusingStep, unrenderedBootStep } from './application-check.js'
import { APPLICATION_CHECK_EXCLUDED, commandEvidence, materializeApplicationShape, materializeFixedApplicationStarter, removeStaleServerSkill } from './application-starter.js'
import { SERVER_BUILD_SCRIPT_PATH, serverBuildScriptSource } from './application-server-build.js'
import { MEMORY_SETTINGS_KEY, type MemorySettings } from './memory.js'
import { buildCandidateServer, createOperationRunner } from './run-operation.js'
import type { CandidateOperationPorts, RunOperation } from './run-operation.js'
import { RUN_ACCOUNT_ID_KEY, RUN_ID_KEY } from './model-routing.js'
import { candidateSnapshot, mirrorSnapshot, pullSnapshot, seedSandbox } from './conexus-git.js'
import type { ConexusGit, RunSourceSandbox } from './conexus-git.js'
import { projectResourceId } from './conversations.js'
import { CONEXUS_CONNECTOR_BRIEF_KEY, CONEXUS_PROJECT_KNOWLEDGE_KEY, CONEXUS_PROMPT_VARIANT_KEY, CONEXUS_TURN_CONFLICTS_KEY, type PromptVariantId, type RunTools } from './harness/index.js'
import { PROJECT_KNOWLEDGE_PATH, PROJECT_KNOWLEDGE_READ_LIMIT, readProjectKnowledge, refuseCandidateKnowledge } from './project-knowledge.js'
import { admitApplicationTree, isUserAuthoredMessage, messageText, sendBuilderTurnMessage, SERVER_SOURCE_ROOTS } from './runtime.js'
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
  // Runs the Hub's check on the tree at `root` as root, its steps as the agent's user, writing the
  // build to `out`; `collect` also reads the build back when the source passed.
  runCheck(input: Readonly<{ root: string; out: string; collect: boolean; user: 'root' | 'agent' }>): Promise<ApplicationCheckRun>
  holdOpen(onLapse: (error: unknown) => void): Promise<() => void>
  /** The agent's workspace on this sandbox. */
  workspace: Workspace
  destroy(): Promise<void>
}>

// Where the agent's own check writes its build; the agent's user owns it, and no run reads it back.
const AGENT_CHECK_OUT = '/tmp/conexus-agent-check'
// Where `conexus_run_operation` builds the server half, as the agent's user, before reading it back.
const RUN_OPERATION_OUT = '/tmp/conexus-run-operation'

type AgentTurn = Readonly<{ reason: string; userMessageId: string | undefined; summary: string; continuations: number }>

/** One run's session on the Builder controller, scoped to builder:<runId> on the conversation's thread. */
type RunSession = Readonly<{
  sendTurn(content: string, signal?: AbortSignal): Promise<AgentTurn>
  close(): Promise<void>
}>

/** One run's reach into its Project's bound Connections: the brief for its instructions, the scope its tools read through, and a handler port on that scope. */
type ConnectorRun = Readonly<{
  brief: string
  bind(requestContext: RequestContext): void
  openHandlerPort(): ReturnType<CandidateOperationPorts['openConnectorPort']>
  end(): void
}>

/** Everything a run's request context carries, set on every turn it takes, resumed ones included. */
export type RunContextBinder = (requestContext: RequestContext) => void

export type BuilderRunPorts = Readonly<{
  createSandbox(builderRunId: string): RunSandbox
  openSession(input: Readonly<{
    projectId: string; conversationId: string; builderRunId: string; workspace: Workspace; bindContext: RunContextBinder
    /** The check `conexus_check` runs: the Hub's script on the checkout, as the agent's user. */
    runCheck: () => Promise<CheckReport>
    /** The operation run `conexus_run_operation` does; absent when the Hub has no Prévia runner. */
    runOperation?: RunOperation
  }>): Promise<RunSession>
  /**
   * Refuses a run before a sandbox exists when the model it starts on has no usable account. It
   * checks that one model only: the account for each later call is looked up when the call is made.
   */
  checkModel(input: Readonly<{ builderRunId: string; accountId: string; projectId: string; conversationId: string; mode: 'BUILD' | 'PLAN' }>): Promise<void>
  git: Pick<ConexusGit, 'startTurn' | 'seedBundle' | 'acceptSnapshot' | 'moveMirror' | 'fastForwardMain' | 'listFilesLong' | 'archive' | 'readBlob'>
  /** How long the conversation's mirror waits after the last edit before it snapshots the checkout. */
  mirrorDebounceMs?: number
  materializeStarter?(input: Readonly<{ repositoryRoot: string; directCommand(command: string, args: readonly string[]): Promise<CommandResult>; writeFiles(files: SandboxFileInput[]): Promise<void> }>): Promise<unknown>
  /** Opens the run's connector access; the run ends it on every exit. Absent, it adds nothing to the agent's instructions. */
  openConnectorRun?(input: Readonly<{ projectId: string; builderRunId: string }>): Promise<ConnectorRun>
  /** The observational-memory settings of the person a run is for, read when it starts. Absent, the run keeps Mastra Code's defaults. */
  readMemorySettings?(accountId: string): Promise<MemorySettings>
  /** The Prévia's runner, which `conexus_run_operation` invokes the candidate's operations through. */
  invokeOperation?: CandidateOperationPorts['invoke']
  log(line: string): void
}>

type BuilderRunInput = Readonly<{
  projectId: string
  accountId: string
  conversationId: string
  executionId: string
  intent: string
  mode: 'BUILD' | 'PLAN'
  /** The prompt the run's turns load; the run's trace records it beside the run id. */
  promptVariant: PromptVariantId
  baseSourceRevision: string
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  bindMessage(messageId: string): Promise<void>
  setPhase(phase: BuilderRunningPhase): Promise<void>
  recordCandidate(sourceRevision: string): Promise<void>
  /** Records the conversation's mirror head as the turn ends; the Git ref stays the truth. */
  recordMirror(head: string): Promise<void>
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
  await materializeApplicationShape(input)
}

// Root-only folders: the base bundle the checkout is seeded from, and the tree the build compiles.
const SEED_ROOT = '/var/lib/conexus-seed'
const BUILD_ROOT = '/var/lib/conexus-build'

const quoted = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`

// Every workspace tool that can change the checkout, the shell included.
const CHECKOUT_WRITERS: ReadonlySet<string> = new Set([
  WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE, WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE, WORKSPACE_TOOLS.FILESYSTEM.DELETE,
  WORKSPACE_TOOLS.FILESYSTEM.MKDIR, WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT, WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND,
])
const MIRROR_DEBOUNCE_MS = 5_000
// A turn-end mirror after a failure waits no longer than this before the sandbox is destroyed.
const FAILED_TURN_MIRROR_MS = 30_000

type TurnMirror = Readonly<{
  schedule(): void
  /** The turn-end mirror: the candidate when the turn made one, else a snapshot of the checkout. Answers the mirror's head. */
  end(candidate: string | null): Promise<string | null>
  /** Ends the turn's mirror without writing, for a sandbox that is gone. */
  abandon(): void
}>

/**
 * The conversation's mirror during one turn (spec 0002 amendment, B1): the checkout as one commit on
 * the turn's start under `refs/conexus/conversations/<conversationId>`. Edits schedule a trailing,
 * debounced snapshot and the turn end writes the last one. One promise chain runs every write, so
 * two never share the checkout's mirror index; the ref moves by compare and swap from the head this
 * turn last saw. A failure is reported and never changes the run.
 */
const createTurnMirror = ({ git, projectId, conversationId, turnStart, head, source, debounceMs, fail }: Readonly<{
  git: BuilderRunPorts['git']
  projectId: string
  conversationId: string
  turnStart: string
  head: string | null
  source: RunSourceSandbox
  debounceMs: number
  fail(error: unknown): void
}>): TurnMirror => {
  let expected = head
  let written: string | null = null
  let chain: Promise<void> = Promise.resolve()
  let queued = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let ended: Promise<string | null> | undefined
  const serial = (work: () => Promise<void>): Promise<void> => {
    chain = chain.then(work).catch(fail)
    return chain
  }
  const snapshot = async (): Promise<void> => {
    const next = await pullSnapshot({
      git, projectId, snapshot: mirrorSnapshot(conversationId, turnStart), expected, unchangedFrom: written ?? turnStart,
      scratch: 'mirror', sandbox: source, checkout: SANDBOX_CHECKOUT, excluded: APPLICATION_CHECK_EXCLUDED,
    })
    if (next) expected = written = next
  }
  const stop = (): void => {
    clearTimeout(timer)
    timer = undefined
  }
  return Object.freeze({
    schedule: () => {
      if (ended) return
      stop()
      timer = setTimeout(() => {
        timer = undefined
        if (queued) return
        queued = true
        void serial(async () => {
          queued = false
          await snapshot()
        })
      }, debounceMs)
    },
    end: (candidate) => {
      stop()
      ended ??= serial(async () => {
        if (!candidate) return snapshot()
        await git.moveMirror(projectId, conversationId, { expected, next: candidate })
        expected = candidate
      }).then(() => expected)
      return ended
    },
    abandon: () => {
      stop()
      ended ??= Promise.resolve(expected)
    },
  })
}

/** Makes every checkout-changing workspace tool schedule the mirror, keeping the hooks the workspace already has. */
const mirrorAfterEdits = (workspace: Workspace, mirror: TurnMirror): void => {
  const existing = workspace.getToolsConfig() ?? {}
  const priorAfterToolCall = existing.hooks?.afterToolCall
  workspace.setToolsConfig({
    ...existing,
    hooks: {
      ...existing.hooks,
      afterToolCall: async (hookContext) => {
        if (CHECKOUT_WRITERS.has(hookContext.workspaceToolName)) mirror.schedule()
        await priorAfterToolCall?.(hookContext)
      },
    },
  })
}

export const createBuilderRunRuntime = (ports: BuilderRunPorts): BuilderRunRuntime => Object.freeze({
  execute: async (input) => {
    if (!UUID.test(input.executionId) || !UUID.test(input.projectId) || !UUID.test(input.conversationId) ||
      !OID.test(input.baseSourceRevision) || !input.intent.trim()) throw new Error('BUILDER_RUNTIME_INPUT_REFUSED')
    const base = input.baseSourceRevision
    const cancelled = (): boolean => input.signal?.aborted === true
    const keepaliveController = new AbortController()
    const runSignal = input.signal ? AbortSignal.any([input.signal, keepaliveController.signal]) : keepaliveController.signal
    let keepaliveFailure: Error | undefined

    // The start model's account is the person's own, else the installation's shared one; none
    // refuses the run before a sandbox exists, with the "connect a model" answer.
    await ports.checkModel({
      builderRunId: input.executionId, accountId: input.accountId, projectId: input.projectId, conversationId: input.conversationId, mode: input.mode,
    })
    const connectorRun = ports.openConnectorRun ? await ports.openConnectorRun({ projectId: input.projectId, builderRunId: input.executionId }) : null
    const sandbox = ports.createSandbox(input.executionId)
    let session: RunSession | undefined
    let release: (() => void) | undefined
    // Set once the checkout holds the turn's start; the turn end mirrors it however the run ends.
    let mirror: TurnMirror | undefined
    let incarnation: string | undefined
    const mirrorFailed = (error: unknown): void => {
      ports.log(`BUILDER_MIRROR_FAILED:${input.executionId}:${error instanceof Error ? error.message : String(error)}`)
    }
    let mirrorEnded: Promise<void> | undefined
    const endMirror = (candidate: string | null): Promise<void> => {
      mirrorEnded ??= (async () => {
        const head = await mirror?.end(candidate)
        if (head) await input.recordMirror(head).catch(mirrorFailed)
      })()
      return mirrorEnded
    }
    // The agent's turn is the only reader of the run's connector scope, so it ends with the session.
    const closeSession = async (): Promise<void> => {
      connectorRun?.end()
      const open = session
      session = undefined
      await open?.close()
    }
    try {
      // Project knowledge is read by the Hub from the base in the Conexus Git, never from the sandbox (AC-8).
      const knowledge = readProjectKnowledge(await ports.git.readBlob(input.projectId, base, PROJECT_KNOWLEDGE_PATH, PROJECT_KNOWLEDGE_READ_LIMIT))
      const memorySettings = await ports.readMemorySettings?.(input.accountId)
      // The paths the turn's start left with conflict markers, which the agent resolves first (decision 3).
      let conflicted: readonly string[] = []
      const bindContext: RunContextBinder = (requestContext) => {
        if (memorySettings) requestContext.setRaw(MEMORY_SETTINGS_KEY, memorySettings)
        requestContext.setRaw('conexusBuilderProjectId', input.projectId)
        requestContext.setRaw(RUN_ID_KEY, input.executionId)
        requestContext.setRaw(RUN_ACCOUNT_ID_KEY, input.accountId)
        requestContext.setRaw(CONEXUS_PROJECT_KNOWLEDGE_KEY, knowledge)
        requestContext.setRaw(CONEXUS_CONNECTOR_BRIEF_KEY, connectorRun?.brief ?? '')
        requestContext.setRaw(CONEXUS_PROMPT_VARIANT_KEY, input.promptVariant)
        requestContext.setRaw(CONEXUS_TURN_CONFLICTS_KEY, conflicted.join('\n'))
        connectorRun?.bind(requestContext)
      }

      await sandbox.start()
      // The first command replaces a VM E2B already reaped, so the run records the incarnation
      // that will actually run it.
      await sandbox.executeCommand('true', [], { env: {}, cwd: '/' })
      incarnation = sandbox.sandboxId
      if (!incarnation) throw new Error('BUILDER_SANDBOX_FRESH_CREATE_REQUIRED')
      await input.bindPhysicalSandbox(incarnation)
      release = await sandbox.holdOpen((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        ports.log(`BUILDER_SANDBOX_KEEPALIVE_FAILED:${input.executionId}:${message}`)
        keepaliveFailure ??= new Error('BUILDER_SANDBOX_KEEPALIVE_FAILED', { cause: { message } })
        keepaliveController.abort()
      }).catch((error: unknown) => {
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
      // The turn goes on from the conversation's files, with `main` brought in (spec 0002 amendment, B2).
      const turnStart = await ports.git.startTurn(input.projectId, input.conversationId, base)
      conflicted = turnStart.conflicted
      if (conflicted.length > 0) ports.log(`BUILDER_TURN_START_CONFLICT:${input.executionId}:${turnStart.conflicted.join(',').slice(0, 2_000)}`)
      await seedSandbox({ git: ports.git, projectId: input.projectId, turn: turnStart, sandbox: source, checkout: SANDBOX_CHECKOUT, seedFile: `${SEED_ROOT}/${input.executionId}.bundle` })
      mirror = createTurnMirror({
        git: ports.git, projectId: input.projectId, conversationId: input.conversationId, turnStart: turnStart.start, head: turnStart.mirror,
        source, debounceMs: ports.mirrorDebounceMs ?? MIRROR_DEBOUNCE_MS, fail: mirrorFailed,
      })
      mirrorAfterEdits(sandbox.workspace, mirror)

      // The Hub's check and its server build run from paths only root can write, so the agent and
      // the admission below see exactly the refusal the Conexus build would give, and neither can
      // change the gate.
      const installed = await asRoot([
        `cat > '${SERVER_BUILD_SCRIPT_PATH}.next' <<'CONEXUS_SERVER_BUILD_EOF'`,
        serverBuildScriptSource(),
        'CONEXUS_SERVER_BUILD_EOF',
        `cat > '${CHECK_SCRIPT_PATH}.next' <<'CONEXUS_CHECK_EOF'`,
        checkScriptSource(),
        'CONEXUS_CHECK_EOF',
        `chmod 555 '${SERVER_BUILD_SCRIPT_PATH}.next' '${CHECK_SCRIPT_PATH}.next'`,
        `mv '${SERVER_BUILD_SCRIPT_PATH}.next' '${SERVER_BUILD_SCRIPT_PATH}' && mv '${CHECK_SCRIPT_PATH}.next' '${CHECK_SCRIPT_PATH}'`,
      ].join('\n'))
      if (installed.exitCode !== 0) throw new Error('BUILDER_CHECK_INSTALL_REFUSED', { cause: { stderr: commandEvidence(installed.stderr) } })
      // A run that starts in Planejar builds in the same run once its plan is approved (AC-4).
      await (ports.materializeStarter ?? materializeRunStarter)({
        repositoryRoot: SANDBOX_CHECKOUT,
        directCommand: (command, args) => direct(command, [...args]),
        writeFiles: (files) => sandbox.writeFiles(files),
      })

      // The candidate's operations run before admission, in the Prévia's runner, on the run's own
      // connector scope; the caller is the run's account.
      const invokeOperation = ports.invokeOperation
      const runOperation = invokeOperation ? createOperationRunner({
        projectId: input.projectId,
        caller: { accountId: input.accountId, email: null, displayName: 'Construir' },
        buildServer: () => buildCandidateServer(
          { node: CHECK_NODE_PATH, script: SERVER_BUILD_SCRIPT_PATH, checkout: SANDBOX_CHECKOUT, out: RUN_OPERATION_OUT },
          (script, args) => onIncarnation(() => sandbox.executeCommand('sh', ['-c', script, 'conexus-run-operation', ...args], {
            timeout: 120_000, cwd: '/', env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: `/home/${SANDBOX_AGENT_USER}`, LANG: 'C.UTF-8' },
          })),
          (path) => sandbox.readAgentFile(path),
        ),
        openConnectorPort: async () => (connectorRun ? connectorRun.openHandlerPort() : null),
        invoke: invokeOperation,
      }) : undefined
      session = await ports.openSession({
        projectId: input.projectId, conversationId: input.conversationId, builderRunId: input.executionId,
        workspace: sandbox.workspace, bindContext,
        runCheck: async () => (await sandbox.runCheck({ root: SANDBOX_CHECKOUT, out: AGENT_CHECK_OUT, collect: false, user: 'agent' })).report,
        ...(runOperation ? { runOperation } : {}),
      })
      await input.setPhase('AGENT')
      const turn = await session.sendTurn(input.intent, runSignal)
      if (turn.continuations > 0) ports.log(`BUILDER_AGENT_CONTINUED:${turn.continuations}:${input.executionId}`)
      if (keepaliveFailure) throw keepaliveFailure
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

      // A turn that changed nothing still offers the files it started from when they are not on `main`.
      const changed = await pullSnapshot({
        git: ports.git, projectId: input.projectId, snapshot: candidateSnapshot(input.executionId, turnStart.start),
        scratch: 'candidate', sandbox: source, checkout: SANDBOX_CHECKOUT, excluded: APPLICATION_CHECK_EXCLUDED,
      })
      const result = changed ?? (turnStart.start === base ? null : turnStart.start)
      await endMirror(result)
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

      // Admission (AC-9, AC-14): the candidate's AGENTS.md is within the rule and the Hub's own check
      // passes on the candidate's tree, taken from the Conexus Git once every process of the agent's
      // user is gone. The check runs as root on that copy and drops to the agent's user for every step
      // that executes application code; nothing in the tree is ever run as the gate.
      await input.setPhase('SOURCE_ADMISSION')
      const refusal = refuseCandidateKnowledge(await ports.git.readBlob(input.projectId, result, PROJECT_KNOWLEDGE_PATH, PROJECT_KNOWLEDGE_READ_LIMIT))
      if (refusal) throw new CandidateRefused('BUILDER_AGENTS_MD_REFUSED', refusal)
      await sh('kill -KILL -1 2>/dev/null; true')
      const candidateTar = `${SEED_ROOT}/${input.executionId}.candidate.tar`
      await writeRootFile(candidateTar, await ports.git.archive(input.projectId, result, []))
      const checkRoot = `${BUILD_ROOT}/${input.executionId}.admission`
      const unpackedCandidate = await asRoot([
        `rm -rf ${quoted(BUILD_ROOT)}`,
        `mkdir -p -m 711 ${quoted(BUILD_ROOT)}`,
        `mkdir -m 755 ${quoted(checkRoot)}`,
        `tar -x -C ${quoted(checkRoot)} -f ${quoted(candidateTar)}`,
        `rm -f ${quoted(candidateTar)}`,
      ].join(' && '))
      if (unpackedCandidate.exitCode !== 0) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
      const admission = await sandbox.runCheck({ root: checkRoot, out: `${checkRoot}.dist`, collect: false, user: 'root' })
      ports.log(`BUILDER_CHECK:admission:${input.executionId}:${checkSummary(admission.report)}`)
      const refusedStep = refusingStep(admission.report)
      if (refusedStep) throw new CandidateRefused('BUILDER_CHECK_FAILED', failedStepEvidence(refusedStep))

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
          `mkdir -p -m 711 '${BUILD_ROOT}'`,
          `mkdir -m 755 '${buildRoot}'`,
        ].join(' && '))
        if (prepared.exitCode !== 0) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
        await writeRootFile(tree, await ports.git.archive(input.projectId, result, archived))
        const unpacked = await asRoot(`tar -x -C '${buildRoot}' -f '${tree}' && rm -f '${tree}'`)
        if (unpacked.exitCode !== 0) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
        // The Preview is built by the steps the model saw. A source the check refuses, or a page
        // that threw or drew nothing, leaves the admitted source in place without a Preview.
        const built = await sandbox.runCheck({ root: buildRoot, out: `${buildRoot}/dist`, collect: true, user: 'root' })
        ports.log(`BUILDER_CHECK:preview:${input.executionId}:${checkSummary(built.report)}`)
        const refused = refusingStep(built.report)
        const notBooting = unrenderedBootStep(built.report)
        const bootProblems = failedBootStep(built.report)
        const renderedWithProblems = bootProblems && !notBooting ? bootProblems : null
        if (renderedWithProblems) ports.log(`BUILDER_CHECK_BOOT_PROBLEMS:${input.executionId}:${JSON.stringify(renderedWithProblems.problems).slice(0, 2_000)}`)
        if (refused) applicationBuild = { kind: 'BUILD_FAILED', code: 'APPLICATION_COMPILATION_FAILED', detail: failedStepEvidence(refused) }
        else if (notBooting) applicationBuild = { kind: 'BUILD_FAILED', code: 'APPLICATION_SMOKE_FAILED', detail: failedStepEvidence(notBooting) }
        else if (built.files) applicationBuild = { kind: 'BUILT', compiledApplication: {
          projectId: input.projectId, executionId: input.executionId, sourceRevision: result,
          templateRef: TEMPLATE_REF, recipeSha256: RECIPE_SHA256, files: built.files,
        }, ...(renderedWithProblems ? { bootProblems: failedStepEvidence(renderedWithProblems) } : {}) }
        else throw new Error('APPLICATION_CHECK_UNREADABLE')
      } catch (error) {
        const code = error instanceof Error ? error.message : ''
        if (code !== 'APPLICATION_COMPILATION_FAILED' && code !== 'BUILDER_APPLICATION_SOURCE_REFUSED' &&
          !code.startsWith('APPLICATION_SMOKE_')) throw error
        applicationBuild = { kind: 'BUILD_FAILED', code }
      }
      return Object.freeze({ ...scope, kind: 'SOURCE_ADMITTED' as const, resultSourceRevision: result, applicationBuild })
    } catch (error) {
      const failure = keepaliveFailure ?? error
      // The run records only its failure code; a failure that carries command evidence says why.
      if (failure instanceof Error && failure.cause !== undefined) ports.log(`BUILDER_RUN_FAILED:${input.executionId}:${failure.message} ${JSON.stringify(failure.cause)}`)
      throw failure
    } finally {
      release?.()
      await closeSession().catch(() => undefined)
      // A lapsed keepalive or a replaced VM has no checkout left to mirror; the edit-time mirrors hold
      // what reached it. Otherwise the turn's files are mirrored before the sandbox goes.
      if (keepaliveFailure || sandbox.sandboxId !== incarnation) mirror?.abandon()
      else await Promise.race([endMirror(null), new Promise((settle) => { setTimeout(settle, FAILED_TURN_MIRROR_MS).unref?.() })])
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
export const createControllerRunSessions = ({ controller, runContexts, runWorkspaces, runTools }: Readonly<{
  controller: AgentController
  /** The live runs' context binders by session scope, which the browser mount applies to every request it serves a run. */
  runContexts: Map<string, RunContextBinder>
  /** The live runs' workspaces by run id, which the controller's workspace resolver hands a run's session. */
  runWorkspaces: Map<string, Workspace>
  /** The live runs' checks and operation runs by run id, which the controller's `conexus_check` and `conexus_run_operation` read. */
  runTools: Map<string, RunTools>
}>): BuilderRunPorts['openSession'] => async ({ projectId, conversationId, builderRunId, workspace, bindContext, runCheck, runOperation }) => {
  const resourceId = projectResourceId(projectId)
  const scope = builderRunScope(builderRunId)
  const requestContext = new RequestContext()
  bindContext(requestContext)
  runWorkspaces.set(builderRunId, workspace)
  runTools.set(builderRunId, { check: runCheck, runOperation })
  runContexts.set(scope, bindContext)
  const forget = (): void => {
    runContexts.delete(scope)
    runWorkspaces.delete(builderRunId)
    runTools.delete(builderRunId)
  }
  const close = async (): Promise<void> => {
    forget()
    const deleted = await controller.deleteSession({ resourceId, scope })
    if (!deleted || await controller.getSessionByResource(resourceId, scope)) throw new Error('BUILDER_SESSION_DELETE_FAILED')
    // The conversation's session, if the browser has it open, keeps the mode and model it had when it
    // was created; a plan's approval writes the new mode to the thread from this run's own scope, so
    // the conversation's in-memory session never sees it (item C). Rehydrating from the thread is
    // Mastra's own mechanism for this, and it emits `mode_changed` for the browser to pick up.
    const conversation = await controller.getSessionByResource(resourceId, `conversation:${conversationId}`)
    await conversation?.thread.loadMetadata()
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
      let continuations = 0
      // A continuation is the Hub's own message; the person's request stays the turn's anchor.
      const detach = session.subscribe((event) => {
        if (event.type === 'message_start' && continuations === 0 && isUserAuthoredMessage(event.message)) userMessageId = event.message.id
      })
      const abort = (): void => { session.abort() }
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
      try {
        let reason: string = await sendBuilderTurnMessage(session, { content }, { requestContext, ...(signal ? { signal } : {}), onContinuation: (count) => { continuations = count } }) ?? 'unknown'
        // A plan waiting for approval, or a question waiting for an answer, keeps the run active: the
        // person answers through the browser, and the turn goes on until the agent ends for good.
        while (reason === 'suspended') reason = await nextAgentEnd(session, signal)
        const messages = await session.thread.listActiveMessages() as readonly RecordedMessage[]
        userMessageId ??= [...messages].reverse().find(isUserAuthoredMessage)?.id
        const summary = messages.slice(messages.findIndex((message) => message.id === userMessageId) + 1)
          .filter((message) => message.role === 'assistant').map((message) => messageText(message as Parameters<typeof messageText>[0])).filter(Boolean).join('\n')
        return { reason, userMessageId, summary, continuations }
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
    runCheck: ({ root, out, collect, user }) => checkApplicationInSandbox(sandbox.e2b, { root, out, collect, user: user === 'root' ? 'root' : SANDBOX_AGENT_USER }),
    holdOpen: (onLapse: (error: unknown) => void) => sandbox.holdOpen(onLapse),
    destroy: () => sandbox.destroy(),
  })
}
