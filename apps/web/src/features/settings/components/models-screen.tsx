import { GoogleAiProAccount } from './google-ai-pro-account'
import { PageHeader } from './page-header'

// Slice 1 of spec 0002 carries only the Google AI Pro account a run uses; API keys, the other
// subscriptions, sharing and the defaults come back with the Modelos de IA screen in slice 5.
export function ModelsScreen() {
  return <main className="cxs-page">
    <PageHeader title="Minhas contas de modelo" lead="Cada pessoa usa a própria conta. Uma conta compartilhada pela instalação atende quem não conectou a sua." />
    <GoogleAiProAccount />
  </main>
}
