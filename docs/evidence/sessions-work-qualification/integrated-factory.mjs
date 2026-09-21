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
import { MastraFactory } from '@mastra/factory'
import { GithubIntegration } from '@mastra/factory/integrations/github/integration'
import { ensureFactorySourceSession } from '@mastra/factory/session/factory-session'
import { Mastra } from '@mastra/core/mastra'
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

const session = await attempt(() => controller.createSession({ resourceId: ensured.value.sessionId }))
if (!claim('stage A', 'an interactive session opens on that source session', session.ok, session.detail ?? 'opened')) finish()

const workspace = await attempt(() => session.value.getWorkspace())
if (!claim('stage A', 'the session resolves a workspace over the real repository', workspace.ok && Boolean(workspace.value),
  workspace.detail ?? String(workspace.value?.constructor?.name))) finish()

const head = await attempt(async () => {
  const sandbox = workspace.value.sandbox
  await sandbox.start?.()
  const out = await sandbox.executeCommand('git rev-parse HEAD && git remote get-url origin')
  return String(out?.stdout ?? out).trim()
})
claim('stage A', 'the repository is materialized in the sandbox at a known revision', head.ok,
  head.detail ?? head.value?.split('\n')[0])

if (negativeControl) {
  claim('negative control', 'the session resolved no workspace at all', !workspace.value, 'this claim is false on purpose')
}

// Stages B and C are written once stage A has run against the real repository, so their
// assertions describe what the Factory did rather than what it was expected to do.
finish(`stage A complete; scratch at ${scratch}`)
