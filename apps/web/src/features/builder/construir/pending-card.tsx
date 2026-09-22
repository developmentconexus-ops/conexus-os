import { Button } from '@mastra/playground-ui/components/Button'
import { presentTool, stringifyToolValue } from '@mastra/playground-ui/components/ai/tool-call'
import { useState } from 'react'
import type { PendingAnswer } from '../mastra-session'
import { toolRequest } from './tool-sentences'

const questionText = (pending: PendingAnswer): string => {
  for (const source of [pending.prompt, pending.args]) {
    if (source && typeof source === 'object' && 'question' in source && typeof source.question === 'string') return source.question
  }
  return 'O agente precisa de uma resposta sua para continuar.'
}

/**
 * A call the run parked on the person. An approval offers Permitir and Recusar and nothing that
 * widens the policy; a question takes a written answer.
 */
export function PendingCard({ pending, onAnswer }: Readonly<{
  pending: PendingAnswer
  onAnswer: (answer: Readonly<{ approved: boolean } | { text: string }>) => Promise<void>
}>) {
  const [state, setState] = useState<'OPEN' | 'SENDING' | 'FAILED'>('OPEN')
  const [text, setText] = useState('')
  const answer = (value: Readonly<{ approved: boolean } | { text: string }>) => {
    setState('SENDING')
    onAnswer(value).catch(() => setState('FAILED'))
  }
  const detail = presentTool(pending.toolName, pending.args).detail
  const technical = stringifyToolValue(pending.args)

  if (pending.kind === 'QUESTION') {
    return <section className="cx-pending" aria-label="Pergunta do agente">
      <p className="cx-pending-text">{questionText(pending)}</p>
      <form className="cx-pending-answer" onSubmit={(event) => { event.preventDefault(); if (text.trim()) answer({ text: text.trim() }) }}>
        <textarea aria-label="Sua resposta" rows={2} value={text} onChange={(event) => setText(event.target.value)} disabled={state === 'SENDING'} />
        <Button type="submit" className="cx-button-ink" size="sm" disabled={!text.trim() || state === 'SENDING'}>Responder</Button>
      </form>
      {state === 'FAILED' && <p className="cx-pending-error" role="alert">A resposta não chegou ao agente. Tente de novo.</p>}
    </section>
  }

  return <section className="cx-pending" aria-label="Pedido de permissão">
    <p className="cx-pending-text">O agente quer {toolRequest(pending.toolName)}{detail ? <>: <code>{detail}</code></> : '.'} Permitir?</p>
    <details className="cx-pending-detail">
      <summary>Detalhe técnico</summary>
      <pre>{pending.toolName}{technical ? `\n${technical}` : ''}</pre>
    </details>
    <div className="cx-pending-actions">
      <Button className="cx-button-ink" size="sm" disabled={state === 'SENDING'} onClick={() => answer({ approved: true })}>Permitir</Button>
      <Button variant="default" size="sm" disabled={state === 'SENDING'} onClick={() => answer({ approved: false })}>Recusar</Button>
    </div>
    {state === 'FAILED' && <p className="cx-pending-error" role="alert">A resposta não chegou ao agente. Tente de novo.</p>}
  </section>
}
