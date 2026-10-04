import type {
  FastifyInstance, onRequestHookHandler, FastifyRequest, FastifySchema, HTTPMethods, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault,
  RouteGenericInterface, RouteHandlerMethod, RouteOptions,
} from 'fastify'
import { bootstrapToken, hubSessionDigest } from '../identity-access/current-session.js'
import type { BootstrapToken, CurrentSession, HubSession, HubSessionDigest } from '../identity-access/current-session.js'
import { Failure } from '../platform/failure.js'
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
  }
  interface FastifyRequest {
    [SLOT]: AccessState | null
  }
}

const missing = (invariant: string): Failure => new Failure('INTERNAL_UNEXPECTED', { details: { invariant } })

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

type RouteRecord = Readonly<{ method: string | readonly string[]; url: string; config?: RouteOptions['config'] }>

const bootRefusal = (record: RouteRecord, listener: Listener): string | null => {
  const kind = record.config?.access
  if (kind === undefined) return 'ROUTE_ACCESS_UNDECLARED'
  if (record.config?.accessConflict !== undefined) return 'ROUTE_ACCESS_CONFLICT'
  if (!LISTENER_KINDS[listener].has(kind)) return 'ROUTE_ACCESS_FOREIGN'
  const methods = typeof record.method === 'string' ? [record.method] : record.method
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
type Handler<Generic extends RouteGenericInterface, Kind extends AccessKind> =
  (request: Parameters<NativeHandler<Generic>>[0], reply: Parameters<NativeHandler<Generic>>[1], grant: Grants[Kind]) => ReturnType<NativeHandler<Generic>>
type Declared<Generic extends RouteGenericInterface, Kind extends AccessKind> = Readonly<{
  url: string
  schema?: FastifySchema
  bodyLimit?: number
  handler: Handler<Generic, Kind>
}>
type WithMethod<Generic extends RouteGenericInterface, Kind extends AccessKind> = Declared<Generic, Kind> & Readonly<{ method: HTTPMethods }>

export const routes = (app: FastifyInstance) => {
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
      route.config = { ...route.config, access: kind, ...(declared !== undefined && declared !== kind ? { accessConflict: declared } : {}) }
    })
    await register(scope, (request) => grantOf(request, kind))
  })
}
