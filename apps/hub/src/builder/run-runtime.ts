import type { AgentController } from '@mastra/core/agent-controller'
import { RequestContext } from '@mastra/core/request-context'
import { Sandbox } from 'e2b'
import type { CommandResult, ExecuteCommandOptions, SandboxFileInput, Workspace } from '@mastra/core/workspace'
import { checkApplicationInSandbox, RECIPE_SHA256, TEMPLATE_REF } from './application-artifact-runtime.js'
import type { ApplicationCheckRun } from './application-artifact-runtime.js'
import type { CheckReport } from './application-check.js'
import { CHECK_NODE_PATH, CHECK_SCRIPT_PATH, checkScriptSource, checkSummary, failedBootStep, failedStepEvidence, refusingStep, unrenderedBootStep } from './application-check.js'
import { APPLICATION_CHECK_EXCLUDED, commandEvidence, materializeApplicationShape, materializeFixedApplicationStarter } from './application-starter.js'
import { SERVER_BUILD_SCRIPT_PATH, serverBuildScriptSource } from './application-server-build.js'
import { buildCandidateServer, createOperationRunner } from './run-operation.js'
import type { CandidateOperationPorts, RunOperation } from './run-operation.js'
import { CONVERSATION_ID_KEY, RUN_ACCOUNT_ID_KEY, RUN_ID_KEY } from './model-routing.js'
import { candidateSnapshot, mirrorSnapshot, pullSnapshot, startCheckout } from './conexus-git.js'
import type { ConexusGit, RunSourceSandbox } from './conexus-git.js'
import { projectResourceId } from './conversations.js'
import { CONEXUS_CONNECTOR_BRIEF_KEY, CONEXUS_PROJECT_INSTRUCTIONS_KEY, CONEXUS_PROJECT_MEMORY_KEY, CONEXUS_PROJECT_NAME_KEY, CONEXUS_PROJECT_NEW_KEY, CONEXUS_TURN_CONFLICTS_KEY, CONEXUS_TURN_DATE_KEY, type RunTools } from './harness/index.js'
import { turnDate } from './harness/prompt.js'
import { createRunTiming } from './run-timing.js'
import { PROJECT_FILE_READ_LIMIT, PROJECT_INSTRUCTIONS_PATH, PROJECT_MEMORY_PATH, readProjectInstructions, readProjectMemory } from './project-context.js'
import { collectEgress, ensureEgressLog } from './egress-log.js'
import { admitApplicationTree, isUserAuthoredMessage, messageText, readParkedCalls, sendBuilderTurnMessage, SERVER_SOURCE_ROOTS } from './runtime.js'
import type { ApplicationBuildOutcome, BuilderStep, CodingWorkerResult, ParkedResult, SourceAdmittedResult } from './runtime.js'
import { CHECKOUT_WRITER_TOOLS, createConversationSandbox, createRunWorkspace, SANDBOX_AGENT_USER, SANDBOX_CHECKOUT } from './sandbox.js'
import type { BuilderRunningPhase } from './store.js'

/** What a run needs of its conversation's sandbox; the E2B one in production, a fake in tests. */
type RunSandbox = Readonly<{
  readonly sandboxId: string | undefined
  start(): Promise<void>
  executeCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>
  writeFiles(files: SandboxFileInput[]): Promise<void>
  runAsRoot(script: string, env: Record<string, string>): Promise<CommandResult>
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
  readAgentFile(path: string): Promise<Uint8Array>
  readAgentFileStream(path: string): Promise<ReadableStream<Uint8Array>>
  // Runs the Hub's check on the tree at `root` as root, its steps as the agent's user, writing the
  // build to `out`; `collect` also reads the build back when the source passed.
  runCheck(input: Readonly<{ root: string; out: string; collect: boolean; user: 'root' | 'agent' }>): Promise<ApplicationCheckRun>
  holdOpen(onLapse: (error: unknown) => void): Promise<() => void>
  /** The agent's workspace on this sandbox. */
  workspace: Workspace
  /** The turn's end: the VM pauses with its files and its checkout, and the next `start()` resumes it. */
  pause(): Promise<void>
  /** A broken VM: it is killed, and the conversation's next turn gets a new one. */
  kill(): Promise<void>
}>

/** What the Hub knows of a conversation's VM between turns (spec 0002 amendment, B3). */
type ConversationSandboxRef = Readonly<{ conversationId: string; providerSandboxId: string | null }>

// Where the agent's own check writes its build; the agent's user owns it, and no run reads it back.
const AGENT_CHECK_OUT = '/tmp/conexus-agent-check'
// Where `conexus_run_operation` builds the server half, as the agent's user, before reading it back.
const RUN_OPERATION_OUT = '/tmp/conexus-run-operation'

