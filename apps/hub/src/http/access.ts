import type {
  FastifyInstance, onRequestHookHandler, FastifyRequest, FastifySchema, HTTPMethods, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault,
  RouteGenericInterface, RouteHandlerMethod, RouteOptions,
} from 'fastify'
import type { AnyOperation, EffectsOf, Input, Out, Reply } from '../../../../packages/contract/dist/index.js'
import type { z } from 'zod'
import { z as zod } from 'zod'
import { clearCookie } from './cookies.js'
import { bootstrapToken, hubSessionDigest } from '../identity-access/current-session.js'
import type { BootstrapToken, CurrentSession, HubSession, HubSessionDigest } from '../identity-access/current-session.js'
import { Failure } from '../platform/failure.js'
import { FAILURE_STATUS as HUB_FAILURES } from '../../../../packages/contract/dist/failures.generated.js'
import { parseOpaqueToken } from '../platform/opaque-token.js'
import { readCredentialCookie } from './cookies.js'

export type AccessKind = 'navigation' | 'sign-in' | 'session' | 'sign-out' | 'bootstrap' | 'host-write' | 'hub-entry'
type Methods = 'PAGE' | 'GET' | 'WRITE' | 'ANY'
type AccessRow = Readonly<{
  methods: Methods
  fetchSite: 'SAME_ORIGIN_OR_NONE' | 'ANY'
  mode: 'NAVIGATE' | 'NOT_NAVIGATE' | 'ANY'
  origin: 'NONE' | 'HUB_WHEN_PRESENT_REQUIRED_ON_WRITE' | 'HUB_ALWAYS' | 'HUB_ALWAYS_ON_OWN_HOST' | 'OWN_ALWAYS'
  credential: 'NONE' | 'HUB_SESSION' | 'HUB_SESSION_COOKIE' | 'BOOTSTRAP_COOKIE'
}>

/** @public */
export const ACCESS: Readonly<Record<AccessKind, AccessRow>> = Object.freeze({
  navigation: { methods: 'PAGE', fetchSite: 'ANY', mode: 'ANY', origin: 'NONE', credential: 'NONE' },
  'sign-in': { methods: 'GET', fetchSite: 'ANY', mode: 'NAVIGATE', origin: 'NONE', credential: 'NONE' },
  session: { methods: 'ANY', fetchSite: 'SAME_ORIGIN_OR_NONE', mode: 'NOT_NAVIGATE', origin: 'HUB_WHEN_PRESENT_REQUIRED_ON_WRITE', credential: 'HUB_SESSION' },
  'sign-out': { methods: 'WRITE', fetchSite: 'SAME_ORIGIN_OR_NONE', mode: 'NOT_NAVIGATE', origin: 'HUB_ALWAYS', credential: 'HUB_SESSION_COOKIE' },
  bootstrap: { methods: 'WRITE', fetchSite: 'SAME_ORIGIN_OR_NONE', mode: 'NOT_NAVIGATE', origin: 'HUB_ALWAYS', credential: 'BOOTSTRAP_COOKIE' },
  'host-write': { methods: 'WRITE', fetchSite: 'SAME_ORIGIN_OR_NONE', mode: 'ANY', origin: 'OWN_ALWAYS', credential: 'NONE' },
  'hub-entry': { methods: 'WRITE', fetchSite: 'ANY', mode: 'ANY', origin: 'HUB_ALWAYS_ON_OWN_HOST', credential: 'NONE' },
})

export type ListenerPolicy =
  | Readonly<{ listener: 'hub'; hubOrigin: string; previewCspSource?: string; resolveHubSession(digest: HubSessionDigest): Promise<CurrentSession | null> }>
  | Readonly<{ listener: 'preview' | 'application'; hubOrigin: string; ownOrigin(host: HeaderFact): string | null; onRequest: onRequestHookHandler }>

