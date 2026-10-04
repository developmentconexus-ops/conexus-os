import { APPLICATION_CHECK_EXCLUDED } from '../application-starter.js'
import { SANDBOX_CHECKOUT } from '../sandbox.js'
import { CONVERSATION_ID_KEY, RUN_ACCOUNT_ID_KEY, RUN_ID_KEY } from '../model-routing.js'
import { CONEXUS_CONNECTOR_BRIEF_KEY, CONEXUS_PROJECT_INSTRUCTIONS_KEY, CONEXUS_PROJECT_MEMORY_KEY, CONEXUS_PROJECT_NAME_KEY, CONEXUS_PROJECT_NEW_KEY, CONEXUS_TURN_CONFLICTS_KEY, CONEXUS_TURN_DATE_KEY } from '../harness/index.js'
import { turnDate } from '../harness/prompt.js'
import { createRunTiming } from '../run-timing.js'
import { PROJECT_FILE_READ_LIMIT, PROJECT_INSTRUCTIONS_PATH, PROJECT_MEMORY_PATH, readProjectInstructions, readProjectMemory } from '../project-context.js'
import type { CodingWorkerResult, ParkedResult, SourceAdmittedResult } from '../runtime.js'
import type { BuilderRunPhase } from '../../generated/builder-run-vocabulary.js'
import type { CandidateGate } from '../candidate-gate.js'
import { Failure, logFailure, toFailure } from '../../platform/failure.js'
import { logger } from '../../platform/logger.js'
import { admitCandidate } from './admit.js'
import { installRunTools, settleRunVm, startCheckoutTurn, startRunVm } from './checkout.js'
import type { RunVm, RunVmState } from './checkout.js'
import { createRunGate } from './judge.js'
import type { TurnMirror } from './mirror.js'
import { createGatePhases } from './phase.js'
import type { BuilderRunPorts, ConnectorRun, ParkedAnswer, RunContextBinder, RunSandbox, RunSession } from './ports.js'



// Where the agent's own check writes its build; the agent's user owns it, and no run reads it back.
const AGENT_CHECK_OUT = '/tmp/conexus-agent-check'




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
}>

/** A candidate the Hub refuses before admission, with the reason the next turn reads. */
export class CandidateRefused extends Failure {
  constructor(code: 'BUILDER_CHECK_FAILED' | 'BUILDER_APP_NOT_FIXED', readonly detail: string) {
    super(code)
  }
}

const OID = /^[0-9a-f]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Mastra keeps a suspended run's own warm state, the bulk of what a parked run holds, for the same
 * half hour (MASTRA_SUSPENDED_RUN_TTL_MS) and has no way to drop it sooner short of aborting the run.
 * An answer within it resumes the live session, a later one resumes from storage.
 */
const WARM_PARKED_MS = 30 * 60_000

/** What a parked run keeps in memory for its answer. */
type WarmParked = Readonly<{ builderRunId: string; session: RunSession; sandbox: RunSandbox; paused: Promise<void>; timer: ReturnType<typeof setTimeout> }>


type RunTiming = ReturnType<typeof createRunTiming>

type PreparedLeg = Readonly<{ gate: CandidateGate; gatePhases(): Promise<void>; session: RunSession; vm: RunVm }>

const mirrorFailed = (executionId: string) => (error: unknown): void => {
  logFailure(logger, new Failure('BUILDER_MIRROR_FAILED', { cause: error }), { 'builder.run_id': executionId })
}

type ParkedRuns = Readonly<{
  takeOver(conversationId: string): Promise<void>
  spentFinishes(conversationId: string, builderRunId: string): number
  recordRedFinishes(conversationId: string, builderRunId: string, count: number): void
  keep(conversationId: string, entry: Omit<WarmParked, 'timer'>): void
  forgetFinishes(conversationId: string): void
}>

type Leg = {
  readonly input: BuilderRunInput
  readonly sandbox: RunSandbox
  readonly vm: RunVmState
  readonly connectorRun: ConnectorRun | null
  session: RunSession | undefined
  mirror: TurnMirror | undefined
  pulled(): string | null
  keepaliveFailure: Error | undefined
  // The leg ended on a question for the person, so the session is parked, not released.
  parked: boolean
  endMirror(candidate: string | null): Promise<void>
}

