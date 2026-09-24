import type { ModelProvider } from './model-accounts-api.ts'
import { providerName } from './provider-names.ts'

// The providers an operator reaches for first: identity providers with subscription login, plus a
// short curated list of the ones people actually use. Order here is display priority inside
// "Principais", not alphabetical.
export const CURATED_FEATURED_PROVIDERS = [
  'anthropic', 'openai', 'google', 'openrouter', 'xai', 'groq', 'deepseek', 'mistral',
] as const

export type ProviderGroups =
  | Readonly<{ featured: readonly ModelProvider[]; rest: readonly ModelProvider[] }>
  | Readonly<{ matches: readonly ModelProvider[] }>

const normalize = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')

const isFeatured = (provider: ModelProvider): boolean =>
  Boolean(provider.oauth?.supported) || (CURATED_FEATURED_PROVIDERS as readonly string[]).includes(provider.provider)

const byDisplayName = (a: ModelProvider, b: ModelProvider): number =>
  providerName(a.provider).localeCompare(providerName(b.provider), 'pt-BR')

// Featured providers keep curated order first (the ones an operator recognizes by name), then any
// other subscription-login provider not on that list, alphabetically.
const featuredOrder = (providers: readonly ModelProvider[]): ModelProvider[] => {
  const featured = providers.filter(isFeatured)
  const curatedRank = new Map<string, number>(CURATED_FEATURED_PROVIDERS.map((id, index) => [id, index]))
  return [...featured].sort((a, b) => {
    const rankA = curatedRank.get(a.provider)
    const rankB = curatedRank.get(b.provider)
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB
    if (rankA !== undefined) return -1
    if (rankB !== undefined) return 1
    return byDisplayName(a, b)
  })
}

// One pure function the component only renders: an empty query groups providers for browsing, any
// other query flattens to one ranked match list (findable ones first) or an explicit empty result.
export function groupProviders(providers: readonly ModelProvider[], query: string): ProviderGroups {
  const featured = featuredOrder(providers)
  const featuredIds = new Set(featured.map((provider) => provider.provider))
  const rest = providers.filter((provider) => !featuredIds.has(provider.provider)).sort(byDisplayName)
  const trimmed = query.trim()
  if (trimmed === '') return { featured, rest }
  const needle = normalize(trimmed)
  const matches = [...featured, ...rest].filter((provider) =>
    normalize(providerName(provider.provider)).includes(needle) || normalize(provider.provider).includes(needle))
  return { matches }
}
