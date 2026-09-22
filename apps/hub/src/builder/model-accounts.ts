import type { ApiRoute } from '@mastra/core/server'
import { ConfigRoutes } from '@mastra/factory/routes/config'
import { OAuthRoutes } from '@mastra/factory/routes/oauth'
import { getAuthProviderId } from '@mastra/factory/routes/provider-credentials'
import type { RouteAuth } from '@mastra/factory/routes/route'
import { invalidateTenantCredentialSnapshots } from '@mastra/factory/routes/tenant-credentials'
import { applyActiveModelPack } from '@mastra/factory/session/model-pack-hydration'
import type { ModelCredentialsStorage } from '@mastra/factory/storage/domains/credentials/base'
import type { MemorySettingsStorage } from '@mastra/factory/storage/domains/memory-settings/base'
import type { ModelPacksStorage } from '@mastra/factory/storage/domains/model-packs/base'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import { GOOGLE_AI_PRO_MEMORY_MODEL, GOOGLE_AI_PRO_PROVIDER } from './google-ai-pro/credential.js'
import { createGoogleAiProLogin, GoogleAiProLoginError, type LoginProblem } from './google-ai-pro/login.js'
import type { CliproxyPool } from './google-ai-pro/pool.js'
import type { BuilderAgentController } from './runtime.js'

// The installation's defaults are one Factory model pack; a person's own defaults are their active
// pack row. The plan role is not offered, so it follows the build model.
export const INSTALLATION_DEFAULTS_PACK = 'Modelos padrão'
const PERSONAL_DEFAULTS_PACK_ID = 'conexus:personal'

export type ModelDefaults = Readonly<{ build: string; fast: string }>

const CSRF_COOKIE = '__Host-conexus_csrf'
const MODEL_ID = /^[\w.-]+\/[\w./:-]+$/
const PROVIDER = /^[a-z0-9][a-z0-9._-]{0,63}$/
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value
const LOGIN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const LOGIN_PROBLEMS: Readonly<Record<LoginProblem, readonly [number, string]>> = {
  'model-login-busy': [409, 'Another sign-in is in progress'],
  'model-login-unavailable': [503, 'Sign-in is unavailable'],
  'model-login-callback-refused': [400, 'Sign-in address refused'],
}

type ModelAccountDomains = Readonly<{
  credentials: ModelCredentialsStorage
  modelPacks: ModelPacksStorage
  memorySettings: MemorySettingsStorage
}>

type Caller = Readonly<{ accountId: AccountId }>

// The slice of Hono's Context the Factory's provider and sign-in handlers read. The Hub builds one
// per request, so the Factory's own handler decides every credential write, and the caller it sees
// is the Hub session's account.
type FactoryHandlerContext = Readonly<{
  req: Readonly<{
    param(name: string): string
    query(name: string): string | undefined
    json(): Promise<unknown>
    header(name: string): string | undefined
  }>
  json(body: unknown, status?: number): Readonly<{ body: unknown; status: number }>
}>
type FactoryHandler = (context: FactoryHandlerContext) => Promise<Readonly<{ body: unknown; status: number }>>

const toDefaults = (models: Readonly<{ build: string; fast: string }>): ModelDefaults => ({ build: models.build, fast: models.fast })
const packModels = ({ build, fast }: ModelDefaults) => ({ build, plan: build, fast })

export const readInstallationDefaults = async (modelPacks: ModelPacksStorage, orgId: string) =>
  (await modelPacks.list({ orgId })).find((pack) => pack.name === INSTALLATION_DEFAULTS_PACK) ?? null

type DefaultsSession = Parameters<typeof applyActiveModelPack>[0]

/**
 * Gives a new conversation's thread the person's own defaults, else the installation's. The Factory
 * seeds only a person's active pack; a thread that already chose its models keeps them.
 */
