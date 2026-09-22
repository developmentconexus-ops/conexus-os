import { FactoryProjectsStorage } from '@mastra/factory'
import { MemorySettingsStorage } from '@mastra/factory/storage/domains/memory-settings/base'
import { SourceControlStorage } from '@mastra/factory/storage/domains/source-control/base'
import type { PgFactoryStorage } from '@mastra/pg'
import { APPLICATION_CHECK_SETUP_COMMAND } from './application-starter.js'
import type { PostgresPool } from '../platform/postgres.js'
import { FACTORY_INTEGRATION_ID, FACTORY_OPERATOR_ID, FACTORY_WORKING_DIRECTORY } from './factory.js'
import { type GithubApp, GithubRequestError, type GithubRepository } from './factory-github.js'

export type FactoryRecords = Readonly<{
  sourceControl: ReturnType<SourceControlStorage['forIntegration']>
  projects: FactoryProjectsStorage
  memorySettings: MemorySettingsStorage
  // Moves a repositories row, and the connections of its installation, to another installation
  // after the Factory deleted the old one. Answers false when the row itself is gone.
  reattachRepository(input: Readonly<{ id: string; installationId: string }>): Promise<boolean>
}>

// The same storage API the Factory uses at runtime, registered here without prepare() so a
// one-shot command never loads Mastra Code.
export const openFactoryRecords = async (storage: PgFactoryStorage): Promise<FactoryRecords> => {
  const sourceControl = storage.registerDomain(new SourceControlStorage())
  const projects = storage.registerDomain(new FactoryProjectsStorage())
  const memorySettings = storage.registerDomain(new MemorySettingsStorage())
  await storage.init()
  // migrateInstallation() only reaches a row whose installation still exists, and the Factory
  // deletes an installation GitHub answers 404 for without touching its rows. This is the same
  // move on the same collections.
  const reattachRepository: FactoryRecords['reattachRepository'] = ({ id, installationId }) => storage.withTransaction(async (ops) => {
    const row = await ops.findOne<{ installation_id: string }>('source_control_repositories', { id })
    if (!row) return false
    await ops.updateMany('source_control_repositories', { id }, { installation_id: installationId, updated_at: new Date() })
    await ops.updateMany('factory_project_source_control_connections', { installation_id: row.installation_id, integration_id: FACTORY_INTEGRATION_ID }, { installation_id: installationId })
    return true
  })
  return Object.freeze({ sourceControl: sourceControl.forIntegration(FACTORY_INTEGRATION_ID), projects, memorySettings, reattachRepository })
}

const MODEL_ID = /^[\w.-]+\/[\w.:-]+$/

export const setFactoryMemoryModel = async ({ records, orgId, modelId, write }: Readonly<{
  records: FactoryRecords
  orgId: string
  modelId: string
  write(line: string): void
}>): Promise<void> => {
  if (!MODEL_ID.test(modelId)) throw new Error('FACTORY_MEMORY_MODEL_REFUSED')
  await records.memorySettings.patch({ orgId, userId: FACTORY_OPERATOR_ID, patch: { observerModelId: modelId, reflectorModelId: modelId } })
  write(`FACTORY_MEMORY_MODEL=${modelId}`)
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
    for (const repository of held) await repositories.migrateInstallation({ orgId, id: repository.id, newInstallationId: live.id })
    await recorded.delete({ orgId, id: old.id })
  }
  write(`FACTORY_INSTALLATION=${externalId} ACCOUNT=${installation.accountLogin} TYPE=${installation.accountType}`)
}

const factoryProjectName = (projectId: string): string => `conexus-project:${projectId}`
const REPOSITORY_NAME = /^[A-Za-z0-9._-]{1,100}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

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
  const recorded = await repositories.get({ orgId, id: repositoryId })
  if (recorded && recorded.installationId !== installation.id) {
    await repositories.migrateInstallation({ orgId, id: repositoryId, newInstallationId: installation.id })
  } else if (!recorded && !await records.reattachRepository({ id: repositoryId, installationId: installation.id })) {
    throw new Error('FACTORY_REPOSITORY_MISSING')
  }
  const row = await repositories.get({ orgId, id: repositoryId })
  if (!row) throw new Error('FACTORY_REPOSITORY_MISSING')
  const repository = await github.readRepository(Number(installation.externalId), row.slug).catch((error: unknown) => {
    throw error instanceof GithubRequestError && error.status === 404 ? new Error('FACTORY_REPOSITORY_MISSING') : error
  })
  if (String(repository.id) !== row.externalId) throw new Error('FACTORY_REPOSITORY_IDENTITY_CHANGED')
  return repository
}

export const provisionFactoryProject = async ({ github, records, executorPool, orgId, projectId, name, headAttempts = 10, headDelayMs = 1_000 }: Readonly<{
  github: GithubApp
  records: FactoryRecords
  executorPool: PostgresPool
  orgId: string
  projectId: string
  name: string
  headAttempts?: number
  headDelayMs?: number
}>): Promise<FactoryBinding> => {
  if (!UUID.test(projectId)) throw new Error('FACTORY_PROVISION_PROJECT_REFUSED')
  if (!REPOSITORY_NAME.test(name)) throw new Error('FACTORY_PROVISION_NAME_REFUSED')
  const installations = await records.sourceControl.installations.list({ orgId })
  if (installations.length === 0) throw new Error('FACTORY_INSTALLATION_MISSING: run connect first.')
  if (installations.length > 1) throw new Error('FACTORY_INSTALLATION_AMBIGUOUS: more than one installation is connected.')
  const [installation] = installations as [typeof installations[number]]
  if (installation.accountType !== 'Organization' || !installation.accountName) throw new Error(ORGANIZATION_REQUIRED)
  const installationExternalId = Number(installation.externalId)
  const owner = installation.accountName

  // A bound Project reaches its Factory project and repository by the ids it was bound with. The
  // name only finds what an earlier attempt created before it failed to bind.
  const bound = (await executorPool.query<{ binding: Readonly<{ factoryProjectId: string; repositoryId: string }> | null }>(
    'SELECT builder.read_factory_binding_for_project($1) AS binding', [projectId])).rows[0]?.binding ?? null
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

  const headRevision = await waitForHead(
    () => github.readBranchHead(installationExternalId, { externalId: repository.id, slug: repository.fullName }, repository.defaultBranch),
    headAttempts, headDelayMs,
  )
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
  const bind = await executorPool.query<{ bound: boolean }>(
    'SELECT builder.bind_factory_project($1,$2,$3,$4,$5) AS bound',
    [binding.projectId, binding.factoryProjectId, binding.projectRepositoryId, binding.repositoryId, binding.headRevision],
  )
  if (bind.rows[0]?.bound !== true) throw new Error('FACTORY_BINDING_REFUSED')
  return binding
}
