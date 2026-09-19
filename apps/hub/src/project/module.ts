import type { FastifyInstance } from 'fastify'
import { createPostgresPool } from '../platform/postgres.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { ProjectRuntimeConfig } from '../platform/config.js'
import { readSecretFile } from '../platform/secrets.js'
import { readJsonFile } from '../model-connection/model-catalog.js'
import { createOciGitExecutionPort, createOciProjectBindingGitCapability } from './git-execution.js'
import type { GitExecutionPort, ProjectBindingRecoveryGitCapability } from './git-execution.js'
import { R2_PROJECT_BINDING_OWNERSHIP } from '../generated/r2-project-binding-ownership.js'
import { createProjectBindingRecovery } from './binding-recovery.js'
import { createGitImportAdmissionCatalog } from './git-import-admission.js'
import type { GitImportAdmissionEntry } from './git-import-admission.js'
import { registerProjectBrainBindingRoutes, registerProjectConnectionBindingRoutes, registerProjectRoutes } from './routes.js'
import type { ResolveProjectSession } from './routes.js'
import type { ProjectBrainBindingStore } from './brain-binding.js'
import { createProjectBrainBindingStore } from './brain-binding.js'
import type { ProjectBrainBindingValidator } from './brain-binding.js'
import { createProjectBrainBindingDatabasePorts } from './brain-binding-postgres.js'
import type { ProjectSourceRecovery } from './source-recovery.js'
import { createProjectSourceRecovery } from './source-recovery.js'
import { createProjectSourceSnapshot } from './source-snapshot.js'
import type { ProjectSourceSnapshotFactory } from './source-snapshot.js'
import { readProjectBrainRealization } from './brain-realization.js'
import { createProjectConnectionBindingStore, createProjectStore } from './store.js'

export type ProjectBrainBindingModule = Readonly<{
  registerProjectBrainBindingRoutes(app: FastifyInstance): Promise<readonly ('PRJ-10' | 'PRJ-11' | 'PRJ-12')[]>
}>

export const createProjectBrainBindingModule = ({ store, origin, resolveCurrentSession }: Readonly<{
  store: ProjectBrainBindingStore
  origin: string
  resolveCurrentSession: ResolveProjectSession
}>): ProjectBrainBindingModule => Object.freeze({
  registerProjectBrainBindingRoutes: (app: FastifyInstance) => registerProjectBrainBindingRoutes(app, {
    store, origin, resolveCurrentSession,
  }),
})

export type ProjectConnectionBindingModule = Readonly<{
  registerProjectConnectionBindingRoutes(app: FastifyInstance): Promise<readonly ('PRJ-13' | 'PRJ-14' | 'PRJ-15')[]>
  reconcileBindingSource(accountId: string, projectId: string): Promise<void>
  close(): Promise<void>
}>

export const createProjectConnectionBindingModule = ({ pool, git, origin, resolveCurrentSession }: Readonly<{
  pool: PostgresPool
  git: ProjectBindingRecoveryGitCapability
  origin: string
  resolveCurrentSession: ResolveProjectSession
}>): ProjectConnectionBindingModule => {
  const store = createProjectConnectionBindingStore({ pool, git })
  const recovery = createProjectBindingRecovery({ pool, git })
  return Object.freeze({
    reconcileBindingSource: recovery.reconcile,
    registerProjectConnectionBindingRoutes: (app: FastifyInstance) => registerProjectConnectionBindingRoutes(app, {
      store, origin, resolveCurrentSession,
    }),
    close: () => pool.end(),
  })
}

export type ProjectBindingModule = ProjectBrainBindingModule & ProjectConnectionBindingModule

export const createProjectBindingModule = ({
  pool,
  brainAuthorityPool,
  createDatabasePorts = createProjectBrainBindingDatabasePorts,
  git,
  sourceSnapshot,
  validator,
  origin,
  resolveCurrentSession,
}: Readonly<{
  pool: PostgresPool
  brainAuthorityPool: PostgresPool
  createDatabasePorts?: typeof createProjectBrainBindingDatabasePorts
  git: ProjectBindingRecoveryGitCapability
  sourceSnapshot: ProjectSourceSnapshotFactory
  validator: ProjectBrainBindingValidator
  origin: string
  resolveCurrentSession: ResolveProjectSession
}>): ProjectBindingModule => {
  const recovery = createProjectBindingRecovery({ pool, git })
  const ports = createDatabasePorts({ bindingPool: pool, brainAuthorityPool })
  const brainStore = createProjectBrainBindingStore({ ...ports, sourceSnapshot, validator, recovery })
  const connectionStore = createProjectConnectionBindingStore({ pool, git })
  return Object.freeze({
    reconcileBindingSource: recovery.reconcile,
    registerProjectBrainBindingRoutes: (app: FastifyInstance) => registerProjectBrainBindingRoutes(app, {
      store: brainStore, origin, resolveCurrentSession,
    }),
    registerProjectConnectionBindingRoutes: (app: FastifyInstance) => registerProjectConnectionBindingRoutes(app, {
      store: connectionStore, origin, resolveCurrentSession,
    }),
    close: async () => Promise.all([pool.end(), brainAuthorityPool.end()]).then(() => undefined),
  })
}

