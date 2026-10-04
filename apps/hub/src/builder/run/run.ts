import { APPLICATION_CHECK_EXCLUDED } from '../application-starter.js'
import type { ApplicationServerPort, BuilderApplicationArtifacts } from '../application-build.js'
import { SANDBOX_CHECKOUT } from '../sandbox.js'
import { CONVERSATION_ID_KEY, RUN_ACCOUNT_ID_KEY, RUN_ID_KEY } from '../model-routing.js'
import { CONEXUS_CONNECTOR_BRIEF_KEY, CONEXUS_PROJECT_INSTRUCTIONS_KEY, CONEXUS_PROJECT_MEMORY_KEY, CONEXUS_PROJECT_NAME_KEY, CONEXUS_PROJECT_NEW_KEY, CONEXUS_TURN_CONFLICTS_KEY, CONEXUS_TURN_DATE_KEY, type RunTools } from '../harness/index.js'
import { turnDate } from '../harness/prompt.js'
import { createRunTiming } from '../run-timing.js'
import { PROJECT_FILE_READ_LIMIT, PROJECT_INSTRUCTIONS_PATH, PROJECT_MEMORY_PATH, readProjectInstructions, readProjectMemory } from '../project-context.js'
import type { BuilderRunSummary, BuilderStore, InterruptionCode } from '../store.js'
import type { BuilderRunPhase } from '../../generated/builder-run-vocabulary.js'
import type { CandidateGate } from '../candidate-gate.js'
import { Failure, type FailureCode, logFailure, toFailure } from '../../platform/failure.js'
import { logger } from '../../platform/logger.js'
import { admitCandidate, settleAdmittedSource } from './admit.js'
import { installRunTools, settleRunVm, startCheckoutTurn, startRunVm } from './checkout.js'
import type { RunVm, RunVmState } from './checkout.js'
import { createRunGate } from './judge.js'
import type { TurnMirror } from './mirror.js'
import { createGatePhases } from './phase.js'
import type { AgentTurn, BuilderRunPorts, ConnectorRun, DiagnosticAppender, RunContextBinder, RunSandbox, RunSession, Step, StopReason } from './ports.js'
import { type AnswerOutcome, createInbox } from './question.js'
import { traceRun } from './trace.js'

// Where the agent's own check writes its build; the agent's user owns it, and no run reads it back.
const AGENT_CHECK_OUT = '/tmp/conexus-agent-check'

const OID = /^[0-9a-f]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Only these end a run with a recorded candidate knowing its source is not on main.
const NOT_ADMITTED: ReadonlySet<string> = new Set(['BUILDER_SOURCE_BASE_MOVED', 'BUILDER_SOURCE_ADMISSION_FAILED', 'BUILDER_RUN_CANCELLED'])
// What a stop surfaces depends on where the run stood.
const STOP_CODES: ReadonlySet<string> = new Set(['BUILDER_RUN_CANCELLED', 'BUILDER_LATE_RESULT_REFUSED'])

/** The row ended without this run, by a takeover: its ending is the one written there. */
class RowEnded extends Failure {
  constructor() {
    super('BUILDER_RUN_PHASE_UPDATE_REFUSED')
  }
}

/** A candidate the Hub refuses before admission, with the reason the next turn reads. */
class CandidateRefused extends Failure {
  constructor(code: 'BUILDER_CHECK_FAILED' | 'BUILDER_APP_NOT_FIXED', readonly detail: string) {
    super(code)
  }
}

type RunStore = Pick<BuilderStore, 'claimBuilderRun' | 'setBuilderRunPhase' | 'recordBuilderRunCandidate' | 'bindBuilderRunMessage' | 'bindBuilderRunSandbox' |
  'recordConversationSandbox' | 'recordConversationSession' | 'settleBuilderRun' | 'advanceBuilderRunSource' |
  'settleBuilderRunBuild' | 'failBuilderRun' | 'interruptBuilderRun' | 'readBuilderRun'>

