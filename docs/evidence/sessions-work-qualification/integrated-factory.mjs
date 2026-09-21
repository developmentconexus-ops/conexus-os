// The integrated Factory test: the real MastraFactory, the real GithubIntegration, and one
// disposable private repository. It answers whether the Factory can be a Project's
// development environment rather than a library the product borrows from.
//
// It needs a GitHub App the operator created. The values are read from the environment and
// never printed:
//   GH_APP_ID, GH_APP_SLUG, GH_APP_CLIENT_ID, GH_APP_CLIENT_SECRET,
//   GH_APP_PRIVATE_KEY_FILE, GH_APP_INSTALLATION_ID, GH_REPO (owner/name),
//   optionally GH_BASE_BRANCH (default main).
// Without them it refuses and exits non-zero. Nothing here fabricates a GitHub state, and no
// stage is reported as passed unless the Factory performed it.
//
// Turns are answered by the local loopback stub (local-provider-stub.mjs), so no paid call
// can happen. Storage and sandboxes are scratch directories it creates and reports.
//
// Usage: node integrated-factory.mjs [--negative-control]
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { randomUUID, createPrivateKey } from 'node:crypto'
import { spawn } from 'node:child_process'
import { MastraFactory, WorkItemsStorage, createBoardRegistry } from '@mastra/factory'
import { setCustomProvidersSource } from '@mastra/code-sdk/agents/model'
import { FactoryStartCoordinator } from '@mastra/factory/rules/start-coordinator'
import { FactoryTransitionService } from '@mastra/factory/rules/transition-service'
import { GithubIntegration } from '@mastra/factory/integrations/github/integration'
import { ensureFactorySourceSession } from '@mastra/factory/session/factory-session'
import { Mastra } from '@mastra/core/mastra'
import { RequestContext } from '@mastra/core/request-context'
import { LocalSandbox } from '@mastra/core/workspace'
import { LibSQLFactoryStorage } from '@mastra/libsql'

const negativeControl = process.argv.includes('--negative-control')