type Listener = ListenerPolicy['listener']
const LISTENER_KINDS: Readonly<Record<Listener, ReadonlySet<AccessKind>>> = Object.freeze({
  hub: new Set<AccessKind>(['navigation', 'sign-in', 'session', 'sign-out', 'bootstrap']),
  preview: new Set<AccessKind>(['navigation', 'sign-in', 'host-write', 'hub-entry']),
  application: new Set<AccessKind>(['navigation', 'sign-in', 'host-write', 'hub-entry']),
})

const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const METHODS: Readonly<Record<Methods, ReadonlySet<string>>> = Object.freeze({
  PAGE: new Set(['GET', 'HEAD']),
  GET: new Set(['GET']),
  WRITE: WRITE_METHODS,
  ANY: new Set(['GET', ...WRITE_METHODS]),
})

const MALFORMED: unique symbol = Symbol('MALFORMED')
export type HeaderFact = string | undefined | typeof MALFORMED
type RequestFacts = Readonly<{
  write: boolean
  origin: HeaderFact
  fetchSite: HeaderFact
  fetchMode: HeaderFact
  formBody: boolean
  document: boolean
  host: HeaderFact
}>

const FORM_MEDIA_TYPES: ReadonlySet<string> = new Set(['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'])

const headerFact = (value: unknown): HeaderFact => value === undefined ? undefined : typeof value === 'string' ? value : MALFORMED

const isFormBody = (contentType: HeaderFact): boolean => {
  if (contentType === undefined) return false
  if (contentType === MALFORMED) return true
  return FORM_MEDIA_TYPES.has(contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '')
}

/** @public */
export const requestFacts = (method: string, headers: Readonly<Record<string, unknown>>): RequestFacts => {
  const fetchMode = headerFact(headers['sec-fetch-mode'])
  return Object.freeze({
    write: WRITE_METHODS.has(method),
    origin: headerFact(headers.origin),
    fetchSite: headerFact(headers['sec-fetch-site']),
    fetchMode,
    formBody: isFormBody(headerFact(headers['content-type'])),
    document: method === 'GET' && fetchMode === 'navigate' && headerFact(headers['sec-fetch-dest']) === 'document',
    host: headerFact(headers.host),
  })
}

type ExpectedOrigins = Readonly<{ hub: string; own: string | null }>

const fetchSiteAllows = (rule: AccessRow['fetchSite'], { fetchSite }: RequestFacts): boolean => {
  switch (rule) {
    case 'ANY': return true
    case 'SAME_ORIGIN_OR_NONE': return fetchSite === undefined || fetchSite === 'same-origin' || fetchSite === 'none'
    default: return rule satisfies never
  }
}

const modeAllows = (rule: AccessRow['mode'], facts: RequestFacts): boolean => {
  switch (rule) {
    case 'ANY': return true
    case 'NAVIGATE': return facts.fetchMode === undefined || facts.fetchMode === 'navigate'
    case 'NOT_NAVIGATE': return facts.fetchMode !== 'navigate' && facts.fetchMode !== MALFORMED && !(facts.write && facts.formBody)
    default: return rule satisfies never
  }
}

const originAllows = (rule: AccessRow['origin'], { origin, write }: RequestFacts, expected: ExpectedOrigins): boolean => {
  switch (rule) {
    case 'NONE': return true
    case 'HUB_WHEN_PRESENT_REQUIRED_ON_WRITE': return origin === undefined ? !write : origin === expected.hub
    case 'HUB_ALWAYS': return origin === expected.hub
    case 'HUB_ALWAYS_ON_OWN_HOST': return expected.own !== null && origin === expected.hub
    case 'OWN_ALWAYS': return expected.own !== null && origin === expected.own
    default: return rule satisfies never
  }
}

/** @public */
export const authentic = (row: AccessRow, facts: RequestFacts, expected: ExpectedOrigins): 'ALLOW' | 'DENY' =>
  fetchSiteAllows(row.fetchSite, facts) && modeAllows(row.mode, facts) && originAllows(row.origin, facts, expected) ? 'ALLOW' : 'DENY'

type Credential =
  | Readonly<{ type: 'NONE' }>
  | Readonly<{ type: 'HUB_SESSION'; session: HubSession }>
  | Readonly<{ type: 'HUB_SESSION_COOKIE'; digest: HubSessionDigest }>
  | Readonly<{ type: 'BOOTSTRAP_COOKIE'; token: BootstrapToken }>

