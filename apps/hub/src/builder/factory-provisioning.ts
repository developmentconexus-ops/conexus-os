import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { FactoryProjectsStorage } from '@mastra/factory'
import { getAuthProviderId } from '@mastra/factory/routes/provider-credentials'
import type { ModelCredentialsStorage } from '@mastra/factory/storage/domains/credentials/base'
import { MemorySettingsStorage } from '@mastra/factory/storage/domains/memory-settings/base'
import { SourceControlStorage } from '@mastra/factory/storage/domains/source-control/base'
import type { PgFactoryStorage } from '@mastra/pg'
import { APPLICATION_CHECK_FILES, APPLICATION_CHECK_SETUP_COMMAND, FIXED_APPLICATION_STARTER_FILES } from './application-starter.js'
import type { PostgresPool } from '../platform/postgres.js'
import { FACTORY_INTEGRATION_ID, FACTORY_OPERATOR_ID, FACTORY_WORKING_DIRECTORY } from './factory.js'
import { type GithubApp, GithubRequestError, type GithubRepository } from './factory-github.js'
import { encodeKey, GOOGLE_AI_PRO_PROVIDER, type GoogleAiProKey, isAuthFileName, parseKey, seedGoogleAiProMemory } from './google-ai-pro/credential.js'

export type FactoryRecords = Readonly<{
  sourceControl: ReturnType<SourceControlStorage['forIntegration']>
  projects: FactoryProjectsStorage
  memorySettings: MemorySettingsStorage
  // Moves a repositories row, and the connections of its installation, to another installation,
  // whether or not the old one still exists. Answers false when the row itself is gone.
  reattachRepository(input: Readonly<{ id: string; installationId: string }>): Promise<boolean>
}>

const domainOf = <T extends Readonly<{ name: string }>>(storage: PgFactoryStorage, domain: T): Readonly<{ domain: T; fresh: boolean }> =>
  storage.hasDomain(domain.name)
    ? { domain: storage.getDomain(domain.name) as unknown as T, fresh: false }
    : { domain: storage.registerDomain(domain as never) as unknown as T, fresh: true }

// The same storage API the Factory uses at runtime. A one-shot command registers it without
// prepare(), so it never loads Mastra Code; the Hub reads the domains its prepared Factory holds.
export const openFactoryRecords = async (storage: PgFactoryStorage): Promise<FactoryRecords> => {
  const opened = [
    domainOf(storage, new SourceControlStorage()),
    domainOf(storage, new FactoryProjectsStorage()),
    domainOf(storage, new MemorySettingsStorage()),
  ] as const
  const [{ domain: sourceControl }, { domain: projects }, { domain: memorySettings }] = opened
  if (opened.some(({ fresh }) => fresh)) await storage.init()
  // The same move as migrateInstallation(), which reaches only a row whose installation still exists
  // (the Factory deletes an installation GitHub answers 404 for without touching its rows) and fails
  // when the target installation already holds a row for the same GitHub repository. That row's links
  // come onto this one, whose id the binding and every conversation's link name, and it is dropped.
  const reattachRepository: FactoryRecords['reattachRepository'] = ({ id, installationId }) => storage.withTransaction(async (ops) => {
    const row = await ops.findOne<{ installation_id: string; external_id: string }>('source_control_repositories', { id })
    if (!row) return false
    if (row.installation_id === installationId) return true
    for (const duplicate of await ops.findMany<{ id: string }>('source_control_repositories', { installation_id: installationId, external_id: row.external_id })) {
      await ops.updateMany('factory_project_repositories', { repository_id: duplicate.id }, { repository_id: id })
      await ops.deleteMany('source_control_repositories', { id: duplicate.id })
    }
    await ops.updateMany('source_control_repositories', { id }, { installation_id: installationId, updated_at: new Date() })
    await ops.updateMany('factory_project_source_control_connections', { installation_id: row.installation_id, integration_id: FACTORY_INTEGRATION_ID }, { installation_id: installationId })
    return true
  })
  return Object.freeze({ sourceControl: sourceControl.forIntegration(FACTORY_INTEGRATION_ID), projects, memorySettings, reattachRepository })
}

export const FACTORY_MEMORY_MODEL_ID = /^[\w.-]+\/[\w.:-]+$/
const MODEL_ID = FACTORY_MEMORY_MODEL_ID

