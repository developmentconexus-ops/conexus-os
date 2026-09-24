import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'
import Fastify from 'fastify'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  https,
  previewCspSource,
}: Readonly<{
  registerRoutes: RouteRegistrar
  staticRoot?: string | null
  https?: Readonly<{ cert: Buffer | string; key: Buffer | string }>
  previewCspSource?: string
}>): Promise<HubHttpApp> => {
  const app = Fastify({ logger: false, trustProxy: false, ...(https ? { https } : {}) })
  // A client may label a DELETE with no body as JSON; Fastify refuses that empty body. Any other
  // method still needs a body its route validates.
  const parseJson = app.getDefaultJsonParser('error', 'error')
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const text = body.toString()
    if (request.method === 'DELETE' && text === '') return done(null, undefined)
    return parseJson(request, text, done)
  })
  app.setErrorHandler((error, _request, reply) => {
    const reportedStatus = errorStatus(error)
    // Keycloak could not be asked about a session due for its check: the request waits, nobody is signed out.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'IDENTITY_PROVIDER_UNAVAILABLE') {
      return sendProblem(reply, 503, 'identity-provider-unavailable', 'Identity provider unavailable')
    }
    const status = reportedStatus >= 400 && reportedStatus < 500 ? reportedStatus : 500
    if (status === 400) return sendProblem(reply, status, 'request-invalid', 'Request invalid')
    if (status === 401) return sendProblem(reply, status, 'authentication-required', 'Authentication required')
    if (status === 403) return sendProblem(reply, status, 'access-denied', 'Access denied')
    if (status === 404) return sendProblem(reply, status, 'not-found', 'Not found')
    return sendProblem(reply, status, status === 500 ? 'internal-error' : 'request-refused', status === 500 ? 'Internal server error' : 'Request refused')
  })
  const ajv = new Ajv2020({ allErrors: true, strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
  ajv.addKeyword({ keyword: 'x-conexus-schema-source', schemaType: 'string', valid: true })
  const addFormats = addFormatsModule.default
  addFormats(ajv)
  let validatorInstallCount = 0
  app.setValidatorCompiler(({ schema }) => ajv.compile(schema))
  validatorInstallCount += 1
  await app.register(cookie)
  await app.register(helmet, {
    // CodeMirror keeps rewriting one <style> element, so no fixed hash covers it; the page hands
    // CodeMirror this response's style nonce instead.
    enableCSPNonces: true,
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"],
      // The hashes are the only <style> elements @mastra/playground-ui injects: an empty one, Base UI's
      // scrollbar-hiding sheet written into it, and sonner's toaster sheet. Any other injected style
      // stays refused, so a library upgrade that changes one shows up as a CSP violation, not silently.
      styleSrc: [
        "'self'",
        "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
        "'sha256-kLmvWqfziFavKtqHqRsb90f006UAK2Dmd0It5Iz2KFA='",
        "'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY='",
      ],
      // Style attributes only: syntax-highlight tokens and collapsible geometry are set per element.
      styleSrcAttr: ["'unsafe-inline'"],
      ...(previewCspSource ? { frameSrc: [previewCspSource] } : {}),
      ...(previewCspSource ? { connectSrc: ["'self'", previewCspSource] } : {}),
      ...(previewCspSource ? { formAction: ["'self'", previewCspSource] } : {}),
    } },
    referrerPolicy: { policy: 'strict-origin' },
  })
  const registered = [...await registerRoutes(app)].sort()

  if (staticRoot) {
    const staticPlugin = (await import('@fastify/static')).default
    await app.register(staticPlugin, { root: staticRoot })
    const indexHtml = readFileSync(join(staticRoot, 'index.html'), 'utf8')
    const spaRoutes = [
      '/',
      '/setup',
      '/workspaces',
      '/workspaces/new',
      '/workspaces/:workspaceId/projects',
      '/workspaces/:workspaceId/projects/new',
      '/workspaces/:workspaceId/members',
      '/workspaces/:workspaceId/settings/people',
      '/projects/:projectId',
      '/projects/:projectId/build',
      '/projects/:projectId/c/:conversationId',
      '/projects/:projectId/settings',
      '/projects/:projectId/settings/access',
      '/settings',
      '/settings/account',
      '/settings/models',
      '/settings/installation/github',
      '/settings/installation/models',
      '/settings/installation/model-defaults',
      '/settings/installation/memory',
      '/settings/installation/admins',
      '/signed-out',
      '/no-access',
    ] as const
    for (const route of spaRoutes) {
      app.get(route, (_request, reply) => reply
        .type('text/html; charset=utf-8')
        .send(indexHtml.replace('<head>', `<head><meta name="csp-nonce" content="${reply.cspNonce.style}">`)),
      )
    }
  }

  await app.ready()
  return Object.assign(app, {
    routeCensus: (): readonly string[] => [...registered],
    validatorInstallCount: (): number => validatorInstallCount,
  }) as HubHttpApp
}