const readRunContext = async (ports: BuilderRunPorts, input: BuilderRunInput, connectorRun: ConnectorRun | null) => {
  // The Project's instructions and memory are read by the Hub from the base in the Conexus Git, never from the sandbox (AC-9).
  const readProjectFile = (path: string) => ports.git.readBlob(input.projectId, input.baseSourceRevision, path, PROJECT_FILE_READ_LIMIT).catch(() => undefined)
  const instructions = readProjectInstructions(await readProjectFile(PROJECT_INSTRUCTIONS_PATH))
  const memory = readProjectMemory(await readProjectFile(PROJECT_MEMORY_PATH))
  const projectName = await ports.readProjectName({ accountId: input.accountId, projectId: input.projectId })
  const date = turnDate()
  const isNew = await ports.git.isStarter(input.projectId, input.baseSourceRevision)
  // The paths the turn's start left with conflict markers, which the agent resolves first (decision 3).
  return (conflicted: readonly string[]): RunContextBinder => (requestContext) => {
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
}

const prepareLeg = async (ports: BuilderRunPorts, parked: ParkedRuns, leg: Leg, timing: RunTiming, keepalive: AbortController): Promise<PreparedLeg> => {
  const { input, sandbox, connectorRun } = leg
  const cancelled = (): boolean => input.signal?.aborted === true
  const excluded = APPLICATION_CHECK_EXCLUDED
  const bindContextFor = await readRunContext(ports, input, connectorRun)
  const vm = await startRunVm({
    sandbox, state: leg.vm, executionId: input.executionId, timing, bindPhysicalSandbox: input.bindPhysicalSandbox,
    onLapse: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      leg.keepaliveFailure ??= new Failure('BUILDER_SANDBOX_KEEPALIVE_FAILED', { cause: { message } })
      keepalive.abort()
    },
  })
  if (cancelled()) throw new Failure('BUILDER_RUN_CANCELLED')
  const turnStart = await startCheckoutTurn({
    ports, projectId: input.projectId, conversationId: input.conversationId, executionId: input.executionId, base: input.baseSourceRevision,
    vm, sandbox, state: leg.vm, excluded, timing, mirrorFailed: mirrorFailed(input.executionId),
  })
  leg.mirror = turnStart.mirror
  const runOperation = await installRunTools({ ports, projectId: input.projectId, accountId: input.accountId, vm, sandbox, connectorRun, timing })
  const gatePhases = createGatePhases(input.setPhase)
  const { gate, pulled } = createRunGate({
    git: ports.git, projectId: input.projectId, executionId: input.executionId, base: input.baseSourceRevision, turnStart: turnStart.start, excluded,
    log: ports.log, cancelled, gatePhase: gatePhases.enter, vm, sandbox,
    redFinishes: parked.spentFinishes(input.conversationId, input.executionId),
    onRedFinish: (count) => parked.recordRedFinishes(input.conversationId, input.executionId, count),
  })
  leg.pulled = pulled
  const session = await ports.openSession({
    projectId: input.projectId, conversationId: input.conversationId, builderRunId: input.executionId,
    workspace: sandbox.workspace, bindContext: bindContextFor(turnStart.conflicted),
    runCheck: async () => (await sandbox.runCheck({ root: SANDBOX_CHECKOUT, out: AGENT_CHECK_OUT, collect: false, user: 'agent' })).report,
    ...(runOperation ? { runOperation } : {}),
    gate,
  })
  leg.session = session
  timing.mark('session')
  return { gate, gatePhases: gatePhases.settled, session, vm }
}

const closeSessionFailed = (executionId: string) => (error: unknown): void => {
  logFailure(logger, new Failure('BUILDER_SESSION_CLOSE_FAILED', { cause: error }), { 'builder.run_id': executionId })
}

