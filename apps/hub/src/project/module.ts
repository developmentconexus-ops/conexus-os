import type { FastifyInstance } from 'fastify'
import { lstatSync, readFileSync } from 'node:fs'
import { createPostgresPool } from '../platform/postgres.js'
import type { PostgresPool } from '../platform/postgres.js'
import { readSecretFile } from '../platform/secrets.js'
import {
  createAnthropicOAuthModel,
  PROJECT_ANTHROPIC_ADMISSION_ID,
  PROJECT_ANTHROPIC_MODEL_ID,
} from './anthropic-oauth-provider.js'
import { createOciGitExecutionPort } from './git-execution.js'
import type { GitExecutionPort } from './git-execution.js'
import { createGitImportAdmissionCatalog } from './git-import-admission.js'
import type { GitImportAdmissionEntry } from './git-import-admission.js'
import { createProjectBaselineExplanationService } from './explanation.js'
import { createProjectInceptionService } from './inception.js'
import type { ProjectInceptionService, ProjectSourceSnapshotFactory } from './inception.js'
import { createOAuthTokenStore } from './oauth-token-store.js'
import { createProjectMastra } from './project-mastra.js'
import type { ProjectMastraPort } from './project-mastra.js'
import { registerProjectRoutes } from './routes.js'
import type { ResolveProjectSession } from './routes.js'
import type { ProjectSourceRecovery } from './source-recovery.js'
import { createProjectSourceRecovery } from './source-recovery.js'
import { createProjectSourceSnapshot } from './source-snapshot.js'
import { createProjectStore } from './store.js'

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

export const createConfiguredProjectModule = ({
  database,
  project,
  origin,
  resolveCurrentSession,
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
  origin: string
  resolveCurrentSession: ResolveProjectSession
}>): ProjectModule => {
  const catalogInput = readJsonFile(project.gitImportCatalogFile)
  const slotInput = readJsonFile(project.externalFileSlotsFile)
  const modelInput = readJsonFile(project.modelCatalogFile)
  const ownershipInput = readJsonFile(project.sourceOwnershipManifestFile)
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
  if (!ownershipInput || typeof ownershipInput !== 'object' || Array.isArray(ownershipInput) ||
    Object.values(ownershipInput).some((value) => !['GENERATED', 'PLATFORM-CONTRACT', 'APP-OWNED'].includes(String(value)))) {
    throw new Error('PROJECT_SOURCE_OWNERSHIP_REFUSED')
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
  const sourceSnapshot: ProjectSourceSnapshotFactory = ({ projectId, sourceRevision }) => createProjectSourceSnapshot({
    storageRoot: project.storageRoot,
    projectId,
    sourceRevision,
    ownership: ownershipInput as Readonly<Record<string, string>>,
  })
  const inception = createProjectInceptionService({
    pool: inceptionPool,
    cognition,
    sourceSnapshot,
    admissionId: PROJECT_ANTHROPIC_ADMISSION_ID,
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
