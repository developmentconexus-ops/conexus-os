import type { ComponentType, SVGProps } from 'react'
import { Sparkle } from 'lucide-react'
import { AmazonIcon } from '@mastra/playground-ui/icons/AmazonIcon'
import { AnthropicMessagesIcon } from '@mastra/playground-ui/icons/AnthropicMessagesIcon'
import { AzureIcon } from '@mastra/playground-ui/icons/AzureIcon'
import { CohereIcon } from '@mastra/playground-ui/icons/CohereIcon'
import { GoogleIcon } from '@mastra/playground-ui/icons/GoogleIcon'
import { GroqIcon } from '@mastra/playground-ui/icons/GroqIcon'
import { MistralIcon } from '@mastra/playground-ui/icons/MistralIcon'
import { OpenAIIcon } from '@mastra/playground-ui/icons/OpenAIIcon'
import type { BuilderModel } from '../mastra-session'

export type ProviderIcon = ComponentType<SVGProps<SVGSVGElement>>

// The Hub lists a model by its catalog provider; the person knows the account by its product name.
const providerNames: Readonly<Record<string, string>> = {
  'mastracode/google-ai-pro': 'Google AI Pro',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  groq: 'Groq',
  mistral: 'Mistral',
  cohere: 'Cohere',
  azure: 'Azure OpenAI',
  amazon: 'Amazon Bedrock',
}
const titleCase = (slug: string): string =>
  (slug.split('/').at(-1) ?? slug).replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
export const providerLabel = (provider: string): string => providerNames[provider] ?? titleCase(provider)

// The logo families this Factory mount actually lists. An unrecognized provider gets a neutral mark
// rather than a guess at a brand it doesn't carry.
const iconByFamily: readonly Readonly<{ match: string; icon: ProviderIcon }>[] = [
  { match: 'openai', icon: OpenAIIcon },
  { match: 'anthropic', icon: AnthropicMessagesIcon },
  { match: 'google', icon: GoogleIcon },
  { match: 'groq', icon: GroqIcon },
  { match: 'mistral', icon: MistralIcon },
  { match: 'cohere', icon: CohereIcon },
  { match: 'azure', icon: AzureIcon },
  { match: 'amazon', icon: AmazonIcon },
]
export const providerIcon = (provider: string): ProviderIcon => {
  const lower = provider.toLowerCase()
  return iconByFamily.find((family) => lower.includes(family.match))?.icon ?? Sparkle
}

// The catalog carries no release date, only the id the provider named the model with. Every family
// in use (claude-opus-4-5, gpt-5.1, gemini-2.5-pro, llama-4…) puts its version in that id as one or
// more numbers, so reading them out and comparing as a tuple orders "newest" without a hand list.
const versionTuple = (id: string): readonly number[] => [...id.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
const byNewestFirst = (left: BuilderModel, right: BuilderModel): number => {
  const [leftVersion, rightVersion] = [versionTuple(left.id), versionTuple(right.id)]
  for (let index = 0; index < Math.max(leftVersion.length, rightVersion.length); index += 1) {
    const diff = (rightVersion[index] ?? 0) - (leftVersion[index] ?? 0)
    if (diff !== 0) return diff
  }
  return left.id.localeCompare(right.id)
}

export type ModelGroup = Readonly<{ provider: string; models: readonly BuilderModel[] }>

/** Provider groups in first-seen order, each newest first by the version the model's own id carries. */
export const groupModelsByProvider = (models: readonly BuilderModel[]): readonly ModelGroup[] => {
  const order: string[] = []
  const byProvider = new Map<string, BuilderModel[]>()
  for (const model of models) {
    if (!byProvider.has(model.provider)) { byProvider.set(model.provider, []); order.push(model.provider) }
    byProvider.get(model.provider)?.push(model)
  }
  return order.map((provider) => ({ provider, models: [...(byProvider.get(provider) ?? [])].sort(byNewestFirst) }))
}
