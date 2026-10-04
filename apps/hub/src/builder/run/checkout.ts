import type { CommandResult, ExecuteCommandOptions } from '@mastra/core/workspace'
import { CHECK_NODE_PATH, CHECK_SCRIPT_PATH, checkScriptSource } from '../application-check.js'
import { commandEvidence, materializeApplicationShape, materializeFixedApplicationStarter } from '../application-starter.js'
import { SERVER_BUILD_SCRIPT_PATH, serverBuildScriptSource } from '../application-server-build.js'
import { startCheckout } from '../conexus-git.js'
import type { RunSourceSandbox } from '../conexus-git.js'
import { collectEgress, ensureEgressLog } from '../egress-log.js'
import { buildCandidateServer, createOperationRunner } from '../run-operation.js'
import type { RunOperation } from '../run-operation.js'
import type { createRunTiming } from '../run-timing.js'
import { SANDBOX_AGENT_USER, SANDBOX_CHECKOUT } from '../sandbox.js'
import { Failure, logFailure } from '../../platform/failure.js'
import { logger } from '../../platform/logger.js'
import { createTurnMirror, MIRROR_DEBOUNCE_MS, mirrorAfterEdits } from './mirror.js'
import type { TurnMirror } from './mirror.js'
import type { BuilderRunPorts, ConnectorRun, RunSandbox } from './ports.js'

// Where `conexus_run_operation` builds the server half, as the agent's user, before reading it back.
const RUN_OPERATION_OUT = '/tmp/conexus-run-operation'
// A turn-end mirror after a failure waits no longer than this before the sandbox pauses.
const FAILED_TURN_MIRROR_MS = 30_000
// The root-only folder of the base bundle the checkout is seeded from.
export const SEED_ROOT = '/var/lib/conexus-seed'
// One seed bundle per VM, replaced at every turn that fetches one.
const SEED_FILE = `${SEED_ROOT}/turn.bundle`

type RunTiming = ReturnType<typeof createRunTiming>

export type RunVmState = {
  // Set before the run's `start()`: from then on the instance may hold a VM this run made or resumed.
  started: boolean
  incarnation: string | undefined
  release: (() => void) | undefined
  unusable: boolean
}

