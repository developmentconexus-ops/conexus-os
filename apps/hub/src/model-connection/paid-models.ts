import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { OAUTH_PROVIDERS } from './oauth-provider-registry.js'
import type { PaidRegistryProvider } from './oauth-provider.js'

export type ModelCredentialKind = 'OAUTH_TOKEN_SET' | 'API_KEY'

// What the Builder may offer, and everything the browser needs to render one row. providerId is
// the connection's own provider id, which is what the run SQL compares against the credential.
export type ModelOffer = Readonly<{
  choiceId: string
  label: string
  providerId: string
  modelId: string
  connectionId: string
  connectionLabel: string
  credentialKind: ModelCredentialKind
}>

export type ApiKeyProvider = Readonly<{ providerId: string; name: string; docUrl: string | null }>
export type AccountSignIn = Readonly<{ providerId: string; name: string }>

// A floating id names whichever model the provider points it at today. The run SQL refuses one,
// so it never becomes an offer.
const FLOATING_MODEL_ID = /latest|\*/i

type RegistryEntry = Readonly<{
  name?: unknown
  docUrl?: unknown
  models?: unknown
  deprecatedModels?: unknown
}>

const registryEntry = (providerId: string): RegistryEntry | undefined =>
  Object.hasOwn(PROVIDER_REGISTRY, providerId)
    ? PROVIDER_REGISTRY[providerId as keyof typeof PROVIDER_REGISTRY] as RegistryEntry
    : undefined

const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

// The payer table. A sign-in pays for the registry provider its descriptor names and reaches only
// the slice of that provider's models the descriptor admits. An API key pays for the registry
// provider it was filed under, and reaches all of it.
const payer = (providerId: string, credentialKind: ModelCredentialKind): PaidRegistryProvider | undefined => {
  if (credentialKind === 'API_KEY') return { registryProviderId: providerId }
  return Object.hasOwn(OAUTH_PROVIDERS, providerId) ? OAUTH_PROVIDERS[providerId]?.pays : undefined
}

export const paidModels = (providerId: string, credentialKind: ModelCredentialKind): readonly string[] => {
  const paid = payer(providerId, credentialKind)
  const entry = paid ? registryEntry(paid.registryProviderId) : undefined
  if (!paid || !entry) return Object.freeze([])
  const deprecated = new Set(stringList(entry.deprecatedModels))
  return Object.freeze(stringList(entry.models).filter((modelId) =>
    !deprecated.has(modelId) &&
    !FLOATING_MODEL_ID.test(modelId) &&
    (paid.modelIds === undefined || paid.modelIds.includes(modelId))))
}

// create_builder_run_with_model records which offer a run was admitted under, and bounds the id it
// will store. The slug is derived from the choice rather than minted, so the same choice always
// produces the same record.
export const modelOfferSlug = (choiceId: string): string =>
  choiceId.toLowerCase().replaceAll(/[^a-z0-9._-]/g, '-').slice(0, 128)

export const modelOffers = (connection: Readonly<{
  connectionId: string
  connectionLabel: string
  providerId: string
  credentialKind: ModelCredentialKind
}>): readonly ModelOffer[] => Object.freeze(paidModels(connection.providerId, connection.credentialKind).map((modelId) =>
  Object.freeze({
    choiceId: `${connection.providerId}/${modelId}`,
    label: modelId,
    providerId: connection.providerId,
    modelId,
    connectionId: connection.connectionId,
    connectionLabel: connection.connectionLabel,
    credentialKind: connection.credentialKind,
  })))

export const accountSignIns = (): readonly AccountSignIn[] => Object.freeze(
  Object.values(OAUTH_PROVIDERS).map((descriptor) =>
    Object.freeze({ providerId: descriptor.providerId, name: descriptor.displayName })))

export const apiKeyProviders = (): readonly ApiKeyProvider[] => Object.freeze(
  Object.keys(PROVIDER_REGISTRY).map((providerId) => {
    const entry = registryEntry(providerId)
    return Object.freeze({
      providerId,
      name: typeof entry?.name === 'string' ? entry.name : providerId,
      docUrl: typeof entry?.docUrl === 'string' ? entry.docUrl : null,
    })
  }).sort((left, right) => left.name.localeCompare(right.name) || left.providerId.localeCompare(right.providerId)))
