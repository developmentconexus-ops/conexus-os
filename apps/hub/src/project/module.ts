import type { FastifyInstance } from 'fastify'
import type { MastraLanguageModel } from '@mastra/core/agent'
import { lstatSync, readFileSync } from 'node:fs'
import { createPostgresPool } from '../platform/postgres.js'
import type { PostgresPool } from '../platform/postgres.js'
import { readSecretFile } from '../platform/secrets.js'
import {
  createAnthropicOAuthModel,
  PROJECT_ANTHROPIC_ADMISSION_ID,
  PROJECT_ANTHROPIC_MODEL_ID,
} from './anthropic-oauth-provider.js'
import { createOciGitExecutionPort, createOciProjectBindingGitCapability } from './git-execution.js'
import type { GitExecutionPort, ProjectBindingRecoveryGitCapability } from './git-execution.js'
import { R2_PROJECT_BINDING_OWNERSHIP } from '../generated/r2-project-binding-ownership.js'
import { createProjectBindingRecovery } from './binding-recovery.js'
import { createGitImportAdmissionCatalog } from './git-import-admission.js'
import type { GitImportAdmissionEntry } from './git-import-admission.js'
import { createProjectBaselineExplanationService } from './explanation.js'
import { createProjectInceptionService } from './inception.js'
import type { ProjectInceptionService, ProjectSourceSnapshotFactory } from './inception.js'
import { createOAuthTokenStore } from './oauth-token-store.js'
import { createProjectMastra } from './project-mastra.js'
import type { ProjectMastraPort } from './project-mastra.js'
import { registerProjectBrainBindingRoutes, registerProjectConnectionBindingRoutes, registerProjectRoutes } from './routes.js'
import type { ResolveProjectSession } from './routes.js'
import type { ProjectBrainBindingStore } from './brain-binding.js'
import { createProjectBrainBindingStore } from './brain-binding.js'
import type { ProjectBrainBindingValidator } from './brain-binding.js'
import { createProjectBrainBindingDatabasePorts } from './brain-binding-postgres.js'
import type { ProjectSourceRecovery } from './source-recovery.js'
import { createProjectSourceRecovery } from './source-recovery.js'
import { createProjectSourceSnapshot } from './source-snapshot.js'
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
  registerProjectRoutes(app: FastifyInstance): Promise<readonly ('PRJ-01' | 'PRJ-02' | 'PRJ-03' | 'PRJ-07' | 'PRJ-08' | 'PRJ-09' | 'PRJ-23' | 'PRJ-24')[]>
  close(): Promise<void>
}>

export const createProjectModule = ({
  commandPool,
  readPool,
  baselineReadPool,
  baselineCommandPool,
  git,
  recovery,
  inception,
  cognition,
  origin,
  resolveCurrentSession,
}: Readonly<{
  commandPool: PostgresPool
  readPool: PostgresPool
  baselineReadPool: PostgresPool
  baselineCommandPool: PostgresPool
  git: GitExecutionPort
  recovery: ProjectSourceRecovery
  inception: ProjectInceptionService
  cognition: ProjectMastraPort
  origin: string
  resolveCurrentSession: ResolveProjectSession
}>): ProjectModule => {
  const store = createProjectStore({ commandPool, readPool, baselineReadPool, baselineCommandPool, git, recovery })
  const explanation = createProjectBaselineExplanationService({
    store,
    cognition,
    admissionId: PROJECT_ANTHROPIC_ADMISSION_ID,
  })
  return Object.freeze({
    registerProjectRoutes: (app: FastifyInstance) => registerProjectRoutes(app, {
      store, inception, explanation, resolveCurrentSession, origin,
    }),
    close: async () => {
      await Promise.all([commandPool.end(), readPool.end(), baselineReadPool.end(), baselineCommandPool.end(), inception.close(), cognition.close()])
    },
  })
}

