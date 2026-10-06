import { z } from 'zod'
import { ModelLoginId } from './ids.js'
import { operation } from './operation.js'

export const ModelAccountProvider = z.enum(['anthropic', 'openai-codex', 'google-ai-pro']).meta({ id: 'ModelAccountProvider' })
export type ModelAccountProvider = z.output<typeof ModelAccountProvider>

export const ModelAccountKind = z.enum(['api_key', 'oauth', 'google_ai_pro']).meta({ id: 'ModelAccountKind' })
export type ModelAccountKind = z.output<typeof ModelAccountKind>

export const ApiKeyProvider = z.enum(['anthropic']).meta({ id: 'ApiKeyProvider' })

export const THINKING_LEVELS = ['off', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export const ThinkingLevel = z.enum(THINKING_LEVELS).meta({ id: 'ThinkingLevel' })
export type ThinkingLevel = z.output<typeof ThinkingLevel>

export const OfferedModel = z.object({
  id: z.string(),
  provider: z.string(),
  providerName: z.string(),
  modelName: z.string(),
  thinkingLevels: z.array(ThinkingLevel),
}).meta({ id: 'OfferedModel' })
export type OfferedModel = z.output<typeof OfferedModel>

export const OwnModelAccount = z.discriminatedUnion('state', [
  z.object({ state: z.literal('absent') }),
  z.object({ state: z.literal('connected'), kind: ModelAccountKind }),
]).meta({ id: 'OwnModelAccount' })
export type OwnModelAccount = z.output<typeof OwnModelAccount>

export const ModelAccountEntry = z.object({
  provider: ModelAccountProvider,
  providerName: z.string(),
  own: OwnModelAccount,
  shared: z.boolean(),
}).meta({ id: 'ModelAccountEntry' })
export type ModelAccountEntry = z.output<typeof ModelAccountEntry>

const ClaudeLoginState = z.enum(['succeeded', 'failed', 'expired'])
const SettlingLoginState = z.enum(['waiting', 'succeeded', 'failed', 'expired'])

const noParams = { params: null, headers: null } as const

export const MDL01 = operation({
  id: 'MDL-01', access: 'session', method: 'GET', path: '/api/control/model-accounts/models',
  ...noParams, query: z.object({ scope: z.literal('installation').optional() }).strict(), body: null,
  success: { 200: z.object({ models: z.array(OfferedModel), defaultThinkingLevel: ThinkingLevel }) },
  effects: [], failures: [], malformed: null,
})

export const MDL02 = operation({
  id: 'MDL-02', access: 'session', method: 'GET', path: '/api/control/model-accounts',
  ...noParams, query: null, body: null,
  success: { 200: z.object({ accounts: z.array(ModelAccountEntry) }) },
  effects: [], failures: [], malformed: null,
})

export const MDL03 = operation({
  id: 'MDL-03', access: 'session', method: 'PUT', path: '/api/control/model-accounts/:provider/api-key',
  params: z.object({ provider: ApiKeyProvider }), query: null, headers: null,
  body: z.strictObject({ key: z.string().max(512).trim() }),
  success: { 204: null },
  effects: [], failures: ['MODEL_ACCOUNT_KEY_REFUSED', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'],
  malformed: { provider: 'MODEL_ACCOUNT_PROVIDER_UNKNOWN' },
})

export const MDL04 = operation({
  id: 'MDL-04', access: 'session', method: 'POST', path: '/api/control/model-accounts/anthropic/oauth/start',
  ...noParams, query: null, body: null,
  success: { 200: z.object({ loginId: ModelLoginId, url: z.string(), expiresAt: z.iso.datetime() }) },
  effects: [], failures: ['MODEL_LOGIN_UNAVAILABLE'], malformed: null,
})

export const MDL05 = operation({
  id: 'MDL-05', access: 'session', method: 'POST', path: '/api/control/model-accounts/anthropic/oauth/complete',
  ...noParams, query: null, body: z.strictObject({ loginId: ModelLoginId, code: z.string().min(1).max(4096) }),
  success: { 200: z.object({ state: ClaudeLoginState }) },
  effects: [], failures: [], malformed: null,
})

export const MDL06 = operation({
  id: 'MDL-06', access: 'session', method: 'POST', path: '/api/control/model-accounts/openai-codex/oauth/start',
  ...noParams, query: null, body: null,
  success: { 200: z.object({ loginId: ModelLoginId, url: z.string(), userCode: z.string(), intervalMs: z.number().int(), expiresAt: z.iso.datetime() }) },
  effects: [], failures: ['MODEL_LOGIN_UNAVAILABLE'], malformed: null,
})

export const MDL07 = operation({
  id: 'MDL-07', access: 'session', method: 'POST', path: '/api/control/model-accounts/openai-codex/oauth/poll',
  ...noParams, query: z.object({ loginId: z.string().max(64).optional() }).strict(), body: null,
  success: { 200: z.object({ state: SettlingLoginState }) },
  effects: [], failures: [], malformed: null,
})

export const MDL08 = operation({
  id: 'MDL-08', access: 'session', method: 'GET', path: '/api/control/model-accounts/google-ai-pro/connection',
  ...noParams, query: null, body: null,
  success: { 200: z.object({ own: OwnModelAccount, shared: z.boolean() }) },
  effects: [], failures: ['MODEL_LOGIN_UNAVAILABLE'], malformed: null,
})

export const MDL09 = operation({
  id: 'MDL-09', access: 'session', method: 'POST', path: '/api/control/model-accounts/google-ai-pro/login/start',
  ...noParams, query: null, body: null,
  success: { 200: z.object({ loginId: ModelLoginId, url: z.string() }) },
  effects: [], failures: ['MODEL_LOGIN_BUSY', 'MODEL_LOGIN_UNAVAILABLE'], malformed: null,
})

export const MDL10 = operation({
  id: 'MDL-10', access: 'session', method: 'POST', path: '/api/control/model-accounts/google-ai-pro/login/complete',
  ...noParams, query: null, body: z.strictObject({ loginId: ModelLoginId, callbackUrl: z.string().max(4096) }),
  success: { 200: z.object({ state: SettlingLoginState }) },
  effects: [], failures: ['MODEL_LOGIN_CALLBACK_REFUSED', 'MODEL_LOGIN_UNAVAILABLE'], malformed: null,
})

export const MDL11 = operation({
  id: 'MDL-11', access: 'session', method: 'POST', path: '/api/control/model-accounts/google-ai-pro/login/:loginId',
  params: z.object({ loginId: ModelLoginId }), query: null, headers: null, body: null,
  success: { 200: z.object({ state: SettlingLoginState }) },
  effects: [], failures: ['MODEL_LOGIN_UNAVAILABLE'],
  malformed: { loginId: 'MODEL_LOGIN_NOT_FOUND' },
})
