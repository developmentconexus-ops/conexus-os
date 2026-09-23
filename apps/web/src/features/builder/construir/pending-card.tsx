import { Button } from '@mastra/playground-ui/components/Button'
import { type AskUserAnswer, type AskUserOption, type AskUserPayload } from '@mastra/playground-ui/components/ai/ask-user'
import { AskUserPt as AskUser } from './ask-user-pt'
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

const isOptionList = (value: unknown): value is readonly AskUserOption[] =>
  Array.isArray(value) && value.every((entry) => entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).label === 'string')

const asSelectionMode = (value: unknown): AskUserPayload['selectionMode'] | undefined =>
  value === 'single_select' || value === 'multi_select' ? value : undefined

// ask_user's suspend payload is untrusted wire data (unknown on the wire type), so it is parsed
// here rather than cast: a malformed or missing options/selectionMode field degrades to a plain
// free-text question (still answerable) instead of passing bad shapes into AskUser.
const askUserPayload = (pending: PendingAnswer): AskUserPayload => {
  const source = [pending.prompt, pending.args].find((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
  const options = source && isOptionList(source.options) ? source.options : undefined
  const selectionMode = source ? asSelectionMode(source.selectionMode) : undefined
  return { question: questionText(pending), ...(options ? { options: [...options] } : {}), ...(selectionMode ? { selectionMode } : {}) }
}

/**
 * A call the run parked on the person. An approval offers Permitir and Recusar and nothing that
 * widens the policy; a question renders through playground-ui's own AskUser (free text, or the
 * agent's options as radio/checkbox controls for single_select/multi_select).
 */
export function PendingCard({ pending, onAnswer }: Readonly<{
  pending: PendingAnswer
  onAnswer: (answer: Readonly<{ approved: boolean }> | Readonly<{ text: string | string[] }>) => Promise<void>
}>) {
  const [state, setState] = useState<'OPEN' | 'SENDING' | 'FAILED'>('OPEN')
  const answer = (value: Readonly<{ approved: boolean }> | Readonly<{ text: string | string[] }>) => {
    setState('SENDING')
    onAnswer(value).catch(() => setState('FAILED'))
  }
  const detail = presentTool(pending.toolName, pending.args).detail
  const technical = stringifyToolValue(pending.args)

  if (pending.kind === 'QUESTION') {
    const submit = (value: AskUserAnswer) => answer({ text: value })
    return <AskUser
      aria-label="Pergunta do agente"
      payload={askUserPayload(pending)}
      isSubmitting={state === 'SENDING'}
      onSubmit={submit}
      footer={state === 'FAILED' ? <p className="cx-pending-error" role="alert">A resposta não chegou ao agente. Tente de novo.</p> : undefined}
    />
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