export type RunVm = Readonly<{
  incarnation: string
  onIncarnation(work: () => Promise<CommandResult>): Promise<CommandResult>
  direct(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>
  sh(script: string, timeout?: number): Promise<CommandResult>
  asRoot(script: string): Promise<CommandResult>
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
  source: RunSourceSandbox
}>

const materializeRunStarter: NonNullable<BuilderRunPorts['materializeStarter']> = async (input) => {
  await materializeFixedApplicationStarter(input)
  await materializeApplicationShape(input)
}

export const startRunVm = async ({ sandbox, state, executionId, timing, bindPhysicalSandbox, hold }: Readonly<{
  sandbox: RunSandbox
  state: RunVmState
  executionId: string
  timing: RunTiming
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  /** Holds the VM open while the run works. */
  hold(): Promise<void>
}>): Promise<RunVm> => {
  // The conversation's VM resumes when E2B still has it; a new one is created only when it has none.
  state.started = true
  await sandbox.start()
  // The first command replaces a VM E2B already reaped, so the run records the incarnation
  // that will actually run it.
  await sandbox.executeCommand('true', [], { env: {}, cwd: '/' })
  state.incarnation = sandbox.sandboxId
  const incarnation = state.incarnation
  if (!incarnation) throw new Failure('BUILDER_SANDBOX_ID_UNAVAILABLE')
  await bindPhysicalSandbox(incarnation)
  await hold()
  timing.mark('sandbox')
  // Every command stays on the one E2B incarnation the run recorded. A replaced VM has lost the
  // pinned checkout, so the run fails rather than acting on whatever the new one holds.
  const onIncarnation = async (work: () => Promise<CommandResult>): Promise<CommandResult> => {
    if (sandbox.sandboxId !== incarnation) throw new Failure('BUILDER_SANDBOX_INCARNATION_CHANGED')
    const result = await work()
    if (sandbox.sandboxId !== incarnation) throw new Failure('BUILDER_SANDBOX_INCARNATION_CHANGED')
    return result
  }
  // The Hub's own commands run as the agent's user with an empty environment, from a folder
  // that exists before the checkout does.
  const direct = (command: string, args: string[] = [], options: ExecuteCommandOptions = {}): Promise<CommandResult> =>
    onIncarnation(() => sandbox.executeCommand(command, args, { timeout: 120_000, ...options, cwd: options.cwd ?? '/', env: {} }))
  const sh = (script: string, timeout?: number): Promise<CommandResult> => direct('sh', ['-c', script], timeout ? { timeout } : {})
  const asRoot = (script: string): Promise<CommandResult> => onIncarnation(() => sandbox.runAsRoot(script, {}))
  const writeRootFile = async (path: string, bytes: Uint8Array): Promise<void> => {
    if (sandbox.sandboxId !== incarnation) throw new Failure('BUILDER_SANDBOX_INCARNATION_CHANGED')
    await sandbox.writeRootFile(path, bytes)
  }
  const source: RunSourceSandbox = { direct, writeRootFile, readAgentFile: (path) => sandbox.readAgentFile(path), readAgentFileStream: (path) => sandbox.readAgentFileStream(path) }
  if ((await direct('id', ['-un'])).stdout.trim() !== SANDBOX_AGENT_USER) throw new Failure('BUILDER_SANDBOX_AGENT_USER_REQUIRED')
  // Recording which hosts the sandbox reaches is evidence, never a gate: a recorder that will not
  // start is logged and the turn goes on.
  await ensureEgressLog({ asRoot, writeRootFile }).catch((error: unknown) => {
    logFailure(logger, new Failure('BUILDER_SANDBOX_EGRESS_START_FAILED', { cause: error }), { 'builder.run_id': executionId })
  })
  return Object.freeze({ incarnation, onIncarnation, direct, sh, asRoot, writeRootFile, source })
}

export const startCheckoutTurn = async ({ ports, projectId, conversationId, executionId, base, vm, sandbox, state, excluded, timing, mirrorFailed }: Readonly<{
  ports: BuilderRunPorts
  projectId: string
  conversationId: string
  executionId: string
  base: string
  vm: RunVm
  sandbox: RunSandbox
  state: RunVmState
  excluded: readonly string[]
  timing: RunTiming
  mirrorFailed(error: unknown): void
}>): Promise<Readonly<{ start: string; conflicted: readonly string[]; mirror: TurnMirror }>> => {
  const turnStart = await ports.git.startTurn(projectId, conversationId, base)
  if (turnStart.conflicted.length > 0) ports.log('BUILDER_TURN_START_CONFLICT', { run: executionId, files: turnStart.conflicted.join(',').slice(0, 2_000) })
  // A checkout that cannot take the start, even seeded again, is one the agent broke: the VM goes.
  const checkoutStart = await startCheckout({ git: ports.git, projectId, turn: turnStart, sandbox: vm.source, checkout: SANDBOX_CHECKOUT, seedFile: SEED_FILE })
    .catch((error: unknown) => { state.unusable = true; throw error })
  ports.log('BUILDER_TURN_CHECKOUT', { run: executionId, start: checkoutStart, incarnation: vm.incarnation })
  timing.mark('seed')
  const mirror = createTurnMirror({
    git: ports.git, projectId, conversationId, turnStart: turnStart.start, head: turnStart.mirror,
    source: vm.source, excluded, debounceMs: ports.mirrorDebounceMs ?? MIRROR_DEBOUNCE_MS, fail: mirrorFailed,
  })
  mirrorAfterEdits(sandbox.workspace, mirror)
  return { start: turnStart.start, conflicted: turnStart.conflicted, mirror }
}

/**
 * The Hub's check and its server build run from paths only root can write, so the agent and the
 * admission see exactly the refusal the Conexus build would give, and neither can change the gate.
 * Answers the operation run `conexus_run_operation` does, when the Hub has a Prévia runner.
 */
export const installRunTools = async ({ ports, projectId, accountId, vm, sandbox, connectorRun, timing }: Readonly<{
  ports: BuilderRunPorts
  projectId: string
  accountId: string
  vm: RunVm
  sandbox: RunSandbox
  connectorRun: ConnectorRun | null
  timing: RunTiming
}>): Promise<RunOperation | undefined> => {
  const installed = await vm.asRoot([
    `cat > '${SERVER_BUILD_SCRIPT_PATH}.next' <<'CONEXUS_SERVER_BUILD_EOF'`,
    serverBuildScriptSource(),
    'CONEXUS_SERVER_BUILD_EOF',
    `cat > '${CHECK_SCRIPT_PATH}.next' <<'CONEXUS_CHECK_EOF'`,
    checkScriptSource(),
    'CONEXUS_CHECK_EOF',
    `chmod 555 '${SERVER_BUILD_SCRIPT_PATH}.next' '${CHECK_SCRIPT_PATH}.next'`,
    `mv '${SERVER_BUILD_SCRIPT_PATH}.next' '${SERVER_BUILD_SCRIPT_PATH}' && mv '${CHECK_SCRIPT_PATH}.next' '${CHECK_SCRIPT_PATH}'`,
  ].join('\n'))
  if (installed.exitCode !== 0) throw new Failure('BUILDER_CHECK_INSTALL_REFUSED', { cause: { stderr: commandEvidence(installed.stderr) } })
  await (ports.materializeStarter ?? materializeRunStarter)({
    repositoryRoot: SANDBOX_CHECKOUT,
    directCommand: (command, args) => vm.direct(command, [...args]),
    writeFiles: (files) => sandbox.writeFiles(files),
  })
  timing.mark('starter')
  // The candidate's operations run before admission, in the Prévia's runner, on the run's own
  // connector scope; the caller is the run's account.
  const invokeOperation = ports.invokeOperation
  return invokeOperation ? createOperationRunner({
    projectId,
    caller: { accountId, email: null, displayName: 'Builder' },
    buildServer: () => buildCandidateServer(
      { node: CHECK_NODE_PATH, script: SERVER_BUILD_SCRIPT_PATH, checkout: SANDBOX_CHECKOUT, out: RUN_OPERATION_OUT },
      (script, args) => vm.onIncarnation(() => sandbox.executeCommand('sh', ['-c', script, 'conexus-run-operation', ...args], {
        timeout: 120_000, cwd: '/', env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: `/home/${SANDBOX_AGENT_USER}`, LANG: 'C.UTF-8' },
      })),
      (path) => sandbox.readAgentFile(path),
    ),
    openConnectorPort: async () => (connectorRun ? connectorRun.openHandlerPort() : null),
    invoke: invokeOperation,
  }) : undefined
}

