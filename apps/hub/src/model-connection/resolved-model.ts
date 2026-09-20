import type { MastraLanguageModel } from '@mastra/core/agent'

// The two shapes a resolved model takes. An OAuth sign-in is a provider instance, because a
// bounded egress fetch, the provider headers and the system-prompt identity rewrite cannot ride a
// config object. An API key for any provider is Mastra's own config, which the model router turns
// into that provider's client. It lives beside the two builders that produce it, because the
// Builder and the connection custody module both name it and neither may reach into the other.
export type ResolvedBuilderModel = MastraLanguageModel | Readonly<{ id: `${string}/${string}`; apiKey: string }>
