import { useEffect, useId, useRef, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import {
  AskUserContainer, AskUserOptionControl, AskUserPending, AskUserQuestion, AskUserSubmit,
  type AskUserAnswer, type AskUserOption,
} from '@mastra/playground-ui/components/ai/ask-user'
import { Input } from '@mastra/playground-ui/components/Input'
import { builderCopy } from './builder-copy'

const copy = builderCopy.askUser

/** One question of the card, as the Hub's `ask_user` suspends with it. */
export type AskUserQuestionData = Readonly<{
  question: string
  header?: string
  options: readonly AskUserOption[]
  multiSelect: boolean
}>

export interface AskUserPtProps extends Omit<ComponentProps<typeof AskUserContainer>, 'children' | 'onSubmit'> {
  questions: readonly AskUserQuestionData[]
  isSubmitting?: boolean
  /** One answer per question, in order: a string, or a string array for a multi-select question. */
  onSubmit: (answers: AskUserAnswer[]) => void
  footer?: ReactNode
}

type Draft = Readonly<{ selected: readonly string[]; text: string }>
const emptyDraft: Draft = { selected: [], text: '' }

// A typed answer stands in for a single choice, and joins the chosen options of a multi-select one.
const answerOf = (entry: AskUserQuestionData, draft: Draft): AskUserAnswer | null => {
  const text = draft.text.trim()
  if (entry.multiSelect) {
    const all = text ? [...draft.selected, text] : [...draft.selected]
    return all.length > 0 ? all : null
  }
  return text || draft.selected[0] || null
}

const answerText = (answer: AskUserAnswer | null): string => (Array.isArray(answer) ? answer.join(', ') : answer ?? '')

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
function AskUserPtInput({ questions, isSubmitting = false, onSubmit, footer, ...props }: AskUserPtProps) {
  const id = useId()
  const total = questions.length
  const stepped = total > 1
  const [drafts, setDrafts] = useState<readonly Draft[]>(() => questions.map(() => emptyDraft))
  // The step is a question's index; `total` is the review after the last question.
  const [step, setStep] = useState(0)
  const byPointer = useRef(false)
  const focusedStep = useRef(step)
  const panel = useRef<HTMLDivElement>(null)
  const update = (index: number, change: (draft: Draft) => Draft) => setDrafts((current) => current.map((draft, at) => (at === index ? change(draft) : draft)))
  const answers = questions.map((entry, index) => answerOf(entry, drafts[index] ?? emptyDraft))
  const settled = answers.filter((answer): answer is AskUserAnswer => answer !== null)
  const complete = settled.length === answers.length
  const submit = () => {
    if (complete && !isSubmitting) onSubmit(settled)
  }
  const next = () => {
    if (!stepped) return submit()
    if (answers[step] !== null) setStep(step + 1)
  }
  const onEnter = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === 'Enter') { event.preventDefault(); next() }
  }
  const label = stepped ? copy.submitMany : copy.submit
  const reviewing = stepped && step === total

  // A pointer choice of a single-select question is its answer and moves on; the arrow keys only walk the options.
  useEffect(() => {
    const pointer = () => { byPointer.current = true }
    const key = () => { byPointer.current = false }
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key) }
  }, [])

  // Each step is a new panel, and its keyboard lands on the answer: the chosen option, else the first input,
  // else (the review) the send button. The card's first panel keeps focus where it was. A new render of the
  // same step never moves focus, so typing elsewhere is never taken over.
  useEffect(() => {
    if (focusedStep.current === step) return
    focusedStep.current = step
    const node = panel.current
    const target = node?.querySelector<HTMLElement>('input:checked') ?? node?.querySelector<HTMLElement>('input') ?? node?.querySelector<HTMLElement>('button')
    target?.focus()
  }, [step])

  const entry = questions[step]
  const draft = drafts[step] ?? emptyDraft
  const questionId = `${id}-${step}`
  const question = entry ? (() => {
    const input = <Input
      id={`${questionId}-text`}
      aria-label={entry.options.length > 0 ? `${copy.other}: ${entry.question}` : undefined}
      value={draft.text}
      onChange={(event) => update(step, (current) => ({ selected: entry.multiSelect ? current.selected : [], text: event.target.value }))}
      onKeyDown={onEnter}
      placeholder={entry.options.length > 0 ? copy.other : copy.placeholder}
      disabled={isSubmitting}
      size="sm"
    />
    const header = !stepped && entry.header ? <span className="text-neutral4 mb-1 block truncate text-xs">{entry.header}</span> : null
    if (entry.options.length === 0) {
      return <div data-ask-question={entry.question}>
        {header}
        <label className="text-neutral6 mb-2 block font-medium" htmlFor={`${questionId}-text`}>{entry.question}</label>
        {input}
      </div>
    }
    return <fieldset data-ask-question={entry.question} disabled={isSubmitting} className="space-y-2">
      {header}
      <AskUserQuestion>{entry.question}</AskUserQuestion>
      {entry.options.map((option) => <AskUserOptionControl
        key={option.label}
        type={entry.multiSelect ? 'checkbox' : 'radio'}
        name={questionId}
        label={option.label}
        disabled={isSubmitting}
        checked={draft.selected.includes(option.label)}
        {...(option.description ? { description: option.description } : {})}
        onKeyDown={onEnter}
        onChange={() => {
          update(step, (current) => entry.multiSelect
            ? { ...current, selected: current.selected.includes(option.label) ? current.selected.filter((chosen) => chosen !== option.label) : [...current.selected, option.label] }
            : { selected: [option.label], text: '' })
          if (stepped && !entry.multiSelect && byPointer.current) setStep(step + 1)
        }}
      />)}
      {input}
    </fieldset>
  })() : null

  return <AskUserContainer data-testid="ask-user" data-ask-total={total} {...props}>
    <div className="space-y-4">
      {stepped ? <div role="tablist" aria-label={copy.steps} className="flex flex-wrap gap-1.5">
        {questions.map((item, index) => {
          const answered = answers[index] !== null
          return <button
            key={item.question}
            type="button"
            role="tab"
            aria-selected={step === index}
            data-answered={answered}
            disabled={isSubmitting}
            onClick={() => setStep(index)}
            className={`max-w-full truncate rounded-full border px-3 py-1 text-xs ${step === index ? 'border-accent1 text-neutral6' : 'border-border1 text-neutral4'}`}
          >{answered ? '✓ ' : ''}{item.header || copy.stepName(index + 1)}</button>
        })}
        <button
          type="button"
          role="tab"
          aria-selected={reviewing}
          disabled={isSubmitting || !complete}
          onClick={() => setStep(total)}
          className={`rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${reviewing ? 'border-accent1 text-neutral6' : 'border-border1 text-neutral4'}`}
        >{copy.review}</button>
      </div> : null}
      <div key={step} ref={panel} role={stepped ? 'tabpanel' : undefined} className="space-y-4">
        {reviewing
          ? <dl data-ask-review className="space-y-2">
            {questions.map((item, index) => <div key={item.question}>
              <dt className="text-neutral4 text-xs">{item.question}</dt>
              <dd className="text-neutral6">{answerText(answers[index] ?? null)}</dd>
            </div>)}
          </dl>
          : question}
        {stepped && !reviewing
          ? <AskUserSubmit type="button" aria-label={copy.next} disabled={isSubmitting || answers[step] === null} onClick={next}>{copy.next}</AskUserSubmit>
          : <AskUserSubmit aria-label={label} disabled={isSubmitting || !complete} onClick={submit}>{label}</AskUserSubmit>}
      </div>
      {isSubmitting ? <AskUserPending className="block">{copy.pending}</AskUserPending> : null}
      {footer}
    </div>
  </AskUserContainer>
}

/**
 * pt-BR drop-in for playground-ui's AskUser (see builder-copy.ts for why), for 1 to 4 questions in
 * one card: the questions are steps, and one send follows a review. Keyed by the questions, so a new card resets every draft like upstream.
 */
export function AskUserPt(props: AskUserPtProps) {
  const key = JSON.stringify(props.questions.map((entry) => [entry.question, entry.options.map((option) => option.label), entry.multiSelect]))
  return <AskUserPtInput key={key} {...props} />
}
