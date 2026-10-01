import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import type { MastraCompositeStore } from '@mastra/core/storage'
import { Memory } from '@mastra/memory'

/** The model both observational-memory roles call: the installation's memory default, paid by the run's account. */
export type MemoryModel = (requestContext: RequestContext) => Promise<MastraModelConfig>

/** Mastra Code's defaults (`DEFAULT_OBS_THRESHOLD`, `DEFAULT_REF_THRESHOLD`), tokens of messages and of observations each role waits for. */
const OBSERVATION_THRESHOLD = 30_000
const REFLECTION_THRESHOLD = 40_000

/**
 * The Builder's `Memory`, observational memory on for every conversation: observations stay in the
 * conversation's thread, and `retrieval` registers Mastra's `recall` tool, which browses the raw
 * messages of the conversations of the same Project (the resource is `project:<id>`). No vector
 * store and no embedder, so recall pages and lists and never searches by meaning.
 */
export const createBuilderMemory = ({ storage, memoryModel }: Readonly<{ storage: MastraCompositeStore; memoryModel: MemoryModel }>): Memory => {
  const model = ({ requestContext }: { requestContext: RequestContext }) => memoryModel(requestContext)
  return new Memory({
    storage,
    options: {
      // Before a conversation's first observation; after it, OM loads every unobserved message.
      lastMessages: 40,
      semanticRecall: false,
      observationalMemory: {
        enabled: true,
        scope: 'thread',
        retrieval: true,
        activateAfterIdle: 'auto',
        // A person can change the model between turns (AC-12).
        activateOnProviderChange: true,
        observation: { model, messageTokens: OBSERVATION_THRESHOLD },
        reflection: { model, observationTokens: REFLECTION_THRESHOLD },
      },
    },
  })
}
