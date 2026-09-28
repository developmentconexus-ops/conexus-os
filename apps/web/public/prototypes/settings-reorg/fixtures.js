// Local fixtures mirroring Conexus production data schemas
export const FIXTURES = {
  // Model Accounts list
  modelAccounts: {
    providers: [
      {
        provider: 'anthropic',
        source: 'stored-user',
        userCredential: 'api_key',
        orgCredential: null,
        oauth: { supported: false, modes: [] }
      },
      {
        provider: 'openai',
        source: 'none',
        userCredential: null,
        orgCredential: null,
        oauth: { supported: true, modes: ['device-code', 'paste-code'] }
      },
      {
        provider: 'google',
        source: 'stored-user',
        userCredential: 'api_key',
        orgCredential: null,
        oauth: { supported: false, modes: [] }
      },
      {
        provider: 'github-copilot',
        source: 'stored-user',
        userCredential: 'api_key',
        orgCredential: null,
        oauth: { supported: true, modes: ['device-code'] },
        needsReconnect: true
      },
      {
        provider: 'groq',
        source: 'stored-org',
        userCredential: null,
        orgCredential: 'api_key',
        oauth: { supported: false, modes: [] }
      },
      {
        provider: 'xai',
        source: 'none',
        userCredential: null,
        orgCredential: null,
        oauth: { supported: false, modes: [] }
      },
      {
        provider: 'deepseek',
        source: 'none',
        userCredential: null,
        orgCredential: null,
        oauth: { supported: false, modes: [] }
      },
      {
        provider: 'openrouter',
        source: 'none',
        userCredential: null,
        orgCredential: null,
        oauth: { supported: false, modes: [] }
      },
      {
        provider: 'mistral',
        source: 'none',
        userCredential: null,
        orgCredential: null,
        oauth: { supported: false, modes: [] }
      }
    ],
    orgKeyAdmin: true
  },

  // Available Builder models for selection
  builderModels: [
    { id: 'anthropic:claude-3-7-sonnet-20250219', provider: 'Anthropic (Claude)', modelName: 'claude-3-7-sonnet', hasApiKey: true },
    { id: 'anthropic:claude-3-5-haiku-20241022', provider: 'Anthropic (Claude)', modelName: 'claude-3-5-haiku', hasApiKey: true },
    { id: 'openai:gpt-4o', provider: 'OpenAI (ChatGPT)', modelName: 'gpt-4o', hasApiKey: true },
    { id: 'openai:gpt-4o-mini', provider: 'OpenAI (ChatGPT)', modelName: 'gpt-4o-mini', hasApiKey: true },
    { id: 'google:gemini-2.0-flash', provider: 'Google (Gemini)', modelName: 'gemini-2.0-flash', hasApiKey: true },
    { id: 'groq:llama-3.3-70b-versatile', provider: 'Groq', modelName: 'llama-3.3-70b-versatile', hasApiKey: true }
  ],

  // Model Defaults
  modelDefaults: {
    installation: {
      build: 'anthropic:claude-3-7-sonnet-20250219',
      fast: 'openai:gpt-4o-mini'
    },
    mine: null, // null when using company defaults, or { build, fast }
    administrator: true
  },

  providerNames: {
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
    mistral: 'Mistral'
  }
};
