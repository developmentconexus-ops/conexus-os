import { Button } from '@mastra/playground-ui/components/Button'
import type { AskUserAnswer, AskUserOption } from '@mastra/playground-ui/components/ai/ask-user'
import { AskUserPt, type AskUserQuestionData } from './ask-user-pt'
import { presentTool, stringifyToolValue } from '@mastra/playground-ui/components/ai/tool-call'
import { useState } from 'react'
import type { AnswerOutcome, PendingReply } from '../mastra-session'
import type { PromptEntry } from '../transcript'
import { PlanPt } from './plan-pt'
import { toolRequest } from './tool-sentences'
import { FAILURES } from '../../../generated/failures'

// submit_plan's suspend payload carries the plan it points at; like ask_user's, it is untrusted
// wire data, so only a string field is shown.
const planField = (pending: PromptEntry, name: 'title' | 'plan'): string | null => {
  for (const source of [pending.prompt, pending.args]) {
    if (source && typeof source === 'object' && name in source) {
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
      const value = (source as Record<string, unknown>)[name]
      if (typeof value === 'string' && value.trim()) return value
    }
  }
  return null
}

const isOption = (value: unknown): value is AskUserOption =>
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  Boolean(value) && typeof value === 'object' && typeof (value as Record<string, unknown>).label === 'string' && (value as AskUserOption).label !== ''

const parseQuestion = (value: unknown): AskUserQuestionData | null => {
  if (!value || typeof value !== 'object') return null
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
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
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
    const list = source && typeof source === 'object' ? (source as Record<string, unknown>).questions : undefined
    const questions = Array.isArray(list) ? list.map(parseQuestion).filter((entry): entry is AskUserQuestionData => entry !== null) : []
    if (questions.length > 0) return questions
  }
  return [FALLBACK_QUESTION]
}

// Why an answer did not take the run back to work, in the person's words.
const REFUSAL_TEXT: Readonly<Record<Exclude<AnswerOutcome, 'ACCEPTED'>, string>> = {
  ALREADY_ANSWERED: FAILURES.TOOL_ANSWER_ALREADY_GIVEN.message,
  ENDED: FAILURES.QUESTION_ENDED.message,
  UNAVAILABLE: FAILURES.BUILDER_UNAVAILABLE.message,
}

/**
 * A call the run waits on the person for. An approval offers Permitir and Recusar and nothing that
 * widens the policy; a question renders through AskUserPt, playground-ui's AskUser parts in pt-BR (free text, or the
 * agent's options as radio/checkbox controls, with one send for all of its 1 to 4 questions).
 */
export function PendingCard({ pending, onAnswer }: Readonly<{
  pending: PromptEntry
  onAnswer: (answer: PendingReply) => Promise<AnswerOutcome>
}>) {
  const [state, setState] = useState<AnswerOutcome | 'OPEN' | 'SENDING'>('OPEN')
  const answer = (value: PendingReply) => {
    setState('SENDING')
    onAnswer(value).then(setState, () => setState('UNAVAILABLE'))
  }
  const refusal = state === 'OPEN' || state === 'SENDING' || state === 'ACCEPTED' ? null : REFUSAL_TEXT[state]
  const detail = presentTool(pending.toolName, pending.args).detail
  const technical = stringifyToolValue(pending.args)

  if (pending.ask === 'PLAN') {
    return <PlanPt title={planField(pending, 'title')} plan={planField(pending, 'plan')} sending={state === 'SENDING'} refusal={refusal} onAnswer={answer} />
  }

  if (pending.ask === 'QUESTION') {
    const submit = (value: AskUserAnswer[]) => answer({ answers: value })
    return <AskUserPt
      aria-label="Pergunta do agente"
      questions={askUserQuestions(pending)}
      isSubmitting={state === 'SENDING'}
      onSubmit={submit}
      footer={refusal ? <p className="cx-pending-error" role="alert">{refusal}</p> : undefined}
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
    {refusal && <p className="cx-pending-error" role="alert">{refusal}</p>}
  </section>
}
