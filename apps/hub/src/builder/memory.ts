import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import { type CollectionSchema, FactoryStorageDomain, type MastraCompositeStore } from '@mastra/core/storage'
import { Memory } from '@mastra/memory'

/**
 * A person's observational-memory choices, the Factory's memory settings as ours: which model
 * observes and which reflects (null is the conversation's own model), and how many tokens of
 * messages and of observations each waits for.
 */
export type MemorySettings = Readonly<{
  observerModelId: string | null
  reflectorModelId: string | null
  observationThreshold: number
  reflectionThreshold: number
}>

/** Mastra Code's defaults (`DEFAULT_OBS_THRESHOLD`, `DEFAULT_REF_THRESHOLD`), which the Factory also falls back to. */
const DEFAULT_MEMORY_SETTINGS: MemorySettings = Object.freeze({
  observerModelId: null, reflectorModelId: null, observationThreshold: 30_000, reflectionThreshold: 40_000,
})

/** Where a run's request context carries the settings of the person it runs for, read once when it starts. */
export const MEMORY_SETTINGS_KEY = 'conexusBuilderMemorySettings'

const isMemorySettings = (value: unknown): value is MemorySettings => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  const modelId = (entry: unknown) => entry === null || typeof entry === 'string'
  return modelId(candidate.observerModelId) && modelId(candidate.reflectorModelId)
    && Number.isSafeInteger(candidate.observationThreshold) && Number.isSafeInteger(candidate.reflectionThreshold)
}

/** The settings a turn runs with; a session with no run behind it keeps the defaults. */
const memorySettingsOf = (requestContext: RequestContext): MemorySettings => {
  const value = requestContext.getRaw(MEMORY_SETTINGS_KEY)
  return isMemorySettings(value) ? value : DEFAULT_MEMORY_SETTINGS
}

/** The model one OM role calls: the chosen one, or the conversation's own when null, paid by the run's account. */
export type MemoryRoleModel = (requestContext: RequestContext, modelId: string | null) => Promise<MastraModelConfig>

/**
 * The Builder's `Memory`, observational memory on for every conversation (thread scope, one thread
 * per conversation). Thresholds are fixed per `Memory`, so one is kept for each pair a run asks
 * for, as Mastra Code's `getDynamicMemory` does; the role models are read per call.
 */
export const createBuilderMemory = ({ storage, roleModel }: Readonly<{ storage: MastraCompositeStore; roleModel: MemoryRoleModel }>) => {
  const built = new Map<string, Memory>()
  const observer = ({ requestContext }: { requestContext: RequestContext }) => roleModel(requestContext, memorySettingsOf(requestContext).observerModelId)
  const reflector = ({ requestContext }: { requestContext: RequestContext }) => roleModel(requestContext, memorySettingsOf(requestContext).reflectorModelId)
  return ({ requestContext }: { requestContext: RequestContext }): Memory => {
    const { observationThreshold, reflectionThreshold } = memorySettingsOf(requestContext)
    const key = `${observationThreshold}:${reflectionThreshold}`
    const existing = built.get(key)
    if (existing) return existing
    const memory = new Memory({
      storage,
      options: {
        // Before a conversation's first observation; after it, OM loads every unobserved message.
        lastMessages: 40,
        semanticRecall: false,
        observationalMemory: {
          enabled: true,
          scope: 'thread',
          activateAfterIdle: 'auto',
          // A person can change the model between turns (AC-23).
          activateOnProviderChange: true,
          observation: { model: observer, messageTokens: observationThreshold },
          reflection: { model: reflector, observationTokens: reflectionThreshold },
        },
      },
    })
    built.set(key, memory)
    return memory
  }
}

/** One stored row: every knob nullable, so only what the person changed is kept (the Factory's `memory_settings`). */
type MemorySettingsRow = Readonly<{
  account_id: string
  observer_model_id: string | null
  reflector_model_id: string | null
  observation_threshold: number | null
  reflection_threshold: number | null
  updated_at: Date
}>

const MEMORY_SETTINGS_COLLECTION: CollectionSchema = {
  name: 'builder_memory_settings',
  columns: {
    account_id: { type: 'text', primaryKey: true },
    observer_model_id: { type: 'text', nullable: true },
    reflector_model_id: { type: 'text', nullable: true },
    observation_threshold: { type: 'integer', nullable: true },
    reflection_threshold: { type: 'integer', nullable: true },
    updated_at: { type: 'timestamp' },
  },
}

const settingsOf = (row: MemorySettingsRow | null): MemorySettings => Object.freeze({
  observerModelId: row?.observer_model_id ?? DEFAULT_MEMORY_SETTINGS.observerModelId,
  reflectorModelId: row?.reflector_model_id ?? DEFAULT_MEMORY_SETTINGS.reflectorModelId,
  observationThreshold: row?.observation_threshold ?? DEFAULT_MEMORY_SETTINGS.observationThreshold,
  reflectionThreshold: row?.reflection_threshold ?? DEFAULT_MEMORY_SETTINGS.reflectionThreshold,
})

export type MemorySettingsStore = Readonly<{
  read(accountId: string): Promise<MemorySettings>
  /** Replaces the person's settings whole and answers them as stored. */
  write(accountId: string, settings: MemorySettings): Promise<MemorySettings>
}>

/**
 * Each person's settings as a collection of the Builder's own Mastra storage (Mastra's
 * `FactoryStorageDomain`, as the Factory keeps its `memory_settings`), created by Mastra next to
 * its threads in the `factory` schema.
 */
export class BuilderMemorySettings extends FactoryStorageDomain implements MemorySettingsStore {
  constructor() {
    super('builder-memory-settings')
  }

  override async init(): Promise<void> {
    await this.ensureCollections([MEMORY_SETTINGS_COLLECTION])
  }

  async dangerouslyClearAll(): Promise<void> {
    await this.ops.deleteMany(MEMORY_SETTINGS_COLLECTION.name, {})
  }

  async read(accountId: string): Promise<MemorySettings> {
    await this.ensureReady()
    return settingsOf(await this.ops.findOne<MemorySettingsRow>(MEMORY_SETTINGS_COLLECTION.name, { account_id: accountId }))
  }

  async write(accountId: string, settings: MemorySettings): Promise<MemorySettings> {
    await this.ensureReady()
    return settingsOf(await this.ops.upsertOne<MemorySettingsRow>(MEMORY_SETTINGS_COLLECTION.name, ['account_id'], {
      account_id: accountId,
      observer_model_id: settings.observerModelId,
      reflector_model_id: settings.reflectorModelId,
      observation_threshold: settings.observationThreshold,
      reflection_threshold: settings.reflectionThreshold,
      updated_at: new Date(),
    }))
  }
}
