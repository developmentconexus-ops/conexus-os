import type { FastifyInstance } from 'fastify'
import { createPostgresPool } from '../platform/postgres.js'
import type { PostgresPool } from '../platform/postgres.js'
import { createOciGitExecution } from '../platform/oci-git.js'
import type { OciGitExecution } from '../platform/oci-git.js'
import { R1C14_GIT_IDENTITY } from '../generated/r1c14-git-identity.js'
import type { ProjectRuntimeConfig } from '../platform/config.js'
import { readSecretFile } from '../platform/secrets.js'
import { readJsonFile } from '../platform/json-file.js'
import { registerProjectRoutes } from './routes.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'
import { createProjectStore } from './store.js'
import type { ProjectRepositoryPort } from './store.js'

export type ProjectModule = Readonly<{
  registerProjectRoutes(app: FastifyInstance): Promise<readonly ('PRJ-01' | 'PRJ-02' | 'PRJ-03')[]>
  sourceGit: OciGitExecution
  warmGitImage(): ReturnType<OciGitExecution['verifyAdmittedImage']>
  close(): Promise<void>
}>

export const createProjectModule = ({
  commandPool,
  readPool,
  repository,
  oci,
  origin,
  resolveCurrentSession,
}: Readonly<{
  commandPool: PostgresPool
  readPool: PostgresPool
  repository: ProjectRepositoryPort
  oci: OciGitExecution
  origin: string
  resolveCurrentSession: ResolveCurrentSession
}>): ProjectModule => {
  const store = createProjectStore({ commandPool, readPool, repository })
  return Object.freeze({
    registerProjectRoutes: (app: FastifyInstance) => registerProjectRoutes(app, {
      store, resolveCurrentSession, origin,
    }),
    sourceGit: oci,
    warmGitImage: () => oci.verifyAdmittedImage(),
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

export const createBuilderProjectGitCapability = (_storageRoot: string): OciGitExecution =>
  createOciGitExecution(R1C14_GIT_IDENTITY)

export const createConfiguredProjectModule = ({
  database,
  project,
  repository,
  origin,
  resolveCurrentSession,
}: Readonly<{
  database: Readonly<{ host: string; port: number; database: string }>
  project: ProjectRuntimeConfig
  repository: ProjectRepositoryPort
  origin: string
  resolveCurrentSession: ResolveCurrentSession
}>): ProjectModule => createProjectModule({
  commandPool: createPostgresPool({
    ...database,
    user: 'hub_project_command',
    password: readSecretFile(project.commandPasswordFile),
  }),
  readPool: createPostgresPool({
    ...database,
    user: 'hub_project_read',
    password: readSecretFile(project.readPasswordFile),
  }),
  repository,
  oci: createOciGitExecution(R1C14_GIT_IDENTITY),
  origin,
  resolveCurrentSession,
})