/** How the agent's turn ended. */
type AgentTurn = Readonly<{ reason: string; userMessageId: string | undefined; summary: string; continuations: number }>

/** The conversation's session on the Builder controller for one turn, scoped to builder:<conversationId> on its thread. */
type RunSession = Readonly<{
  /** Ends `suspended` when the agent asks the person something: the turn does not wait for the answer. */
  sendTurn(content: string, signal?: AbortSignal): Promise<AgentTurn>
  /** The same turn, going on from the answer to the call a parked run waited on. */
  resumeTurn(resume: ParkedAnswer, signal?: AbortSignal): Promise<AgentTurn>
  /** The agent's turn is over: its context and tools are forgotten, and the session stays for the run's remaining phases. */
  end(): Promise<void>
  /** The run is over: ends the turn and deletes the session, which Mastra keeps in memory until it is deleted. */
  release(): Promise<void>
  /** The run parks on a call: the session goes, and the call stays in Mastra's storage for the answer to resume. */
  park(): Promise<void>
}>

/** The person's answer to the call a parked run waits on. */
type ParkedAnswer = Readonly<{ toolCallId: string; resumeData: unknown }>

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
  /** The conversation's sandbox: the same one for every turn while it lives, resumed or created by `start()`. */
  openSandbox(ref: ConversationSandboxRef): RunSandbox
  openSession(input: Readonly<{
    projectId: string; conversationId: string; builderRunId: string; workspace: Workspace; bindContext: RunContextBinder
    /** The check `conexus_check` runs: the Hub's script on the checkout, as the agent's user. */
    runCheck: () => Promise<CheckReport>
    /** The operation run `conexus_run_operation` does; absent when the Hub has no Prévia runner. */
    runOperation?: RunOperation
  }>): Promise<RunSession>
  /** A stop on a parked run: its open call is settled as denied in the thread, so no card is left asking. */
  discardParked(input: Readonly<{ projectId: string; conversationId: string }>): Promise<void>
  /**
   * Refuses a run before a sandbox exists when the model it starts on has no usable account. It
   * checks that one model only: the account for each later call is looked up when the call is made.
   */
  checkModel(input: Readonly<{ builderRunId: string; accountId: string; projectId: string; conversationId: string }>): Promise<void>
  git: Pick<ConexusGit, 'startTurn' | 'seedBundle' | 'acceptSnapshot' | 'moveMirror' | 'fastForwardMain' | 'isStarter' | 'listFilesLong' | 'archive' | 'readBlob'>
  /** How long the conversation's mirror waits after the last edit before it snapshots the checkout. */
  mirrorDebounceMs?: number
  materializeStarter?(input: Readonly<{ repositoryRoot: string; directCommand(command: string, args: readonly string[]): Promise<CommandResult>; writeFiles(files: SandboxFileInput[]): Promise<void> }>): Promise<unknown>
  /** Opens the run's connector access; the run ends it on every exit. Absent, it adds nothing to the agent's instructions. */
  openConnectorRun?(input: Readonly<{ projectId: string; builderRunId: string }>): Promise<ConnectorRun>
  /** The Project's display name, read when a turn starts. */
  readProjectName(input: Readonly<{ accountId: string; projectId: string }>): Promise<string>
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
  /** The answer to the call this run parked on: the run goes on from it instead of sending `intent` again. */
  resume?: ParkedAnswer
  baseSourceRevision: string
  /** The E2B sandbox the conversation's last turn ran on, which this turn resumes; null for none recorded. */
  providerSandboxId: string | null
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  bindMessage(messageId: string): Promise<void>
  setPhase(phase: BuilderRunningPhase): Promise<void>
  recordCandidate(sourceRevision: string): Promise<void>
  /** Records the conversation's mirror head as the turn ends; the Git ref stays the truth. */
  recordMirror(head: string): Promise<void>
  /**
   * Hands over the closing of the run's session instead of doing it as `execute` ends, so the caller
   * can publish the state the run ended in to the session's stream first, and then closes it.
   */
  holdSession?(close: () => Promise<void>): void
  signal?: AbortSignal
}>

export type BuilderRunRuntime = Readonly<{
  /** A stop on a parked run: its open call is settled as denied in the thread. */
  discardParked: BuilderRunPorts['discardParked']
  execute(input: BuilderRunInput): Promise<CodingWorkerResult | ParkedResult | SourceAdmittedResult>
}>

/** A candidate the Hub refuses before admission, with the reason the next turn reads. */
export class CandidateRefused extends Error {
  constructor(code: 'BUILDER_CHECK_FAILED', readonly detail: string) {
    super(code)
  }
}

const OID = /^[0-9a-f]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const materializeRunStarter: NonNullable<BuilderRunPorts['materializeStarter']> = async (input) => {
  await materializeFixedApplicationStarter(input)
  await materializeApplicationShape(input)
}

