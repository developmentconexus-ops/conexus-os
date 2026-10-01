import type { MastraModelConfig } from '@mastra/core/llm'
import type { RequestContext } from '@mastra/core/request-context'
import type { MastraCompositeStore } from '@mastra/core/storage'
import { Memory } from '@mastra/memory'

/** The model both observational-memory roles call: the installation's memory default, paid by the run's account. */
export type MemoryModel = (requestContext: RequestContext) => Promise<MastraModelConfig>

/** Mastra Code's defaults (`DEFAULT_OBS_THRESHOLD`, `DEFAULT_REF_THRESHOLD`), tokens of messages and of observations each role waits for. */
const OBSERVATION_THRESHOLD = 30_000
const REFLECTION_THRESHOLD = 40_000

/** Mastra's default title instructions (`resolveTitleInstructions` in `@mastra/core`), in Portuguese and about what the person asks of the app. */
const TITLE_INSTRUCTIONS = `
- Gere um título curto, em português do Brasil, a partir da conversa entre a pessoa e o assistente.
- As linhas da conversa começam com "User:" e "Assistant:". Nunca responda nem continue a conversa.
- Sempre devolva um título, mesmo que a conversa seja só uma saudação.
- Use no máximo 80 caracteres.
- O título resume o que a pessoa quer construir ou mudar no app.
- Não use aspas nem dois-pontos.
- O texto inteiro que você devolver será o título.`

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
      // Mastra Code names threads the same way (`agents/memory.js`: `generateTitle: { model }`, the memory model); `instructions` is ours, for Portuguese.
      generateTitle: { model, instructions: TITLE_INSTRUCTIONS },
      observationalMemory: {
        enabled: true,
        scope: 'thread',
        retrieval: true,
        activateAfterIdle: 'auto',
        // A person can change the model between turns (AC-12).
        activateOnProviderChange: true,
        // A reminder before a message that follows a gap of ten minutes or more (Mastra Code, `agents/memory.js`).
        temporalMarkers: true,
        observation: {
          model,
          messageTokens: OBSERVATION_THRESHOLD,
          // Mastra Code's buffering for thread scope (`agents/memory.js`, `bufferTokens: isResourceScope ? false : 1 / 5`
          // and the lines after it): observe in the background every fifth of the window, keep 2,000 tokens on
          // activation, and force activation at twice the window.
          bufferTokens: 1 / 5,
          bufferActivation: 2_000,
          blockAfter: 2,
          previousObserverTokens: 1_000,
          threadTitle: true,
        },
        reflection: { model, observationTokens: REFLECTION_THRESHOLD, bufferActivation: 1 / 2, blockAfter: 1.1 },
      },
    },
  })
}
