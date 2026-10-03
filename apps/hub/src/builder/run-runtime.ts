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
import type { BuilderRunPhase } from '../generated/builder-run-vocabulary.js'
import { classifyCheck, createCandidateGate, GATE_RED_BUDGET, type CandidateGate, type CandidateVerdict } from './candidate-gate.js'

/** What a run needs of its conversation's sandbox; the E2B one in production, a fake in tests. */
type RunSandbox = Readonly<{
  readonly sandboxId: string | undefined
  start(): Promise<void>
  executeCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>
  writeFiles(files: SandboxFileInput[]): Promise<void>
  runAsRoot(script: string, env: Record<string, string>): Promise<CommandResult>
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
  readAgentFile(path: string): Promise<Uint8Array>
  readAgentFileIfPresent(path: string): Promise<Uint8Array | null>
  readAgentFileStream(path: string): Promise<ReadableStream<Uint8Array>>
  // Runs the Hub's check on the tree at `root` as root, its steps as the agent's user, writing the
  // build to `out`; `collect` also reads the build back when the source passed.
  runCheck(input: Readonly<{ root: string; out: string; collect: boolean; thumbnail?: string; user: 'root' | 'agent' }>): Promise<ApplicationCheckRun>
  holdOpen(onLapse: (error: unknown) => void): Promise<() => void>
  /** The agent's workspace on this sandbox. */
  workspace: Workspace
  /**
   * The turn's end: the VM pauses with its files and its checkout, and the next `start()` resumes it.
   * A parked run's instance stays for its answer, since its live session holds this workspace.
   */
  pause(parked?: boolean): Promise<void>
  /**
   * A parked run let go of its instance: it is dropped from memory, the VM stays paused, and the
   * conversation's next `start()` resumes it by the provider id the Hub recorded.
   */
  release(): void
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
  /**
   * The agent's turn is over: its context and tools are forgotten, and the session stays for the
   * run's remaining phases. A run parked on a call keeps it live for the answer, as Mastra's Factory does.
   */
  end(): Promise<void>
  /** The run is over: ends the turn and deletes the session, which Mastra keeps in memory until it is deleted. */
  release(): Promise<void>
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
    /** The run's finish gate, which Mastra's completion check calls when the agent says it is done. */
    gate?: CandidateGate
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
  /** How long a parked run keeps its session and its sandbox instance in memory for the answer. */
  warmParkedMs?: number
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
  setPhase(phase: BuilderRunPhase): Promise<void>
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
  /** A stop on a parked run: its open call is settled as denied in the thread, and what it kept in memory is let go. */
  discardParked: BuilderRunPorts['discardParked']
  execute(input: BuilderRunInput): Promise<CodingWorkerResult | ParkedResult | SourceAdmittedResult>
  /** Lets go of every parked run's session and sandbox instance held in memory; each answer then resumes from storage. Answers how many. */
  evictParked(): Promise<number>
  /** Spike: checks an admitted revision again on its conversation's VM, with no agent, for a publish retry. */
  rebuild(input: Readonly<{ projectId: string; conversationId: string; executionId: string; revision: string; providerSandboxId: string | null }>): Promise<CandidateVerdict>
}>

