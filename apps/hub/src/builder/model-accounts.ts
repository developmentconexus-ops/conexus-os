import { getAuthProviderId } from '@mastra/factory/routes/provider-credentials'
import { invalidateTenantCredentialSnapshots } from '@mastra/factory/routes/tenant-credentials'
import { applyActiveModelPack } from '@mastra/factory/session/model-pack-hydration'
import type { ModelCredentialsStorage } from '@mastra/factory/storage/domains/credentials/base'
import type { MemorySettingsStorage } from '@mastra/factory/storage/domains/memory-settings/base'
import type { ModelPacksStorage } from '@mastra/factory/storage/domains/model-packs/base'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import { filterChatModels } from './chat-models.js'
import { FACTORY_MEMORY_MODEL_ID, setFactoryMemoryModel } from './factory-provisioning.js'
import { FACTORY_OPERATOR_ID } from './factory.js'
import { GOOGLE_AI_PRO_CATALOG_PROVIDER, GOOGLE_AI_PRO_MODELS, GOOGLE_AI_PRO_PROVIDER, seedGoogleAiProMemory } from './google-ai-pro/credential.js'
import { createGoogleAiProLogin, GoogleAiProLoginError, type LoginProblem } from './google-ai-pro/login.js'
import type { CliproxyPool } from './google-ai-pro/pool.js'

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
type OfferedModel = Readonly<{ id: string; provider: string; modelName: string; hasApiKey: boolean }>

// The Factory's own provider-key and sign-in routes, which the browser calls at their own paths.
export const FACTORY_CREDENTIAL_ROUTES: ReadonlySet<string> = new Set([
  'GET /web/config/providers',
  'GET /web/config/models',
  'PUT /web/config/providers/:provider/key',
  'DELETE /web/config/providers/:provider/key',
  'POST /web/config/providers/:provider/oauth/start',
  'POST /web/config/providers/:provider/oauth/complete',
  'POST /web/config/providers/:provider/oauth/poll',
  'DELETE /web/config/providers/:provider/oauth/session/:sessionId',
  'DELETE /web/config/providers/:provider/oauth',
])

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

export const registerModelAccountRoutes = async (app: FastifyInstance, { domains, orgId, origin, resolveCurrentSession, isInstallationAdministrator, googleAiPro }: Readonly<{
  domains: ModelAccountDomains
  orgId: string
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  // Present when the Hub runs CLIProxyAPI; then a person signs in to Google AI Pro from Settings.
  googleAiPro?: Pick<CliproxyPool, 'startLogin'>
}>): Promise<void> => {
  const { credentials, modelPacks, memorySettings } = domains
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

  // The Factory's own answer for the caller's credentials, user over org, from its route. Google AI
  // Pro's credential id is not its catalog id, so the Factory leaves its models out, and the Hub,
  // which hosts it (C-027), adds them for a caller who has that credential.
  app.get('/api/control/model-accounts/models', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    const answer = await app.inject({ method: 'GET', url: '/web/config/models', headers: { cookie: request.headers.cookie ?? '' } })
    if (answer.statusCode !== 200) return reply.code(answer.statusCode).type('application/json').send(answer.body)
    const models = filterChatModels((answer.json() as Readonly<{ models: readonly OfferedModel[] }>).models)
      .filter((model) => model.provider !== GOOGLE_AI_PRO_CATALOG_PROVIDER)
    const connected = googleAiPro && (await credentials.getCredential({ orgId, userId: caller.accountId }, GOOGLE_AI_PRO_PROVIDER) ??
      await credentials.getCredential({ orgId }, GOOGLE_AI_PRO_PROVIDER))
    if (!connected) return { models }
    return { models: [...models, ...GOOGLE_AI_PRO_MODELS.map((modelName) => ({ id: `${GOOGLE_AI_PRO_CATALOG_PROVIDER}/${modelName}`, provider: GOOGLE_AI_PRO_CATALOG_PROVIDER, modelName, hasApiKey: true }))] }
  })
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
    const login = createGoogleAiProLogin<Caller>({
      pool: googleAiPro,
      // The person's own row in the Factory's credential storage, as its key route writes it. The
      // sign-in settles on a later poll, which carries no write's CSRF, so the Hub writes here.
      writeCredential: async ({ accountId }, key) => {
        const tenant = { orgId, userId: accountId }
        await credentials.setCredential(tenant, GOOGLE_AI_PRO_PROVIDER, { type: 'api_key', key })
        invalidateTenantCredentialSnapshots(tenant)
      },
      seedMemory: ({ accountId }) => seedGoogleAiProMemory(memorySettings, { orgId, userId: accountId }),
    })
    const loginProblem = (reply: FastifyReply, error: unknown) => {
      if (!(error instanceof GoogleAiProLoginError)) throw error
      const [status, title] = LOGIN_PROBLEMS[error.problem]
      const extra = error.expiresAt ? { expiresAt: new Date(error.expiresAt).toISOString() } : undefined
      return sendProblem(reply, status, error.problem, title, undefined, extra)
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

  const memoryBody = { type: 'object', additionalProperties: false, required: ['model'], properties: { model: { type: 'string', pattern: FACTORY_MEMORY_MODEL_ID.source } } } as const
  app.get('/api/control/installation/memory', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller || !await requireAdministrator(caller, reply)) return reply
    const record = await memorySettings.get({ orgId, userId: FACTORY_OPERATOR_ID })
    return { model: record?.observerModelId ?? null }
  })
  app.put<{ Body: { model: string } }>('/api/control/installation/memory', { schema: { body: memoryBody } }, async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller || !await requireAdministrator(caller, reply)) return reply
    await setFactoryMemoryModel({ records: { memorySettings }, orgId, modelId: request.body.model, write: () => undefined })
    return { model: request.body.model }
  })
}
