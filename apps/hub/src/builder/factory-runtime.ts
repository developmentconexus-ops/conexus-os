import { RequestContext } from '@mastra/core/request-context'
import type { CommandResult, ExecuteCommandOptions, SandboxFileInput } from '@mastra/core/workspace'
import { applyStoredMemorySettings } from '@mastra/factory/session/memory-settings-hydration'
import { repoDirUnder } from '@mastra/factory/sandbox/workdir'
import type { MemorySettingsStorage } from '@mastra/factory/storage/domains/memory-settings/base'
import { buildApplicationInSandbox, RECIPE_SHA256, TEMPLATE_REF } from './application-artifact-runtime.js'
import type { CompiledApplication } from './application-artifact-runtime.js'
import { APPLICATION_CHECK_INSTRUCTION, BUILDER_SHARED_AGENT_INSTRUCTIONS, commandEvidence, materializeApplicationCheck, materializeFixedApplicationStarter } from './application-starter.js'
import { ConexusFactoryE2BSandbox, FACTORY_OPERATOR_ID, FACTORY_WORKING_DIRECTORY, HUB_GIT_ROOT, tokenEnvironment } from './factory.js'
import type { FactoryComposition } from './factory.js'
import type { GithubApp } from './factory-github.js'
import { conversationBranch } from './factory-routes.js'
import { admitApplicationTree, isUserAuthoredMessage, messageText, sendBuilderSessionMessage } from './runtime.js'
import type { ApplicationBuildOutcome, CodingWorkerResult, SourceAdmittedResult } from './runtime.js'
import type { BuilderRunningPhase, BuilderStore, FactoryBindingRecord } from './store.js'

/** Where a run's source lives, decided once at claim from the Project's binding. */
export type RunSource =
  | Readonly<{ kind: 'CONEXUS' }>
  | Readonly<{ kind: 'FACTORY'; binding: FactoryBindingRecord }>

export type FactoryRunSandbox = Readonly<{
  readonly sandboxId: string | undefined
  start(): Promise<void>
  executeCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>
  writeFiles(files: SandboxFileInput[]): Promise<void>
  runAsRoot(script: string, env: Record<string, string>): Promise<CommandResult>
  // Builds <buildRoot>/app as root, writing only under buildRoot.
  buildApplication(buildRoot: string, signal?: AbortSignal): Promise<CompiledApplication['files']>
}>

export type FactoryAgentTurn = Readonly<{
  reason: string
  endedAt: Date
  userMessageId: string | undefined
  summary: string
}>

/** One run's session on the Factory controller, scoped to builder:<runId> under the conversation. */
export type FactoryRunSession = Readonly<{
  sandbox: FactoryRunSandbox
  configure(input: Readonly<{ mode: 'BUILD' | 'PLAN'; instructions: string }>): Promise<void>
  hasModelSelection(): boolean
  sendTurn(content: string, signal?: AbortSignal): Promise<FactoryAgentTurn>
  close(): Promise<void>
}>

/** The bound repository as the Factory's repositories row has it when the run reads it. */
export type FactoryRepository = Readonly<{ installation: number; externalId: number; slug: string; defaultBranch: string }>

export type FactoryRunPorts = Readonly<{
  openSession(input: Readonly<{ conversationId: string; builderRunId: string; projectId: string; accountId: string }>): Promise<FactoryRunSession>
  github: Pick<GithubApp, 'repositoryToken' | 'branchContains'>
  resolveRepository(binding: FactoryBindingRecord): Promise<FactoryRepository>
  materializeStarter?(input: Readonly<{ repositoryRoot: string; directCommand(command: string, args: readonly string[]): Promise<CommandResult>; writeFiles(files: SandboxFileInput[]): Promise<void> }>): Promise<unknown>
  log(line: string): void
}>

export type FactoryCodingWorkerInput = Readonly<{
  projectId: string
  accountId: string
  conversationId: string
  executionId: string
  intent: string
  mode: 'BUILD' | 'PLAN'
  baseSourceRevision: string
  binding: FactoryBindingRecord
  bindPhysicalSandbox(sandboxId: string): Promise<void>
  bindMessage(messageId: string): Promise<void>
  setPhase(phase: BuilderRunningPhase): Promise<void>
  recordCandidate(sourceRevision: string): Promise<void>
  signal?: AbortSignal
}>

