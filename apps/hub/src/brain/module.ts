import type { FastifyInstance } from 'fastify'
import type { PostgresPool } from '../platform/postgres.js'
import { registerProjectBrainContextRoutes } from './context-routes.js'
import { createProjectBrainContextResolver } from './context.js'
import type { ProjectBrainContextPorts, ProjectBrainContextResolver } from './context.js'
import { createProjectBrainContextBasisPort } from './context-store.js'
import { registerBrainRoutes } from './routes.js'
import type { ResolveBrainSession } from './routes.js'
import { createBrainStore } from './store.js'
import type { BrainRegistryPort } from './store.js'

export { createBrainBindingValidator } from './binding-validation.js'
export type {
  BrainBindingProof,
  BrainBindingValidationCandidate,
  BrainBindingValidationInput,
  BrainBindingValidationResult,
  BrainBindingValidator,
  BrainBindingVerifiedRealization,
} from './binding-validation.js'
export { createProjectBrainContextResolver, resolveProjectBrainContext } from './context.js'
export type {
  CurrentProjectBrainBinding,
  CurrentProjectBrainRealization,
  ProjectBrainContext,
  ProjectBrainContextAuthorization,
  ProjectBrainContextHealth,
  ProjectBrainContextPortResult,
  ProjectBrainContextPorts,
  ProjectBrainContextRegistryRevision,
  ProjectBrainContextResolver,
  ProjectBrainContextResult,
  ProjectBrainContextPurpose,
  ResolveProjectBrainContextInput,
} from './context.js'

export type BrainModule = Readonly<{
  registerBrainRoutes(app: FastifyInstance): Promise<readonly ('BRN-01' | 'BRN-02' | 'BRN-03' | 'BRN-10' | 'BRN-14')[]>
  close(): Promise<void>
}>

export const createBrainModule = ({ pool, registry, resolveCurrentSession, projectContext }: Readonly<{
  pool: PostgresPool
  registry: BrainRegistryPort
  resolveCurrentSession: ResolveBrainSession
  projectContext?: ProjectBrainContextPorts['project']
}>): BrainModule => {
  const store = createBrainStore({ pool, registry })
  const context = projectContext ? createProjectBrainContextResolver({
    basis: createProjectBrainContextBasisPort(pool),
    project: projectContext,
  }) : undefined
  return Object.freeze({
    registerBrainRoutes: async (app) => [
      ...await registerBrainRoutes(app, { store, resolveCurrentSession }),
      ...(context ? await registerProjectBrainContextRoutes(app, { resolver: context, resolveCurrentSession }) : []),
    ],
    close: () => pool.end(),
  })
}

export type ProjectBrainContextModule = Readonly<{
  registerProjectBrainContextRoutes(app: FastifyInstance): Promise<readonly ['BRN-14']>
}>

export const createProjectBrainContextModule = ({ resolver, resolveCurrentSession }: Readonly<{
  resolver: ProjectBrainContextResolver
  resolveCurrentSession: ResolveBrainSession
}>): ProjectBrainContextModule => Object.freeze({
  registerProjectBrainContextRoutes: (app) => registerProjectBrainContextRoutes(app, {
    resolver,
    resolveCurrentSession,
  }),
})
