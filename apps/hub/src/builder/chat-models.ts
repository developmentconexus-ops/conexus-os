// The Factory's model catalog (`AvailableModel` in @mastra/core) carries no capability field —
// only `id`, `provider`, `modelName`, `hasApiKey`, `apiKeyEnvVar`, `useCount`. It cannot separate a
// chat-completion model from one the composer can never build with (image generation, embeddings,
// text-to-speech, transcription, reranking). Provider catalogs mix them in the same listing, so the
// composer's model picker would otherwise offer models that fail on the first message. Until the
// catalog carries a capability field, this table is the one place that decision is made.
const NON_CHAT_MODEL_PATTERNS: ReadonlyArray<RegExp> = [
  /(^|[-_.])(dall-?e|imagen|stable-diffusion|midjourney|flux|sdxl)([-_.]|$)/i, // image generation
  /(^|[-_.])(embed|embedding)([-_.]|$)/i, // embeddings
  /(^|[-_.])(tts|whisper|transcribe)([-_.]|$)/i, // text-to-speech / transcription
  /(^|[-_.])(rerank|moderation)([-_.]|$)/i, // rerank / moderation
]

export type ChatCandidateModel = Readonly<{ id: string; modelName: string }>

const isChatModel = (model: ChatCandidateModel): boolean =>
  !NON_CHAT_MODEL_PATTERNS.some((pattern) => pattern.test(model.modelName) || pattern.test(model.id))

export const filterChatModels = <T extends ChatCandidateModel>(models: readonly T[]): T[] => models.filter(isChatModel)
