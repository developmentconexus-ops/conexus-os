// One table of display names; a provider id absent here falls back to itself.
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
}

export const providerName = (provider: string): string => providerNames[provider] ?? provider