/** What a run needs of the Hub. */
export type RunEnvironment = Readonly<{
  ports: BuilderRunPorts
  store: RunStore
  applicationArtifacts: BuilderApplicationArtifacts
  applicationServer: ApplicationServerPort | undefined
  appendDiagnostic: DiagnosticAppender
  /** Hands the run, as the builder-session read serves it, to a browser following its conversation; never throws. */
  publishRun(run: BuilderRunSummary): Promise<void>
  /** This Hub process as the owner of the runs it works. */
  ownerId: string
  /** How long a question waits for the person before the run ends. */
  questionWaitMs: number
  /** The wait before a failed ending write is tried again; it is tried three times. */
  settleRetryMs: number
}>

/** The one handle the service holds per conversation. Nothing else reaches the run's session, sandbox or row. */
export type LiveRun = Readonly<{
  builderRunId: string
  projectId: string
  answer(toolCallId: string, resumeData: unknown): AnswerOutcome
  /** A message for the run: taken while it waits on the person, else the run is busy. A known key is taken once. */
  message(content: string, idempotencyKey: string): 'ACCEPTED' | 'BUSY'
  stop(reason: StopReason): void
  /** The run's own tools, which the controller hands the agent on the conversation's session. */
  tools(): RunTools | undefined
  /** Settles after the run's last write. */
  done: Promise<void>
}>

type RunRequest = Readonly<{ accountId: string; content: string; idempotencyKey: string }>

// How the run ended: settled by its own work, left to the sweep (a candidate that may be on `main`,
// or a row a takeover already ended), or ended with a code its exit writes.
type RunEnding =
  | Readonly<{ kind: 'SETTLED' }>
  | Readonly<{ kind: 'LEFT' }>
  | Readonly<{ kind: 'INTERRUPTED'; code: InterruptionCode }>
  | Readonly<{ kind: 'FAILED'; code: FailureCode }>

type Run = {
  readonly env: RunEnvironment
  readonly row: BuilderRunSummary
  readonly request: RunRequest
  /** The stop: the person's or the Hub's, by its reason. */
  readonly stopSignal: AbortSignal
  /** The stop, or a VM that stopped being held open. */
  readonly signal: AbortSignal
  readonly keepalive: AbortController
  readonly timing: ReturnType<typeof createRunTiming>
  readonly inbox: ReturnType<typeof createInbox>
  readonly trace: ReturnType<typeof traceRun>
  readonly vm: RunVmState
  sandbox: RunSandbox | undefined
  connectorRun: ConnectorRun | null
  session: RunSession | undefined
  /** What `conexus_check`, `conexus_run_operation` and the finish gate run, once the checkout is ready. */
  tools: RunTools | undefined
  mirror: TurnMirror | undefined
  pulled(): string | null
  keepaliveFailure: Error | undefined
  // The agent ran and nothing of it is admitted yet, so a failure leaves the thread a note.
  agentUnadmitted: boolean
  candidateRecorded: boolean
  mirrorEnded: Promise<void> | undefined
}

type Prepared = Readonly<{ gate: CandidateGate; gatePhases(): Promise<void>; session: RunSession; sandbox: RunSandbox; vm: RunVm }>

const cancelled = (run: Run): boolean => run.stopSignal.aborted

const logged = (run: Run, code: FailureCode) => (error: unknown): void => {
  logFailure(logger, new Failure(code, { cause: error }), { 'builder.run_id': run.row.builderRunId })
}

// A phase the database refuses means a stop was asked for; the browser following the run hears every one written.
// `written` runs once the row holds the phase, before the browser hears of it.
const setPhase = async (run: Run, phase: BuilderRunPhase, written?: () => void): Promise<void> => {
  const summary = await run.env.store.setBuilderRunPhase(run.row.builderRunId, phase)
  if (!summary) throw await phaseRefusal(run)
  run.trace.phase(phase)
  written?.()
  await run.env.publishRun(summary)
}

