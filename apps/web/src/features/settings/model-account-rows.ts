import type { ModelProvider } from './model-accounts-api'
import { providerName } from './provider-names'
import { groupProviders } from './provider-groups'

type ModelAccountConnection = 'api_key' | 'oauth'
export type ModelAccountState = 'connected' | 'needs-reconnect' | 'shared' | 'not-connected'

// One row shape for every place a model account is listed. `needs-reconnect` is carried in the
// type and has its own chip and action; `toRows` only produces it when the server reports
// `health: 'needs-reconnect'` for that provider. Nothing here should be built to fake that signal
// from a timestamp or any other client-side guess.
export type ModelAccountRow = Readonly<{
  provider: string
  label: string
  own: ModelAccountConnection | null
  shared: ModelAccountConnection | null
  state: ModelAccountState
}>

// Google AI Pro connects through its own card (a Google sign-in on the Hub's CLIProxyAPI), so the
// generic connect flow and the own-accounts list leave it to that card.
const OWN_CARD_PROVIDERS: ReadonlySet<string> = new Set(['google-ai-pro'])

export const connectableProviders = (providers: readonly ModelProvider[]): ModelProvider[] =>
  providers.filter((provider) => !OWN_CARD_PROVIDERS.has(provider.provider))

const toRows = (providers: readonly ModelProvider[]): ModelAccountRow[] =>
  providers.map((provider) => {
    const own = provider.userCredential ?? null
    const shared = provider.orgCredential ?? null
    return {
      provider: provider.provider,
      label: providerName(provider.provider),
      own,
      shared,
      state: own ? (provider.health === 'needs-reconnect' ? 'needs-reconnect' : 'connected') : shared ? 'shared' : 'not-connected',
    }
  })

export const unifiedRows = (providers: readonly ModelProvider[]): ModelAccountRow[] => {
  const eligible = connectableProviders(providers)
  const groups = groupProviders(eligible, '')
  const featured = 'featured' in groups ? groups.featured : []
  const featuredSet = new Set(featured.map((p) => p.provider))

  // Non-featured providers that have an active own or shared credential are preserved
  // so the user can see and manage their connection.
  const extraActive = eligible.filter(
    (p) => !featuredSet.has(p.provider) && (p.userCredential != null || p.orgCredential != null)
  )

  return toRows([...featured, ...extraActive])
}

export const sharedRows = (providers: readonly ModelProvider[]): ModelAccountRow[] =>
  toRows(providers).filter((row) => row.shared !== null)

// An administrator's own accounts that are not shared yet: the pool "Contas compartilhadas" offers
// to share.
export const shareableRows = (providers: readonly ModelProvider[]): ModelAccountRow[] =>
  toRows(providers).filter((row) => row.own !== null && row.shared === null)
