import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { sendProblem } from './problem.js'

export type HubHttpApp = FastifyInstance & Readonly<{
  routeCensus(): readonly string[]
  validatorInstallCount(): number
}>

export type RouteRegistrar = (app: FastifyInstance) => Promise<readonly string[]>

const errorStatus = (error: unknown): number => {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return 500
  return typeof error.statusCode === 'number' ? error.statusCode : 500
}

export const createHttpApp = async ({
  registerRoutes,
  staticRoot = null,
}: Readonly<{ registerRoutes: RouteRegistrar; staticRoot?: string | null }>): Promise<HubHttpApp> => {
  const app = Fastify({ logger: false, trustProxy: false })
  app.setErrorHandler((error, _request, reply) => {
    const reportedStatus = errorStatus(error)
    const status = reportedStatus >= 400 && reportedStatus < 500 ? reportedStatus : 500
    if (status === 400) return sendProblem(reply, status, 'request-invalid', 'Request invalid')
    if (status === 401) return sendProblem(reply, status, 'authentication-required', 'Authentication required')
    if (status === 403) return sendProblem(reply, status, 'access-denied', 'Access denied')
    if (status === 404) return sendProblem(reply, status, 'not-found', 'Not found')
    return sendProblem(reply, status, status === 500 ? 'internal-error' : 'request-refused', status === 500 ? 'Internal server error' : 'Request refused')
  })
  const ajv = new Ajv2020({ allErrors: true, strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
  const addFormats = addFormatsModule.default
  addFormats(ajv)
  let validatorInstallCount = 0
  app.setValidatorCompiler(({ schema }) => ajv.compile(schema))
  validatorInstallCount += 1
  await app.register(cookie)
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"] } } })
  const registered = [...await registerRoutes(app)].sort()

  if (staticRoot) {
    const staticPlugin = (await import('@fastify/static')).default
    await app.register(staticPlugin, { root: staticRoot })
    const spaRoutes = [
      '/',
      '/setup',
      '/workspaces/new',
      '/workspaces/:workspaceId/projects',
      '/workspaces/:workspaceId/projects/new',
      '/projects/:projectId',
      '/projects/:projectId/inception',
      '/projects/:projectId/baseline-candidates/:candidateBaselineDigest',
    ] as const
    for (const route of spaRoutes) {
      app.get(route, (_request, reply) =>
        reply.sendFile('index.html', { cacheControl: false }),
      )
    }
  }

  await app.ready()
  return Object.assign(app, {
    routeCensus: (): readonly string[] => [...registered],
    validatorInstallCount: (): number => validatorInstallCount,
  }) as HubHttpApp
}