// The database refuses a phase once a stop is asked for or once the row is no longer running; the row says which.
const phaseRefusal = async (run: Run): Promise<Failure> => {
  const persisted = await run.env.store.readBuilderRun({ accountId: run.request.accountId, projectId: run.row.projectId })
  if (persisted?.builderRunId !== run.row.builderRunId || persisted.state !== 'RUNNING') return new RowEnded()
  return new Failure(persisted.cancellationRequested ? 'BUILDER_RUN_CANCELLED' : 'BUILDER_RUN_PHASE_UPDATE_REFUSED')
}

// Set once the checkout holds the turn's start; the run's end mirrors it however the run ends.
const endMirror = (run: Run, candidate: string | null): Promise<void> => {
  run.mirrorEnded ??= (async () => {
    const head = await run.mirror?.end(candidate, run.pulled())
    if (head) {
      await run.env.store.recordConversationSession({
        projectId: run.row.projectId, conversationId: run.row.conversationId, mirrorHead: head, syncedMain: run.row.baseSourceRevision, turnEnded: true,
      }).catch(logged(run, 'BUILDER_MIRROR_FAILED'))
    }
  })()
  return run.mirrorEnded
}

const readRunContext = async (run: Run): Promise<(conflicted: readonly string[]) => RunContextBinder> => {
  const { ports } = run.env
  const { projectId, conversationId, builderRunId, baseSourceRevision } = run.row
  const { connectorRun } = run
  // The Project's instructions and memory are read by the Hub from the base in the Conexus Git, never from the sandbox (AC-9).
  const readProjectFile = (path: string) => ports.git.readBlob(projectId, baseSourceRevision, path, PROJECT_FILE_READ_LIMIT).catch(() => undefined)
  const instructions = readProjectInstructions(await readProjectFile(PROJECT_INSTRUCTIONS_PATH))
  const memory = readProjectMemory(await readProjectFile(PROJECT_MEMORY_PATH))
  const projectName = await ports.readProjectName({ accountId: run.request.accountId, projectId })
  const date = turnDate()
  const isNew = await ports.git.isStarter(projectId, baseSourceRevision)
  // The paths the turn's start left with conflict markers, which the agent resolves first (decision 3).
  return (conflicted) => (requestContext) => {
    requestContext.setRaw('conexusBuilderProjectId', projectId)
    requestContext.setRaw(RUN_ID_KEY, builderRunId)
    requestContext.setRaw(CONVERSATION_ID_KEY, conversationId)
    requestContext.setRaw(RUN_ACCOUNT_ID_KEY, run.request.accountId)
    requestContext.setRaw(CONEXUS_PROJECT_NAME_KEY, projectName)
    requestContext.setRaw(CONEXUS_TURN_DATE_KEY, date)
    requestContext.setRaw(CONEXUS_PROJECT_NEW_KEY, isNew ? 'true' : '')
    requestContext.setRaw(CONEXUS_PROJECT_INSTRUCTIONS_KEY, instructions)
    requestContext.setRaw(CONEXUS_PROJECT_MEMORY_KEY, memory)
    requestContext.setRaw(CONEXUS_CONNECTOR_BRIEF_KEY, connectorRun?.brief ?? '')
    requestContext.setRaw(CONEXUS_TURN_CONFLICTS_KEY, conflicted.join('\n'))
    connectorRun?.bind(requestContext)
  }
}

// E2B counts its timeout from the last extension, so the run holds the VM while it works.
const holdVm = async (run: Run, sandbox: RunSandbox): Promise<void> => {
  run.vm.release = await sandbox.holdOpen((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    run.keepaliveFailure ??= new Failure('BUILDER_SANDBOX_KEEPALIVE_FAILED', { cause: { message } })
    run.keepalive.abort()
  }).catch((error: unknown) => {
    throw new Failure('BUILDER_SANDBOX_KEEPALIVE_FAILED', { cause: { message: error instanceof Error ? error.message : String(error) } })
  })
}

