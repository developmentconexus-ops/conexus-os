import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { MarkdownRenderer } from '@mastra/playground-ui/components/MarkdownRenderer'
import { Textarea } from '@mastra/playground-ui/components/Textarea'
import { Plan, PlanBody, PlanContent, PlanHeader, PlanIntro, PlanLabel, PlanMain } from '@mastra/playground-ui/components/ai/plan'
import { type ReactNode, useState } from 'react'
import type { PendingReply } from '../mastra-session'
import { personPart } from './plan-sections'

// The plan's reply, shown on the card and again in the reader: the same answer handler behind both.
function PlanReply({ feedback, onFeedback, sending, refusal, onAnswer, children }: Readonly<{
  feedback: string
  onFeedback: (value: string) => void
  sending: boolean
  refusal: string | null
  onAnswer: (value: PendingReply) => void
  children?: ReactNode
}>) {
  return <>
    <Textarea className="cx-pending-feedback" size="sm" aria-label="O que mudar no plano" placeholder="Se quiser ajustes, diga o que mudar" value={feedback} onChange={(event) => onFeedback(event.target.value)} />
    <div className="cx-pending-actions">
      {children}
      <Button className="cx-button-ink" size="sm" disabled={sending} onClick={() => onAnswer({ plan: { action: 'approved' } })}>Aprovar e construir</Button>
      <Button variant="default" size="sm" disabled={sending || !feedback.trim()} onClick={() => onAnswer({ plan: { action: 'rejected', feedback: feedback.trim() } })}>Pedir ajustes</Button>
    </div>
    {refusal && <p className="cx-pending-error" role="alert">{refusal}</p>}
  </>
}

/**
 * The plan submit_plan waits on the person for, on playground-ui's Plan parts in pt-BR: the person's
 * part on the card, the whole plan in the reader, and one reply in both. The parts' own copy and
 * expand buttons speak English, so the card does without them.
 */
export function PlanPt({ title, plan, sending, refusal, onAnswer }: Readonly<{
  title: string | null
  plan: string | null
  sending: boolean
  /** Why the last answer did not resume the run, in the person's words. */
  refusal: string | null
  onAnswer: (value: PendingReply) => void
}>) {
  const [feedback, setFeedback] = useState('')
  const [reading, setReading] = useState(false)
  const answer = (value: PendingReply): void => {
    setReading(false)
    onAnswer(value)
  }
  const reply = { feedback, onFeedback: setFeedback, sending, refusal, onAnswer: answer }
  return <Plan role="region" aria-label="Plano para aprovar">
    <PlanHeader><PlanLabel>Plano</PlanLabel></PlanHeader>
    <PlanBody className="cx-plan-body">
      <PlanIntro className="cx-plan-intro">
        <p className="cx-pending-text">{title ? <>O agente propõe um plano: <strong>{title}</strong>.</> : 'O agente propõe um plano.'} Aprovar e construir?</p>
      </PlanIntro>
      {plan && <>
        <PlanMain><PlanContent>{personPart(plan)}</PlanContent></PlanMain>
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
    </PlanBody>
  </Plan>
}