const NO_CREDENTIAL: Credential = Object.freeze({ type: 'NONE' })
const NOTHING = Object.freeze({})

export type Grants = {
  navigation: Readonly<{ document: boolean }>
  'sign-in': Readonly<Record<never, never>>
  session: HubSession
  'sign-out': Readonly<{ digest: HubSessionDigest }>
  bootstrap: Readonly<{ token: BootstrapToken }>
  'host-write': Readonly<Record<never, never>>
  'hub-entry': Readonly<Record<never, never>>
}

const GRANT: { readonly [Kind in AccessKind]: (credential: Credential, facts: RequestFacts) => Grants[Kind] | null } = Object.freeze({
  navigation: (_credential: Credential, facts: RequestFacts) => ({ document: facts.document }),
  'sign-in': () => NOTHING,
  session: (credential: Credential) => credential.type === 'HUB_SESSION' ? credential.session : null,
  'sign-out': (credential: Credential) => credential.type === 'HUB_SESSION_COOKIE' ? { digest: credential.digest } : null,
  bootstrap: (credential: Credential) => credential.type === 'BOOTSTRAP_COOKIE' ? { token: credential.token } : null,
  'host-write': () => NOTHING,
  'hub-entry': () => NOTHING,
})

type AccessState = Readonly<{ kind: AccessKind; facts: RequestFacts; credential: Credential | null }>

const SLOT: unique symbol = Symbol('access')

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: AccessKind
    accessConflict?: AccessKind
    operation?: string
    foreignOperation?: true
  }
  interface FastifyRequest {
    [SLOT]: AccessState | null
  }
}

const missing = (invariant: string): Failure => new Failure('INTERNAL_UNEXPECTED', { details: { invariant } })
const isHubFailureCode = (code: unknown): code is keyof typeof HUB_FAILURES => typeof code === 'string' && Object.hasOwn(HUB_FAILURES, code)

/** @public */
export const grantOf = <Kind extends AccessKind>(request: FastifyRequest, kind: Kind): Grants[Kind] => {
  const state = request[SLOT]
  if (!state?.credential) throw missing('ACCESS_GRANT_MISSING')
  const grant = state.kind === kind ? GRANT[kind](state.credential, state.facts) : null
  if (grant === null) throw missing('ACCESS_GRANT_MISMATCH')
  return grant
}

const hubSessionOf = async (request: FastifyRequest, policy: ListenerPolicy): Promise<Credential> => {
  const token = parseOpaqueToken(readCredentialCookie(request, 'hubSession'))
  if (!token) throw new Failure('AUTHENTICATION_REQUIRED')
  if (policy.listener !== 'hub') throw missing('ACCESS_KIND_FOREIGN')
  const digest = hubSessionDigest(token)
  const session = await policy.resolveHubSession(digest)
  if (!session) throw new Failure('AUTHENTICATION_REQUIRED')
  return { type: 'HUB_SESSION', session: Object.freeze({ ...session, digest }) }
}

const credentialOf = async (rule: AccessRow['credential'], request: FastifyRequest, policy: ListenerPolicy): Promise<Credential> => {
  switch (rule) {
    case 'NONE': return NO_CREDENTIAL
    case 'HUB_SESSION': return hubSessionOf(request, policy)
    case 'HUB_SESSION_COOKIE': {
      const token = parseOpaqueToken(readCredentialCookie(request, 'hubSession'))
      if (!token) throw new Failure('AUTHENTICATION_REQUIRED')
      return { type: 'HUB_SESSION_COOKIE', digest: hubSessionDigest(token) }
    }
    case 'BOOTSTRAP_COOKIE': {
      const token = bootstrapToken(readCredentialCookie(request, 'bootstrap'))
      if (!token) throw new Failure('BOOTSTRAP_REQUIRED')
      return { type: 'BOOTSTRAP_COOKIE', token }
    }
    default: return rule satisfies never
  }
}