export const applyModelDefaults = ({ modelPacks, orgId }: Readonly<{ modelPacks: ModelPacksStorage; orgId: string }>) =>
  async (session: DefaultsSession, accountId: string): Promise<void> => {
    if (typeof await session.thread.getSetting?.({ key: 'activeModelPackId' }) === 'string') return
    const own = await modelPacks.getActive({ orgId, userId: accountId })
    const installation = own ? null : await readInstallationDefaults(modelPacks, orgId)
    const pack = own ?? (installation ? { packId: `custom:${installation.id}`, models: installation.models } : null)
    if (pack) await applyActiveModelPack(session, pack as Parameters<typeof applyActiveModelPack>[1])
  }

export const registerModelAccountRoutes = async (app: FastifyInstance, { domains, controller, orgId, origin, resolveCurrentSession, isInstallationAdministrator, googleAiPro }: Readonly<{
  domains: ModelAccountDomains
  controller: BuilderAgentController
  orgId: string
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  // Present when the Hub runs CLIProxyAPI; then a person signs in to Google AI Pro from Settings.
  googleAiPro?: Pick<CliproxyPool, 'startLogin'>
}>): Promise<void> => {
  const { credentials, modelPacks, memorySettings } = domains
  const callers = new WeakMap<object, Caller>()
  const callerOf = (context: unknown): Caller | undefined => callers.get(context as object)
  const auth: RouteAuth = {
    enabled: () => true,
    ensureUser: async (context) => callerOf(context),
    tenant: (context) => {
      const caller = callerOf(context)
      return caller ? { orgId, userId: caller.accountId } : undefined
    },
    // Sharing with everyone, and every write to the installation's shared row, is an
    // installation-wide action (C-025, C-026).
    isOrganizationAdmin: async (context, organizationId) => {
      const caller = callerOf(context)
      return caller !== undefined && organizationId === orgId && await isInstallationAdministrator(caller.accountId)
    },
  }
  const onCredentialsChanged = (tenant: Readonly<{ orgId: string; userId?: string }>): void => { invalidateTenantCredentialSnapshots(tenant) }
  const factoryRoutes: readonly ApiRoute[] = [
    ...new ConfigRoutes({ auth, controller, modelCredentials: credentials, memorySettings, onCredentialsChanged } as ConstructorParameters<typeof ConfigRoutes>[0]).routes(),
    ...new OAuthRoutes({ auth, modelCredentials: credentials, memorySettings, onCredentialsChanged } as ConstructorParameters<typeof OAuthRoutes>[0]).routes(),
  ]
  const factoryHandler = (method: string, path: string): FactoryHandler => {
    const route = factoryRoutes.find((candidate) => candidate.method === method && candidate.path === path)
    if (!route || !('handler' in route) || typeof route.handler !== 'function') throw new Error(`FACTORY_ROUTE_MISSING:${method} ${path}`)
    return route.handler as unknown as FactoryHandler
  }

  const admit = async (request: FastifyRequest, reply: FastifyReply): Promise<Caller | null> => {
    if (request.method !== 'GET') {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (request.headers.origin !== origin || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
        await sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
        return null
      }
    }
    const session = await resolveCurrentSession(request, request.method !== 'GET')
    if (!session) {
      await sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      return null
    }
    const { provider } = (request.params ?? {}) as Readonly<{ provider?: string }>
    if (provider !== undefined && !PROVIDER.test(provider)) {
      await sendProblem(reply, 404, 'model-provider-not-found', 'Model provider not found')
      return null
    }
    return { accountId: session.account.accountId }
  }
  const requireAdministrator = async (caller: Caller, reply: FastifyReply): Promise<boolean> => {
    if (await isInstallationAdministrator(caller.accountId)) return true
    await sendProblem(reply, 403, 'installation-administrator-required', 'Installation administrator required')
    return false
  }

  const callFactory = (handler: FactoryHandler, caller: Caller, { params, query, body, headers }: Readonly<{
    params: Readonly<Record<string, string>>
    query: Readonly<Record<string, unknown>>
    body: unknown
    headers: FastifyRequest['headers']
  }>) => {
    const context: FactoryHandlerContext = {
      req: {
        param: (name) => params[name] ?? '',
        query: (name) => typeof query[name] === 'string' ? query[name] as string : undefined,
        json: async () => body ?? {},
        header: (name) => header(headers[name.toLowerCase()]),
      },
      json: (answer, status = 200) => ({ body: answer, status }),
    }
    callers.set(context, caller)
    return handler(context)
  }

  // The Factory's own handler answers; the Hub only authenticates and names the caller.
  const forward = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', hubPath: string, factoryPath: string): void => {
    const handler = factoryHandler(method, factoryPath)
    app.route({
      method,
      url: `/api/control/model-accounts${hubPath}`,
      handler: async (request, reply) => {
        const caller = await admit(request, reply)
        if (!caller) return reply
        const answer = await callFactory(handler, caller, {
          params: (request.params ?? {}) as Readonly<Record<string, string>>,
          query: (request.query ?? {}) as Readonly<Record<string, unknown>>,
          body: request.body,
          headers: request.headers,
        })
        return reply.code(answer.status).send(answer.body)
      },
    })
  }

  forward('GET', '', '/web/config/providers')
  forward('PUT', '/:provider/key', '/web/config/providers/:provider/key')
  forward('DELETE', '/:provider/key', '/web/config/providers/:provider/key')
  forward('POST', '/:provider/oauth/start', '/web/config/providers/:provider/oauth/start')
  forward('POST', '/:provider/oauth/complete', '/web/config/providers/:provider/oauth/complete')
  forward('POST', '/:provider/oauth/poll', '/web/config/providers/:provider/oauth/poll')
  forward('DELETE', '/:provider/oauth/session/:sessionId', '/web/config/providers/:provider/oauth/session/:sessionId')
  forward('DELETE', '/:provider/oauth', '/web/config/providers/:provider/oauth')

  // Sharing moves the administrator's own account to the installation's row, and stopping moves it
  // back. One row per account keeps a rotating OAuth refresh token in one place.
  app.post<{ Params: { provider: string } }>('/api/control/model-accounts/:provider/share', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller || !await requireAdministrator(caller, reply)) return reply
    const provider = getAuthProviderId(request.params.provider)
    const own = { orgId, userId: caller.accountId }
    const credential = await credentials.getCredential(own, provider)
    if (!credential) return sendProblem(reply, 404, 'model-account-not-found', 'Model account not found')
    if (await credentials.getCredential({ orgId }, provider)) return sendProblem(reply, 409, 'model-account-already-shared', 'An account for this provider is already shared')
    await credentials.setCredential({ orgId }, provider, credential)
    await credentials.removeCredential(own, provider)
    invalidateTenantCredentialSnapshots({ orgId })
    return reply.code(204).send()
  })
  app.delete<{ Params: { provider: string } }>('/api/control/model-accounts/:provider/share', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller || !await requireAdministrator(caller, reply)) return reply
    const provider = getAuthProviderId(request.params.provider)
    const own = { orgId, userId: caller.accountId }
    const credential = await credentials.getCredential({ orgId }, provider)
    if (!credential) return sendProblem(reply, 404, 'model-account-not-found', 'Model account not found')
    if (!await credentials.getCredential(own, provider)) await credentials.setCredential(own, provider, credential)
    await credentials.removeCredential({ orgId }, provider)
    invalidateTenantCredentialSnapshots({ orgId })
    return reply.code(204).send()
  })

  if (googleAiPro) {
    const putKey = factoryHandler('PUT', '/web/config/providers/:provider/key')
    const login = createGoogleAiProLogin<Caller>({
      pool: googleAiPro,
      // The Factory's own key handler stores the person's row, so the Factory decides the write.
      writeCredential: async (caller, key) => {
        const answer = await callFactory(putKey, caller, { params: { provider: GOOGLE_AI_PRO_PROVIDER }, query: {}, body: { key }, headers: {} })
        if (answer.status !== 200) throw new Error('GOOGLE_AI_PRO_CREDENTIAL_WRITE_FAILED')
      },
      seedMemory: async ({ accountId }) => {
        await memorySettings.ensureReady()
        await memorySettings.patch({
          orgId, userId: accountId, patch: {},
          fillIfUnset: { observerModelId: GOOGLE_AI_PRO_MEMORY_MODEL, reflectorModelId: GOOGLE_AI_PRO_MEMORY_MODEL },
        })
      },
    })
    const loginProblem = (reply: FastifyReply, error: unknown) => {
      if (!(error instanceof GoogleAiProLoginError)) throw error
      const [status, title] = LOGIN_PROBLEMS[error.problem]
      return sendProblem(reply, status, error.problem, title)
    }
    // The Factory's provider listing names this provider by its catalog id, which is not the
    // credential's id, so the Settings card reads the person's connection here.
    app.get(`/api/control/model-accounts/${GOOGLE_AI_PRO_PROVIDER}/connection`, async (request, reply) => {
      const caller = await admit(request, reply)
      if (!caller) return reply
      const [mine, shared, administrator] = await Promise.all([
        credentials.getCredential({ orgId, userId: caller.accountId }, GOOGLE_AI_PRO_PROVIDER),
        credentials.getCredential({ orgId }, GOOGLE_AI_PRO_PROVIDER),
        isInstallationAdministrator(caller.accountId),
      ])
      return { mine: Boolean(mine), shared: Boolean(shared), administrator }
    })
    const base = `/api/control/model-accounts/${GOOGLE_AI_PRO_PROVIDER}/login`
    app.post(`${base}/start`, async (request, reply) => {
      const caller = await admit(request, reply)
      if (!caller) return reply
      return login.start(caller).catch((error: unknown) => loginProblem(reply, error))
    })
    app.post<{ Body: { loginId: string; callbackUrl: string } }>(`${base}/complete`, {
      schema: {
        body: {
          type: 'object', additionalProperties: false, required: ['loginId', 'callbackUrl'],
          properties: { loginId: { type: 'string', pattern: LOGIN_ID.source }, callbackUrl: { type: 'string', maxLength: 4096 } },
        },
      },
    }, async (request, reply) => {
      const caller = await admit(request, reply)
      if (!caller) return reply
      return login.complete(caller, request.body.loginId, request.body.callbackUrl)
        .then((state) => ({ state }), (error: unknown) => loginProblem(reply, error))
    })
    app.get<{ Params: { loginId: string } }>(`${base}/:loginId`, async (request, reply) => {
      const caller = await admit(request, reply)
      if (!caller) return reply
      if (!LOGIN_ID.test(request.params.loginId)) return { state: 'expired' }
      return { state: await login.status(caller, request.params.loginId) }
    })
  }

  const defaultsBody = {
    type: 'object', additionalProperties: false, required: ['build', 'fast'],
    properties: { build: { type: 'string', pattern: MODEL_ID.source }, fast: { type: 'string', pattern: MODEL_ID.source } },
  } as const
  app.get('/api/control/model-defaults', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    const [installation, own, administrator] = await Promise.all([
      readInstallationDefaults(modelPacks, orgId),
      modelPacks.getActive({ orgId, userId: caller.accountId }),
      isInstallationAdministrator(caller.accountId),
    ])
    return {
      installation: installation ? toDefaults(installation.models) : null,
      mine: own ? toDefaults(own.models) : null,
      administrator,
    }
  })
  app.put<{ Body: ModelDefaults }>('/api/control/model-defaults/installation', { schema: { body: defaultsBody } }, async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller || !await requireAdministrator(caller, reply)) return reply
    const pack = await modelPacks.upsert({ orgId, userId: caller.accountId, input: { name: INSTALLATION_DEFAULTS_PACK, models: packModels(request.body) } })
    return { installation: toDefaults(pack.models) }
  })
  app.put<{ Body: ModelDefaults }>('/api/control/model-defaults/mine', { schema: { body: defaultsBody } }, async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    const active = await modelPacks.setActive({ orgId, userId: caller.accountId, packId: PERSONAL_DEFAULTS_PACK_ID, models: packModels(request.body) })
    return { mine: toDefaults(active.models) }
  })
  app.delete('/api/control/model-defaults/mine', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    await modelPacks.clearActive({ orgId, userId: caller.accountId })
    return reply.code(204).send()
  })
}