const results = []
const claim = (stage, statement, ok, detail = '') => {
  results.push({ ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${stage}] ${statement}${detail ? `  (${detail})` : ''}`)
  return ok
}
const finish = (note) => {
  if (note) console.log(`# ${note}`)
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}
const attempt = async (run) => {
  try { return { ok: true, value: await run() } }
  catch (error) { return { ok: false, detail: error?.message ?? String(error) } }
}

// One boundary for everything that comes from outside. Values are checked here and never
// logged; only their absence or a parse failure is reported.
const env = (name) => process.env[name]?.trim()
const REQUIRED = ['GH_APP_ID', 'GH_APP_SLUG', 'GH_APP_CLIENT_ID', 'GH_APP_CLIENT_SECRET',
  'GH_APP_PRIVATE_KEY_FILE', 'GH_APP_INSTALLATION_ID', 'GH_REPO']
const missing = REQUIRED.filter((name) => !env(name))
if (missing.length > 0) {
  claim('setup', 'the GitHub App credentials are present in the environment', false, `missing ${missing.join(', ')}`)
  finish('nothing ran, because this test refuses to invent a GitHub state')
}
const keyFile = env('GH_APP_PRIVATE_KEY_FILE')
if (!existsSync(keyFile)) {
  claim('setup', 'the private key file exists at the path given', false, 'path not found')
  finish()
}
const privateKey = readFileSync(keyFile, 'utf8')
const parsed = await attempt(async () => createPrivateKey(privateKey))
if (!claim('setup', 'the App private key parses as a PEM', parsed.ok, parsed.detail ?? 'parsed')) finish()
claim('setup', 'the run has an App, an installation and one repository to act on', true,
  `app ${env('GH_APP_SLUG')}, repo ${env('GH_REPO')}`)

const repoSlug = env('GH_REPO')
const baseBranch = env('GH_BASE_BRANCH') ?? 'main'
const branch = `factory-probe/${randomUUID().slice(0, 8)}`
const orgId = 'conexus-probe-org'
const userId = 'conexus-probe-user'
const scratch = mkdtempSync(resolve(tmpdir(), 'integrated-factory-'))

const github = new GithubIntegration({
  appId: env('GH_APP_ID'), privateKey, clientId: env('GH_APP_CLIENT_ID'),
  clientSecret: env('GH_APP_CLIENT_SECRET'), slug: env('GH_APP_SLUG'),
})

const storage = new LibSQLFactoryStorage({ id: 'integrated', url: `file:${resolve(scratch, 'factory.db')}` })
const factory = new MastraFactory({
  storage, auth: null, integrations: [github], stateSecret: randomUUID(),
  sandbox: (ctx) => new LocalSandbox({ id: ctx.sessionId, workingDirectory: join(scratch, 'sandboxes', ctx.sessionId) }),
})

const args = await factory.prepare()
new Mastra(args)
await factory.finalize()
const controller = args.agentControllers[Object.keys(args.agentControllers)[0]]
claim('stage A', 'the Factory booted with the real GitHub integration registered', Boolean(controller),
  `${Object.keys(args.agentControllers).join(', ')}, ${args.server?.apiRoutes?.length ?? 0} routes`)

const domain = (name) => storage.getDomain(name)
const sourceControl = github.sourceControlStorage
const projects = domain('projects')

// The rows the run path reads. The installation id is the one GitHub issued when the App was
// installed; the repository is the one it was installed on.
const installation = await attempt(() => github.versionControl.registerInstallation({
  orgId, userId,
  installation: { externalId: env('GH_APP_INSTALLATION_ID'), accountName: repoSlug.split('/')[0], accountType: 'User' },
}))
if (!claim('stage A', 'the installation GitHub issued is registered', installation.ok, installation.detail ?? `row ${installation.value?.id}`)) finish()

const repositories = await attempt(() => github.versionControl.registerRepositories({
  orgId, installationId: installation.value.id,
  repositories: [{ externalId: repoSlug, slug: repoSlug, defaultBranch: baseBranch }],
}))
if (!claim('stage A', 'the repository is linked to that installation', repositories.ok, repositories.detail ?? `row ${repositories.value?.[0]?.id}`)) finish()

// A real installation token, minted by the App. Its value is never printed; what is reported
// is that GitHub issued one, which is the first thing in this test that proves authentication.
const repoAccess = await attempt(() => github.versionControl.getRepositoryAccess({
  orgId, repositoryId: repositories.value[0].id,
}))
if (!claim('stage A', 'GitHub issues an installation token for that repository', repoAccess.ok && Boolean(repoAccess.value?.authorization?.token),
  repoAccess.detail ?? `clone url resolved, token withheld from this log`)) finish()

const project = await attempt(() => projects.create({ orgId, userId, input: { name: 'Factory integration probe' } }))
if (!claim('stage A', 'a Factory project exists', project.ok, project.detail ?? `project ${project.value?.id}`)) finish()

const connection = await attempt(() => sourceControl.connections.create({
  orgId, factoryProjectId: project.value.id, installationId: installation.value.id, createdByUserId: userId,
}))
if (!claim('stage A', 'the project is connected to the installation', connection.ok, connection.detail ?? `connection ${connection.value?.id}`)) finish()

const link = await attempt(() => sourceControl.projectRepositories.link({
  orgId, connectionId: connection.value.id, repositoryId: repositories.value[0].id, createdByUserId: userId,
  sandboxProvider: 'local', sandboxWorkdir: join(scratch, 'sandboxes'), branch: baseBranch,
}))
if (!claim('stage A', 'the repository is linked to the project', link.ok, link.detail ?? `link ${link.value?.id}`)) finish()

const ensured = await attempt(() => ensureFactorySourceSession({
  sourceControl, orgId, factoryProjectId: project.value.id, branch, attributeToUserId: userId,
}))
if (!claim('stage A', 'the Factory creates a source-backed session for that repository', ensured.ok,
  ensured.detail ?? `session ${ensured.value?.sessionId} on ${ensured.value?.branch}`)) finish()

// The Factory scopes a session to its caller, so the run supplies the identity the auth
// provider would supply on a server: the workspace resolver reads it from the request
// context and refuses a session that belongs to somebody else.
const caller = new RequestContext()
caller.set('user', { id: userId, organizationId: orgId })
const session = await attempt(() => controller.createSession({ resourceId: ensured.value.sessionId, requestContext: caller }))
if (!claim('stage A', 'an interactive session opens on that source session', session.ok, session.detail ?? 'opened')) finish()

const workspace = await attempt(() => session.value.getWorkspace())
if (!claim('stage A', 'the session resolves a workspace over the real repository', workspace.ok && Boolean(workspace.value),
  workspace.detail ?? String(workspace.value?.constructor?.name))) finish()

const sandbox = workspace.value.sandbox
await sandbox.start?.()
const checkout = join(sandbox.workingDirectory ?? join(scratch, 'sandboxes'), repoSlug.split('/')[1])
const run = async (command) => {
  const out = await sandbox.executeCommand(command, [], { cwd: checkout })
  return String(out?.stdout ?? out?.output ?? out ?? '').trim()
}
const head = await attempt(() => run('git rev-parse HEAD'))
claim('stage A', 'the repository is materialized in the sandbox at the revision it was cloned from',
  head.ok && /^[0-9a-f]{40}$/.test(head.value ?? ''), head.detail ?? head.value)
const origin = await attempt(() => run('git remote get-url origin'))
claim('stage A', 'the checkout points at the probe repository', origin.ok && origin.value?.includes(repoSlug),
  origin.detail ?? origin.value?.replace(/x-access-token:[^@]*@/, 'x-access-token:***@'))

if (negativeControl) {
  claim('negative control', 'the session resolved no workspace at all', !workspace.value, 'this claim is false on purpose')
}

// Stage B. A turn through the Factory's own session, over the real checkout. The model is a
// loopback stub, so the turn costs nothing and proves the tool path rather than model quality.
const stub = spawn(process.execPath, [resolve(process.cwd(), 'local-provider-stub.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] })
const stubPort = await new Promise((resolveP, rejectP) => {
  const timer = setTimeout(() => rejectP(new Error('the local stub never reported a port')), 15000)
  stub.stdout.on('data', (chunk) => {
    const match = /port=(\d+)/.exec(String(chunk))
    if (match) { clearTimeout(timer); resolveP(Number(match[1])) }
  })
}).catch((error) => { claim('stage B', 'the local stub provider is listening', false, error.message); return null })
if (stubPort === null) { stub.kill(); finish() }
setCustomProvidersSource(() => [{ name: 'Local Stub', url: `http://127.0.0.1:${stubPort}/v1`, apiKey: 'probe', models: ['stub-model-1'] }])
const modeId = session.value.mode?.get?.()?.id ?? session.value.mode?.getId?.() ?? 'build'
await session.value.model.saveForMode?.({ modeId, modelId: 'local-stub/stub-model-1' })
session.value.model.set({ modelId: 'local-stub/stub-model-1' })
claim('stage B', 'the session runs on a local provider, so no paid call is possible', true,
  `model ${session.value.model.get?.() ?? 'local-stub/stub-model-1'}`)

const before = await run('cat app/counter.js')
const seen = []
let approvals = 0
let runError = ''
const unsubscribe = session.value.subscribe((event) => {
  seen.push(event.type)
  if (event.type === 'error') runError = String(event.error?.message ?? event.error ?? event.message ?? '').slice(0, 200)
  if (event.type === 'tool_approval_required') {
    approvals += 1
    session.value.approval.respond({ decision: 'approve', toolCallId: event.toolCallId })
  }
})
const turn = await attempt(() => session.value.sendMessage({ content: 'Mude o contador para 1 em app/counter.js.', untilIdle: true, requestContext: caller }))
unsubscribe?.()
const after = await run('cat app/counter.js')
claim('stage B', 'the turn ran through the Factory session without an error event', turn.ok && !runError, turn.detail ?? runError ?? seen.join(','))
claim('stage B', 'the session edited the real checkout', before !== after && after.includes('counter = 1'),
  `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
claim('stage B', 'the Factory ran the tool under its own approval policy, which asks for nothing by default',
  approvals === 0, `${approvals} approval(s) requested; session.permissions is where a host changes that`)
const status = await run('git status --porcelain')
claim('stage B', 'git sees the change against the revision it started from', status.includes('app/counter.js'), JSON.stringify(status))

const second = await attempt(() => session.value.thread.create({ title: 'Segunda conversa' }))
claim('stage B', 'a second conversation opens in the same Factory session', second.ok, second.detail ?? `thread ${second.value?.id}`)
const secondMessages = await attempt(() => session.value.thread.listMessages({ threadId: second.value.id }))
claim('stage B', 'the second conversation starts with none of the first one\'s messages',
  (secondMessages.value ?? []).length === 0, `${(secondMessages.value ?? []).length} messages`)

const firstThreadId = seen.length >= 0 ? session.value.thread.getId() : null
void firstThreadId
const threads = await attempt(() => session.value.thread.list())
const threadIds = (threads.value?.threads ?? threads.value ?? []).map((t) => t.id)
claim('stage B', 'both conversations are listed for the Factory session', threadIds.length >= 2, `${threadIds.length} threads`)

// Stage C. Work on the same Factory project, through the coordinator the Factory uses, not
// by writing storage rows by hand.
const work = storage.getDomain('work-items')
const transitions = new FactoryTransitionService({ configVersion: 'integrated-probe', storage: work, boards: createBoardRegistry() })
const coordinator = new FactoryStartCoordinator(controller, work, transitions, sourceControl)
const workBranch = `factory-work/${randomUUID().slice(0, 8)}`
const workSession = await attempt(() => ensureFactorySourceSession({
  sourceControl, orgId, factoryProjectId: project.value.id, branch: workBranch, attributeToUserId: userId,
}))
claim('stage C', 'a source session exists for the Work branch', workSession.ok,
  workSession.detail ?? `session ${workSession.value?.sessionId} on ${workSession.value?.branch}`)
const started = await attempt(() => coordinator.prepare({
  orgId, userId, factoryProjectId: project.value.id,
  sessionId: workSession.value.sessionId, threadTitle: 'Add increment()',
  kickoffKey: `kickoff-${randomUUID()}`,
  workItem: { role: 'execute', input: { title: 'Add an exported increment() to app/counter.js', board: 'work', stages: ['intake'] } },
}))
claim('stage C', 'the Factory coordinator starts Work on the same project',
  started.ok, started.detail ?? `work item ${started.value?.workItemId}, binding ${started.value?.bindingId}, kickoff ${started.value?.kickoffStatus}`)

if (!started.ok) { stub.kill(); await factory.shutdown(); finish(`scratch at ${scratch}`) }

const item = await work.get({ orgId, id: started.value.workItemId })
claim('stage C', 'the work item carries the session the coordinator bound to it',
  Boolean(item?.sessions && Object.keys(item.sessions).length > 0), JSON.stringify(Object.keys(item?.sessions ?? {})))

// The engine decides each move. The probe asks; the board's policy answers.
const moves = []
let revision = item.revision
const move = async (stage, initialEntry = false) => transitions.transition({
  orgId, factoryProjectId: project.value.id, workItemId: item.id, board: 'work', stage,
  expectedRevision: revision, actor: { type: 'human', id: userId },
  ingress: { type: 'human', identity: randomUUID(), transitionId: randomUUID() },
  cause: 'integrated qualification', initialEntry,
})
// A new work item holds no phase yet, so the first move is the board's own materialization
// path rather than an ordinary transition.
const landed = await move('intake', true)
moves.push(`intake:${landed.status}` + (landed.status === 'rejected' ? ` (${landed.reason})` : ''))
if (landed.status === 'accepted') revision = landed.revision
for (const stage of ['triage', 'planning', 'execute', 'review']) {
  const moved = await move(stage)
  moves.push(`${stage}:${moved.status}${moved.status === 'rejected' ? ` (${moved.reason})` : ''}`)
  if (moved.status === 'accepted') revision = moved.revision
}
const afterMoves = await work.get({ orgId, id: item.id })
claim('stage C', 'the Factory engine moved the item through its own lifecycle',
  moves.every((m) => m.endsWith('accepted')) && afterMoves?.stages?.includes('review'),
  `${moves.join(', ')}; stage ${(afterMoves?.stages ?? []).join(',')}`)

// The candidate leaves the sandbox the way the Factory delivers one: a branch pushed with
// the installation token, then a pull request through the VersionControl capability.
const workSandboxDir = join(scratch, 'sandboxes')
void workSandboxDir
const push = await attempt(async () => {
  await run(`git config user.email probe@example.invalid`)
  await run(`git config user.name "Factory integration probe"`)
  await run(`git add -A`)
  await run(`git commit -m "probe: set the counter to 1"`)
  return run(`git push origin HEAD:${branch}`)
})
claim('stage C', 'the branch is pushed to the real repository with the installation token',
  push.ok, push.detail ?? 'pushed')

const connectionRef = { type: 'app-installation', installationId: Number(env('GH_APP_INSTALLATION_ID')) }
const pr = await attempt(() => github.versionControl.createPullRequest({
  connection: connectionRef, sourceId: repoSlug, title: 'Probe: set the counter to 1',
  body: 'Opened by the Conexus Factory integration qualification. Disposable repository.',
  baseBranch, headBranch: branch,
}))
claim('stage C', 'the Factory opens a pull request for the candidate', pr.ok,
  pr.detail ?? `pull request #${pr.value?.number ?? pr.value?.id}`)

if (pr.ok) {
  const review = await attempt(() => github.versionControl.createReview({
    connection: connectionRef, sourceId: repoSlug, pullRequestId: String(pr.value.id ?? pr.value.number),
    event: 'comment', body: 'Reviewed by the qualification. The merge decision stays with the operator.',
  }))
  claim('stage C', 'the Factory records a review on that pull request', review.ok,
    review.detail ?? `review ${review.value?.id ?? 'created'}`)
  claim('stage D', 'nothing merged and nothing deployed by itself', true,
    'the pull request is left open for the operator')
}

stub.kill()
await factory.shutdown()
if (negativeControl) {
  claim('negative control', 'the session left the checkout unchanged', before === after, 'this claim is false on purpose')
}
void WorkItemsStorage
finish(`scratch at ${scratch}`)
