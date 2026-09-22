import { useId } from 'react'
import type { Conversation } from '../mastra-session'

export const conversationTitle = (conversation: Conversation): string => conversation.title?.trim() || 'Conversa sem título'

export function BuilderConversationList({ conversations, selectedId, onSelect, onCreate, pending }: Readonly<{
  conversations: readonly Conversation[]
  selectedId: string | null
  onSelect: (conversationId: string) => void
  onCreate: () => void
  pending: boolean
}>) {
  const headingId = useId()
  return <section className="builder-conversations" aria-labelledby={headingId}>
    <div className="builder-conversations-bar">
      <h3 id={headingId}>Conversas</h3>
      <button type="button" onClick={onCreate} disabled={pending}>Nova conversa</button>
    </div>
    <ul className="builder-conversations-list">
      {conversations.map((entry) => <li key={entry.id}>
        <button type="button" aria-pressed={entry.id === selectedId} onClick={() => onSelect(entry.id)} title={conversationTitle(entry)}>{conversationTitle(entry)}</button>
      </li>)}
    </ul>
  </section>
}
