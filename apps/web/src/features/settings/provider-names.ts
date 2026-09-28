// One table of display names, shared by Settings and the Builder composer. A provider id
// absent here falls back to a title-cased reading of its own id.
const providerNames: Readonly<Record<string, string>> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (ChatGPT)',
  'openai-codex': 'OpenAI (ChatGPT)',
  google: 'Google (Gemini)',
  'google-ai-pro': 'Google AI Pro',
  xai: 'xAI (Grok)',
  'github-copilot': 'GitHub Copilot',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  cohere: 'Cohere',
  azure: 'Azure OpenAI',
  amazon: 'Amazon Bedrock',
}

const titleCase = (slug: string): string =>
  (slug.split('/').at(-1) ?? slug).replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export const providerName = (provider: string): string => providerNames[provider] ?? titleCase(provider)
