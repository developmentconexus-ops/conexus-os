import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer'
import type { AskUserAnswer, AskUserOption } from '@mastra/playground-ui/components/ai/ask-user'
import { AskUserPt, type AskUserQuestionData } from './ask-user-pt'
import { presentTool, stringifyToolValue } from '@mastra/playground-ui/components/ai/tool-call'
import { type ReactNode, useState } from 'react'
import type { PendingReply, PromptEntry } from '../mastra-session'
import { personPart } from './plan-sections'
import { toolRequest } from './tool-sentences'

// submit_plan's suspend payload carries the plan it points at; like ask_user's, it is untrusted
// wire data, so only a string field is shown.
const planField = (pending: PromptEntry, name: 'title' | 'plan'): string | null => {
  for (const source of [pending.prompt, pending.args]) {
    if (source && typeof source === 'object' && name in source) {
      const value = (source as Record<string, unknown>)[name]
      if (typeof value === 'string' && value.trim()) return value
    }
  }
  return null
}

const isOption = (value: unknown): value is AskUserOption =>
  Boolean(value) && typeof value === 'object' && typeof (value as Record<string, unknown>).label === 'string' && (value as AskUserOption).label !== ''

const parseQuestion = (value: unknown): AskUserQuestionData | null => {
  if (!value || typeof value !== 'object') return null
  const entry = value as Record<string, unknown>
  if (typeof entry.question !== 'string' || !entry.question) return null
  const options = Array.isArray(entry.options) ? entry.options.filter(isOption) : []
  return {
    question: entry.question,
    ...(typeof entry.header === 'string' && entry.header ? { header: entry.header } : {}),
    options,
    multiSelect: entry.multiSelect === true && options.length > 0,
  }
}

const FALLBACK_QUESTION: AskUserQuestionData = { question: 'O agente precisa de uma resposta sua para continuar.', options: [], multiSelect: false }

// ask_user's suspend payload is untrusted wire data (unknown on the wire type), so it is parsed
// here rather than cast: a malformed question is dropped, and a payload with none left degrades to
// a plain free-text question (still answerable) instead of passing bad shapes into the card.
const askUserQuestions = (pending: PromptEntry): AskUserQuestionData[] => {
  for (const source of [pending.prompt, pending.args]) {
    const list = source && typeof source === 'object' ? (source as Record<string, unknown>).questions : undefined
    const questions = Array.isArray(list) ? list.map(parseQuestion).filter((entry): entry is AskUserQuestionData => entry !== null) : []
    if (questions.length > 0) return questions
  }
  return [FALLBACK_QUESTION]
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
 * agent's options as radio/checkbox controls, with one send for all of its 1 to 4 questions).
 */
export function PendingCard({ pending, onAnswer }: Readonly<{
  pending: PromptEntry
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

  if (pending.ask === 'PLAN') {
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

  if (pending.ask === 'QUESTION') {
    const submit = (value: AskUserAnswer[]) => answer({ answers: value })
    return <AskUserPt
      aria-label="Pergunta do agente"
      questions={askUserQuestions(pending)}
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
