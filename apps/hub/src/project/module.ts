import type { FastifyInstance } from 'fastify'
import { createPostgresPool } from '../platform/postgres.js'
import type { PostgresPool } from '../platform/postgres.js'
import type { ProjectRuntimeConfig } from '../platform/config.js'
import { readSecretFile } from '../platform/secrets.js'
import { readJsonFile } from '../model-connection/model-catalog.js'
import { createOciGitExecutionPort } from './git-execution.js'
import type { GitExecutionPort } from './git-execution.js'
import { createGitImportAdmissionCatalog } from './git-import-admission.js'
import type { GitImportAdmissionEntry } from './git-import-admission.js'
import { registerProjectRoutes } from './routes.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import type { ProjectSourceRecovery } from './source-recovery.js'
import { createProjectSourceRecovery } from './source-recovery.js'
import { createProjectStore } from './store.js'

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
  resolveCurrentSession: ResolveCurrentSession
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
  return Object.freeze(result)
}

export const readProjectSourceOwnership = (path: string): Readonly<Record<string, string>> =>
  composeProjectSourceOwnership(readJsonFile(path))

export const createBuilderProjectGitCapability = (storageRoot: string): GitExecutionPort =>
  createOciGitExecutionPort({ projectStorageRoot: storageRoot })

export const createConfiguredProjectModule = ({
  database,
  project,
  origin,
  resolveCurrentSession,
}: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  project: ProjectRuntimeConfig
  origin: string
  resolveCurrentSession: ResolveCurrentSession
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
