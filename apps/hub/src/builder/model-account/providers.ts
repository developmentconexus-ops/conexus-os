import { z } from 'zod'
import { ModelAccountKind, ModelAccountProvider } from '../../../../../packages/contract/dist/index.js'

type ProviderEntry = Readonly<{
  name: string
  routerPrefix: string
  kinds: readonly ModelAccountKind[]
  keyShape: RegExp | null
  models: readonly string[] | null
}>

export const MODEL_PROVIDERS = {
  anthropic: { name: 'Anthropic (Claude)', routerPrefix: 'anthropic', kinds: ['api_key', 'oauth'], keyShape: /^sk-ant-[A-Za-z0-9_-]{20,200}$/, models: null },
  'openai-codex': { name: 'OpenAI (ChatGPT)', routerPrefix: 'openai', kinds: ['oauth'], keyShape: null, models: null },
  // What CLIProxyAPI v7.3.12 listed for an AI Pro account on 2026-09-22, Gemini only: Claude through
  // Antigravity has a small separate quota, and an account that lacks a model fails at call time.
  'google-ai-pro': {
    name: 'Google AI Pro',
    routerPrefix: 'google-ai-pro',
    kinds: ['google_ai_pro'],
    keyShape: null,
    models: ['gemini-3.1-pro-low', 'gemini-pro-agent', 'gemini-3.8-flash-high', 'gemini-3.7-flash-high', 'gemini-3.6-flash-high', 'gemini-3-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  },
} as const satisfies Record<ModelAccountProvider, ProviderEntry>

type Providers = typeof MODEL_PROVIDERS

export type Lawful = { [P in ModelAccountProvider]: Readonly<{ provider: P; kind: Providers[P]['kinds'][number] }> }[ModelAccountProvider]

const ProviderKind = z.object({ provider: ModelAccountProvider, kind: ModelAccountKind })

export const LawfulCredential = ProviderKind.transform((pair, ctx): Lawful => {
  const kinds: readonly ModelAccountKind[] = MODEL_PROVIDERS[pair.provider].kinds
  if (!isLawful(pair, kinds)) {
    ctx.issues.push({ code: 'custom', message: `${pair.provider} cannot hold a ${pair.kind} account`, input: pair })
    return z.NEVER
  }
  return pair
})

function isLawful(pair: z.output<typeof ProviderKind>, kinds: readonly ModelAccountKind[]): pair is Lawful {
  return kinds.includes(pair.kind)
}

export type RouterPrefix = Providers[ModelAccountProvider]['routerPrefix']

const PREFIXES: ReadonlySet<string> = new Set(Object.values(MODEL_PROVIDERS).map((entry) => entry.routerPrefix))

export function isRouterPrefix(value: string): value is RouterPrefix {
  return PREFIXES.has(value)
}