export const setFactoryMemoryModel = async ({ records, orgId, modelId, write }: Readonly<{
  records: Pick<FactoryRecords, 'memorySettings'>
  orgId: string
  modelId: string
  write(line: string): void
}>): Promise<void> => {
  if (!MODEL_ID.test(modelId)) throw new Error('FACTORY_MEMORY_MODEL_REFUSED')
  await records.memorySettings.patch({ orgId, userId: FACTORY_OPERATOR_ID, patch: { observerModelId: modelId, reflectorModelId: modelId } })
  write(`FACTORY_MEMORY_MODEL=${modelId}`)
}

const PROVIDER = /^[a-z0-9][a-z0-9._-]{0,63}$/
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type HostCredential = Readonly<{ type: 'oauth'; access: string; refresh: string; expires: number }> | Readonly<{ type: 'api_key'; key: string }>

const hostCredential = (entry: unknown): HostCredential | null => {
  if (typeof entry !== 'object' || entry === null) return null
  const value = entry as Readonly<Record<string, unknown>>
  if (value.type === 'oauth' && typeof value.access === 'string' && typeof value.refresh === 'string' && typeof value.expires === 'number') return value as HostCredential
  if (value.type === 'api_key' && typeof value.key === 'string' && value.key.trim()) return value as HostCredential
  return null
}

/**
 * Copies one provider's login from a Mastra Code auth.json into the Factory's credentials domain,
 * as the installation's shared row or one person's row. Rerunning replaces that row. Only the
 * provider and the row are printed, never the credential.
 */
export const importHostCredential = async ({ credentials, orgId, provider, accountId, authFile, write }: Readonly<{
  credentials: Pick<ModelCredentialsStorage, 'setCredential'>
  orgId: string
  provider: string
  // null is the installation's shared row.
  accountId: string | null
  authFile: string
  write(line: string): void
}>): Promise<void> => {
  if (!PROVIDER.test(provider)) throw new Error('FACTORY_HOST_CREDENTIAL_PROVIDER_REFUSED')
  if (accountId !== null && !ACCOUNT_ID.test(accountId)) throw new Error('FACTORY_HOST_CREDENTIAL_ACCOUNT_REFUSED')
  let entries: Readonly<Record<string, unknown>>
  try {
    entries = JSON.parse(await readFile(authFile, 'utf8'))
  } catch {
    throw new Error('FACTORY_HOST_AUTH_FILE_UNREADABLE')
  }
  // The Factory keys a row by the auth provider id, which for OpenAI is openai-codex.
  const storedAs = getAuthProviderId(provider)
  const credential = hostCredential(entries[provider] ?? entries[storedAs])
  if (!credential) throw new Error(`FACTORY_HOST_CREDENTIAL_MISSING:${provider}`)
  await credentials.setCredential(accountId === null ? { orgId } : { orgId, userId: accountId }, storedAs, credential)
  write(`FACTORY_HOST_CREDENTIAL_IMPORTED=${storedAs}:${credential.type}:${accountId ?? 'shared'}`)
}

/**
 * Stores a CLIProxyAPI Antigravity auth file as a Google AI Pro credential, the row the Settings
 * sign-in writes, for when nobody can sign in through a browser. A person's row also gets the
 * sign-in's memory seed. Rerunning replaces the row. The credential is never printed.
 */
export const importGoogleAiProLogin = async ({ credentials, memorySettings, orgId, accountId, authFile, write }: Readonly<{
  credentials: Pick<ModelCredentialsStorage, 'setCredential'>
  memorySettings: Pick<MemorySettingsStorage, 'ensureReady' | 'patch'>
  orgId: string
  // null is the installation's shared row.
  accountId: string | null
  authFile: string
  write(line: string): void
}>): Promise<void> => {
  if (accountId !== null && !ACCOUNT_ID.test(accountId)) throw new Error('GOOGLE_AI_PRO_LOGIN_ACCOUNT_REFUSED')
  const fileName = basename(authFile)
  if (!isAuthFileName(fileName)) throw new Error('GOOGLE_AI_PRO_LOGIN_FILE_REFUSED')
  let key: GoogleAiProKey | null
  try {
    key = parseKey(encodeKey({ fileName, bytes: new Uint8Array(await readFile(authFile)) }))
  } catch {
    key = null
  }
  if (!key) throw new Error('GOOGLE_AI_PRO_LOGIN_UNREADABLE')
  await credentials.setCredential(accountId === null ? { orgId } : { orgId, userId: accountId }, GOOGLE_AI_PRO_PROVIDER, { type: 'api_key', key })
  if (accountId !== null) await seedGoogleAiProMemory(memorySettings, { orgId, userId: accountId })
  write(`GOOGLE_AI_PRO_LOGIN_IMPORTED=${GOOGLE_AI_PRO_PROVIDER}:api_key:${accountId ?? 'shared'}`)
}

