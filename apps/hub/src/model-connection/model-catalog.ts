import type { MastraLanguageModel } from '@mastra/core/agent'
import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { lstatSync, readFileSync } from 'node:fs'
import { createAnthropicOAuthModel } from './anthropic-oauth-provider.js'
import { createUnavailableOAuthTokenStore } from './oauth-token-store.js'

export const readJsonFile = (path: string): unknown => {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PROJECT_CONFIG_FILE_REFUSED')
  return JSON.parse(readFileSync(path, 'utf8'))
}

export type ResolvedModelAdmission = Readonly<{
  admissionId: string
  providerId: string
  modelId: string
  model: MastraLanguageModel
  validateCredential(): void
}>

export type ModelCapability = 'BUILDER_CODING' | 'BUILDER_VERIFICATION'

type ModelAdmissionCatalogEntry = Readonly<{
  admissionId: string
  providerKey: string
  modelId: string
  officialHttpsOrigin: string
  capabilitySet: readonly ModelCapability[]
  enabled: boolean
}>

export type ModelChoice = Readonly<{
  choiceId: string
  label: string
  providerId: string
  modelId: string
  capabilities: readonly ModelCapability[]
}>

const readModelAdmissionCatalog = (catalogFile: string): readonly ModelAdmissionCatalogEntry[] => {
  const catalog = readJsonFile(catalogFile)
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) ||
    !('schemaVersion' in catalog) || catalog.schemaVersion !== 'conexus-model-admission-catalog/v1' ||
    !('entries' in catalog) || !Array.isArray(catalog.entries) || catalog.entries.length < 1 || catalog.entries.length > 16) {
    throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
  }
  const identities = new Set<string>()
  const admittedCapabilities = new Set<ModelCapability>(['BUILDER_CODING', 'BUILDER_VERIFICATION'])
  return Object.freeze(catalog.entries.map((value): ModelAdmissionCatalogEntry => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
    const entry = value as Record<string, unknown>
    const keys = Object.keys(entry).sort().join(',')
    const capabilities = entry.capabilitySet
    const provider = typeof entry.providerKey === 'string'
      ? PROVIDER_REGISTRY[entry.providerKey as keyof typeof PROVIDER_REGISTRY]
      : undefined
    if (keys !== 'admissionId,capabilitySet,enabled,modelId,officialHttpsOrigin,providerKey' ||
      typeof entry.admissionId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(entry.admissionId) ||
      identities.has(entry.admissionId) || typeof entry.providerKey !== 'string' ||
      !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(entry.providerKey) ||
      typeof entry.modelId !== 'string' || !entry.modelId || /latest|\*/i.test(entry.modelId) ||
      !provider || !provider.models.includes(entry.modelId) ||
      typeof entry.officialHttpsOrigin !== 'string' || !entry.officialHttpsOrigin.startsWith('https://') ||
      !Array.isArray(capabilities) || capabilities.length < 1 || capabilities.length > admittedCapabilities.size ||
      capabilities.some((item) => typeof item !== 'string' || !admittedCapabilities.has(item as ModelCapability)) ||
      new Set(capabilities).size !== capabilities.length || typeof entry.enabled !== 'boolean') {
      throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
    }
    identities.add(entry.admissionId)
    return Object.freeze({
      admissionId: entry.admissionId,
      providerKey: entry.providerKey,
      modelId: entry.modelId,
      officialHttpsOrigin: entry.officialHttpsOrigin,
      capabilitySet: Object.freeze([...capabilities]) as readonly ModelCapability[],
      enabled: entry.enabled,
    }) as ModelAdmissionCatalogEntry
  }))
}

export const readModelChoices = ({ catalogFile, requiredCapabilities }: Readonly<{
  catalogFile: string
  requiredCapabilities: readonly ModelCapability[]
}>): readonly ModelChoice[] => Object.freeze(readModelAdmissionCatalog(catalogFile)
  .filter((entry) => entry.enabled && requiredCapabilities.every((capability) => entry.capabilitySet.includes(capability)))
  .map((entry) => Object.freeze({
    choiceId: entry.admissionId,
    label: entry.modelId.replaceAll('-', ' '),
    providerId: entry.providerKey,
    modelId: entry.modelId,
    capabilities: entry.capabilitySet,
  })))

export const resolveModelAdmission = ({
  catalogFile,
  admissionId,
  requiredCapabilities,
}: Readonly<{
  catalogFile: string
  admissionId: string
  requiredCapabilities: readonly ModelCapability[]
}>): ResolvedModelAdmission => {
  const catalog = readModelAdmissionCatalog(catalogFile)
  if (requiredCapabilities.length < 1 || new Set(requiredCapabilities).size !== requiredCapabilities.length ||
    requiredCapabilities.some((capability) =>
      !(['BUILDER_CODING', 'BUILDER_VERIFICATION'] as const).includes(capability))) {
    throw new Error('PROJECT_MODEL_CATALOG_REFUSED')
  }
  const selected = catalog.find((entry) => entry.admissionId === admissionId)
  if (selected?.enabled !== true ||
    requiredCapabilities.some((capability) => !selected.capabilitySet.includes(capability))) {
    throw new Error('PROJECT_MODEL_ADMISSION_UNAVAILABLE')
  }
  if (selected.providerKey !== 'anthropic' || selected.officialHttpsOrigin !== 'https://api.anthropic.com') {
    throw new Error('PROJECT_MODEL_PROVIDER_UNSUPPORTED')
  }
  const tokenStore = createUnavailableOAuthTokenStore()
  tokenStore.validate()
  return Object.freeze({
    admissionId: selected.admissionId,
    providerId: selected.providerKey,
    modelId: selected.modelId,
    model: createAnthropicOAuthModel({ tokenStore, modelId: selected.modelId }),
    validateCredential: tokenStore.validate,
  })
}