export const createConfiguredProjectConnectionBindingModule = ({ database, bindings, origin, resolveCurrentSession }: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  bindings: Readonly<{ passwordFile: string; storageRoot: string }>
  origin: string
  resolveCurrentSession: ResolveProjectSession
}>): ProjectConnectionBindingModule => createProjectConnectionBindingModule({
  pool: createPostgresPool({ ...database, user: 'hub_r2_project_binding', password: readSecretFile(bindings.passwordFile) }),
  git: createOciProjectBindingGitCapability({ projectStorageRoot: bindings.storageRoot }),
  origin,
  resolveCurrentSession,
})

export const createConfiguredProjectBindingModule = ({
  database,
  bindings,
  sourceSnapshot,
  validator,
  origin,
  resolveCurrentSession,
}: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  bindings: Readonly<{
    passwordFile: string
    attesterPasswordFile: string
    storageRoot: string
    sourceOwnershipManifestFile: string
  }>
  sourceSnapshot?: ProjectSourceSnapshotFactory
  validator: ProjectBrainBindingValidator
  origin: string
  resolveCurrentSession: ResolveProjectSession
}>): ProjectBindingModule => createProjectBindingModule({
  pool: createPostgresPool({
    ...database,
    user: 'hub_r2_project_binding',
    password: readSecretFile(bindings.passwordFile),
  }),
  brainAuthorityPool: createPostgresPool({
    ...database,
    user: 'hub_r2_brain_attester',
    password: readSecretFile(bindings.attesterPasswordFile),
  }),
  git: createOciProjectBindingGitCapability({ projectStorageRoot: bindings.storageRoot }),
  sourceSnapshot: sourceSnapshot ?? createConfiguredProjectSourceSnapshotFactory(bindings),
  validator,
  origin,
  resolveCurrentSession,
})

export type ProjectModule = Readonly<{
  registerProjectRoutes(app: FastifyInstance): Promise<readonly ('PRJ-01' | 'PRJ-02' | 'PRJ-03')[]>
  sourceGit: GitExecutionPort
  warmGitImage(): ReturnType<GitExecutionPort['verifyAdmittedImage']>
  close(): Promise<void>
}>

export const createProjectModule = ({
  commandPool,
  readPool,
  git,
  recovery,
  origin,
  resolveCurrentSession,
}: Readonly<{
  commandPool: PostgresPool
  readPool: PostgresPool
  git: GitExecutionPort
  recovery: ProjectSourceRecovery
  origin: string
  resolveCurrentSession: ResolveProjectSession
}>): ProjectModule => {
  const store = createProjectStore({ commandPool, readPool, git, recovery })
  return Object.freeze({
    registerProjectRoutes: (app: FastifyInstance) => registerProjectRoutes(app, {
      store, resolveCurrentSession, origin,
    }),
    sourceGit: git,
    warmGitImage: () => git.verifyAdmittedImage(),
    close: async () => {
      await Promise.all([commandPool.end(), readPool.end()])
    },
  })
}

export const composeProjectSourceOwnership = (input: unknown): Readonly<Record<string, string>> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('PROJECT_SOURCE_OWNERSHIP_REFUSED')
  const result: Record<string, string> = Object.create(null)
  for (const [path, owner] of Object.entries(input)) {
    if (!path || path.startsWith('/') || path.includes('\\') ||
      [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      path.split('/').some((part) => !part || part === '.' || part === '..') ||
      typeof owner !== 'string' || !['GENERATED', 'PLATFORM-CONTRACT', 'APP-OWNED'].includes(owner)) {
      throw new Error('PROJECT_SOURCE_OWNERSHIP_REFUSED')
    }
    result[path] = owner
  }
  for (const entry of R2_PROJECT_BINDING_OWNERSHIP.entries) {
    if (Object.hasOwn(result, entry.path) && result[entry.path] !== entry.class) {
      throw new Error('PROJECT_SOURCE_OWNERSHIP_REFUSED')
    }
    result[entry.path] = entry.class
  }
  return Object.freeze(result)
}