const UNDECLARED_OPERATIONS: ReadonlySet<string> = new Set([
  'GET /api/control/access-context',
  'POST /api/control/accounts',
  'GET /api/control/workspaces/:workspaceId/members',
  'POST /api/control/workspaces/:workspaceId/invitations',
  'PUT /api/control/workspaces/:workspaceId/members/:accountId',
  'DELETE /api/control/workspaces/:workspaceId/roster/:entryKind/:entryId',
  'GET /api/control/projects/:projectId/application-access',
  'POST /api/control/projects/:projectId/application-access',
  'DELETE /api/control/projects/:projectId/application-access/:entryKind/:entryId',
  'GET /api/control/installation',
  'GET /api/control/installation/administrators',
  'POST /api/control/installation/administrators',
  'DELETE /api/control/installation/administrators/:accountId',
  'GET /api/control/projects/:projectId/builder-session',
  'POST /api/control/projects/:projectId/builder-session/messages',
  'POST /api/control/projects/:projectId/builder-session/runs/:builderRunId/cancel',
  'GET /api/control/projects/:projectId/builder-session/runs/:builderRunId/trace',
  'POST /api/control/projects/:projectId/builder-session/preview',
  'GET /api/control/projects/:projectId/source/tree',
  'GET /api/control/projects/:projectId/source/file',
  'GET /api/control/projects/:projectId/source/compare',
  'GET /api/control/model-accounts/models',
  'GET /api/control/model-accounts',
  'PUT /api/control/model-accounts/:provider/api-key',
  'POST /api/control/model-accounts/anthropic/oauth/start',
  'POST /api/control/model-accounts/anthropic/oauth/complete',
  'POST /api/control/model-accounts/openai-codex/oauth/start',
  'POST /api/control/model-accounts/openai-codex/oauth/poll',
  'GET /api/control/model-accounts/google-ai-pro/connection',
  'POST /api/control/model-accounts/google-ai-pro/login/start',
  'POST /api/control/model-accounts/google-ai-pro/login/complete',
  'POST /api/control/model-accounts/google-ai-pro/login/:loginId',
])

type RouteRecord = Readonly<{ method: string | readonly string[]; url: string; config?: RouteOptions['config'] }>

const bootRefusal = (record: RouteRecord, listener: Listener): string | null => {
  const kind = record.config?.access
  if (kind === undefined) return 'ROUTE_ACCESS_UNDECLARED'
  if (record.config?.accessConflict !== undefined) return 'ROUTE_ACCESS_CONFLICT'
  if (!LISTENER_KINDS[listener].has(kind)) return 'ROUTE_ACCESS_FOREIGN'
  const methods = typeof record.method === 'string' ? [record.method] : record.method
  if (listener === 'hub' && (record.url.startsWith('/api/control') || record.url.startsWith('/api/builder')) &&
      record.config?.operation === undefined && record.config?.foreignOperation !== true &&
      !methods.every((method) => UNDECLARED_OPERATIONS.has(`${method} ${record.url}`))) return 'ROUTE_OPERATION_UNDECLARED'
  return methods.every((method) => METHODS[ACCESS[kind].methods].has(method)) ? null : 'ROUTE_ACCESS_METHOD'
}

export const installAccess = (app: FastifyInstance, policy: ListenerPolicy): void => {
  const records: RouteOptions[] = []
  app.decorateRequest(SLOT, null)
  app.addHook('onRoute', (route) => { records.push(route) })
  app.addHook('onReady', async () => {
    for (const record of records) {
      const invariant = bootRefusal(record, policy.listener)
      if (invariant) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant, route: `${String(record.method)} ${record.url}` } })
    }
  })
  app.addHook('onRequest', async (request) => {
    const kind = request.routeOptions.config.access
    if (kind === undefined) throw new Failure('NOT_FOUND')
    const facts = requestFacts(request.method, request.headers)
    const expected = { hub: policy.hubOrigin, own: policy.listener === 'hub' ? null : policy.ownOrigin(facts.host) }
    if (authentic(ACCESS[kind], facts, expected) === 'DENY') throw new Failure('REQUEST_AUTHENTICITY_DENIED')
    request[SLOT] = Object.freeze({ kind, facts, credential: null })
  })
  app.addHook('preHandler', async (request) => {
    const state = request[SLOT]
    if (!state) return
    request[SLOT] = Object.freeze({ ...state, credential: await credentialOf(ACCESS[state.kind].credential, request, policy) })
  })
}

