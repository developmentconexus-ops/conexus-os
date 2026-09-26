import type { ModelProvider } from './model-accounts-api'
import { providerName } from './provider-names'

type ModelAccountConnection = 'api_key' | 'oauth'
type ModelAccountState = 'connected' | 'needs-reconnect' | 'shared'

// One row shape for every place a model account is listed. `needs-reconnect` is carried in the
// type and has its own chip and action, but the Hub does not report which accounts need it yet, so
// `toRows` never produces it; nothing here should be built to fake that signal.
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
      state: own ? 'connected' : 'shared',
    }
  })

export const ownRows = (providers: readonly ModelProvider[]): ModelAccountRow[] =>
  toRows(connectableProviders(providers)).filter((row) => row.own !== null)

export const sharedRows = (providers: readonly ModelProvider[]): ModelAccountRow[] =>
  toRows(providers).filter((row) => row.shared !== null)

// An administrator's own accounts that are not shared yet: the pool "Contas compartilhadas" offers
// to share.
export const shareableRows = (providers: readonly ModelProvider[]): ModelAccountRow[] =>
  toRows(providers).filter((row) => row.own !== null && row.shared === null)