const readJsonFile = (path: string): unknown => {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PROJECT_CONFIG_FILE_REFUSED')
  return JSON.parse(readFileSync(path, 'utf8'))
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

export const createProjectAdmittedModel = ({ admissionId, credentialFile }: Readonly<{
  admissionId: string
  credentialFile: string
}>): MastraLanguageModel => {
  if (admissionId !== PROJECT_ANTHROPIC_ADMISSION_ID) throw new Error('PROJECT_MODEL_ADMISSION_REFUSED')
  return createAnthropicOAuthModel({ tokenStore: createOAuthTokenStore(credentialFile) })
}

export type ResolvedProjectModelAdmission = Readonly<{
  admissionId: string
  providerId: string
  modelId: string
  model: MastraLanguageModel
}>

export const resolveProjectModelAdmission = ({
  catalogFile,
  credentialSlotsFile,
  admissionId,
  capability,
}: Readonly<{
  catalogFile: string
  credentialSlotsFile: string
  admissionId: string
  capability: 'BUILDER_CODING'
}>): ResolvedProjectModelAdmission => {
  const catalog = readJsonFile(catalogFile)
  const slots = readJsonFile(credentialSlotsFile)
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) ||
    !('schemaVersion' in catalog) || catalog.schemaVersion !== 'conexus-model-admission-catalog/v1' ||
    !('entries' in catalog) || !Array.isArray(catalog.entries) || catalog.entries.length < 1 || catalog.entries.length > 16 ||
    !slots || typeof slots !== 'object' || Array.isArray(slots)) throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
  const identities = new Set<string>()
  for (const value of catalog.entries) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
    const entry = value as Record<string, unknown>
    const keys = Object.keys(entry).sort().join(',')
    if (keys !== 'admissionId,capabilitySet,credentialSlot,enabled,modelId,officialHttpsOrigin,providerId' ||
      typeof entry.admissionId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(entry.admissionId) ||
      identities.has(entry.admissionId) || typeof entry.providerId !== 'string' ||
      typeof entry.modelId !== 'string' || !entry.modelId || /latest|\*/i.test(entry.modelId) ||
      typeof entry.credentialSlot !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(entry.credentialSlot) ||
      !Array.isArray(entry.capabilitySet) || entry.capabilitySet.some((item) => item !== 'BUILDER_CODING') ||
      entry.capabilitySet.length !== 1 || typeof entry.enabled !== 'boolean') throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
    identities.add(entry.admissionId)
  }
  const selected = catalog.entries.find((value) => (value as Record<string, unknown>).admissionId === admissionId) as Record<string, unknown> | undefined
  if (!selected || selected.enabled !== true || !(selected.capabilitySet as unknown[]).includes(capability)) {
    throw new Error('PROJECT_MODEL_ADMISSION_UNAVAILABLE')
  }
  if (selected.providerId !== 'anthropic' || selected.officialHttpsOrigin !== 'https://api.anthropic.com') {
    throw new Error('PROJECT_MODEL_PROVIDER_UNSUPPORTED')
  }
  const credentialFile = (slots as Record<string, unknown>)[selected.credentialSlot as string]
  if (typeof credentialFile !== 'string' || !credentialFile) throw new Error('PROJECT_MODEL_CREDENTIAL_SLOT_REFUSED')
  return Object.freeze({
    admissionId: selected.admissionId as string,
    providerId: selected.providerId,
    modelId: selected.modelId as string,
    model: createAnthropicOAuthModel({ tokenStore: createOAuthTokenStore(credentialFile), modelId: selected.modelId as string }),
  })
}

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
  sourceSnapshot: configuredSourceSnapshot,
  origin,
  resolveCurrentSession,
  reconcileBindingSource,
}: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  project: Readonly<{
    commandPasswordFile: string
    readPasswordFile: string
    baselineReadPasswordFile: string
    baselineCommandPasswordFile: string
    inceptionCommandPasswordFile: string
    storageRoot: string
    gitImportCatalogFile: string
    externalFileSlotsFile: string
    modelCatalogFile: string
    sourceOwnershipManifestFile: string
  }>
  sourceSnapshot?: ProjectSourceSnapshotFactory
  origin: string
  resolveCurrentSession: ResolveProjectSession
  reconcileBindingSource?: (accountId: string, projectId: string) => Promise<void>
}>): ProjectModule => {
  const catalogInput = readJsonFile(project.gitImportCatalogFile)
  const slotInput = readJsonFile(project.externalFileSlotsFile)
  const modelInput = readJsonFile(project.modelCatalogFile)
  if (!catalogInput || typeof catalogInput !== 'object' || !('entries' in catalogInput) || !Array.isArray(catalogInput.entries)) {
    throw new Error('PROJECT_GIT_CATALOG_REFUSED')
  }
  if (!slotInput || typeof slotInput !== 'object' || Array.isArray(slotInput) ||
    Object.values(slotInput).some((value) => typeof value !== 'string')) throw new Error('PROJECT_EXTERNAL_SLOTS_REFUSED')
  if (!modelInput || typeof modelInput !== 'object' || !('entries' in modelInput) || !Array.isArray(modelInput.entries) ||
    modelInput.entries.length !== 1) throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
  const modelEntry = modelInput.entries[0] as Record<string, unknown>
  if (modelEntry.admissionId !== PROJECT_ANTHROPIC_ADMISSION_ID || modelEntry.providerId !== 'anthropic' ||
    modelEntry.modelId !== PROJECT_ANTHROPIC_MODEL_ID || modelEntry.enabled !== true || typeof modelEntry.credentialSlot !== 'string') {
    throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
  }
  const externalSlots = slotInput as Readonly<Record<string, string>>
  const credentialPath = externalSlots[modelEntry.credentialSlot]
  if (!credentialPath) throw new Error('PROJECT_MODEL_CREDENTIAL_SLOT_REFUSED')
  const cognition = createProjectMastra([{
    admissionId: modelEntry.admissionId,
    providerId: 'anthropic',
    modelId: PROJECT_ANTHROPIC_MODEL_ID,
    enabled: true,
    model: createAnthropicOAuthModel({ tokenStore: createOAuthTokenStore(credentialPath) }),
  }])
  const inceptionPool = createPostgresPool({
    ...database,
    user: 'hub_s6_inception_command',
    password: readSecretFile(project.inceptionCommandPasswordFile),
  })
  const sourceSnapshot = configuredSourceSnapshot ?? createConfiguredProjectSourceSnapshotFactory({
    storageRoot: project.storageRoot,
    sourceOwnershipManifestFile: project.sourceOwnershipManifestFile,
  })
  const inception = createProjectInceptionService({
    pool: inceptionPool,
    cognition,
    sourceSnapshot,
    admissionId: PROJECT_ANTHROPIC_ADMISSION_ID,
    ...(reconcileBindingSource ? { reconcileBindingSource } : {}),
  })
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
    baselineReadPool: createPostgresPool({
      ...database,
      user: 'hub_s4_baseline_read',
      password: readSecretFile(project.baselineReadPasswordFile),
    }),
    baselineCommandPool: createPostgresPool({
      ...database,
      user: 'hub_s4_baseline_command',
      password: readSecretFile(project.baselineCommandPasswordFile),
    }),
    git: createOciGitExecutionPort({
      projectStorageRoot: project.storageRoot,
      gitImportCatalog: catalog,
      externalFileSlots: externalSlots,
    }),
    recovery: createProjectSourceRecovery(project.storageRoot),
    inception,
    cognition,
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