/** A candidate the Hub refuses before admission, with the reason the next turn reads. */
export class CandidateRefused extends Error {
  constructor(code: 'BUILDER_CHECK_FAILED' | 'BUILDER_APP_NOT_FIXED', readonly detail: string) {
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

/** Places the Hub's check and server build where only root can write, so nothing in the VM can change the gate. */
const installCheck = async (asRoot: (script: string) => Promise<CommandResult>): Promise<void> => {
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
}

/**
 * The one check of a candidate revision: the admission check and the Preview build in one, on the
 * full tree from the Conexus Git, as root, from a root-only copy, with the build and its picture
 * collected. The run's finish gate and a publish retry both call it.
 */
const judgeCandidate = async ({ git, projectId, executionId, revision, writeRootFile, asRoot, runCheck, log }: Readonly<{
  git: Pick<ConexusGit, 'listFilesLong' | 'archive'>
  projectId: string
  executionId: string
  revision: string
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
  asRoot(script: string): Promise<CommandResult>
  runCheck: RunSandbox['runCheck']
  log(line: string): void
}>): Promise<CandidateVerdict> => {
  // The tree's own limits are the app's: a symlink, an oversized file or no app/index.html.
  admitApplicationTree(await git.listFilesLong(projectId, revision, ['app/', 'conexus/']))
  const candidateTar = `${SEED_ROOT}/${executionId}.candidate.tar`
  await writeRootFile(candidateTar, await git.archive(projectId, revision, []))
  const checkRoot = `${BUILD_ROOT}/${executionId}`
  const unpacked = await asRoot([
    `rm -rf ${quoted(BUILD_ROOT)}`,
    `mkdir -p -m 711 ${quoted(BUILD_ROOT)}`,
    `mkdir -m 755 ${quoted(checkRoot)}`,
    `tar -x -C ${quoted(checkRoot)} -f ${quoted(candidateTar)}`,
    `rm -f ${quoted(candidateTar)}`,
  ].join(' && '))
  if (unpacked.exitCode !== 0) throw new Error('BUILDER_CANDIDATE_UNPACK_FAILED')
  const checked = await runCheck({ root: checkRoot, out: `${checkRoot}.dist`, collect: true, thumbnail: `${BUILD_ROOT}/${executionId}.png`, user: 'root' })
  log(`BUILDER_CHECK:gate:${executionId}:${revision.slice(0, 12)}:${checkSummary(checked.report)}`)
  const verdict = classifyCheck(revision, checked)
  const renderedWithProblems = verdict.kind === 'GREEN' ? failedBootStep(checked.report) : null
  if (renderedWithProblems) log(`BUILDER_CHECK_BOOT_PROBLEMS:${executionId}:${JSON.stringify(renderedWithProblems.problems).slice(0, 2_000)}`)
  return verdict
}

type TurnMirror = Readonly<{
  schedule(): void
  /** The turn-end mirror: the candidate when the turn made one, else a snapshot of the checkout. Answers the mirror's head. */
  end(candidate: string | null): Promise<string | null>
  /** Ends the turn's mirror without a new write, for a sandbox that is gone. Settles once the write in flight has. */
  abandon(): Promise<void>
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
      ended ??= chain.then(() => expected)
      return ended.then(() => undefined)
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

/**
 * Mastra keeps a suspended run's own warm state, the bulk of what a parked run holds, for the same
 * half hour (MASTRA_SUSPENDED_RUN_TTL_MS) and has no way to drop it sooner short of aborting the run.
 * An answer within it resumes the live session, a later one resumes from storage.
 */
const WARM_PARKED_MS = 30 * 60_000

/** What a parked run keeps in memory for its answer. */
type WarmParked = Readonly<{ builderRunId: string; session: RunSession; sandbox: RunSandbox; paused: Promise<void>; timer: ReturnType<typeof setTimeout> }>

export const createBuilderRunRuntime = (ports: BuilderRunPorts): BuilderRunRuntime => {
  // By conversation: one run of a Project at a time, so one parked run per conversation.
  const warm = new Map<string, WarmParked>()
  // A run's red finishes across its legs: a run that parks on a question keeps its count. In
  // memory, as the lease is: a Hub restart interrupts the run anyway.
  const redChecksByRun = new Map<string, number>()
  // A letting go still in flight, which the conversation's next leg waits on before it opens anything.
  const lettingGo = new Map<string, Promise<void>>()
  const take = (conversationId: string): WarmParked | undefined => {
    const entry = warm.get(conversationId)
    if (!entry) return undefined
    warm.delete(conversationId)
    clearTimeout(entry.timer)
    return entry
  }
  // The session is deleted leaving its call in storage, and the instance dropped with the VM paused.
  const letGo = (conversationId: string, entry: WarmParked, reason: 'TTL' | 'HEAP' | 'ENDED'): Promise<void> => {
    const done = (async () => {
      await entry.paused
      await entry.session.release().catch((error: unknown) => {
        ports.log(`BUILDER_SESSION_RELEASE_FAILED:${entry.builderRunId}:${error instanceof Error ? error.message : String(error)}`)
      })
      entry.sandbox.release()
      ports.log(`BUILDER_PARKED_SESSION_EVICTED:${entry.builderRunId}:${reason}`)
    })()
    lettingGo.set(conversationId, done)
    const settled = (): void => { if (lettingGo.get(conversationId) === done) lettingGo.delete(conversationId) }
    done.then(settled, settled)
    return done
  }
  const evict = async (conversationId: string, reason: 'TTL' | 'HEAP'): Promise<void> => {
    const entry = take(conversationId)
    if (entry) await letGo(conversationId, entry, reason)
  }
  const discardParked: BuilderRunRuntime['discardParked'] = async (input) => {
    const entry = take(input.conversationId)
    await lettingGo.get(input.conversationId)
    try {
      await ports.discardParked(input)
    } finally {
      if (entry) await letGo(input.conversationId, entry, 'ENDED')
    }
  }
  const evictParked: BuilderRunRuntime['evictParked'] = async () => {
    const conversations = [...warm.keys()]
    await Promise.all(conversations.map((conversationId) => evict(conversationId, 'HEAP')))
    return conversations.length
  }
  const execute: BuilderRunRuntime['execute'] = async (input) => {
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
    // The answer's leg takes over what its parked run kept warm, or waits until it was let go.
    take(input.conversationId)
    await lettingGo.get(input.conversationId)
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
      await installCheck(asRoot)
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
      // The finish gate (option A): the candidate is the checkout pulled into the Conexus Git, and the
      // judge is the admission check and the Preview build in one, on the full tree, as root, from a
      // root-only copy. Its verdict is kept by revision, so nothing after the turn checks again.
      let pulled: string | null = null
      const judge = (revision: string): Promise<CandidateVerdict> => judgeCandidate({
        git: ports.git, projectId: input.projectId, executionId: input.executionId, revision, writeRootFile, asRoot,
        runCheck: (check) => sandbox.runCheck(check), log: ports.log,
      })
      const gate = createCandidateGate({
        candidate: async () => {
          const next = await pullSnapshot({
            git: ports.git, projectId: input.projectId, snapshot: candidateSnapshot(input.executionId, turnStart.start),
            unchangedFrom: pulled ?? turnStart.start, scratch: 'candidate', sandbox: source, checkout: SANDBOX_CHECKOUT, excluded,
          })
          if (next) pulled = next
          return pulled ?? (turnStart.start === base ? null : turnStart.start)
        },
        judge,
        redChecks: redChecksByRun.get(input.executionId) ?? 0,
        onRed: (count) => { redChecksByRun.set(input.executionId, count) },
        onJudging: (revision) => {
          ports.log(`BUILDER_GATE_CHECKING:${input.executionId}:${revision.slice(0, 12)}`)
          void input.setPhase('COMPILING').catch(() => undefined)
        },
      })
      // A red check sends the agent back to work, so the run says so.
      const runGate: CandidateGate = Object.freeze({
        ...gate,
        finish: async () => {
          const step = await gate.finish()
          ports.log(`BUILDER_GATE:${input.executionId}:${step.next}`)
          if (step.next === 'REPAIR') await input.setPhase('AGENT').catch(() => undefined)
          return step
        },
      })
      session = await ports.openSession({
        projectId: input.projectId, conversationId: input.conversationId, builderRunId: input.executionId,
        workspace: sandbox.workspace, bindContext,
        runCheck: async () => (await sandbox.runCheck({ root: SANDBOX_CHECKOUT, out: AGENT_CHECK_OUT, collect: false, user: 'agent' })).report,
        ...(runOperation ? { runOperation } : {}),
        gate: runGate,
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

      // The gate judged the candidate when the agent said it was done; settling reads that verdict,
      // and checks only a revision the gate never saw (a turn the loop ended without its check).
      // Every agent process goes first, so nothing changes the checkout after the last pull.
      await sh('kill -KILL -1 2>/dev/null; true')
      const outcome = await gate.settle()
      const result = outcome.kind === 'NO_CHANGE' ? null : outcome.verdict.revision || null
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
      if (outcome.kind === 'NO_CHANGE') {
        if (cancelled()) throw new Error('BUILDER_LATE_RESULT_REFUSED')
        return Object.freeze({ ...scope, kind: 'RESPONSE_ONLY' as const })
      }
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      const { verdict } = outcome
      ports.log(`BUILDER_GATE_SETTLED:${input.executionId}:${verdict.kind}:red=${outcome.redChecks}`)
      // Not admitted: the files stay in the conversation and `main` does not move.
      if (verdict.kind === 'RED_PLATFORM') throw new Error(verdict.code)
      if (verdict.kind === 'RED_APP') throw new CandidateRefused(outcome.redChecks >= GATE_RED_BUDGET ? 'BUILDER_APP_NOT_FIXED' : 'BUILDER_CHECK_FAILED', verdict.detail)
      const admitted = verdict.revision

      // The last step a stop can prevent. The candidate is recorded before `main` moves, so a restart
      // finds what may be on main; a stopped run is refused and stops here.
      await input.setPhase('SOURCE_ADMISSION')
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      await input.recordCandidate(admitted)
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      // The compare-and-swap and the moment of admission: `main` moves from exactly the run's base.
      await ports.git.fastForwardMain(input.projectId, { base, candidate: admitted })
      timing.mark('admission')
      // C-033 as it is: a page that did not render is admitted without a Preview.
      const applicationBuild: ApplicationBuildOutcome = verdict.kind === 'UNRENDERED'
        ? { kind: 'UNRENDERED', code: 'APPLICATION_SMOKE_FAILED', detail: verdict.detail }
        : { kind: 'BUILT', compiledApplication: {
          projectId: input.projectId, executionId: input.executionId, sourceRevision: admitted,
          templateRef: TEMPLATE_REF, recipeSha256: RECIPE_SHA256, files: verdict.build.files,
        }, ...(verdict.build.thumbnail ? { thumbnail: verdict.build.thumbnail } : {}), ...(verdict.build.bootProblems ? { bootProblems: verdict.build.bootProblems } : {}) }
      return Object.freeze({ ...scope, kind: 'SOURCE_ADMITTED' as const, resultSourceRevision: admitted, applicationBuild })
    } catch (error) {
      const failure = keepaliveFailure ?? error
      // The run records only its failure code; a failure that carries command evidence says why.
      // A failure without a cause logs only its code, never a message that may carry text or a tool result.
      const failureCode = failure instanceof Error && /^[A-Z0-9_]{1,120}$/.test(failure.message) ? failure.message : 'BUILDER_PREPARATION_FAILED'
      if (failure instanceof Error && failure.cause !== undefined) ports.log(`BUILDER_RUN_FAILED:${input.executionId}:${failure.message} ${JSON.stringify(failure.cause)}`)
      else if (!input.signal?.aborted) ports.log(`BUILDER_RUN_FAILED:${input.executionId}:${failureCode}`)
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
          readAgentFile: (path) => sandbox.readAgentFileIfPresent(path),
          log: ports.log,
          executionId: input.executionId,
          conversationId: input.conversationId,
        })
        live = sandbox.sandboxId === incarnation
      }
      const mirrorSettled = live ? endMirror(null) : mirror?.abandon()
      await Promise.race([mirrorSettled, new Promise((settle) => { setTimeout(settle, FAILED_TURN_MIRROR_MS).unref?.() })])
      const failed = (code: string) => (error: unknown): void => {
        ports.log(`${code}:${input.executionId}:${error instanceof Error ? error.message : String(error)}`)
      }
      // The run owns the session it opened, whatever way it ended: Mastra frees none by itself. A
      // parked run keeps it live for the answer.
      connectorRun?.end()
      const closeSession = async (): Promise<void> => {
        if (!parked) await session?.release().catch(failed('BUILDER_SESSION_RELEASE_FAILED'))
      }
      if (input.holdSession) input.holdSession(closeSession)
      else await closeSession()
      // The pause takes seconds and nothing waits for it: the conversation's next `start()` does.
      let paused: Promise<void> = Promise.resolve()
      if (live) paused = sandbox.pause(parked).catch(failed('BUILDER_SANDBOX_PAUSE_FAILED'))
      // A run that started and is not live kills its VM, a failed start included: no VM it made or
      // resumed is left running or paused behind it.
      else if (started) await sandbox.kill().catch(failed('BUILDER_SANDBOX_KILL_FAILED'))
      if (parked && session) {
        const timer = setTimeout(() => { void evict(input.conversationId, 'TTL') }, ports.warmParkedMs ?? WARM_PARKED_MS)
        timer.unref?.()
        warm.set(input.conversationId, { builderRunId: input.executionId, session, sandbox, paused, timer })
      }
      if (!parked) redChecksByRun.delete(input.executionId)
      ports.log(timing.line(input.executionId))
    }
  }
  const rebuild: BuilderRunRuntime['rebuild'] = async ({ projectId, conversationId, executionId, revision, providerSandboxId }) => {
    await lettingGo.get(conversationId)
    const sandbox = ports.openSandbox({ conversationId, providerSandboxId })
    let live = false
    try {
      await sandbox.start()
      await sandbox.executeCommand('true', [], { env: {}, cwd: '/' })
      live = true
      const asRoot = (script: string): Promise<CommandResult> => sandbox.runAsRoot(script, {})
      await installCheck(asRoot)
      return await judgeCandidate({
        git: ports.git, projectId, executionId, revision, writeRootFile: (path, bytes) => sandbox.writeRootFile(path, bytes), asRoot,
        runCheck: (check) => sandbox.runCheck(check), log: ports.log,
      })
    } finally {
      if (live) await sandbox.pause().catch(() => undefined)
    }
  }
  return Object.freeze({ discardParked, evictParked, execute, rebuild })
}

type RecordedMessage = Readonly<{ id: string; role?: string; content?: unknown }>

/** Mastra's completion-check feedback: written as an assistant message, but it is the gate speaking, not the Builder. */
const isCompletionCheck = (message: RecordedMessage): boolean => {
  const metadata = (message.content as { metadata?: { completionResult?: unknown } } | undefined)?.metadata
  return metadata?.completionResult !== undefined
}

/**
 * How long a turn may go without one event from its session while the agent is working. A storage
 * read that never settles (Mastra's `getWorkflowRunById` was seen to) emits no error and no end, and
 * neither `session.abort()` nor Mastra's `untilIdle` timer, which watches background tasks, settles
 * it. It is twice one model step's budget, so a slow step or a long tool call never reaches it. A
 * turn that asks the person something ends there, so no wait on an answer is ever timed.
 */
const TURN_SILENCE_MS = 10 * 60_000
const STALLED_SESSION_DELETE_MS = 5_000

type ControllerSession = Awaited<ReturnType<AgentController['createSession']>>

/**
 * Lets a session go of the calls it is parked on, so deleting it answers none of them. Mastra's
 * `deleteSession` aborts the session, and the abort settles its parked calls as denied and marks the
 * thread's run aborted, so no answer could resume it. Any session on the thread holds the call, not
 * only the run's own: while the suspended run is warm in this process, a session opened on its
 * thread is told of the call within moments. Here the session's list of parked calls is cleared, an
 * abort is marked as already made, and the stream is detached without an abort; the call and its
 * snapshot stay in storage, and an answer resumes them on a new session.
 */
const letGoOfParked = (session: ControllerSession): void => {
  // The registry, not the display state, is what Mastra's abort settles: a session opened again for
  // the answer may show no pending suspension while it still holds the call.
  if (session.suspensions.clear().length === 0) return
  session.displayState.clearPendingSuspensions()
  session.run.requestAbort({ deferSignal: true })
  session.stream.detach()
}

/** Deletes the session of a scope without settling a call it holds: only a discard settles one. */
export const deleteSessionLeavingParked = async (controller: Pick<AgentController, 'getSessionByResource' | 'deleteSession'>, resourceId: string, scope: string): Promise<void> => {
  const session = await controller.getSessionByResource(resourceId, scope)
  if (!session) return
  letGoOfParked(session)
  await controller.deleteSession({ resourceId, scope })
}

/** The conversation's own session scope: never the browser's `conversation:<id>`, which has no workspace. */
export const conversationRunScope = (conversationId: string): string => `builder:${conversationId}`

/**
 * The conversation's session on the Builder controller for one run (spec 0002 amendment, B3): one
 * session per run on the conversation's thread, on that conversation's sandbox workspace, with every
 * tool allowed without asking (the workspace lists the tools the Builder has), and a turn that
 * lasts until the agent is done, including while it waits for the person to answer a question
 * (AC-16). The context, the check and the operation run are the turn's own. Mastra keeps a live
 * session until it is deleted, so the run deletes its own, and a parked run keeps it for the answer;
 * the thread, which holds the conversation, is in storage.
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
}>): BuilderRunPorts['openSession'] => {
  /** The run that owns each scope now. Two runs on one conversation can share one session object, so only the owner may end it. */
  const owners = new Map<string, string>()
  return async ({ projectId, conversationId, builderRunId, workspace, bindContext, runCheck, runOperation, gate }) => {
  const resourceId = projectResourceId(projectId)
  const scope = conversationRunScope(conversationId)
  const requestContext = new RequestContext()
  bindContext(requestContext)
  conversationWorkspaces.set(conversationId, workspace)
  runTools.set(builderRunId, { check: runCheck, runOperation, gate })
  runContexts.set(scope, bindContext)
  owners.set(scope, builderRunId)
  let session: ControllerSession | undefined
  // Lets go of what this run holds and says whether it still owned the scope. A run that a later
  // run took the scope from leaves the session and the scope's entries to that run.
  const forget = (keepOwnership = false): boolean => {
    runTools.delete(builderRunId)
    if (owners.get(scope) !== builderRunId) return false
    if (!keepOwnership) owners.delete(scope)
    if (runContexts.get(scope) === bindContext) runContexts.delete(scope)
    if (conversationWorkspaces.get(conversationId) === workspace) conversationWorkspaces.delete(conversationId)
    return true
  }
  const deleteSession = async (): Promise<void> => {
    if (!session || (await controller.getSessionByResource(resourceId, scope)) !== session) return
    await deleteSessionLeavingParked(controller, resourceId, scope)
    if (await controller.getSessionByResource(resourceId, scope)) throw new Error('BUILDER_SESSION_DELETE_FAILED')
  }
  // The agent's turn ends, but the run keeps the session for its remaining phases and still owns it.
  const end = async (): Promise<void> => {
    forget(true)
  }
  try {
    // A parked run's answer gets the session the run parked in, still live on the same workspace.
    session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext })
    // A session resolves its workspace once, when it is made; one made on a VM the conversation no
    // longer has is made again on this one, and the call it is parked on resumes from storage.
    if (session.getWorkspace() !== workspace) {
      if (owners.get(scope) === builderRunId) await deleteSession()
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
    if (forget()) await deleteSession().catch(() => undefined)
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
        .filter((message) => message.role === 'assistant' && !isCompletionCheck(message)).map((message) => messageText(message as Parameters<typeof messageText>[0])).filter(Boolean).join('\n')
      return { reason, userMessageId, summary, continuations }
    } catch (error) {
      // The stuck run still holds the session, so the next turn must not find it: the session is
      // deleted, waiting only briefly, since the store that hung may not answer the delete either.
      if (error instanceof Error && error.message === 'BUILDER_AGENT_STALLED') {
        if (forget()) await Promise.race([deleteSession().catch(() => undefined), new Promise((settle) => { setTimeout(settle, STALLED_SESSION_DELETE_MS).unref?.() })])
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
      if (forget()) await deleteSession()
    },
  })
  }
}