/**
 * Stop included, every turn end on a live VM kills what the agent left running, so nothing changes
 * the files after the turn-end mirror or runs on while the VM is paused. A lapsed keepalive or a
 * replaced VM has no checkout left to mirror; the edit-time mirrors hold what reached it. Answers
 * whether the VM is still the run's own and live.
 */
export const settleRunVm = async ({ sandbox, state, lapsed, ports, executionId, conversationId, endMirror, mirror }: Readonly<{
  sandbox: RunSandbox
  state: RunVmState
  lapsed: boolean
  ports: BuilderRunPorts
  executionId: string
  conversationId: string
  endMirror(): Promise<void>
  mirror: TurnMirror | undefined
}>): Promise<boolean> => {
  state.release?.()
  const { incarnation } = state
  let live = incarnation !== undefined && !lapsed && !state.unusable && sandbox.sandboxId === incarnation
  if (live) {
    await sandbox.executeCommand('sh', ['-c', 'kill -KILL -1 2>/dev/null; true'], { timeout: 30_000, cwd: '/', env: {} }).catch((error: unknown) => {
      logFailure(logger, new Failure('BUILDER_AGENT_PROCESSES_KILL_FAILED', { cause: error }), { 'builder.run_id': executionId })
    })
    live = sandbox.sandboxId === incarnation
  }
  if (live) {
    await collectEgress({
      asRoot: (script) => sandbox.runAsRoot(script, {}),
      writeRootFile: (path, bytes) => sandbox.writeRootFile(path, bytes),
      readAgentFile: (path) => sandbox.readAgentFileIfPresent(path),
      log: ports.log,
      executionId,
      conversationId,
    })
    live = sandbox.sandboxId === incarnation
  }
  const mirrorSettled = live ? endMirror() : mirror?.abandon()
  await Promise.race([mirrorSettled, new Promise((settle) => { setTimeout(settle, FAILED_TURN_MIRROR_MS).unref?.() })])
  return live
}