export type FactoryCodingWorkerRuntime = Readonly<{
  execute(input: FactoryCodingWorkerInput): Promise<Extract<CodingWorkerResult, { kind: 'RESPONSE_ONLY' }> | SourceAdmittedResult>
}>

const OID = /^[0-9a-f]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SLUG = /^[\w.-]+\/[\w.-]+$/
const BRANCH = /^[A-Za-z0-9_./-]+$/

export const factoryAgentInstructions = (workdir: string): string => [
  ...BUILDER_SHARED_AGENT_INSTRUCTIONS.map((line) => line.replaceAll('/workspace/repo', workdir)),
  'The conversation history can describe edits from earlier turns that were discarded; trust the files in the workspace over the history.',
  APPLICATION_CHECK_INSTRUCTION,
].join(' ')

const materializeFactoryStarter: NonNullable<FactoryRunPorts['materializeStarter']> = async (input) => {
  await materializeFixedApplicationStarter(input)
  await materializeApplicationCheck(input)
}

const repositoryUrl = (slug: string): string => `https://github.com/${slug}.git`

const AGENT_USER = 'conexus-agent'
const RESULT_BUNDLE = `${FACTORY_WORKING_DIRECTORY}/.conexus-result.bundle`
const BUILD_ROOT = '/var/lib/conexus-build'

