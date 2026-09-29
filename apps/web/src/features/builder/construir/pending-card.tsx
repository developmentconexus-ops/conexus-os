import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer'
import { type AskUserAnswer, type AskUserOption, type AskUserPayload } from '@mastra/playground-ui/components/ai/ask-user'
import { AskUserPt } from './ask-user-pt'
import { presentTool, stringifyToolValue } from '@mastra/playground-ui/components/ai/tool-call'
import { type ReactNode, useState } from 'react'
import type { PendingAnswer, PendingReply } from '../mastra-session'
import { personPart } from './plan-sections'
import { toolRequest } from './tool-sentences'

const questionText = (pending: PendingAnswer): string => {
  for (const source of [pending.prompt, pending.args]) {
    if (source && typeof source === 'object' && 'question' in source && typeof source.question === 'string') return source.question
  }
  return 'O agente precisa de uma resposta sua para continuar.'
}

// submit_plan's suspend payload carries the plan it points at; like ask_user's, it is untrusted
// wire data, so only a string field is shown.
const planField = (pending: PendingAnswer, name: 'title' | 'plan'): string | null => {
  for (const source of [pending.prompt, pending.args]) {
    if (source && typeof source === 'object' && name in source) {
      const value = (source as Record<string, unknown>)[name]
      if (typeof value === 'string' && value.trim()) return value
    }
  }
  return null
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

// The plan's reply, shown on the card and again in the reader: the same answer handler behind both.
function PlanReply({ feedback, onFeedback, sending, failed, onAnswer, children }: Readonly<{
  feedback: string
  onFeedback: (value: string) => void
  sending: boolean
  failed: boolean
  onAnswer: (value: PendingReply) => void
  children?: ReactNode
}>) {
  return <>
    <textarea className="cx-pending-feedback" aria-label="O que mudar no plano" placeholder="Se quiser ajustes, diga o que mudar" value={feedback} onChange={(event) => onFeedback(event.target.value)} />
    <div className="cx-pending-actions">
      {children}
      <Button className="cx-button-ink" size="sm" disabled={sending} onClick={() => onAnswer({ plan: { action: 'approved' } })}>Aprovar e construir</Button>
      <Button variant="default" size="sm" disabled={sending || !feedback.trim()} onClick={() => onAnswer({ plan: { action: 'rejected', feedback: feedback.trim() } })}>Pedir ajustes</Button>
    </div>
    {failed && <p className="cx-pending-error" role="alert">A resposta não chegou ao agente. Tente de novo.</p>}
  </>
}

/**
 * A call the run parked on the person. An approval offers Permitir and Recusar and nothing that
 * widens the policy; a question renders through AskUserPt, playground-ui's AskUser parts in pt-BR (free text, or the
 * agent's options as radio/checkbox controls for single_select/multi_select).
 */
export function PendingCard({ pending, onAnswer }: Readonly<{
  pending: PendingAnswer
  onAnswer: (answer: PendingReply) => Promise<void>
}>) {
  const [state, setState] = useState<'OPEN' | 'SENDING' | 'FAILED'>('OPEN')
  const [feedback, setFeedback] = useState('')
  const [reading, setReading] = useState(false)
  const answer = (value: PendingReply) => {
    setState('SENDING')
    setReading(false)
    onAnswer(value).catch(() => setState('FAILED'))
  }
  const detail = presentTool(pending.toolName, pending.args).detail
  const technical = stringifyToolValue(pending.args)

  if (pending.kind === 'PLAN') {
    const title = planField(pending, 'title')
    const plan = planField(pending, 'plan')
    const person = personPart(plan ?? '')
    const reply = { feedback, onFeedback: setFeedback, sending: state === 'SENDING', failed: state === 'FAILED', onAnswer: answer }
    return <section className="cx-pending" aria-label="Plano para aprovar">
      <p className="cx-pending-text">{title ? <>O agente propõe um plano: <strong>{title}</strong>.</> : 'O agente propõe um plano.'} Aprovar e construir?</p>
      {plan && <>
        <div className="cx-plan-clamp"><MarkdownRenderer>{person}</MarkdownRenderer></div>
        <Button variant="default" size="sm" className="cx-plan-read" onClick={() => setReading(true)}>Ler plano completo</Button>
        <AlertDialog open={reading} onOpenChange={setReading}>
          <AlertDialog.Content className="cx-plan-reader">
            <AlertDialog.Header>
              <AlertDialog.Title>{title ?? 'Plano'}</AlertDialog.Title>
              <AlertDialog.Description>O plano inteiro, como o agente vai seguir. Aprovar começa a construir.</AlertDialog.Description>
            </AlertDialog.Header>
            <div className="cx-plan-reader-body"><MarkdownRenderer>{plan}</MarkdownRenderer></div>
            <AlertDialog.Footer className="cx-plan-reader-reply">
              <PlanReply {...reply}><AlertDialog.Cancel>Fechar</AlertDialog.Cancel></PlanReply>
            </AlertDialog.Footer>
          </AlertDialog.Content>
        </AlertDialog>
      </>}
      <PlanReply {...reply} />
    </section>
  }

  if (pending.kind === 'QUESTION') {
    const submit = (value: AskUserAnswer) => answer({ text: value })
    return <AskUserPt
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
