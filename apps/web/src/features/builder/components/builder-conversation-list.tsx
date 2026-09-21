import type { FormEvent, KeyboardEvent } from 'react'
import { useId, useState } from 'react'
import type { Conversation } from '../mastra-session'

export const conversationTitle = (conversation: Conversation): string => conversation.title?.trim() || 'Conversa sem título'

export function BuilderConversationList({ conversations, selectedId, onSelect, onCreate, onRename, pending }: Readonly<{
  conversations: readonly Conversation[]
  selectedId: string | null
  onSelect: (conversationId: string) => void
  onCreate: () => void
  onRename: (title: string) => void
  pending: boolean
}>) {
  const headingId = useId()
  // null is "not renaming", so an open editor always carries its own draft and the two cannot disagree.
  const [draft, setDraft] = useState<string | null>(null)
  const selected = conversations.find((entry) => entry.id === selectedId) ?? null
  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = (draft ?? '').trim()
    setDraft(null)
    if (title && title !== selected?.title) onRename(title)
  }
  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Escape') setDraft(null) }
  return <section className="builder-conversations" aria-labelledby={headingId}>
    <div className="builder-conversations-bar">
      <h3 id={headingId}>Conversas</h3>
      <button type="button" onClick={onCreate} disabled={pending}>Nova conversa</button>
      <button type="button" onClick={() => setDraft(selected?.title ?? '')} disabled={pending || !selected || draft !== null}>Renomear</button>
    </div>
    {draft !== null && <form className="builder-conversations-rename" onSubmit={submitRename}>
      <input aria-label="Novo nome da conversa" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onDraftKeyDown} />
      <button className="primary" type="submit" disabled={pending}>Salvar</button>
      <button type="button" onClick={() => setDraft(null)}>Cancelar</button>
    </form>}
    <ul className="builder-conversations-list">
      {conversations.map((entry) => <li key={entry.id}>
        <button type="button" aria-pressed={entry.id === selectedId} onClick={() => onSelect(entry.id)} title={conversationTitle(entry)}>{conversationTitle(entry)}</button>
      </li>)}
    </ul>
  </section>
}
