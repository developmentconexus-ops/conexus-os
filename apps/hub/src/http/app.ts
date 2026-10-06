import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'
import Fastify from 'fastify'
import { readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { Failure, type FailureCode, logFailure, toFailure } from '../platform/failure.js'
import { logger } from '../platform/logger.js'
import { foreignRoutes, installAccess, routes } from './access.js'
import type { ListenerPolicy } from './access.js'
import { sendFailure } from './problem.js'

declare module 'fastify' {
  interface FastifyInstance {
    routeCensus(): readonly string[]
  }
}

export type RouteRegistrar = (app: FastifyInstance) => Promise<readonly string[]>

export const parseJsonBody = (app: FastifyInstance): void => {
  const parseJson = app.getDefaultJsonParser('error', 'error')
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const text = body.toString()
    if (text.trim() === '') return done(null, undefined)
    return parseJson(request, text, done)
  })
}

// Fastify's own refusals, which carry a `code` and no `Failure`.
const FASTIFY_FAILURES: ReadonlyMap<string, FailureCode> = new Map([
  ['FST_ERR_VALIDATION', 'REQUEST_VALIDATION_FAILED'],
  ['FST_ERR_CTP_BODY_TOO_LARGE', 'REQUEST_BODY_TOO_LARGE'],
  ['FST_ERR_CTP_INVALID_JSON_BODY', 'REQUEST_JSON_INVALID'],
  ['FST_ERR_CTP_INVALID_MEDIA_TYPE', 'REQUEST_MEDIA_TYPE_UNSUPPORTED'],
])

const namedFailure = (error: unknown): Failure | null => {
  if (error instanceof Failure) return error
  if (typeof error !== 'object' || error === null || !('code' in error) || typeof error.code !== 'string') return null
  const code = FASTIFY_FAILURES.get(error.code)
  return code ? new Failure(code, { cause: error }) : null
}

export const createHttpApp = async ({
  policy,
  registerRoutes,
  staticRoot = null,
  https,
}: Readonly<{
  policy: ListenerPolicy
  registerRoutes: RouteRegistrar
  staticRoot?: string | null
  https?: Readonly<{ cert: Buffer | string; key: Buffer | string }>
}>): Promise<FastifyInstance> => {
  const app = Fastify({
    loggerInstance: logger, forceCloseConnections: true, disableRequestLogging: true, trustProxy: false, exposeHeadRoutes: false,
    ...(https ? { https } : {}),
  })
  const previewCspSource = policy.listener === 'hub' ? policy.previewCspSource : undefined
  parseJsonBody(app)
  app.setErrorHandler((error, request, reply) => {
    const failure = namedFailure(error) ?? toFailure(error)
    logFailure(request.log, failure, { 'http.route': request.routeOptions.url ?? '' })
    return sendFailure(reply, failure)
  })
  const ajv = new Ajv2020({ allErrors: true, strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
  ajv.addKeyword({ keyword: 'x-conexus-schema-source', schemaType: 'string', valid: true })
  const addFormats = addFormatsModule.default
  addFormats(ajv)
  app.setValidatorCompiler(({ schema }) => ajv.compile(schema))
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
  if (policy.listener !== 'hub') app.addHook('onRequest', policy.onRequest)
  installAccess(app, policy)
  const registered = [...await registerRoutes(app)].sort()

  if (staticRoot) {
    const assetsPrefix = join(staticRoot, 'assets') + sep
    const staticPlugin = (await import('@fastify/static')).default
    await foreignRoutes(app, 'navigation', async (scope) => {
      await scope.register(staticPlugin, {
        root: staticRoot,
        setHeaders: (reply, pathName) => {
          if (pathName.startsWith(assetsPrefix)) {
            reply.header('cache-control', 'public, max-age=31536000, immutable')
          }
        },
      })
    })
    const indexHtml = readFileSync(join(staticRoot, 'index.html'), 'utf8')
    const spaRoutes = [
      '/',
      '/workspaces',
      '/workspaces/new',
      '/workspaces/:workspaceId/projects',
      '/workspaces/:workspaceId/projects/new',
      '/workspaces/:workspaceId/settings/people',
      '/projects/:projectId',
      '/projects/:projectId/c/:conversationId',
      '/projects/:projectId/settings',
      '/projects/:projectId/settings/access',
      '/projects/:projectId/integrations',
      '/settings',
      '/settings/account',
      '/settings/models',
      '/settings/installation/admins',
      '/signed-out',
      '/no-access',
    ] as const
    const route = routes(app)
    for (const url of spaRoutes) {
      route.navigation({
        url,
        handler: (_request, reply) => reply
          .type('text/html; charset=utf-8')
          .send(indexHtml.replace('<head>', `<head><meta name="csp-nonce" content="${reply.cspNonce.style}">`)),
      })
    }
  }

  app.decorate('routeCensus', (): readonly string[] => [...registered])
  await app.ready()
  return app
}
