import { ApiKeyAccount } from './api-key-account'
import { ChatGptAccount } from './chatgpt-account'
import { ClaudeAccount } from './claude-account'
import { GoogleAiProAccount } from './google-ai-pro-account'
import { PageHeader } from './page-header'

export function ModelsScreen() {
  return <main className="cxs-page">
    <PageHeader title="Minhas contas de modelo" lead="Cada pessoa usa a própria conta. Uma conta compartilhada pela instalação atende quem não conectou a sua." />
    <GoogleAiProAccount />
    <ChatGptAccount />
    <ClaudeAccount />
    <ApiKeyAccount provider="anthropic" />
  </main>
}