export const readProjectSourceOwnership = (path: string): Readonly<Record<string, string>> =>
  composeProjectSourceOwnership(readJsonFile(path))

export const createBuilderProjectGitCapability = (storageRoot: string): GitExecutionPort =>
  createOciGitExecutionPort({ projectStorageRoot: storageRoot })

export const createConfiguredProjectSourceSnapshotFactory = ({
  storageRoot,
  sourceOwnershipManifestFile,
}: Readonly<{
  storageRoot: string
  sourceOwnershipManifestFile: string
}>): ProjectSourceSnapshotFactory => {
  const ownership = composeProjectSourceOwnership(readJsonFile(sourceOwnershipManifestFile))
  return ({ projectId, sourceRevision }) => createProjectSourceSnapshot({
    storageRoot,
    projectId,
    sourceRevision,
    ownership,
  })
}

export const createProjectBrainRealizationPort = (
  sourceSnapshot: ProjectSourceSnapshotFactory,
) => Object.freeze({
  getCurrentRealization: async (input: Readonly<{
    projectId: string
    sourceRevision: string
    brainSource: unknown
  }>) => {
    try {
      const realization = await readProjectBrainRealization({
        source: sourceSnapshot({ projectId: input.projectId, sourceRevision: input.sourceRevision }),
        expectedSourceRevision: input.sourceRevision,
        brainSource: input.brainSource,
      })
      return {
        status: 'FOUND' as const,
        value: {
          sourceRevision: realization.sourceRevision,
          inputDigest: realization.inputDigest,
          manifestDigest: realization.manifestDigest,
          applicableItemIds: realization.applicableItemIds,
        },
      }
    } catch {
      return { status: 'UNAVAILABLE' as const }
    }
  },
})

export const createConfiguredProjectModule = ({
  database,
  project,
  origin,
  resolveCurrentSession,
}: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  project: ProjectRuntimeConfig
  origin: string
  resolveCurrentSession: ResolveProjectSession
}>): ProjectModule => {
  const catalogInput = readJsonFile(project.gitImportCatalogFile)
  const slotInput = readJsonFile(project.externalFileSlotsFile)
  if (!catalogInput || typeof catalogInput !== 'object' || !('entries' in catalogInput) || !Array.isArray(catalogInput.entries)) {
    throw new Error('PROJECT_GIT_CATALOG_REFUSED')
  }
  if (!slotInput || typeof slotInput !== 'object' || Array.isArray(slotInput) ||
    Object.values(slotInput).some((value) => typeof value !== 'string')) throw new Error('PROJECT_EXTERNAL_SLOTS_REFUSED')
  const externalSlots = slotInput as Readonly<Record<string, string>>
  const catalog = createGitImportAdmissionCatalog(catalogInput.entries as GitImportAdmissionEntry[])
  if (!catalog) throw new Error('PROJECT_GIT_CATALOG_REFUSED')
  return createProjectModule({
    commandPool: createPostgresPool({
      ...database,
      user: 'hub_prj03_command',
      password: readSecretFile(project.commandPasswordFile),
    }),
    readPool: createPostgresPool({
      ...database,
      user: 'hub_s3_read',
      password: readSecretFile(project.readPasswordFile),
    }),
    git: createOciGitExecutionPort({
      projectStorageRoot: project.storageRoot,
      gitImportCatalog: catalog,
      externalFileSlots: externalSlots,
    }),
    recovery: createProjectSourceRecovery(project.storageRoot),
    origin,
    resolveCurrentSession,
  })
}
export {
  BRAIN_REALIZATION_PATH,
  parseBrainRealization,
  readProjectBrainRealization,
  readProjectBrainRealizationManifest,
} from './brain-realization.js'
export type {
  BrainRealization,
  ParsedBrainRealization,
  VerifiedBrainRealizationManifestSource,
  VerifiedBrainRealizationSource,
} from './brain-realization.js'
export { createProjectKeyConformanceBasisResolver } from './key-conformance-basis.js'
export type {
  ProjectKeyConformanceBasis,
  ProjectKeyConformanceBasisRequest,
} from './key-conformance-basis.js'