const prepare = async (run: Run): Promise<Prepared> => {
  const { ports, store } = run.env
  const { projectId, conversationId, builderRunId, baseSourceRevision } = run.row
  const conversation = { projectId, conversationId }
  const bindContextFor = await readRunContext(run)
  const sandbox = await ports.openSandbox(conversation)
  run.sandbox = sandbox
  const vm = await startRunVm({
    sandbox, state: run.vm, executionId: builderRunId, timing: run.timing, hold: () => holdVm(run, sandbox),
    bindPhysicalSandbox: async (sandboxId) => {
      await store.bindBuilderRunSandbox(builderRunId, sandboxId)
      await store.recordConversationSandbox({ ...conversation, providerSandboxId: sandboxId })
    },
  })
  if (cancelled(run)) throw new Failure('BUILDER_RUN_CANCELLED')
  const turnStart = await startCheckoutTurn({
    ports, projectId, conversationId, executionId: builderRunId, base: baseSourceRevision,
    vm, sandbox, state: run.vm, excluded: APPLICATION_CHECK_EXCLUDED, timing: run.timing, mirrorFailed: logged(run, 'BUILDER_MIRROR_FAILED'),
  })
  run.mirror = turnStart.mirror
  const runOperation = await installRunTools({ ports, projectId, accountId: run.request.accountId, vm, sandbox, connectorRun: run.connectorRun, timing: run.timing })
  const gatePhases = createGatePhases((phase) => setPhase(run, phase))
  const { gate, pulled } = createRunGate({
    git: ports.git, projectId, executionId: builderRunId, base: baseSourceRevision, turnStart: turnStart.start, excluded: APPLICATION_CHECK_EXCLUDED,
    log: ports.log, cancelled: () => cancelled(run), gatePhase: gatePhases.enter, vm, sandbox,
  })
  run.pulled = pulled
  run.tools = {
    check: async () => (await sandbox.runCheck({ root: SANDBOX_CHECKOUT, out: AGENT_CHECK_OUT, collect: false, user: 'agent' })).report,
    ...(runOperation ? { runOperation } : {}),
    gate,
  }
  const session = await ports.openSession({ projectId, conversationId, builderRunId, bindContext: bindContextFor(turnStart.conflicted) })
  run.session = session
  run.timing.mark('session')
  return { gate, gatePhases: gatePhases.settled, session, sandbox, vm }
}

/**
 * The run waits on the person with the VM let go, so E2B pauses it after its idle window, until
 * the first `WaitEnd`. An answer or a message checks the VM is the same one, which also resumes a
 * paused VM, and holds it again.
 */
const awaitReply = async (run: Run, prepared: Prepared): Promise<Step> => {
  await prepared.session.untilQuestionStored()
  // A reply is taken only once the row says the run waits, so a failed write loses none.
  await setPhase(run, 'WAITING', () => { run.inbox.open() })
  run.vm.release?.()
  run.vm.release = undefined
  const end = await run.inbox.wait({ waitMs: run.env.questionWaitMs, signal: run.stopSignal })
  const resume = async (): Promise<void> => {
    await prepared.vm.direct('true')
    await holdVm(run, prepared.sandbox)
  }
  switch (end.kind) {
    case 'ANSWER':
      await resume()
      return { kind: 'ANSWER', toolCallId: end.toolCallId, resumeData: end.resumeData }
    case 'MESSAGE':
      await resume()
      return { kind: 'SEND', content: end.content }
    case 'EXPIRED': throw new Failure('BUILDER_QUESTION_EXPIRED')
    case 'STOPPED': throw new Failure('BUILDER_RUN_CANCELLED')
    default: { const unhandled: never = end; return unhandled }
  }
}

