import type { CommandResult, ExecuteCommandOptions } from '@mastra/core/workspace'
import { CHECK_NODE_PATH } from '../application-check.js'
import { installCheck } from '../check-delivery.js'
import { commandEvidence, materializeApplicationShape, materializeFixedApplicationStarter } from '../application-starter.js'
import { SERVER_BUILD_SCRIPT_PATH, serverBuildScriptSource } from '../application-server-build.js'
import { startCheckout } from '../conexus-git.js'
import type { RunSourceSandbox } from '../conexus-git.js'
import { collectEgress, ensureEgressLog } from '../egress-log.js'
import { buildCandidateServer, createOperationRunner } from '../run-operation.js'
import type { RunOperation } from '../run-operation.js'
import type { createRunTiming } from '../run-timing.js'
import { SANDBOX_AGENT_USER, SANDBOX_CHECKOUT } from '../sandbox.js'
import { Failure, type FailureCode, logFailure } from '../../platform/failure.js'
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

const startVm = async ({ sandbox, executionId, timing, started, recorded, bindPhysicalSandbox, hold }: Readonly<{
  sandbox: RunSandbox
  executionId: string
  timing: RunTiming
  /** Called before the run's `start()`: from then on the instance may hold a VM this run made or resumed. */
  started(): void
  /** The incarnation that will run the run, known before anything else can fail. */
  recorded(incarnation: string | undefined): void
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  /** Holds the VM open while the run works. */
  hold(): Promise<void>
}>): Promise<RunVm> => {
  // The conversation's VM resumes when E2B still has it; a new one is created only when it has none.
  started()
  await sandbox.start()
  // The first command replaces a VM E2B already reaped, so the run records the incarnation
  // that will actually run it.
  await sandbox.executeCommand('true', [], { env: {}, cwd: '/' })
  const incarnation = sandbox.sandboxId
  recorded(incarnation)
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

const startCheckoutTurn = async ({ ports, projectId, conversationId, executionId, base, vm, sandbox, markUnusable, excluded, timing, mirrorFailed }: Readonly<{
  ports: BuilderRunPorts
  projectId: string
  conversationId: string
  executionId: string
  base: string
  vm: RunVm
  sandbox: RunSandbox
  markUnusable(): void
  excluded: readonly string[]
  timing: RunTiming
  mirrorFailed(error: unknown): void
}>): Promise<Readonly<{ start: string; conflicted: readonly string[]; mirror: TurnMirror }>> => {
  const turnStart = await ports.git.startTurn(projectId, conversationId, base)
  if (turnStart.conflicted.length > 0) ports.log('BUILDER_TURN_START_CONFLICT', { run: executionId, files: turnStart.conflicted.join(',').slice(0, 2_000) })
  // A checkout that cannot take the start, even seeded again, is one the agent broke: the VM goes.
  const checkoutStart = await startCheckout({ git: ports.git, projectId, turn: turnStart, sandbox: vm.source, checkout: SANDBOX_CHECKOUT, seedFile: SEED_FILE })
    .catch((error: unknown) => { markUnusable(); throw error })
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
  await installCheck(vm, ports.check)
  const installed = await vm.asRoot([
    `cat > '${SERVER_BUILD_SCRIPT_PATH}.next' <<'CONEXUS_SERVER_BUILD_EOF'`,
    serverBuildScriptSource(),
    'CONEXUS_SERVER_BUILD_EOF',
    `chmod 555 '${SERVER_BUILD_SCRIPT_PATH}.next'`,
    `mv '${SERVER_BUILD_SCRIPT_PATH}.next' '${SERVER_BUILD_SCRIPT_PATH}'`,
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
const settleVm = async ({ sandbox, incarnation, live: usable, ports, executionId, conversationId, endMirror, mirror }: Readonly<{
  sandbox: RunSandbox
  incarnation: string | undefined
  live: boolean
  ports: BuilderRunPorts
  executionId: string
  conversationId: string
  endMirror(): Promise<void>
  mirror: TurnMirror | undefined
}>): Promise<boolean> => {
  let live = incarnation !== undefined && usable && sandbox.sandboxId === incarnation
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

const logged = (code: FailureCode, executionId: string) => (error: unknown): void => {
  logFailure(logger, new Failure(code, { cause: error }), { 'builder.run_id': executionId })
}

/**
 * The one owner of the run's sandbox, from the moment it opens: it holds the VM open while the run
 * works, lets it go while the run waits on the person, and at the run's end, however it ended,
 * pauses a VM still the run's own and live or kills one the run started.
 */
export const createRunVm = ({ ports, executionId, conversationId, timing, lapsed }: Readonly<{
  ports: BuilderRunPorts
  executionId: string
  conversationId: string
  timing: RunTiming
  /** E2B stopped extending the VM, so it may reap it under the run. */
  lapsed(failure: Failure): void
}>) => {
  let sandbox: RunSandbox | undefined
  let started = false
  let incarnation: string | undefined
  let release: (() => void) | undefined
  let unusable = false
  let mirror: TurnMirror | undefined
  let vm: RunVm | undefined
  // E2B counts its timeout from the last extension, so the run holds the VM while it works.
  const hold = async (opened: RunSandbox): Promise<void> => {
    release = await opened.holdOpen((error: unknown) => {
      unusable = true
      lapsed(new Failure('BUILDER_SANDBOX_KEEPALIVE_FAILED', { cause: { message: error instanceof Error ? error.message : String(error) } }))
    }).catch((error: unknown) => {
      throw new Failure('BUILDER_SANDBOX_KEEPALIVE_FAILED', { cause: { message: error instanceof Error ? error.message : String(error) } })
    })
  }
  const letGo = (): void => {
    release?.()
    release = undefined
  }
  return Object.freeze({
    open: async (opened: RunSandbox, bindPhysicalSandbox: (sandboxId: string) => Promise<void>): Promise<RunVm> => {
      sandbox = opened
      vm = await startVm({
        sandbox: opened, executionId, timing, bindPhysicalSandbox, hold: () => hold(opened),
        started: () => { started = true },
        recorded: (id) => { incarnation = id },
      })
      return vm
    },
    startTurn: async (input: Readonly<{ projectId: string; base: string; vm: RunVm; sandbox: RunSandbox; excluded: readonly string[]; mirrorFailed(error: unknown): void }>) => {
      const turn = await startCheckoutTurn({ ...input, ports, conversationId, executionId, timing, markUnusable: () => { unusable = true } })
      mirror = turn.mirror
      return { start: turn.start, conflicted: turn.conflicted }
    },
    /** The turn-end mirror, which answers its head; none before the checkout holds the turn's start. */
    endMirror: (candidate: string | null, pulled: string | null): Promise<string | null> => (mirror ? mirror.end(candidate, pulled) : Promise.resolve(null)),
    letGo,
    /** Checks the VM is the same one, which also resumes a paused VM, and holds it again. */
    resume: async (): Promise<void> => {
      if (!vm || !sandbox) throw new Failure('BUILDER_SANDBOX_ID_UNAVAILABLE')
      await vm.direct('true')
      await hold(sandbox)
    },
    settle: async (endMirror: () => Promise<void>): Promise<void> => {
      letGo()
      if (!sandbox) return
      const live = await settleVm({ sandbox, incarnation, live: !unusable, ports, executionId, conversationId, endMirror, mirror })
      // The exit's own commands may have resumed a VM the wait let pause, so its idle window starts again here.
      if (live) void sandbox.idle().catch(logged('BUILDER_SANDBOX_PAUSE_FAILED', executionId))
      else if (started) await sandbox.kill().catch(logged('BUILDER_SANDBOX_KILL_FAILED', executionId))
    },
  })
}

export type RunVmOwner = ReturnType<typeof createRunVm>