// Root-only folders: the base bundle the checkout is seeded from, and the tree the build compiles.
const SEED_ROOT = '/var/lib/conexus-seed'
const BUILD_ROOT = '/var/lib/conexus-build'

const quoted = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`

const MIRROR_DEBOUNCE_MS = 5_000
// A turn-end mirror after a failure waits no longer than this before the sandbox pauses.
const FAILED_TURN_MIRROR_MS = 30_000
// One seed bundle per VM, replaced at every turn that fetches one.
const SEED_FILE = `${SEED_ROOT}/turn.bundle`

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
const createTurnMirror = ({ git, projectId, conversationId, turnStart, head, source, excluded, debounceMs, fail }: Readonly<{
  git: BuilderRunPorts['git']
  projectId: string
  conversationId: string
  turnStart: string
  head: string | null
  source: RunSourceSandbox
  excluded: readonly string[]
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
      scratch: 'mirror', sandbox: source, checkout: SANDBOX_CHECKOUT, excluded,
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

// The turn whose mirror each conversation workspace feeds. The hook goes on once, at the workspace's
// first turn, so a kept workspace never stacks one per turn.
const fedMirrors = new WeakMap<Workspace, { current: TurnMirror }>()

/** Makes every checkout-changing workspace tool schedule this turn's mirror, keeping the hooks the workspace already has. */
const mirrorAfterEdits = (workspace: Workspace, mirror: TurnMirror): void => {
  const fed = fedMirrors.get(workspace)
  if (fed) {
    fed.current = mirror
    return
  }
  const slot = { current: mirror }
  fedMirrors.set(workspace, slot)
  const existing = workspace.getToolsConfig() ?? {}
  const priorAfterToolCall = existing.hooks?.afterToolCall
  workspace.setToolsConfig({
    ...existing,
    hooks: {
      ...existing.hooks,
      afterToolCall: async (hookContext) => {
        if (CHECKOUT_WRITER_TOOLS.has(hookContext.workspaceToolName)) slot.current.schedule()
        await priorAfterToolCall?.(hookContext)
      },
    },
  })
}

export const createBuilderRunRuntime = (ports: BuilderRunPorts): BuilderRunRuntime => Object.freeze({
  discardParked: ports.discardParked,
  execute: async (input) => {
    if (!UUID.test(input.executionId) || !UUID.test(input.projectId) || !UUID.test(input.conversationId) ||
      !OID.test(input.baseSourceRevision) || !input.intent.trim()) throw new Error('BUILDER_RUNTIME_INPUT_REFUSED')
    const base = input.baseSourceRevision
    const timing = createRunTiming()
    // What no commit of this run holds: generated files.
    const excluded = APPLICATION_CHECK_EXCLUDED
    const cancelled = (): boolean => input.signal?.aborted === true
    const keepaliveController = new AbortController()
    const runSignal = input.signal ? AbortSignal.any([input.signal, keepaliveController.signal]) : keepaliveController.signal
    let keepaliveFailure: Error | undefined

    // The start model's account is the person's own, else the installation's shared one; none
    // refuses the run before a sandbox exists, with the "connect a model" answer.
    await ports.checkModel({
      builderRunId: input.executionId, accountId: input.accountId, projectId: input.projectId, conversationId: input.conversationId,
    })
    const connectorRun = ports.openConnectorRun ? await ports.openConnectorRun({ projectId: input.projectId, builderRunId: input.executionId }) : null
    const sandbox = ports.openSandbox({ conversationId: input.conversationId, providerSandboxId: input.providerSandboxId })
    let session: RunSession | undefined
    let release: (() => void) | undefined
    // Set once the checkout holds the turn's start; the turn end mirrors it however the run ends.
    let mirror: TurnMirror | undefined
    let incarnation: string | undefined
    // Set before the run's `start()`: from then on the instance may hold a VM this run made or resumed.
    let started = false
    let unusable = false
    // The leg ended on a question for the person, so the session is parked, not released.
    let parked = false
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
    // The agent's turn is the only reader of the run's connector scope, so it ends with the turn.
    const endTurn = async (): Promise<void> => {
      connectorRun?.end()
      await session?.end()
    }
    try {
      // The Project's instructions and memory are read by the Hub from the base in the Conexus Git, never from the sandbox (AC-9).
      const readProjectFile = (path: string) => ports.git.readBlob(input.projectId, base, path, PROJECT_FILE_READ_LIMIT).catch(() => undefined)
      const instructions = readProjectInstructions(await readProjectFile(PROJECT_INSTRUCTIONS_PATH))
      const memory = readProjectMemory(await readProjectFile(PROJECT_MEMORY_PATH))
      const projectName = await ports.readProjectName({ accountId: input.accountId, projectId: input.projectId })
      const date = turnDate()
      const isNew = await ports.git.isStarter(input.projectId, base)
      // The paths the turn's start left with conflict markers, which the agent resolves first (decision 3).
      let conflicted: readonly string[] = []
      const bindContext: RunContextBinder = (requestContext) => {
        requestContext.setRaw('conexusBuilderProjectId', input.projectId)
        requestContext.setRaw(RUN_ID_KEY, input.executionId)
        requestContext.setRaw(CONVERSATION_ID_KEY, input.conversationId)
        requestContext.setRaw(RUN_ACCOUNT_ID_KEY, input.accountId)
        requestContext.setRaw(CONEXUS_PROJECT_NAME_KEY, projectName)
        requestContext.setRaw(CONEXUS_TURN_DATE_KEY, date)
        requestContext.setRaw(CONEXUS_PROJECT_NEW_KEY, isNew ? 'true' : '')
        requestContext.setRaw(CONEXUS_PROJECT_INSTRUCTIONS_KEY, instructions)
        requestContext.setRaw(CONEXUS_PROJECT_MEMORY_KEY, memory)
        requestContext.setRaw(CONEXUS_CONNECTOR_BRIEF_KEY, connectorRun?.brief ?? '')
        requestContext.setRaw(CONEXUS_TURN_CONFLICTS_KEY, conflicted.join('\n'))
        connectorRun?.bind(requestContext)
      }

      // The conversation's VM resumes when E2B still has it; a new one is created only when it has none.
      started = true
      await sandbox.start()
      // The first command replaces a VM E2B already reaped, so the run records the incarnation
      // that will actually run it.
      await sandbox.executeCommand('true', [], { env: {}, cwd: '/' })
      incarnation = sandbox.sandboxId
      if (!incarnation) throw new Error('BUILDER_SANDBOX_ID_UNAVAILABLE')
      await input.bindPhysicalSandbox(incarnation)
      release = await sandbox.holdOpen((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        ports.log(`BUILDER_SANDBOX_KEEPALIVE_FAILED:${input.executionId}:${message}`)
        keepaliveFailure ??= new Error('BUILDER_SANDBOX_KEEPALIVE_FAILED', { cause: { message } })
        keepaliveController.abort()
      }).catch((error: unknown) => {
        throw new Error('BUILDER_SANDBOX_KEEPALIVE_FAILED', { cause: { message: error instanceof Error ? error.message : String(error) } })
      })
      timing.mark('sandbox')
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
      const source: RunSourceSandbox = { direct, writeRootFile, readAgentFile: (path) => sandbox.readAgentFile(path), readAgentFileStream: (path) => sandbox.readAgentFileStream(path) }
      if ((await direct('id', ['-un'])).stdout.trim() !== SANDBOX_AGENT_USER) throw new Error('BUILDER_SANDBOX_AGENT_USER_REQUIRED')
      // Recording which hosts the sandbox reaches is evidence, never a gate: a recorder that will not
      // start is logged and the turn goes on.
      await ensureEgressLog({ asRoot, writeRootFile }).catch((error: unknown) => {
        ports.log(`BUILDER_SANDBOX_EGRESS_START_FAILED:${input.executionId}:${error instanceof Error ? error.message : String(error)}`)
      })

      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      // The turn goes on from the conversation's files, with `main` brought in (spec 0002 amendment, B2).
      const turnStart = await ports.git.startTurn(input.projectId, input.conversationId, base)
      conflicted = turnStart.conflicted
      if (conflicted.length > 0) ports.log(`BUILDER_TURN_START_CONFLICT:${input.executionId}:${turnStart.conflicted.join(',').slice(0, 2_000)}`)
      // A checkout that cannot take the start, even seeded again, is one the agent broke: the VM goes.
      const checkoutStart = await startCheckout({ git: ports.git, projectId: input.projectId, turn: turnStart, sandbox: source, checkout: SANDBOX_CHECKOUT, seedFile: SEED_FILE })
        .catch((error: unknown) => { unusable = true; throw error })
      ports.log(`BUILDER_TURN_CHECKOUT:${input.executionId}:${checkoutStart}:${incarnation}`)
      timing.mark('seed')
      mirror = createTurnMirror({
        git: ports.git, projectId: input.projectId, conversationId: input.conversationId, turnStart: turnStart.start, head: turnStart.mirror,
        source, excluded, debounceMs: ports.mirrorDebounceMs ?? MIRROR_DEBOUNCE_MS, fail: mirrorFailed,
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
      await (ports.materializeStarter ?? materializeRunStarter)({
        repositoryRoot: SANDBOX_CHECKOUT,
        directCommand: (command, args) => direct(command, [...args]),
        writeFiles: (files) => sandbox.writeFiles(files),
      })
      timing.mark('starter')

      // The candidate's operations run before admission, in the Prévia's runner, on the run's own
      // connector scope; the caller is the run's account.
      const invokeOperation = ports.invokeOperation
      const runOperation = invokeOperation ? createOperationRunner({
        projectId: input.projectId,
        caller: { accountId: input.accountId, email: null, displayName: 'Builder' },
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
      timing.mark('session')
      await input.setPhase('AGENT')
      const turn = await (input.resume ? session.resumeTurn(input.resume, runSignal) : session.sendTurn(input.intent, runSignal))
      if (turn.continuations > 0) ports.log(`BUILDER_AGENT_CONTINUED:${turn.continuations}:${input.executionId}`)
      if (keepaliveFailure) throw keepaliveFailure
      if (turn.reason === 'aborted') ports.log(`BUILDER_AGENT_END:aborted:${input.executionId}`)
      if (!turn.userMessageId) throw new Error('BUILDER_MESSAGE_ID_UNAVAILABLE')
      await input.bindMessage(turn.userMessageId)
      // An agent that ends aborted without the person's stop failed on its own, for example a model
      // call it could not authenticate; reporting that as their cancellation would be false.
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      // The agent asked the person something: nothing here waits for the answer. The leg ends, its
      // work is mirrored and the sandbox paused by the cleanup below, and the answer starts the next.
      if (turn.reason === 'suspended') {
        parked = true
        await endTurn().catch((error: unknown) => {
          ports.log(`BUILDER_SESSION_CLOSE_FAILED:${input.executionId}:${error instanceof Error ? error.message : String(error)}`)
        })
        timing.mark('agent')
        return Object.freeze({
          runtimeId: 'conexus-builder-e2b-v1' as const, projectId: input.projectId, executionId: input.executionId, sandboxId: incarnation,
          baseSourceRevision: base, summary: turn.summary.trim(), kind: 'PARKED' as const,
        })
      }
      if (turn.reason !== 'complete') throw new Error('BUILDER_MODEL_INCOMPLETE')
      await endTurn().catch((error: unknown) => {
        ports.log(`BUILDER_SESSION_CLOSE_FAILED:${input.executionId}:${error instanceof Error ? error.message : String(error)}`)
      })
      timing.mark('agent')

      // A turn that changed nothing still offers the files it started from when they are not on `main`.
      const changed = await pullSnapshot({
        git: ports.git, projectId: input.projectId, snapshot: candidateSnapshot(input.executionId, turnStart.start),
        scratch: 'candidate', sandbox: source, checkout: SANDBOX_CHECKOUT, excluded,
      })
      const result = changed ?? (turnStart.start === base ? null : turnStart.start)
      await endMirror(result)
      timing.mark('pull')
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

      // Admission (AC-9, AC-14): the Hub's own check passes on the candidate's tree, taken from the Conexus Git once every process of the agent's
      // user is gone. The check runs as root on that copy and drops to the agent's user for every step
      // that executes application code; nothing in the tree is ever run as the gate.
      await input.setPhase('SOURCE_ADMISSION')
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
      timing.mark('admission')

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
      timing.mark('compile')
      return Object.freeze({ ...scope, kind: 'SOURCE_ADMITTED' as const, resultSourceRevision: result, applicationBuild })
    } catch (error) {
      const failure = keepaliveFailure ?? error
      // The run records only its failure code; a failure that carries command evidence says why.
      if (failure instanceof Error && failure.cause !== undefined) ports.log(`BUILDER_RUN_FAILED:${input.executionId}:${failure.message} ${JSON.stringify(failure.cause)}`)
      throw failure
    } finally {
      release?.()
      // Stop included, every turn end on a live VM kills what the agent left running, so nothing
      // changes the files after the turn-end mirror or runs on while the VM is paused. A lapsed
      // keepalive or a replaced VM has no checkout left to mirror; the edit-time mirrors hold what
      // reached it, and the VM is killed so the next turn rebuilds from the mirror.
      let live = incarnation !== undefined && !keepaliveFailure && !unusable && sandbox.sandboxId === incarnation
      if (live) {
        await sandbox.executeCommand('sh', ['-c', 'kill -KILL -1 2>/dev/null; true'], { timeout: 30_000, cwd: '/', env: {} }).catch((error: unknown) => {
          ports.log(`BUILDER_AGENT_PROCESSES_KILL_FAILED:${input.executionId}:${error instanceof Error ? error.message : String(error)}`)
        })
        live = sandbox.sandboxId === incarnation
      }
      if (live) {
        await collectEgress({
          asRoot: (script) => sandbox.runAsRoot(script, {}),
          writeRootFile: (path, bytes) => sandbox.writeRootFile(path, bytes),
          readAgentFile: (path) => sandbox.readAgentFile(path),
          log: ports.log,
          executionId: input.executionId,
          conversationId: input.conversationId,
        })
        live = sandbox.sandboxId === incarnation
      }
      if (live) await Promise.race([endMirror(null), new Promise((settle) => { setTimeout(settle, FAILED_TURN_MIRROR_MS).unref?.() })])
      else mirror?.abandon()
      const failed = (code: string) => (error: unknown): void => {
        ports.log(`${code}:${input.executionId}:${error instanceof Error ? error.message : String(error)}`)
      }
      // The run owns the session it opened, whatever way it ended: Mastra frees none by itself.
      connectorRun?.end()
      const closeSession = async (): Promise<void> => {
        await (parked ? session?.park() : session?.release())?.catch(failed('BUILDER_SESSION_RELEASE_FAILED'))
      }
      if (input.holdSession) input.holdSession(closeSession)
      else await closeSession()
      // The pause takes seconds and nothing waits for it: the conversation's next `start()` does.
      if (live) void sandbox.pause().catch(failed('BUILDER_SANDBOX_PAUSE_FAILED'))
      // A run that started and is not live kills its VM, a failed start included: no VM it made or
      // resumed is left running or paused behind it.
      else if (started) await sandbox.kill().catch(failed('BUILDER_SANDBOX_KILL_FAILED'))
      ports.log(timing.line(input.executionId))
    }
  },
})

type RecordedMessage = Readonly<{ id: string; role?: string; content?: unknown }>

/**
 * How long a turn may go without one event from its session while the agent is working. A storage
 * read that never settles (Mastra's `getWorkflowRunById` was seen to) emits no error and no end, and
 * neither `session.abort()` nor Mastra's `untilIdle` timer, which watches background tasks, settles
 * it. It is twice one model step's budget, so a slow step or a long tool call never reaches it. A
 * turn that asks the person something ends there, so no wait on an answer is ever timed.
 */
const TURN_SILENCE_MS = 10 * 60_000
const STALLED_SESSION_DELETE_MS = 5_000

/** The conversation's own session scope: never the browser's `conversation:<id>`, which has no workspace. */
export const conversationRunScope = (conversationId: string): string => `builder:${conversationId}`

type ControllerSession = Awaited<ReturnType<AgentController['createSession']>>

/**
 * The conversation's session on the Builder controller for one run (spec 0002 amendment, B3): one
 * session per run on the conversation's thread, on that conversation's sandbox workspace, with every
 * tool allowed without asking (the workspace lists the tools the Builder has), and a turn that
 * lasts until the agent is done, including while it waits for the person to answer a question
 * (AC-16). The context, the check and the operation run are the turn's own. Mastra keeps a live
 * session until it is deleted, so the run deletes its own; the thread, which holds the
 * conversation, is in storage.
 */
export const createControllerRunSessions = ({ controller, runContexts, conversationWorkspaces, runTools, readDefaultModel, turnSilenceMs = TURN_SILENCE_MS }: Readonly<{
  controller: AgentController
  /** How long a working turn may go without an event before it settles as `BUILDER_AGENT_STALLED`. */
  turnSilenceMs?: number
  /** The installation's default Builder model, which a conversation with no model of its own starts on. */
  readDefaultModel(): Promise<string | null>
  /** The live turns' context binders by session scope, which the browser mount applies to every request it serves a turn. */
  runContexts: Map<string, RunContextBinder>
  /** The live turns' workspaces by conversation id, which the controller's workspace resolver hands a new session. */
  conversationWorkspaces: Map<string, Workspace>
  /** The live runs' checks and operation runs by run id, which the controller's `conexus_check` and `conexus_run_operation` read. */
  runTools: Map<string, RunTools>
}>): BuilderRunPorts['openSession'] => async ({ projectId, conversationId, builderRunId, workspace, bindContext, runCheck, runOperation }) => {
  const resourceId = projectResourceId(projectId)
  const scope = conversationRunScope(conversationId)
  const requestContext = new RequestContext()
  bindContext(requestContext)
  conversationWorkspaces.set(conversationId, workspace)
  runTools.set(builderRunId, { check: runCheck, runOperation })
  runContexts.set(scope, bindContext)
  const forget = (): void => {
    runContexts.delete(scope)
    conversationWorkspaces.delete(conversationId)
    runTools.delete(builderRunId)
  }
  const deleteSession = async (): Promise<void> => {
    await controller.deleteSession({ resourceId, scope })
    if (await controller.getSessionByResource(resourceId, scope)) throw new Error('BUILDER_SESSION_DELETE_FAILED')
  }
  const end = async (): Promise<void> => {
    forget()
  }
  let session: ControllerSession
  try {
    session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext })
    // A session resolves its workspace once, when it is made; one made on a VM the conversation no
    // longer has is made again on this one.
    if (session.getWorkspace() !== workspace) {
      await deleteSession()
      session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext })
    }
    if (session.getWorkspace() !== workspace) throw new Error('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')
    // The model the person set on the conversation since the session was made. A conversation with
    // none starts on the installation's default, kept on the thread from its first turn on.
    await session.thread.loadMetadata()
    if (!session.model.hasSelection()) {
      const modelId = await readDefaultModel()
      if (!modelId) throw new Error('BUILDER_MODEL_NOT_SELECTED')
      await session.model.switch({ modelId })
    }
    await session.state.set({ yolo: true })
  } catch (error) {
    forget()
    await deleteSession().catch(() => undefined)
    throw error
  }
  const takeTurn = async (step: BuilderStep, signal?: AbortSignal): Promise<AgentTurn> => {
    let userMessageId: string | undefined
    let continuations = 0
    let limit: ReturnType<typeof setTimeout> | undefined
    let expire: (error: Error) => void = () => undefined
    const expired = new Promise<never>((_, reject) => { expire = reject })
    expired.catch(() => undefined)
    // Silent too long is a stall: the session is aborted and the turn settles.
    const within = <T>(work: Promise<T>): Promise<T> => Promise.race([work, expired])
    const working = (): void => {
      clearTimeout(limit)
      limit = setTimeout(() => {
        session.abort()
        expire(new Error('BUILDER_AGENT_STALLED'))
      }, turnSilenceMs)
      limit.unref?.()
    }
    // A continuation is the Hub's own message; the person's request stays the turn's anchor.
    const detach = session.subscribe((event) => {
      if (event.type === 'message_start' && continuations === 0 && isUserAuthoredMessage(event.message)) userMessageId = event.message.id
      working()
    })
    const abort = (): void => { session.abort() }
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    try {
      working()
      const reason: string = await within(sendBuilderTurnMessage(session, step, { requestContext, ...(signal ? { signal } : {}), onContinuation: (count) => { continuations = count } })) ?? 'unknown'
      const messages = await within(session.thread.listActiveMessages()) as readonly RecordedMessage[]
      userMessageId ??= [...messages].reverse().find(isUserAuthoredMessage)?.id
      const summary = messages.slice(messages.findIndex((message) => message.id === userMessageId) + 1)
        .filter((message) => message.role === 'assistant').map((message) => messageText(message as Parameters<typeof messageText>[0])).filter(Boolean).join('\n')
      return { reason, userMessageId, summary, continuations }
    } catch (error) {
      // The stuck run still holds the session, so the next turn must not find it: the session is
      // deleted, waiting only briefly, since the store that hung may not answer the delete either.
      if (error instanceof Error && error.message === 'BUILDER_AGENT_STALLED') {
        forget()
        await Promise.race([deleteSession().catch(() => undefined), new Promise((settle) => { setTimeout(settle, STALLED_SESSION_DELETE_MS).unref?.() })])
      }
      throw error
    } finally {
      clearTimeout(limit)
      detach()
      signal?.removeEventListener('abort', abort)
    }
  }
  return Object.freeze({
    sendTurn: (content: string, signal?: AbortSignal) => takeTurn({ content }, signal),
    resumeTurn: (resume: ParkedAnswer, signal?: AbortSignal) => takeTurn({ resume }, signal),
    end,
    release: async () => {
      forget()
      await deleteSession()
    },
    // Mastra's `deleteSession` aborts the session, and the abort reaches the thread's run, parked or
    // not: it settles the session's parked calls as denied and marks the run aborted, so no answer
    // could resume it. The call is parked on purpose, so the session lets go of it first: its list of
    // parked calls is cleared, an abort is marked as already made, and the stream is detached
    // without an abort. The call and its snapshot stay in storage for the answer.
    park: async () => {
      forget()
      session.suspensions.clear()
      session.displayState.clearPendingSuspensions()
      session.run.requestAbort({ deferSignal: true })
      session.stream.detach()
      await deleteSession()
    },
  })
}

/**
 * A stop on a parked run. The run holds no session, so one is opened on its thread to settle its
 * calls; Mastra marks each as denied in the thread, as a stop on a run waiting in a session always did.
 */
export const createParkedDiscard = ({ controller }: Readonly<{ controller: AgentController }>): BuilderRunPorts['discardParked'] => async ({ projectId, conversationId }) => {
  const resourceId = projectResourceId(projectId)
  const scope = conversationRunScope(conversationId)
  const session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext: new RequestContext() })
  try {
    await session.runEngine.settleSuspendedToolCallsAsDenied((await readParkedCalls(session)).map((call) => ({ ...call, threadId: conversationId, resourceId })))
  } finally {
    await controller.deleteSession({ resourceId, scope })
  }
}

/**
 * The production sandboxes: one E2B VM per conversation, with the agent's workspace on its checkout.
 * While a conversation has a run, or a pause still pending, that run's instance is the one every
 * run of it gets, so the next `start()` waits for the pause. Once the VM is paused the Hub drops
 * the instance, with the workspace and the process handles it holds (Mastra's Factory does the
 * same when it retires a session): the paused VM stays at E2B, and the next run builds an instance
 * that resumes it by the provider id the Hub recorded. A workspace is never destroyed on a pause,
 * since Mastra's destroy kills the VM it stands on. A killed VM is forgotten too, and the next run
 * gets a new one.
 */
// A deleted Project's kill waits on E2B at most this long per VM, so an unreachable provider never holds the deletion.
const PROVIDER_KILL_TIMEOUT_MS = 15_000

export const e2bConversationSandboxes = ({
  apiKey,
  templateId,
  create = createConversationSandbox,
  killProvider = (providerSandboxId) => Sandbox.kill(providerSandboxId, { apiKey, requestTimeoutMs: PROVIDER_KILL_TIMEOUT_MS }),
  log = () => undefined,
}: Readonly<{
  apiKey: string
  templateId: string
  create?: typeof createConversationSandbox
  killProvider?: (providerSandboxId: string) => Promise<boolean>
  log?: (line: string) => void
}>): Readonly<{
  open: BuilderRunPorts['openSandbox']
  /** The conversations are gone for good: their instances are dropped, and the VMs they hold are killed. */
  destroy(conversationIds: readonly string[]): Promise<void>
  /**
   * Kills the VMs by the provider ids the Hub recorded, running, paused or held by an earlier Hub
   * process. A VM E2B no longer has counts as killed; a kill that fails is logged and never throws.
   * Answers the ids that are gone.
   */
  killRecorded(providerSandboxIds: readonly string[]): Promise<readonly string[]>
}> => {
  // `opened` counts the runs that took the instance, so a pause that finishes after a later run took it drops nothing.
  const kept = new Map<string, { readonly sandbox: RunSandbox; opened: number }>()
  const open: BuilderRunPorts['openSandbox'] = ({ conversationId, providerSandboxId }) => {
    const held = kept.get(conversationId)
    if (held) {
      held.opened += 1
      return held.sandbox
    }
    const sandbox = create({ apiKey, templateId, conversationId, providerSandboxId })
    const workspace = createRunWorkspace(sandbox)
    const entry: { sandbox: RunSandbox; opened: number } = {
      opened: 1,
      sandbox: Object.freeze({
        get sandboxId() { return sandbox.sandboxId },
        workspace,
        start: async () => { await sandbox.start() },
        executeCommand: (command: string, args: string[] = [], options: ExecuteCommandOptions = {}) => sandbox.runCommand(command, args, options),
        writeFiles: (files: SandboxFileInput[]) => sandbox.writeFiles(files),
        runAsRoot: (script: string, env: Record<string, string>) => sandbox.runAsRoot(script, env),
        writeRootFile: (path: string, bytes: Uint8Array) => sandbox.writeRootFile(path, bytes),
        readAgentFile: (path: string) => sandbox.readAgentFile(path),
        readAgentFileStream: (path: string) => sandbox.readAgentFileStream(path),
        runCheck: ({ root, out, collect, user }) => checkApplicationInSandbox(sandbox.e2b, { root, out, collect, user: user === 'root' ? 'root' : SANDBOX_AGENT_USER }),
        holdOpen: (onLapse: (error: unknown) => void) => sandbox.holdOpen(onLapse),
        pause: async () => {
          const opened = entry.opened
          try {
            await sandbox.pause()
          } finally {
            if (kept.get(conversationId) === entry && entry.opened === opened) kept.delete(conversationId)
          }
        },
        kill: async () => {
          if (kept.get(conversationId) === entry) kept.delete(conversationId)
          await sandbox.kill()
        },
      }),
    }
    kept.set(conversationId, entry)
    return entry.sandbox
  }
  return Object.freeze({
    open,
    destroy: async (conversationIds) => {
      for (const conversationId of conversationIds) {
        await kept.get(conversationId)?.sandbox.kill().catch((error: unknown) => {
          log(`BUILDER_SANDBOX_KILL_FAILED:${conversationId}:${error instanceof Error ? error.message : String(error)}`)
        })
      }
    },
    killRecorded: async (providerSandboxIds) => {
      const gone = await Promise.all(providerSandboxIds.map((providerSandboxId) => killProvider(providerSandboxId).then(() => true, (error: unknown) => {
        log(`BUILDER_SANDBOX_KILL_FAILED:${providerSandboxId}:${error instanceof Error ? error.message : String(error)}`)
        return false
      })))
      return providerSandboxIds.filter((_, index) => gone[index])
    },
  })
}