/** The agent's steps, from the person's message to a step that does not end on a question. */
const converse = async (run: Run, prepared: Prepared): Promise<AgentTurn> => {
  let step: Step = { kind: 'SEND', content: run.request.content }
  let bound = false
  for (;;) {
    await setPhase(run, 'AGENT')
    run.agentUnadmitted = true
    const turn = await prepared.session.takeStep(step, run.signal)
    if (run.keepaliveFailure) throw run.keepaliveFailure
    if (turn.reason === 'aborted') run.env.ports.log('BUILDER_AGENT_END', { run: run.row.builderRunId, reason: 'aborted' })
    if (!bound) {
      if (!turn.userMessageId) throw new Failure('BUILDER_MESSAGE_ID_UNAVAILABLE')
      await run.env.store.bindBuilderRunMessage(run.row.builderRunId, turn.userMessageId)
      bound = true
    }
    // An agent that ends aborted without a stop failed on its own, for example a model call it
    // could not authenticate; reporting that as the person's cancellation would be false.
    if (cancelled(run)) throw new Failure('BUILDER_RUN_CANCELLED')
    if (turn.reason !== 'suspended') return turn
    step = await awaitReply(run, prepared)
  }
}

/**
 * The gate judged the candidate when the agent said it was done; settling reads that verdict, and
 * checks only a revision the gate never saw: a turn the loop ended without its check, or a tree an
 * agent process changed after it. Every agent process goes first, so the settled tree is the last one.
 */
const conclude = async (run: Run, prepared: Prepared): Promise<RunEnding> => {
  const { env, row } = run
  await prepared.vm.sh('kill -KILL -1 2>/dev/null; true')
  const verdict = await prepared.gate.settle()
  if (verdict?.kind === 'RED_PLATFORM') throw verdict.error
  await endMirror(run, verdict?.revision ?? null)
  run.timing.mark('pull')
  if (!verdict) {
    if (cancelled(run)) throw new Failure('BUILDER_LATE_RESULT_REFUSED')
    await setPhase(run, 'FINALIZING')
    await env.store.settleBuilderRun({ builderRunId: row.builderRunId, resultSourceRevision: null, resultKind: 'RESPONSE_ONLY', failureCode: null })
    return { kind: 'SETTLED' }
  }
  if (cancelled(run)) throw new Failure('BUILDER_RUN_CANCELLED')
  env.ports.log('BUILDER_GATE_SETTLED', { run: row.builderRunId, verdict: verdict.kind })
  // Not admitted: the files stay in the conversation and `main` does not move.
  if (verdict.kind === 'RED_APP') throw new CandidateRefused(prepared.gate.gaveUp() ? 'BUILDER_APP_NOT_FIXED' : 'BUILDER_CHECK_FAILED', verdict.detail)
  const { admitted, applicationBuild } = await admitCandidate({
    git: env.ports.git, projectId: row.projectId, executionId: row.builderRunId, base: row.baseSourceRevision, verdict, cancelled: () => cancelled(run),
    gatePhases: prepared.gatePhases(), setPhase: (phase) => setPhase(run, phase), timing: run.timing,
    recordCandidate: async (sourceRevision) => {
      await env.store.recordBuilderRunCandidate(row.builderRunId, sourceRevision)
      run.candidateRecorded = true
    },
  })
  run.agentUnadmitted = false
  await settleAdmittedSource({
    store: env.store, applicationArtifacts: env.applicationArtifacts, applicationServer: env.applicationServer, appendDiagnostic: env.appendDiagnostic,
    finalizing: () => setPhase(run, 'FINALIZING').catch(() => undefined),
  }, { ...row, accountId: run.request.accountId }, admitted, applicationBuild)
  return { kind: 'SETTLED' }
}