const finishLeg = async (ports: BuilderRunPorts, leg: Leg, prepared: PreparedLeg, timing: RunTiming, runSignal: AbortSignal): Promise<CodingWorkerResult | ParkedResult | SourceAdmittedResult> => {
  const { input } = leg
  const { gate, session, vm } = prepared
  const cancelled = (): boolean => input.signal?.aborted === true
  // The agent's turn is the only reader of the run's connector scope, so it ends with the turn.
  const endTurn = async (): Promise<void> => {
    leg.connectorRun?.end()
    await session.end()
  }
  await input.setPhase('AGENT')
  const turn = await (input.resume ? session.resumeTurn(input.resume, runSignal) : session.sendTurn(input.intent, runSignal))
  if (leg.keepaliveFailure) throw leg.keepaliveFailure
  if (turn.reason === 'aborted') ports.log('BUILDER_AGENT_END', { run: input.executionId, reason: 'aborted' })
  if (!turn.userMessageId) throw new Failure('BUILDER_MESSAGE_ID_UNAVAILABLE')
  await input.bindMessage(turn.userMessageId)
  // An agent that ends aborted without the person's stop failed on its own, for example a model
  // call it could not authenticate; reporting that as their cancellation would be false.
  if (cancelled()) throw new Failure('BUILDER_RUN_CANCELLED')
  const scope = {
    runtimeId: 'conexus-builder-e2b-v1' as const, projectId: input.projectId, executionId: input.executionId, sandboxId: vm.incarnation, baseSourceRevision: input.baseSourceRevision,
  }
  // The agent asked the person something: nothing here waits for the answer. The leg ends, its
  // work is mirrored and the sandbox paused by the cleanup below, and the answer starts the next.
  if (turn.reason === 'suspended') {
    leg.parked = true
    await endTurn().catch(closeSessionFailed(input.executionId))
    timing.mark('agent')
    return Object.freeze({ ...scope, summary: turn.summary.trim(), kind: 'PARKED' as const })
  }
  if (turn.reason !== 'complete') throw new Failure('BUILDER_MODEL_INCOMPLETE')
  await endTurn().catch(closeSessionFailed(input.executionId))
  timing.mark('agent')

  // The gate judged the candidate when the agent said it was done; settling reads that verdict,
  // and checks only a revision the gate never saw: a turn the loop ended without its check, or a
  // tree an agent process changed after it. Every agent process goes first, so the settled tree
  // is the last one.
  await vm.sh('kill -KILL -1 2>/dev/null; true')
  const verdict = await gate.settle()
  if (verdict?.kind === 'RED_PLATFORM') throw verdict.error
  const result = verdict?.revision ?? null
  await leg.endMirror(result)
  timing.mark('pull')
  const summary = turn.summary.trim() || (result ? 'Coding worker produced a candidate result.' : 'Coding worker produced a response without source changes.')
  if (!verdict) {
    if (cancelled()) throw new Failure('BUILDER_LATE_RESULT_REFUSED')
    return Object.freeze({ ...scope, summary, kind: 'RESPONSE_ONLY' as const })
  }
  if (cancelled()) throw new Failure('BUILDER_RUN_CANCELLED')
  ports.log('BUILDER_GATE_SETTLED', { run: input.executionId, verdict: verdict.kind })
  // Not admitted: the files stay in the conversation and `main` does not move.
  if (verdict.kind === 'RED_APP') throw new CandidateRefused(gate.gaveUp() ? 'BUILDER_APP_NOT_FIXED' : 'BUILDER_CHECK_FAILED', verdict.detail)
  const { admitted, applicationBuild } = await admitCandidate({
    git: ports.git, projectId: input.projectId, executionId: input.executionId, base: input.baseSourceRevision, verdict, cancelled,
    gatePhases: prepared.gatePhases(), setPhase: input.setPhase, recordCandidate: input.recordCandidate, timing,
  })
  return Object.freeze({ ...scope, summary, kind: 'SOURCE_ADMITTED' as const, resultSourceRevision: admitted, applicationBuild })
}

const endLeg = async (ports: BuilderRunPorts, parked: ParkedRuns, leg: Leg, timing: RunTiming): Promise<void> => {
  const { input, sandbox } = leg
  const live = await settleRunVm({
    sandbox, state: leg.vm, lapsed: leg.keepaliveFailure !== undefined, ports, executionId: input.executionId, conversationId: input.conversationId,
    endMirror: () => leg.endMirror(null), mirror: leg.mirror,
  })
  const failed = (code: 'BUILDER_SESSION_RELEASE_FAILED' | 'BUILDER_SANDBOX_PAUSE_FAILED' | 'BUILDER_SANDBOX_KILL_FAILED') => (error: unknown): void => {
    logFailure(logger, new Failure(code, { cause: error }), { 'builder.run_id': input.executionId })
  }
  // The run owns the session it opened, whatever way it ended: Mastra frees none by itself. A
  // parked run keeps it live for the answer.
  leg.connectorRun?.end()
  const closeSession = async (): Promise<void> => {
    if (!leg.parked) await leg.session?.release().catch(failed('BUILDER_SESSION_RELEASE_FAILED'))
  }
  if (input.holdSession) input.holdSession(closeSession)
  else await closeSession()
  // The pause takes seconds and nothing waits for it: the conversation's next `start()` does.
  let paused: Promise<void> = Promise.resolve()
  if (live) paused = sandbox.pause(leg.parked).catch(failed('BUILDER_SANDBOX_PAUSE_FAILED'))
  // A run that started and is not live kills its VM, a failed start included: no VM it made or
  // resumed is left running or paused behind it.
  else if (leg.vm.started) await sandbox.kill().catch(failed('BUILDER_SANDBOX_KILL_FAILED'))
  if (leg.parked && leg.session) parked.keep(input.conversationId, { builderRunId: input.executionId, session: leg.session, sandbox, paused })
  if (!leg.parked) parked.forgetFinishes(input.conversationId)
  ports.log('BUILDER_RUN_TIMING', timing.fields(input.executionId))
}