export type FactoryBinding = Readonly<{
  projectId: string
  factoryProjectId: string
  projectRepositoryId: string
  repositoryId: string
  repositoryExternalId: number
  repositorySlug: string
  defaultBranch: string
  headRevision: string
}>

const ORGANIZATION_REQUIRED = 'FACTORY_INSTALLATION_ORGANIZATION_REQUIRED: GitHub does not let an App create repositories in a personal account. Install the App on a GitHub organization (a free organization allows private repositories) and connect again.'

export const connectFactoryInstallation = async ({ github, records, orgId, write }: Readonly<{
  github: GithubApp
  records: FactoryRecords
  orgId: string
  write(line: string): void
}>): Promise<void> => {
  const app = await github.readApp()
  write(`CONEXUS_FACTORY_GITHUB_CLIENT_ID=${app.clientId}`)
  write(`CONEXUS_FACTORY_GITHUB_APP_SLUG=${app.slug}`)
  const installations = await github.listInstallations()
  if (installations.length === 0) throw new Error('FACTORY_INSTALLATION_MISSING: install the App on one GitHub organization, then connect again.')
  if (installations.length > 1) throw new Error('FACTORY_INSTALLATION_AMBIGUOUS: the App is installed on more than one account. Keep one organization installation, then connect again.')
  const [installation] = installations as [typeof installations[number]]
  if (installation.accountType === 'User') throw new Error(ORGANIZATION_REQUIRED)
  const externalId = String(installation.id)
  const { installations: recorded, repositories } = records.sourceControl
  // GitHub lists every live installation of the App, so any other recorded one is gone. Its rows
  // move to the live one, which keeps every id a binding names; only the same account can own them.
  const gone = await Promise.all((await recorded.list({ orgId })).filter((row) => row.externalId !== externalId)
    .map(async (old) => ({ old, held: await repositories.list({ orgId, installationId: old.id }) })))
  const foreign = gone.find(({ old, held }) => held.length > 0 && old.accountName !== installation.accountLogin)
  if (foreign) {
    throw new Error(`FACTORY_INSTALLATION_ACCOUNT_CHANGED: repositories of ${foreign.old.accountName} are recorded under an installation that is gone. Install the App on ${foreign.old.accountName} again.`)
  }
  const existing = await recorded.findByExternalId({ orgId, externalId })
  const live = existing && existing.accountName === installation.accountLogin && existing.accountType === installation.accountType
    ? existing
    : await recorded.upsert({
      orgId,
      connectedByUserId: FACTORY_OPERATOR_ID,
      externalId,
      accountName: installation.accountLogin,
      accountType: installation.accountType,
    })
  for (const { old, held } of gone) {
    for (const repository of held) await records.reattachRepository({ id: repository.id, installationId: live.id })
    await recorded.delete({ orgId, id: old.id })
  }
  write(`FACTORY_INSTALLATION=${externalId} ACCOUNT=${installation.accountLogin} TYPE=${installation.accountType}`)
}

const factoryProjectName = (projectId: string): string => `conexus-project:${projectId}`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The Project's name, reduced to what GitHub accepts, and the head of its id. The same Project
// always names the same repository, so a retry finds the one an earlier attempt created.
export const factoryRepositoryName = (projectName: string, projectId: string): string => {
  const slug = projectName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  return `${slug || 'project'}-${projectId.slice(0, 8)}`
}

const TEMPLATE_MESSAGE = 'Start the Conexus application'

type TreeEntry = Readonly<{ path: string }>
const parseTree = (tree: Record<string, unknown>): Readonly<{ sha: string; paths: ReadonlySet<string> }> => {
  if (typeof tree.sha !== 'string' || !/^[0-9a-f]{40}$/.test(tree.sha) || tree.truncated !== false || !Array.isArray(tree.tree) ||
    !tree.tree.every((entry: unknown) => typeof (entry as Partial<TreeEntry> | null)?.path === 'string')) throw new Error('FACTORY_GITHUB_RESPONSE_REFUSED')
  return { sha: tree.sha, paths: new Set((tree.tree as TreeEntry[]).map((entry) => entry.path)) }
}