type NativeHandler<Generic extends RouteGenericInterface> = RouteHandlerMethod<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, Generic>
export type Handler<O extends AnyOperation> = (request: Input<O>, grant: Grants[O['access']], effects: EffectsOf<O['effects']>) => Promise<Reply<O>>
function parsedPart<P extends z.ZodType | null>(schema: P, value: unknown): Out<P>
function parsedPart(schema: z.ZodType | null, value: unknown): unknown {
  return schema === null ? undefined : schema.parse(value)
}
type NativeDeclaredHandler<Generic extends RouteGenericInterface, Kind extends AccessKind> =
  (request: Parameters<NativeHandler<Generic>>[0], reply: Parameters<NativeHandler<Generic>>[1], grant: Grants[Kind]) => ReturnType<NativeHandler<Generic>>
type Declared<Generic extends RouteGenericInterface, Kind extends AccessKind> = Readonly<{
  url: string
  schema?: FastifySchema
  bodyLimit?: number
  handler: NativeDeclaredHandler<Generic, Kind>
}>
type WithMethod<Generic extends RouteGenericInterface, Kind extends AccessKind> = Declared<Generic, Kind> & Readonly<{ method: HTTPMethods }>

export const routes = (app: FastifyInstance) => {
  const declaredOperation = <const O extends AnyOperation>(op: O, handler: Handler<O>): void => {
    const parts = { params: op.params, querystring: op.query, headers: op.headers, body: op.body }
    const schema = Object.fromEntries(Object.entries(parts).filter(([, part]) => part !== null).map(([name]) => [name, {}]))
    app.route<{ Params: Input<O>['params']; Querystring: Input<O>['query']; Headers: Input<O>['headers']; Body: Input<O>['body'] }>({
      method: op.method,
      url: op.path,
      config: { access: op.access, operation: op.id },
      schema,
      validatorCompiler: ({ httpPart }) => (value) => {
        const part = httpPart === 'querystring' ? op.query : httpPart === 'params' ? op.params : httpPart === 'headers' ? op.headers : op.body
        if (part === null) return { value }
        const parsed = part.safeParse(value)
        if (parsed.success) return { value: parsed.data }
        if (httpPart === 'params') {
          const name = parsed.error.issues[0]?.path[0]
          const code = typeof name === 'string' && op.malformed ? Object.entries(op.malformed).find(([key]) => key === name)?.[1] : undefined
          if (isHubFailureCode(code)) return { error: new Failure(code) }
        }
        if (httpPart === 'headers' && op.headers instanceof zod.ZodObject) {
          const schema = op.headers.shape['idempotency-key']
          const code = schema ? zod.globalRegistry.get(schema)?.failureCode : undefined
          const raw = typeof value === 'object' && value !== null && 'idempotency-key' in value ? value['idempotency-key'] : undefined
          if (isHubFailureCode(code) && (raw === undefined || raw === '')) return { error: new Failure(code) }
        }
        if (httpPart === 'body' && op.body instanceof zod.ZodObject) {
          const field = parsed.error.issues[0]?.path[0]
          const schema = typeof field === 'string' ? op.body.shape[field] : undefined
          const code = schema ? zod.globalRegistry.get(schema)?.failureCode : undefined
          if (isHubFailureCode(code)) return { error: new Failure(code) }
        }
        return { error: parsed.error }
      },
      handler: async (request, reply) => {
        const effects = {
          'clear-session-cookie': () => { clearCookie(reply, 'hubSession') },
          'clear-bootstrap-cookie': () => { clearCookie(reply, 'bootstrap') },
        }
        const result = await handler({
          params: parsedPart<O['params']>(op.params, request.params),
          query: parsedPart<O['query']>(op.query, request.query),
          headers: parsedPart<O['headers']>(op.headers, request.headers),
          body: parsedPart<O['body']>(op.body, request.body),
        }, grantOf<O['access']>(request, op.access), effects)
        const statuses = Object.entries(op.success)
        const status = statuses.length === 1 ? Number(statuses[0]?.[0]) : typeof result === 'object' && result !== null && 'status' in result ? result.status : undefined
        if (typeof status !== 'number') throw missing('OPERATION_SUCCESS_STATUS')
        const declared = statuses.find(([code]) => Number(code) === status)?.[1]
        const body = statuses.length === 1 ? result : typeof result === 'object' && result !== null && 'body' in result ? result.body : undefined
        if (declared === null) return reply.code(status).send()
        if (declared && 'parse' in declared) return reply.code(status).send(declared.parse(body))
        if (declared) {
          const revalidated = declared.cache === 'revalidate-private'
          const bytes = revalidated ? (typeof body === 'object' && body !== null && 'bytes' in body ? body.bytes : null) : body
          const etag = revalidated && typeof body === 'object' && body !== null && 'etag' in body && typeof body.etag === 'string' ? body.etag : null
          if (bytes instanceof Uint8Array && bytes.byteLength <= declared.maxBytes && (!revalidated || etag !== null)) {
            const sent = reply.code(status).type(declared.mediaType)
            if (revalidated && etag !== null) sent.header('Cache-Control', 'private, no-cache').header('ETag', `"${etag}"`)
            return sent.send(Buffer.from(bytes))
          }
        }
        throw missing('OPERATION_SUCCESS_UNREADABLE')
      },
    })
  }
  const declare = <Generic extends RouteGenericInterface, Kind extends AccessKind>(
    kind: Kind, method: HTTPMethods, { handler, ...route }: Declared<Generic, Kind>, exposeHeadRoute = false,
  ): void => {
    app.route<Generic>({
      ...route,
      method,
      ...(exposeHeadRoute ? { exposeHeadRoute } : {}),
      config: { access: kind },
      handler: (request, reply) => handler(request, reply, grantOf(request, kind)),
    })
  }
  return Object.freeze({
    operation: declaredOperation,
    navigation: <Generic extends RouteGenericInterface = RouteGenericInterface>(route: Declared<Generic, 'navigation'>) => declare('navigation', 'GET', route, true),
    'sign-in': <Generic extends RouteGenericInterface = RouteGenericInterface>(route: Declared<Generic, 'sign-in'>) => declare('sign-in', 'GET', route),
    session: <Generic extends RouteGenericInterface = RouteGenericInterface>(route: WithMethod<Generic, 'session'>) => declare('session', route.method, route),
    'sign-out': <Generic extends RouteGenericInterface = RouteGenericInterface>(route: WithMethod<Generic, 'sign-out'>) => declare('sign-out', route.method, route),
    bootstrap: <Generic extends RouteGenericInterface = RouteGenericInterface>(route: WithMethod<Generic, 'bootstrap'>) => declare('bootstrap', route.method, route),
    'host-write': <Generic extends RouteGenericInterface = RouteGenericInterface>(route: WithMethod<Generic, 'host-write'>) => declare('host-write', route.method, route),
    'hub-entry': <Generic extends RouteGenericInterface = RouteGenericInterface>(route: WithMethod<Generic, 'hub-entry'>) => declare('hub-entry', route.method, route),
  })
}

export const foreignRoutes = async <Kind extends AccessKind>(
  app: FastifyInstance,
  kind: Kind,
  register: (scope: FastifyInstance, grant: (request: FastifyRequest) => Grants[Kind]) => Promise<void>,
): Promise<void> => {
  await app.register(async (scope) => {
    scope.addHook('onRoute', (route) => {
      const declared = route.config?.access
      route.config = { ...route.config, access: kind, foreignOperation: true, ...(declared !== undefined && declared !== kind ? { accessConflict: declared } : {}) }
    })
    await register(scope, (request) => grantOf(request, kind))
  })
}
