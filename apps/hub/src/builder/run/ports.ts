import type { RequestContext } from '@mastra/core/request-context'
import type { CommandResult, ExecuteCommandOptions, SandboxFileInput, Workspace } from '@mastra/core/workspace'
import type { ApplicationCheckRun } from '../application-artifact-runtime.js'
import type { CheckReport } from '../application-check.js'
import type { CandidateGate } from '../candidate-gate.js'
import type { ConexusGit } from '../conexus-git.js'
import type { CandidateOperationPorts, RunOperation } from '../run-operation.js'
import type { EventLog } from '../../platform/logger.js'

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
  log: EventLog
}>

/** How the agent's turn ended. */
export type AgentTurn = Readonly<{ reason: string; userMessageId: string | undefined; summary: string }>

/** The conversation's session on the Builder controller for one turn, scoped to builder:<conversationId> on its thread. */
export type RunSession = Readonly<{
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
export type ParkedAnswer = Readonly<{ toolCallId: string; resumeData: unknown }>