const executeLeg = async (ports: BuilderRunPorts, parked: ParkedRuns, input: BuilderRunInput): Promise<CodingWorkerResult | ParkedResult | SourceAdmittedResult> => {
  if (!UUID.test(input.executionId) || !UUID.test(input.projectId) || !UUID.test(input.conversationId) ||
    !OID.test(input.baseSourceRevision) || !input.intent.trim()) throw new Failure('BUILDER_RUNTIME_INPUT_REFUSED')
  const timing = createRunTiming()
  const keepalive = new AbortController()
  const runSignal = input.signal ? AbortSignal.any([input.signal, keepalive.signal]) : keepalive.signal
  // The start model's account is the person's own, else the installation's shared one; none
  // refuses the run before a sandbox exists, with the "connect a model" answer.
  await ports.checkModel({
    builderRunId: input.executionId, accountId: input.accountId, projectId: input.projectId, conversationId: input.conversationId,
  })
  const connectorRun = ports.openConnectorRun ? await ports.openConnectorRun({ projectId: input.projectId, builderRunId: input.executionId }) : null
  await parked.takeOver(input.conversationId)
  let mirrorEnded: Promise<void> | undefined
  const leg: Leg = {
    input, connectorRun,
    sandbox: ports.openSandbox({ conversationId: input.conversationId, providerSandboxId: input.providerSandboxId }),
    vm: { started: false, incarnation: undefined, release: undefined, unusable: false },
    session: undefined, mirror: undefined, pulled: () => null, keepaliveFailure: undefined, parked: false,
    // Set once the checkout holds the turn's start; the turn end mirrors it however the run ends.
    endMirror: (candidate) => {
      mirrorEnded ??= (async () => {
        const head = await leg.mirror?.end(candidate, leg.pulled())
        if (head) await input.recordMirror(head).catch(mirrorFailed(input.executionId))
      })()
      return mirrorEnded
    },
  }
  try {
    return await finishLeg(ports, leg, await prepareLeg(ports, parked, leg, timing, keepalive), timing, runSignal)
  } catch (error) {
    const failure = leg.keepaliveFailure ?? error
    // The run records only its failure code, and the one log line of the run's end is the row's:
    // its level follows the row's category, and command evidence rides along as a field.
    const ended = toFailure(failure)
    const evidence = ended.cause !== undefined && !(ended.cause instanceof Error) ? { 'builder.run.evidence': JSON.stringify(ended.cause) } : {}
    if (!input.signal?.aborted || 'builder.run.evidence' in evidence) logFailure(logger, ended, { 'builder.run_id': input.executionId, ...evidence })
    throw failure
  } finally {
    await endLeg(ports, parked, leg, timing)
  }
}

export const createBuilderRunRuntime = (ports: BuilderRunPorts): BuilderRunRuntime => {
  // By conversation: one run of a Project at a time, so one parked run per conversation.
  const warm = new Map<string, WarmParked>()
  // A run's red finishes across its legs, so a run that parks on a question keeps its count. By
  // conversation, as a parked run is, and gone with the run's end. In memory: a run parked across a
  // Hub restart starts its count again when it is answered.
  const redFinishes = new Map<string, Readonly<{ builderRunId: string; count: number }>>()
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
        logFailure(logger, new Failure('BUILDER_SESSION_RELEASE_FAILED', { cause: error }), { 'builder.run_id': entry.builderRunId })
      })
      entry.sandbox.release()
      ports.log('BUILDER_PARKED_SESSION_EVICTED', { run: entry.builderRunId, reason })
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
  const parked: ParkedRuns = Object.freeze({
    takeOver: async (conversationId) => {
      take(conversationId)
      await lettingGo.get(conversationId)
    },
    spentFinishes: (conversationId, builderRunId) => {
      const spent = redFinishes.get(conversationId)
      return spent?.builderRunId === builderRunId ? spent.count : 0
    },
    recordRedFinishes: (conversationId, builderRunId, count) => { redFinishes.set(conversationId, { builderRunId, count }) },
    keep: (conversationId, entry) => {
      const timer = setTimeout(() => { void evict(conversationId, 'TTL') }, ports.warmParkedMs ?? WARM_PARKED_MS)
      timer.unref?.()
      warm.set(conversationId, { ...entry, timer })
    },
    forgetFinishes: (conversationId) => { redFinishes.delete(conversationId) },
  })
  const discardParked: BuilderRunRuntime['discardParked'] = async (input) => {
    redFinishes.delete(input.conversationId)
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
  return Object.freeze({ discardParked, evictParked, execute: (input) => executeLeg(ports, parked, input) })
}