const work = async (run: Run): Promise<RunEnding> => {
  const { env, row } = run
  await env.store.claimBuilderRun(row.builderRunId, env.ownerId)
  await setPhase(run, 'PREPARING')
  if (!UUID.test(row.builderRunId) || !UUID.test(row.projectId) || !UUID.test(row.conversationId) ||
    !OID.test(row.baseSourceRevision) || !run.request.content.trim()) throw new Failure('BUILDER_RUNTIME_INPUT_REFUSED')
  // The start model's account is the person's own, else the installation's shared one; none
  // refuses the run before a sandbox exists, with the "connect a model" answer.
  await env.ports.checkModel({ builderRunId: row.builderRunId, accountId: run.request.accountId, projectId: row.projectId, conversationId: row.conversationId })
  run.connectorRun = env.ports.openConnectorRun ? await env.ports.openConnectorRun({ projectId: row.projectId, builderRunId: row.builderRunId }) : null
  const prepared = await prepare(run)
  const turn = await converse(run, prepared)
  if (turn.reason !== 'complete') throw new Failure('BUILDER_MODEL_INCOMPLETE')
  // The agent's turn is the only reader of the run's connector scope, so it ends with the turn.
  run.connectorRun?.end()
  run.timing.mark('agent')
  return conclude(run, prepared)
}

const endingOf = async (run: Run, error: unknown): Promise<RunEnding> => {
  const { row } = run
  const ended = toFailure(run.keepaliveFailure ?? error)
  // The one log line of the run's end is the row's: its level follows the row's category, and
  // command evidence rides along as a field.
  const evidence = ended.cause !== undefined && !(ended.cause instanceof Error) ? { 'builder.run.evidence': JSON.stringify(ended.cause) } : {}
  if (!cancelled(run) || 'builder.run.evidence' in evidence) logFailure(logger, ended, { 'builder.run_id': row.builderRunId, ...evidence })
  const code = ended.id
  // Its source may be on main: the run stays running with its candidate until a sweep, once its
  // heartbeat has lapsed, reads `main` and settles it.
  if (error instanceof RowEnded) return { kind: 'LEFT' }
  if (run.candidateRecorded && !NOT_ADMITTED.has(code)) return { kind: 'LEFT' }
  // A run that spent its repair budget already told the person why, in the check's last notice.
  if (run.agentUnadmitted && code !== 'BUILDER_APP_NOT_FIXED') {
    // A refused candidate says why, so the next turn in this conversation can fix it.
    const refused = error instanceof CandidateRefused ? error : null
    await run.env.appendDiagnostic({
      projectId: row.projectId, conversationId: row.conversationId, builderRunId: row.builderRunId, code,
      outcome: refused ? 'CANDIDATE_REFUSED' : code === 'BUILDER_SOURCE_BASE_MOVED' ? 'SOURCE_BASE_MOVED' : 'RUN_NOT_FINISHED',
      sourceRevision: row.baseSourceRevision, ...(refused ? { detail: refused.detail } : {}),
    }).catch(() => undefined)
  }
  if (run.stopSignal.reason === 'HUB_STOPPING') return { kind: 'INTERRUPTED', code: 'HUB_RESTART' }
  if (code === 'BUILDER_QUESTION_EXPIRED') return { kind: 'INTERRUPTED', code }
  if (cancelled(run) || STOP_CODES.has(code)) return { kind: 'INTERRUPTED', code: 'USER_CANCELLED' }
  return { kind: 'FAILED', code }
}

// A database blip is common and the Project answers PROJECT_BUSY while the row stays running, so
// the ending is written again after a short wait. When every try fails the run is gone and its
// heartbeat with it, so a sweep takes the row over and settles it.
const writeEnding = async (run: Run, ending: RunEnding): Promise<void> => {
  const { store, settleRetryMs } = run.env
  const id = run.row.builderRunId
  const write = ending.kind === 'INTERRUPTED' ? () => store.interruptBuilderRun(id, ending.code)
    : ending.kind === 'FAILED' ? () => store.failBuilderRun(id, ending.code) : null
  if (!write) return
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { await write(); return } catch (error) {
      if (attempt === 3) { logged(run, 'BUILDER_RUN_SETTLE_FAILED')(error); return }
      await new Promise((wake) => { setTimeout(wake, settleRetryMs) })
    }
  }
}

