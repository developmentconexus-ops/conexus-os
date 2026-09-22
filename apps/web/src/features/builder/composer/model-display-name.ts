import type { ReasoningLevel } from '../mastra-session'

// Mastra's AvailableModel.modelName is documented as "Model name without provider prefix"
// (node_modules/@mastra/core/dist/agent-controller/types.d.ts:371 in the installed 1.x line) — it is
// still the provider's raw catalog id (`gemini-3.8-flash-high`), not a display name. The provider
// registry (`node_modules/@mastra/core/dist/provider-registry.json`, typed by
// node_modules/@mastra/core/dist/llm/model/provider-registry.d.ts's `PROVIDER_REGISTRY`) carries a
// human `name` per PROVIDER (e.g. "Subconscious", "TokenGo"), but each provider's `models` entry is
// a bare array of id strings with no per-model display name field anywhere in the installed
// registry, gateway catalog (`GatewayModel`, gateway-manager.d.ts) or models.dev bundle. So this
// formatter derives a name from the id; it is the documented fallback, not a field Mastra ships.

// A literal copy of mastra-session's `reasoningLevels`, kept as a `ReasoningLevel` array so the
// compiler catches drift: this module is imported standalone by a plain node:test run (no bundler),
// where importing mastra-session's *runtime* export would also drag in its Mastra client/React
// Query chain, so only its type is imported (erased entirely by TS's type-only import).
const reasoningLevelIds: readonly ReasoningLevel[] = ['low', 'medium', 'high', 'xhigh']
const reasoningSuffixPattern = new RegExp(`-(${reasoningLevelIds.join('|')})$`)

export type ReasoningSuffix = Readonly<{ base: string; level: ReasoningLevel }>

/**
 * google-ai-pro/CLIProxy ids encode their reasoning level as a trailing suffix
 * (`gemini-3.8-flash-high`) instead of exposing an independent reasoning setting. A model whose raw
 * name ends this way has no free choice of level: the id itself locks it in.
 */
export const parseReasoningSuffix = (modelName: string): ReasoningSuffix | null => {
  const match = reasoningSuffixPattern.exec(modelName)
  if (!match) return null
  const level = match[1] as ReasoningLevel
  return { base: modelName.slice(0, -match[0].length), level }
}

// Acronyms the catalog's ids actually carry stay uppercase; OpenAI's own "o1/o3/o4" family stays
// lowercase, matching how OpenAI itself writes them.
const upperCaseWords = new Set(['gpt', 'ai'])
const literalWords = new Set(['o1', 'o3', 'o4'])

const titleWord = (word: string): string => {
  if (literalWords.has(word)) return word
  if (upperCaseWords.has(word)) return word.toUpperCase()
  if (/^\d/.test(word)) return word
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// Anthropic and OpenAI ids hyphenate a version across two numeric tokens ("claude-opus-4-5" means
// 4.5, not "4" then "5"); merging an adjacent numeric pair with a dot before title-casing reads
// that version the way the provider names it.
const mergeVersionTokens = (tokens: readonly string[]): readonly string[] => {
  const merged: string[] = []
  for (const token of tokens) {
    const previous = merged.at(-1)
    if (previous !== undefined && /^\d+$/.test(previous) && /^\d+$/.test(token)) merged[merged.length - 1] = `${previous}.${token}`
    else merged.push(token)
  }
  return merged
}

/**
 * Turns a bare catalog id ("gemini-3.8-flash-high") into the human name the person reads
 * ("Gemini 3.8 Flash"). The reasoning suffix, if any, is stripped here: the composer renders that
 * level separately (the "· alto" badge, or the locked reasoning control), not as part of the name.
 */
export const humanizeModelName = (modelName: string): string => {
  const { base } = parseReasoningSuffix(modelName) ?? { base: modelName }
  const tokens = mergeVersionTokens(base.split(/[-_]+/).filter(Boolean))
  return tokens.map(titleWord).join(' ')
}