/**
 * Settles every call a run left open on its thread: the session is the parked run's own while it is
 * live, else one opened on its thread, and Mastra marks each call as denied, as a stop on a run waiting in a session always
 * did. With no call open it only reads the thread, so every ending of a run can call it and a second
 * call changes nothing.
 */
export const createParkedDiscard = ({ controller }: Readonly<{ controller: AgentController }>): BuilderRunPorts['discardParked'] => async ({ projectId, conversationId }) => {
  const resourceId = projectResourceId(projectId)
  const scope = conversationRunScope(conversationId)
  const session = await controller.createSession({ resourceId, scope, threadId: conversationId, requestContext: new RequestContext() })
  try {
    await session.runEngine.settleSuspendedToolCallsAsDenied((await readParkedCalls(session)).map((call) => ({ ...call, threadId: conversationId, resourceId })))
  } finally {
    await deleteSessionLeavingParked(controller, resourceId, scope)
  }
}

/**
 * The production sandboxes: one E2B VM per conversation, with the agent's workspace on its checkout.
 * While a conversation has a run, or a pause still pending, that run's instance is the one every
 * run of it gets, so the next `start()` waits for the pause. Once the VM is paused the Hub drops
 * the instance, with the workspace and the process handles it holds (Mastra's Factory does the
 * same when it retires a session), unless the run parked: its live session holds the workspace, so
 * the answer resumes the same instance. The paused VM stays at E2B, and the next run builds an instance
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
        readAgentFileIfPresent: (path: string) => sandbox.readAgentFileIfPresent(path),
        readAgentFileStream: (path: string) => sandbox.readAgentFileStream(path),
        runCheck: ({ root, out, collect, thumbnail, user }) => checkApplicationInSandbox(sandbox.e2b, { root, out, collect, ...(thumbnail ? { thumbnail } : {}), user: user === 'root' ? 'root' : SANDBOX_AGENT_USER }),
        holdOpen: (onLapse: (error: unknown) => void) => sandbox.holdOpen(onLapse),
        pause: async (parked = false) => {
          const opened = entry.opened
          try {
            await sandbox.pause()
          } finally {
            if (!parked && kept.get(conversationId) === entry && entry.opened === opened) kept.delete(conversationId)
          }
        },
        release: () => {
          if (kept.get(conversationId) === entry) kept.delete(conversationId)
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

/** What the Hub needs of its conversations' sandboxes: E2B's in production, a test composition's own otherwise. */
export type ConversationSandboxes = ReturnType<typeof e2bConversationSandboxes>