export const createFactoryCodingWorkerRuntime = (ports: FactoryRunPorts): FactoryCodingWorkerRuntime => Object.freeze({
  execute: async (input) => {
    if (!UUID.test(input.executionId) || !UUID.test(input.projectId) || !UUID.test(input.conversationId) ||
      !OID.test(input.baseSourceRevision) || !input.intent.trim()) throw new Error('BUILDER_RUNTIME_INPUT_REFUSED')
    const base = input.baseSourceRevision
    const repository = await ports.resolveRepository(input.binding)
    const { installation, slug } = repository
    const branch = conversationBranch(input.conversationId)
    const workdir = repoDirUnder(FACTORY_WORKING_DIRECTORY, slug)
    const git = `git -C '${workdir}'`
    const hubRepository = repoDirUnder(HUB_GIT_ROOT, slug)
    const mirror = `${hubRepository}.git`
    const hubGit = `git --git-dir='${mirror}'`
    const baseBundle = `${hubRepository}.base.bundle`
    const cancelled = (): boolean => input.signal?.aborted === true

    const session = await ports.openSession({
      conversationId: input.conversationId, builderRunId: input.executionId, projectId: input.projectId, accountId: input.accountId,
    })
    let sessionOpen = true
    const closeSession = async (): Promise<void> => {
      if (!sessionOpen) return
      sessionOpen = false
      await session.close()
    }
    try {
      const { sandbox } = session
      await sandbox.start()
      // start() returns at once for a sandbox this process already started, even when E2B's idle
      // timeout killed its VM since. A first command replaces a dead VM (and reclones), so the
      // run records the incarnation that will actually run it.
      await sandbox.executeCommand('true', [], { env: {} })
      const incarnation = sandbox.sandboxId
      if (!incarnation) throw new Error('BUILDER_SANDBOX_FRESH_CREATE_REQUIRED')
      await input.bindPhysicalSandbox(incarnation)
      // Every command stays on the one E2B incarnation the run recorded. A replaced VM has lost the
      // pinned checkout, so the run fails rather than acting on whatever the new one holds.
      const onIncarnation = async (work: () => Promise<CommandResult>): Promise<CommandResult> => {
        if (sandbox.sandboxId !== incarnation) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
        const result = await work()
        if (sandbox.sandboxId !== incarnation) throw new Error('BUILDER_SANDBOX_INCARNATION_CHANGED')
        return result
      }
      // Commands in the checkout run as the agent's user with an empty environment.
      const direct = (command: string, args: string[] = [], options: ExecuteCommandOptions = {}): Promise<CommandResult> =>
        onIncarnation(() => sandbox.executeCommand(command, args, { ...options, env: {} }))
      const sh = (script: string): Promise<CommandResult> => direct('sh', ['-c', script])
      const withToken = (token: string, script: string): Promise<CommandResult> => onIncarnation(() => sandbox.runAsRoot(script, tokenEnvironment(token)))
      const asRoot = (script: string): Promise<CommandResult> => onIncarnation(() => sandbox.runAsRoot(script, {}))
      // A VM from an older template, adopted after a Hub restart, would still run the agent as root.
      if ((await direct('id', ['-un'])).stdout.trim() !== AGENT_USER) throw new Error('BUILDER_SANDBOX_AGENT_USER_REQUIRED')

      // The Factory fetches the base branch once per branch, so each run pins its own base. This also
      // discards whatever a stopped or stale run left in the checkout.
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      const pinToken = await ports.github.repositoryToken(installation, repository.externalId, 'write')
      const fetched = await withToken(pinToken, [
        `mkdir -p '${HUB_GIT_ROOT}'`,
        `{ test -d '${mirror}' || git init --quiet --bare '${mirror}'; }`,
        `${hubGit} fetch --quiet --no-tags '${repositoryUrl(slug)}' '${base}'`,
        `${hubGit} update-ref refs/conexus/base '${base}'`,
        `${hubGit} bundle create --quiet '${baseBundle}' refs/conexus/base`,
      ].join(' && '))
      if (fetched.exitCode !== 0) throw new Error('BUILDER_SOURCE_BASE_PIN_REFUSED', { cause: { step: 'fetch', exitCode: fetched.exitCode, stderr: commandEvidence(fetched.stderr) } })
      const pinned = await sh([
        `${git} fetch --quiet --no-tags '${baseBundle}' refs/conexus/base`,
        `${git} reset --quiet --hard`,
        `${git} clean -fdq`,
        `${git} checkout --quiet -B '${branch}' '${base}'`,
        `test "$(${git} rev-parse HEAD)" = '${base}'`,
      ].join(' && '))
      if (pinned.exitCode !== 0) throw new Error('BUILDER_SOURCE_BASE_PIN_REFUSED', { cause: { step: 'checkout', exitCode: pinned.exitCode, stderr: commandEvidence(pinned.stderr) } })

      if (input.mode === 'BUILD') {
        await (ports.materializeStarter ?? materializeFactoryStarter)({
          repositoryRoot: workdir,
          directCommand: (command, args) => direct(command, [...args]),
          writeFiles: (files) => sandbox.writeFiles(files),
        })
      }
      await session.configure({ mode: input.mode, instructions: factoryAgentInstructions(workdir) })
      if (!session.hasModelSelection()) throw new Error('BUILDER_MODEL_NOT_SELECTED')

      await input.setPhase('AGENT')
      const turn = await session.sendTurn(input.intent, input.signal)
      if (turn.reason === 'aborted') ports.log(`BUILDER_FACTORY_AGENT_END:aborted:${input.executionId}:${turn.endedAt.toISOString()}`)
      if (!turn.userMessageId) throw new Error('BUILDER_MESSAGE_ID_UNAVAILABLE')
      await input.bindMessage(turn.userMessageId)
      // An agent that ends aborted without the person's stop failed on its own, for example a model
      // call it could not authenticate; reporting that as their cancellation would be false.
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      if (turn.reason !== 'complete') throw new Error('BUILDER_MODEL_INCOMPLETE')
      await closeSession()

      const committed = await sh([
        `${git} add --all`,
        `{ ${git} diff --cached --quiet || ${git} -c user.name='Conexus Coding Worker' -c user.email='worker@conexus.invalid' commit --quiet -m 'Conexus Builder candidate'; }`,
        `${git} rev-parse HEAD`,
      ].join(' && '))
      const result = committed.stdout.trim().split('\n').pop() ?? ''
      if (committed.exitCode !== 0 || !OID.test(result)) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
      const scope = {
        runtimeId: 'mastra-factory-e2b-v1' as const,
        projectId: input.projectId,
        executionId: input.executionId,
        sandboxId: incarnation,
        baseSourceRevision: base,
        summary: turn.summary.trim() || (result === base ? 'Coding worker produced a response without source changes.' : 'Coding worker produced a candidate result.'),
      }
      if (result === base) {
        if (cancelled()) throw new Error('BUILDER_LATE_RESULT_REFUSED')
        return Object.freeze({ ...scope, kind: 'RESPONSE_ONLY' as const })
      }
      if (input.mode === 'PLAN') throw new Error('BUILDER_PLAN_SOURCE_RESULT_REFUSED')
      const verified = await sh(`${git} merge-base --is-ancestor '${base}' '${result}' && test -z "$(${git} status --porcelain)"`)
      if (verified.exitCode !== 0) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')

      // Force applies only to the conversation's own scratch branch, which the base pin rewinds. The
      // push names the result's id, so a bundle that lacks it pushes nothing.
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      const bundled = await sh(`${git} bundle create --quiet '${RESULT_BUNDLE}' 'refs/heads/${branch}'`)
      if (bundled.exitCode !== 0) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
      const pushToken = await ports.github.repositoryToken(installation, repository.externalId, 'write')
      const pushed = await withToken(pushToken, [
        `${hubGit} fetch --quiet '${RESULT_BUNDLE}' 'refs/heads/${branch}'`,
        `${hubGit} merge-base --is-ancestor '${base}' '${result}'`,
        `${hubGit} push --quiet --force '${repositoryUrl(slug)}' '${result}:refs/heads/${branch}'`,
      ].join(' && '))
      if (pushed.exitCode !== 0) throw new Error('BUILDER_SOURCE_PUSH_FAILED')

      await input.setPhase('COMPILING')
      let applicationBuild: ApplicationBuildOutcome
      try {
        // The agent's processes can outlive its turn and keep writing the checkout, so the build
        // takes the result's own tree from the mirror into a directory only root can enter, once
        // every process of the agent's user is gone.
        const listed = await asRoot(`${hubGit} ls-tree -r -l '${result}' app/`)
        if (listed.exitCode !== 0) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
        admitApplicationTree(listed.stdout)
        await sh('kill -KILL -1 2>/dev/null; true')
        const buildRoot = `${BUILD_ROOT}/${input.executionId}`
        const snapshot = await asRoot([
          `rm -rf '${BUILD_ROOT}'`,
          `mkdir -p -m 700 '${BUILD_ROOT}'`,
          `mkdir -m 700 '${buildRoot}'`,
          `${hubGit} archive --format=tar '${result}' app | tar -x -C '${buildRoot}'`,
          // The recipe's cache directory is in the agent's workspace; root must not follow what it left there.
          `rm -rf '${FACTORY_WORKING_DIRECTORY}/.vite'`,
        ].join(' && '))
        if (snapshot.exitCode !== 0) throw new Error('BUILDER_APPLICATION_SOURCE_REFUSED')
        const files = await sandbox.buildApplication(buildRoot, input.signal)
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

      // The last step a stop can prevent. The result is recorded before GitHub hears anything, so a
      // restart or a lost answer finds what may be on main; a stopped run is refused and stops here.
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      await input.recordCandidate(result)
      if (cancelled()) throw new Error('BUILDER_RUN_CANCELLED')
      // The compare-and-swap: receive-pack moves the default branch only while it still holds base,
      // under its own ref lock. The result descends from base (checked on the mirror before the
      // conversation push), so an admitted update is a fast-forward from exactly base.
      const defaultRef = `refs/heads/${repository.defaultBranch}`
      const admission = await withToken(await ports.github.repositoryToken(installation, repository.externalId, 'write'),
        `${hubGit} push --porcelain --force-with-lease='${defaultRef}:${base}' '${repositoryUrl(slug)}' '${result}:${defaultRef}'`)
      // ' ' is a fast-forward, '=' finds the result already there, '!' is a refused lease.
      const flag = admission.stdout.split('\n').map((line) => line.split('\t')).find(([, refs]) => refs === `${result}:${defaultRef}`)?.[0]
      if (flag === '!') throw new Error('BUILDER_SOURCE_BASE_MOVED')
      if (admission.exitCode !== 0 || (flag !== ' ' && flag !== '=')) {
        // GitHub may have applied the push and lost the answer; main's history says which.
        const cause = { exitCode: admission.exitCode, stderr: commandEvidence(admission.stderr) }
        const landed = await ports.github.branchContains(installation, repository, repository.defaultBranch, result)
          .catch(() => { throw new Error('BUILDER_SOURCE_ADMISSION_UNKNOWN', { cause }) })
        if (!landed) throw new Error('BUILDER_SOURCE_ADMISSION_FAILED', { cause })
      }
      return Object.freeze({ ...scope, kind: 'SOURCE_ADMITTED' as const, resultSourceRevision: result, applicationBuild })
    } catch (error) {
      // The run records only its failure code; a failure that carries command evidence says why.
      if (error instanceof Error && error.cause !== undefined) ports.log(`BUILDER_FACTORY_RUN_FAILED:${input.executionId}:${error.message} ${JSON.stringify(error.cause)}`)
      throw error
    } finally {
      await closeSession().catch(() => undefined)
    }
  },
})

// Every tool the Factory's GitHub integration contributes reaches GitHub with an installation token,
// and web tools reach anything; the agent's work is the checkout in front of it. The integration
// contributes its tools only to a session on a repository thread, so they are listed against one.
const deniedTools = (github: FactoryComposition['github'], orgId: string): Record<string, 'deny'> => {
  const listing = new RequestContext()
  listing.set('user', { id: FACTORY_OPERATOR_ID, organizationId: orgId })
  listing.set('controller', { threadId: 'conexus-tool-listing', getState: () => ({ projectRepositoryId: 'conexus-tool-listing' }) })
  const githubTools = Object.keys(github.sessionTools({ requestContext: listing }))
  if (githubTools.length === 0) throw new Error('FACTORY_GITHUB_TOOLS_UNLISTED')
  return Object.fromEntries([...githubTools, 'web_search', 'web_extract'].map((name) => [name, 'deny' as const]))
}

type RecordedMessage = Readonly<{ id: string; role?: string; content?: unknown }>

export const createMastraFactoryRunPorts = ({ composition, orgId, log }: Readonly<{
  composition: FactoryComposition
  orgId: string
  log(line: string): void
}>): Omit<FactoryRunPorts, 'github'> => {
  const tools = deniedTools(composition.github, orgId)
  const memorySettings = composition.storage.getDomain<MemorySettingsStorage>('memory-settings')
  return Object.freeze({
    resolveRepository: async (binding: FactoryBindingRecord) => {
      const sourceControl = composition.github.sourceControlStorage
      const row = await sourceControl.repositories.get({ orgId, id: binding.repositoryId })
      const installation = row ? await sourceControl.installations.get({ orgId, id: row.installationId }) : null
      const repository = { installation: Number(installation?.externalId), externalId: Number(row?.externalId), slug: row?.slug ?? '', defaultBranch: row?.defaultBranch ?? '' }
      if (![repository.installation, repository.externalId].every((id) => Number.isSafeInteger(id) && id > 0) ||
        !SLUG.test(repository.slug) || !BRANCH.test(repository.defaultBranch)) throw new Error('BUILDER_FACTORY_UNAVAILABLE')
      return Object.freeze(repository)
    },
    log,
    openSession: async ({ conversationId, builderRunId, projectId, accountId }) => {
      const { controller } = composition
      const requestContext = new RequestContext()
      requestContext.set('user', { id: accountId, organizationId: orgId })
      requestContext.setRaw('conexusBuilderProjectId', projectId)
      requestContext.setRaw('conexusBuilderRunId', builderRunId)
      const scope = `builder:${builderRunId}`
      const session = await controller.createSession({ resourceId: conversationId, ownerId: conversationId, scope, threadId: conversationId, requestContext })
      const close = async (): Promise<void> => {
        const deleted = await controller.deleteSession({ resourceId: conversationId, scope })
        if (!deleted || await controller.getSessionByResource(conversationId, scope)) throw new Error('BUILDER_SESSION_DELETE_FAILED')
      }
      const sandbox = session.getWorkspace()?.sandbox
      if (!(sandbox instanceof ConexusFactoryE2BSandbox) || !sandbox.executeCommand) {
        await close().catch(() => undefined)
        throw new Error('BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED')
      }
      const execute = sandbox.executeCommand.bind(sandbox)
      return Object.freeze({
        sandbox: Object.freeze({
          get sandboxId() { return sandbox.sandboxId },
          start: async () => { await sandbox.start() },
          executeCommand: (command: string, args: string[] = [], options: ExecuteCommandOptions = {}) =>
            execute(command, args, { ...options, cwd: options.cwd ?? FACTORY_WORKING_DIRECTORY, timeout: options.timeout ?? 120_000 }),
          writeFiles: (files: SandboxFileInput[]) => sandbox.writeFiles(files),
          runAsRoot: (script: string, env: Record<string, string>) => sandbox.runAsRoot(script, env),
          buildApplication: (buildRoot: string, signal?: AbortSignal) =>
            buildApplicationInSandbox(sandbox.e2b, { workRoot: buildRoot, appRoot: `${buildRoot}/app`, user: 'root', ...(signal ? { signal } : {}) }),
        }),
        configure: async ({ mode, instructions }) => {
          await session.state.set({ yolo: true, permissionRules: { categories: {}, tools }, pluginInstructions: [instructions] })
          // The Factory seeded this session from the conversation owner's row; the organization's row,
          // which `hub-factory memory` writes, decides the memory model of every run.
          const memory = await memorySettings.get({ orgId, userId: FACTORY_OPERATOR_ID })
          if (memory) await applyStoredMemorySettings(session, memory)
          await session.mode.switch({ modeId: mode.toLowerCase() })
        },
        hasModelSelection: () => session.model.hasSelection(),
        sendTurn: async (content, signal) => {
          let endedAt = new Date()
          let userMessageId: string | undefined
          const detach = session.subscribe((event) => {
            if (event.type === 'agent_end') endedAt = new Date()
            if (event.type === 'message_end' && isUserAuthoredMessage(event.message)) userMessageId = event.message.id
          })
          const abort = (): void => { session.abort() }
          if (signal?.aborted) abort()
          else signal?.addEventListener('abort', abort, { once: true })
          try {
            const reason = await sendBuilderSessionMessage(session, { content }, requestContext)
            const messages = await session.thread.listActiveMessages() as readonly RecordedMessage[]
            userMessageId ??= [...messages].reverse().find(isUserAuthoredMessage)?.id
            const summary = messages.slice(messages.findIndex((message) => message.id === userMessageId) + 1)
              .filter((message) => message.role === 'assistant').map((message) => messageText(message as Parameters<typeof messageText>[0])).filter(Boolean).join('\n')
            return { reason: reason ?? 'unknown', endedAt, userMessageId, summary }
          } finally {
            detach()
            signal?.removeEventListener('abort', abort)
          }
        },
        close,
      })
    },
  })
}

/**
 * Settles every running run with a candidate that no run in this process still owns, whatever phase
 * it stopped in; the candidate may be on the default branch. When the run already recorded its
 * advance, or main's history holds the candidate, the run is admitted with the last good Preview
 * kept; both writes converge when repeated. A candidate main's history lacks fails the run. Answers
 * the runs it could not settle, for example while GitHub is unreachable; they stay running.
 */
export const recoverFactoryAdmissions = async ({ store, github, resolveRepository, active }: Readonly<{
  store: Pick<BuilderStore, 'listFactoryAdmissionRuns' | 'advanceBuilderRunSource' | 'settleBuilderRunBuild' | 'failBuilderRun'>
  github: Pick<GithubApp, 'branchContains'>
  resolveRepository: FactoryRunPorts['resolveRepository']
  active: ReadonlySet<string>
}>): Promise<readonly string[]> => {
  const unsettled: string[] = []
  for (const run of await store.listFactoryAdmissionRuns()) {
    if (active.has(run.builderRunId)) continue
    const candidate = run.candidateSourceRevision
    try {
      if (run.resultSourceRevision !== candidate) {
        const repository = await resolveRepository(run.binding)
        if (!await github.branchContains(repository.installation, repository, repository.defaultBranch, candidate)) {
          await store.failBuilderRun(run.builderRunId, 'BUILDER_SOURCE_ADMISSION_FAILED')
          continue
        }
      }
      await store.advanceBuilderRunSource(run.builderRunId, candidate)
      await store.settleBuilderRunBuild({ builderRunId: run.builderRunId, sourceRevision: candidate, failureCode: 'BUILDER_PREVIEW_NOT_BUILT' })
    } catch {
      unsettled.push(run.builderRunId)
    }
  }
  return unsettled
}