// Every question that ends unanswered ends before the row frees the Project. A question Mastra
// does not let go of fails a run that would otherwise end interrupted; the next send ends it again.
const endOpenQuestions = async (run: Run, ending: RunEnding): Promise<RunEnding> => {
  try {
    await run.session?.endQuestions()
    return ending
  } catch (error) {
    logged(run, 'BUILDER_QUESTION_NOT_RELEASED')(error)
    return ending.kind === 'INTERRUPTED' ? { kind: 'FAILED', code: 'BUILDER_QUESTION_NOT_RELEASED' } : ending
  }
}

/**
 * The run's exit, however it ended. A VM still the run's own is let go, and E2B pauses it with its
 * files after its idle window; the conversation's next command resumes it. A run that started a VM
 * and does not leave it live kills it. The stream that follows the run hears how it ended before
 * the session goes.
 */
const exit = async (run: Run, ending: RunEnding): Promise<void> => {
  const final = await endOpenQuestions(run, ending)
  const { sandbox } = run
  const live = sandbox ? await settleRunVm({
    sandbox, state: run.vm, lapsed: run.keepaliveFailure !== undefined, ports: run.env.ports, executionId: run.row.builderRunId,
    conversationId: run.row.conversationId, endMirror: () => endMirror(run, null), mirror: run.mirror,
  }) : false
  run.connectorRun?.end()
  // The exit's own commands may have resumed a VM the wait let pause, so its idle window starts again here.
  if (sandbox && live) void sandbox.idle().catch(logged(run, 'BUILDER_SANDBOX_PAUSE_FAILED'))
  else if (sandbox && run.vm.started) await sandbox.kill().catch(logged(run, 'BUILDER_SANDBOX_KILL_FAILED'))
  run.env.ports.log('BUILDER_RUN_TIMING', run.timing.fields(run.row))
  await writeEnding(run, final)
  run.trace.end(final.kind === 'INTERRUPTED' || final.kind === 'FAILED' ? final.code : final.kind, final.kind === 'FAILED')
  const latest = await run.env.store.readBuilderRun({ accountId: run.request.accountId, projectId: run.row.projectId }).catch(() => null)
  if (latest?.builderRunId === run.row.builderRunId) await run.env.publishRun(latest)
  await run.session?.release().catch(logged(run, 'BUILDER_SESSION_RELEASE_FAILED'))
}

/** Starts a run the database created, from its claim to its last write. */
export const startRun = (env: RunEnvironment, row: BuilderRunSummary, request: RunRequest): LiveRun => {
  const stop = new AbortController()
  const keepalive = new AbortController()
  const run: Run = {
    env, row, request, stopSignal: stop.signal, keepalive, signal: AbortSignal.any([stop.signal, keepalive.signal]),
    timing: createRunTiming(),
    trace: traceRun(row),
    inbox: createInbox((toolCallId) => run.session?.pending(toolCallId) === true, (signal) => (signal.reason === 'HUB_STOPPING' ? 'HUB_STOPPING' : 'USER_CANCELLED')),
    vm: { started: false, incarnation: undefined, release: undefined, unusable: false },
    sandbox: undefined, connectorRun: null, session: undefined, tools: undefined, mirror: undefined, pulled: () => null, keepaliveFailure: undefined,
    agentUnadmitted: false, candidateRecorded: false, mirrorEnded: undefined,
  }
  const taken = new Set([request.idempotencyKey])
  const done = (async () => {
    let ending: RunEnding
    try { ending = await work(run) } catch (error) { ending = await endingOf(run, error) }
    await exit(run, ending)
  })()
  return Object.freeze({
    builderRunId: row.builderRunId,
    projectId: row.projectId,
    answer: (toolCallId, resumeData) => run.inbox.answer(toolCallId, resumeData),
    message: (content, idempotencyKey) => {
      if (taken.has(idempotencyKey)) return 'ACCEPTED'
      const outcome = run.inbox.message(content, idempotencyKey)
      if (outcome === 'ACCEPTED') taken.add(idempotencyKey)
      return outcome
    },
    stop: (reason) => { stop.abort(reason) },
    tools: () => run.tools,
    done,
  })
}
