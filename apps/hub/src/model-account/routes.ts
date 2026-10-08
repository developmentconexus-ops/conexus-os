import { AnthropicKey, type Credential } from './credential.js'
import type { FastifyInstance } from 'fastify'
import {
  listAvailableModels, listModelAccounts, setModelAccountApiKey, startClaudeModelLogin, completeClaudeModelLogin, startCodexModelLogin, pollCodexModelLogin, getGoogleModelConnection, startGoogleModelLogin, completeGoogleModelLogin, getGoogleModelLoginStatus,
  ModelLoginId, type ModelAccountProvider, type OfferedModel, type SessionAccount, type AccountId, type ModelAccountEntry, type ThinkingLevel,
} from '@conexus/contract'
import { Failure } from '../platform/failure.js'
import { createClaudeLogin } from './anthropic/login.js'
import { createGoogleAiProLogin } from './google-ai-pro/login.js'
import type { ConnectResult } from './store.js'
import type { CliproxyPool } from './google-ai-pro/pool.js'
import { createCodexLogin } from './openai-codex/login.js'
import { routes } from '../http/access.js'

type Caller = Pick<SessionAccount, 'accountId' | 'displayName'>
const LISTED_PROVIDERS = ['openai-codex', 'anthropic'] as const satisfies readonly ModelAccountProvider[]

type RouteDependencies = Readonly<{
  list(accountId: AccountId): Promise<readonly ModelAccountEntry[]>
  offers(accountId: AccountId): Promise<readonly OfferedModel[]>
  write(input: Readonly<{ account: Caller; credential: Credential }>): Promise<void>
  connect(input: Readonly<{ account: Caller; credential: Credential }>): Promise<ConnectResult>
  defaultThinkingLevel: ThinkingLevel
  googleAiPro?: Pick<CliproxyPool, 'startLogin'>
}>

export async function registerModelAccountRoutes(app: FastifyInstance, { list, offers, write, connect, defaultThinkingLevel, googleAiPro }: RouteDependencies): Promise<readonly string[]> {
  const route = routes(app)
  const claudeLogin = createClaudeLogin<Caller>({
    connect: (account, tokens) => connect({ account, credential: { provider: 'anthropic', kind: 'oauth', value: tokens } }),
  })
  const codexLogin = createCodexLogin<Caller>({
    connect: (account, tokens) => connect({ account, credential: { provider: 'openai-codex', kind: 'oauth', value: tokens } }),
  })
  const googleLogin = googleAiPro && createGoogleAiProLogin<Caller>({
    pool: googleAiPro,
    connect: (account, key) => connect({ account, credential: { provider: 'google-ai-pro', kind: 'google_ai_pro', value: key } }),
  })
  const google = (): NonNullable<typeof googleLogin> => {
    if (!googleLogin) throw new Failure('MODEL_LOGIN_UNAVAILABLE')
    return googleLogin
  }
  const unavailable = (error: unknown): never => { throw new Failure('MODEL_LOGIN_UNAVAILABLE', { cause: error }) }

  route.operation(listAvailableModels, async (_input, session) => {
    return { models: [...await offers(session.account.accountId)], defaultThinkingLevel }
  })

  // The caller's accounts for the providers this Hub signs in to, never their secrets.
  route.operation(listModelAccounts, async (_input, session) => {
    const accounts = await list(session.account.accountId)
    return { accounts: LISTED_PROVIDERS.flatMap((provider) => accounts.filter((account) => account.provider === provider)) }
  })

  // A key the person pastes becomes their own `api_key` row, sealed. The key is never sent back.
  route.operation(setModelAccountApiKey, async ({ params, body }, session) => {
    const key = AnthropicKey.safeParse(body.key)
    if (!key.success) throw new Failure('MODEL_ACCOUNT_KEY_REFUSED')
    await write({ account: session.account, credential: { provider: params.provider, kind: 'api_key', value: key.data } })
    return undefined
  })

  route.operation(startClaudeModelLogin, async (_input, session) => claudeLogin.start(session.account).then(
    ({ expiresAt, ...handoff }) => ({ ...handoff, expiresAt: new Date(expiresAt).toISOString() }), unavailable))
  route.operation(completeClaudeModelLogin, async ({ body }, session) => ({ state: await claudeLogin.complete(session.account, body.loginId, body.code) }))

  route.operation(startCodexModelLogin, async (_input, session) => codexLogin.start(session.account).then(
    ({ expiresAt, ...handoff }) => ({ ...handoff, expiresAt: new Date(expiresAt).toISOString() }), unavailable))
  route.operation(pollCodexModelLogin, async ({ query }, session) => {
    const loginId = ModelLoginId.safeParse(query.loginId)
    return { state: loginId.success ? await codexLogin.poll(session.account, loginId.data) : 'expired' as const }
  })

  route.operation(getGoogleModelConnection, async (_input, session) => {
    google()
    return { own: (await list(session.account.accountId)).find((account) => account.provider === 'google-ai-pro')?.own ?? { state: 'absent' as const } }
  })
  route.operation(startGoogleModelLogin, async (_input, session) => google().start(session.account))
  route.operation(completeGoogleModelLogin, async ({ body }, session) => ({ state: await google().complete(session.account, body.loginId, body.callbackUrl) }))
  route.operation(getGoogleModelLoginStatus, async ({ params }, session) => ({ state: await google().status(session.account, params.loginId) }))

  return ['listAvailableModels', 'listModelAccounts', 'setModelAccountApiKey', 'startClaudeModelLogin', 'completeClaudeModelLogin', 'startCodexModelLogin', 'pollCodexModelLogin', 'getGoogleModelConnection', 'startGoogleModelLogin', 'completeGoogleModelLogin', 'getGoogleModelLoginStatus']
}
