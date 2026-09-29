import { ApiKeyAccount } from './api-key-account'
import { ChatGptAccount } from './chatgpt-account'
import { ClaudeAccount } from './claude-account'
import { GoogleAiProAccount } from './google-ai-pro-account'
import { PageHeader } from './page-header'

// The accounts a run can pay with today: Google AI Pro, the ChatGPT and Claude subscriptions, and an
// Anthropic API key. Sharing and the defaults come back with the rest of slice 5 of spec 0002.
export function ModelsScreen() {
  return <main className="cxs-page">
    <PageHeader title="Minhas contas de modelo" lead="Cada pessoa usa a própria conta. Uma conta compartilhada pela instalação atende quem não conectou a sua." />
    <GoogleAiProAccount />
    <ChatGptAccount />
    <ClaudeAccount />
    <ApiKeyAccount provider="anthropic" />
  </main>
}
