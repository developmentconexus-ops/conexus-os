import type { RequestContext } from '@mastra/core/request-context'
import type { CommandResult, ExecuteCommandOptions, SandboxFileInput, Workspace } from '@mastra/core/workspace'
import type { ApplicationCheckRun } from '../application-artifact-runtime.js'
import type { CheckBundle } from '../check-delivery.js'
import type { Caller } from '../check/command.js'
import type { ConexusGit } from '../conexus-git.js'
import type { CandidateOperationPorts } from '../run-operation.js'
import type { EventLog } from '../../platform/logger.js'
import type { AgentController, AgentControllerEvent } from '@mastra/core/agent-controller'

/** What a run needs of its conversation's sandbox; the E2B one in production, a fake in tests. */
export type RunSandbox = Readonly<{
  readonly sandboxId: string | undefined
  start(): Promise<void>
  executeCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>
  writeFiles(files: SandboxFileInput[]): Promise<void>
  runAsRoot(script: string, env: Record<string, string>): Promise<CommandResult>
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
  readAgentFile(path: string): Promise<Uint8Array>
  readAgentFileIfPresent(path: string): Promise<Uint8Array | null>
  readAgentFileStream(path: string): Promise<ReadableStream<Uint8Array>>
  // Runs the Hub's check on the tree at `root`, writing the build to `out`; the gate runs as root and the
  // agent's tool as the agent, and every step that runs application code runs as the agent. `collect`
  // also reads the build back when the source passed.
  runCheck(input: Readonly<{ caller: Caller; root: string; out: string; collect: boolean; thumbnail?: string }>): Promise<ApplicationCheckRun>
  /** Keeps the VM on while the run works; letting go starts the idle window. */
  holdOpen(onLapse: (error: unknown) => void): Promise<() => void>
  /** Leaves the VM the idle window from now, after which E2B pauses it; the next command resumes it. */
  idle(): Promise<void>
  /** The agent's workspace on this sandbox. */
  workspace: Workspace
  /** A broken VM: it is killed, and the conversation gets a new instance and session. */
  kill(): Promise<void>
}>

/** One run's reach into its Project's bound Connections: the brief for its instructions, the scope its tools read through, and a handler port on that scope. */
export type ConnectorRun = Readonly<{
  brief: string
  bind(requestContext: RequestContext): void
  openHandlerPort(): ReturnType<CandidateOperationPorts['openConnectorPort']>
  end(): void
}>

/** Everything a run's request context carries, set on every turn it takes, resumed ones included. */
export type RunContextBinder = (requestContext: RequestContext) => void

export type BuilderRunPorts = Readonly<{
  /** The conversation's sandbox instance, the same one for each of its runs while it lives; it starts no VM until `start()`. */
  openSandbox(ref: Readonly<{ projectId: string; conversationId: string }>): Promise<RunSandbox>
  /** The conversation's session, on that sandbox's workspace, for the run's steps. */
  openSession(input: Readonly<{ projectId: string; conversationId: string; builderRunId: string; bindContext: RunContextBinder }>): Promise<RunSession>
  /**
   * Refuses a run before a sandbox exists when the model it starts on has no usable account. It
   * checks that one model only: the account for each later call is looked up when the call is made.
   */
  checkModel(input: Readonly<{ builderRunId: string; accountId: string; projectId: string; conversationId: string }>): Promise<void>
  /** The check this Hub sends to each VM, and the identity every report must carry. */
  check: CheckBundle
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
  log: EventLog
}>

/** How the agent's step ended. */
/** The Mastra session of one conversation, as the AgentController creates it. */
export type ControllerSession = Awaited<ReturnType<AgentController['createSession']>>

/** How an agent step ended; an `error` end is thrown as its failure instead. */
export type SendableAgentEndReason = Exclude<Extract<AgentControllerEvent, { type: 'agent_end' }>['reason'], 'error' | undefined>
export type AgentTurn = Readonly<{ reason: SendableAgentEndReason; userMessageId: string | undefined }>

/** A note in the run's conversation thread, keyed by run and code so a retry writes it once. */
export type RunNote = Readonly<{
  projectId: string
  conversationId: string
  builderRunId: string
  code: string
  outcome: 'SOURCE_BASE_MOVED' | 'RUN_NOT_FINISHED' | 'CANDIDATE_REFUSED' | 'BUILD_FAILED' | 'PLATFORM_FAILED' | 'PREVIEW_DATA_RESET' | 'BOOT_PROBLEMS'
  // `main` after the run: its base when nothing was admitted, its result when admitted.
  sourceRevision: string
  // The Project's own diagnostic, such as the database's error for its migration.
  detail?: string
}>

export type DiagnosticAppender = (note: RunNote) => Promise<void>

/** What starts an agent step: the person's message, or the answer to the call the run waits on. */
export type Step =
  | Readonly<{ kind: 'SEND'; content: string }>
  | Readonly<{ kind: 'ANSWER'; toolCallId: string; resumeData: unknown }>

export type StopReason = 'USER_CANCELLED' | 'HUB_STOPPING'

/** Every way a wait ends. A fifth kind is a compile error in the run's switch. */
export type WaitEnd =
  | Readonly<{ kind: 'ANSWER'; toolCallId: string; resumeData: unknown }>
  | Readonly<{ kind: 'MESSAGE'; content: string }>
  | Readonly<{ kind: 'EXPIRED' }>
  | Readonly<{ kind: 'STOPPED'; reason: StopReason }>

/** The run's session on the Builder controller, from its first step to its end. */
export type RunSession = Readonly<{
  /**
   * One agent step. A message first ends every open question, so it never reaches a session that
   * holds one. Ends `suspended` when the agent asks the person something.
   */
  takeStep(step: Step, signal: AbortSignal): Promise<AgentTurn>
  /** The calls that wait on the live session. */
  pendingCalls(): readonly string[]
  /** Resolves once every call the session holds is stored on the thread. */
  untilQuestionStored(): Promise<void>
  endQuestions(): Promise<void>
  /** The run is over: the session stays with the conversation, and one whose turn stalled is deleted. */
  release(): Promise<void>
}>