// The files a run would write when its checkout lacks them, committed once so the repository
// passes conexus/check.sh from its first revision. A file already there is the repository's.
const seedTemplate = async ({ github, installationId, repository, head }: Readonly<{
  github: GithubApp
  installationId: number
  repository: GithubRepository
  head: string
}>): Promise<string> => {
  const target = { externalId: repository.id, slug: repository.fullName }
  const tree = parseTree(await github.readTree(installationId, target, head))
  const { paths } = tree
  const files = [
    ...(paths.has('app') ? [] : FIXED_APPLICATION_STARTER_FILES),
    ...APPLICATION_CHECK_FILES.filter((file) => !paths.has(file.path)),
  ].map((file) => ({ path: file.path, mode: file.path.endsWith('.sh') ? '100755' as const : '100644' as const, content: file.content }))
  if (files.length === 0) return head
  return github.commitFiles(installationId, target, {
    branch: repository.defaultBranch, parent: head, baseTree: tree.sha, message: TEMPLATE_MESSAGE, files,
  })
}

const waitForHead = async (read: () => Promise<string | null>, attempts: number, delayMs: number): Promise<string> => {
  for (let attempt = 1; ; attempt += 1) {
    const head = await read()
    if (head) return head
    // A repository created with auto_init answers 409 for a moment before its first commit lands.
    if (attempt >= attempts) throw new Error('FACTORY_REPOSITORY_HEAD_UNAVAILABLE')
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}

type Installation = Awaited<ReturnType<FactoryRecords['sourceControl']['installations']['list']>>[number]

// The repository a Project is bound to is the repositories row the binding names, whose GitHub id
// never changes. It is brought under the live installation, then read from GitHub; a Project
// whose repository is gone is refused rather than given a new one.
const boundRepository = async ({ github, records, orgId, installation, repositoryId }: Readonly<{
  github: GithubApp
  records: FactoryRecords
  orgId: string
  installation: Installation
  repositoryId: string
}>): Promise<GithubRepository> => {
  const { repositories } = records.sourceControl
  if (!await records.reattachRepository({ id: repositoryId, installationId: installation.id })) throw new Error('FACTORY_REPOSITORY_MISSING')
  const row = await repositories.get({ orgId, id: repositoryId })
  if (!row) throw new Error('FACTORY_REPOSITORY_MISSING')
  const repository = await github.readRepository(Number(installation.externalId), row.slug).catch((error: unknown) => {
    throw error instanceof GithubRequestError && error.status === 404 ? new Error('FACTORY_REPOSITORY_MISSING') : error
  })
  if (String(repository.id) !== row.externalId) throw new Error('FACTORY_REPOSITORY_IDENTITY_CHANGED')
  return repository
}

export type FactoryRepositoryRequest = Readonly<{
  github: GithubApp
  records: FactoryRecords
  orgId: string
  projectId: string
  projectName: string
  headAttempts?: number
  headDelayMs?: number
}>

type BoundIds = Readonly<{ factoryProjectId: string; repositoryId: string }>

const prepare = async ({ github, records, orgId, projectId, projectName, bound, headAttempts = 10, headDelayMs = 1_000 }: FactoryRepositoryRequest & Readonly<{
  bound: BoundIds | null
}>): Promise<FactoryBinding> => {
  if (!UUID.test(projectId)) throw new Error('FACTORY_PROVISION_PROJECT_REFUSED')
  if (typeof projectName !== 'string' || !/\S/.test(projectName)) throw new Error('FACTORY_PROVISION_NAME_REFUSED')
  const name = factoryRepositoryName(projectName, projectId)
  const installations = await records.sourceControl.installations.list({ orgId })
  if (installations.length === 0) throw new Error('FACTORY_INSTALLATION_MISSING: run connect first.')
  if (installations.length > 1) throw new Error('FACTORY_INSTALLATION_AMBIGUOUS: more than one installation is connected.')
  const [installation] = installations as [typeof installations[number]]
  if (installation.accountType !== 'Organization' || !installation.accountName) throw new Error(ORGANIZATION_REQUIRED)
  const installationExternalId = Number(installation.externalId)
  const owner = installation.accountName

  // A bound Project reaches its Factory project and repository by the ids it was bound with. The
  // name only finds what an earlier attempt created before it failed to bind.
  const repository = bound
    ? await boundRepository({ github, records, orgId, installation, repositoryId: bound.repositoryId })
    : await github.createOrganizationRepository(installationExternalId, owner, name) ?? await github.readRepository(installationExternalId, `${owner}/${name}`)
  if (!repository.private) throw new Error('FACTORY_REPOSITORY_PUBLIC_REFUSED')

  const ownName = factoryProjectName(projectId)
  const existingProject = bound
    ? await records.projects.get({ orgId, id: bound.factoryProjectId })
    : (await records.projects.list({ orgId })).find((project) => project.name === ownName)
  if (bound && !existingProject) throw new Error('FACTORY_PROJECT_MISSING')
  const externalId = String(repository.id)
  const knownRepository = await records.sourceControl.repositories.findByExternalId({ orgId, externalId })
  if (knownRepository) {
    const links = await records.sourceControl.projectRepositories.listByExternalRepository({ installationExternalId: installation.externalId, repositoryExternalId: externalId })
    if (links.some((link) => link.factoryProjectId !== existingProject?.id)) throw new Error('FACTORY_REPOSITORY_BOUND_ELSEWHERE')
  }

  const factoryProject = existingProject ?? await records.projects.create({ orgId, userId: FACTORY_OPERATOR_ID, input: { name: ownName } })
  const repositoryRow = knownRepository && knownRepository.installationId === installation.id &&
    knownRepository.slug === repository.fullName && knownRepository.defaultBranch === repository.defaultBranch
    ? knownRepository
    : await records.sourceControl.repositories.upsert({
      orgId,
      input: {
        installationId: installation.id,
        externalId,
        slug: repository.fullName,
        defaultBranch: repository.defaultBranch,
        providerMetadata: { private: repository.private, owner: repository.owner },
      },
    })
  const connection = await records.sourceControl.connections.create({
    orgId, factoryProjectId: factoryProject.id, installationId: installation.id, createdByUserId: FACTORY_OPERATOR_ID,
  })
  const linked = await records.sourceControl.projectRepositories.link({
    orgId,
    connectionId: connection.id,
    repositoryId: repositoryRow.id,
    createdByUserId: FACTORY_OPERATOR_ID,
    branch: null,
    sandboxProvider: 'e2b',
    sandboxWorkdir: FACTORY_WORKING_DIRECTORY,
    setupCommand: APPLICATION_CHECK_SETUP_COMMAND,
  })
  // link() returns an existing row as it is, so a link made before the setup command gets it here.
  const projectRepository = linked.setupCommand === APPLICATION_CHECK_SETUP_COMMAND
    ? linked
    : await records.sourceControl.projectRepositories.update({ orgId, id: linked.id, input: { setupCommand: APPLICATION_CHECK_SETUP_COMMAND } })
  if (!projectRepository) throw new Error('FACTORY_PROJECT_REPOSITORY_MISSING')

  const head = await waitForHead(
    () => github.readBranchHead(installationExternalId, { externalId: repository.id, slug: repository.fullName }, repository.defaultBranch),
    headAttempts, headDelayMs,
  )
  // A bound repository is the Project's source, which provisioning never writes.
  const headRevision = bound ? head : await seedTemplate({ github, installationId: installationExternalId, repository, head })
  const binding: FactoryBinding = Object.freeze({
    projectId,
    factoryProjectId: factoryProject.id,
    projectRepositoryId: projectRepository.id,
    repositoryId: repositoryRow.id,
    repositoryExternalId: repository.id,
    repositorySlug: repository.fullName,
    defaultBranch: repository.defaultBranch,
    headRevision,
  })
  return binding
}

/**
 * The Project's private repository in the connected organization, seeded with the application
 * template, and its Factory project and project repository rows, without the binding. It creates
 * nothing twice: a retry after any failure finds the repository by the name the Project always
 * derives, and the Factory rows by the Project's id.
 */
export const prepareFactoryRepository = (request: FactoryRepositoryRequest): Promise<FactoryBinding> => prepare({ ...request, bound: null })

/** Gives an existing Project its repository and binds it; a bound Project converges to its binding. */
export const provisionFactoryProject = async ({ executorPool, ...request }: FactoryRepositoryRequest & Readonly<{ executorPool: PostgresPool }>): Promise<FactoryBinding> => {
  if (!UUID.test(request.projectId)) throw new Error('FACTORY_PROVISION_PROJECT_REFUSED')
  const bound = (await executorPool.query<{ binding: BoundIds | null }>(
    'SELECT builder.read_factory_binding_for_project($1) AS binding', [request.projectId])).rows[0]?.binding ?? null
  const binding = await prepare({ ...request, bound })
  const bind = await executorPool.query<{ bound: boolean }>(
    'SELECT builder.bind_factory_project($1,$2,$3,$4,$5) AS bound',
    [binding.projectId, binding.factoryProjectId, binding.projectRepositoryId, binding.repositoryId, binding.headRevision],
  )
  if (bind.rows[0]?.bound !== true) throw new Error('FACTORY_BINDING_REFUSED')
  return binding
}
