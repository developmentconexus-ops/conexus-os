import { useId, useState } from 'react'
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

function AskUserPtInput({ questions, isSubmitting = false, onSubmit, footer, ...props }: AskUserPtProps) {
  const id = useId()
  const [drafts, setDrafts] = useState<readonly Draft[]>(() => questions.map(() => emptyDraft))
  const update = (index: number, change: (draft: Draft) => Draft) => setDrafts((current) => current.map((draft, at) => (at === index ? change(draft) : draft)))
  const answers = questions.map((entry, index) => answerOf(entry, drafts[index] ?? emptyDraft))
  const complete = answers.every((answer) => answer !== null)
  const submit = () => {
    if (complete && !isSubmitting) onSubmit(answers as AskUserAnswer[])
  }
  const onEnter = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === 'Enter') { event.preventDefault(); submit() }
  }
  const label = questions.length > 1 ? copy.submitMany : copy.submit

  return <AskUserContainer data-testid="ask-user" {...props}>
    <div className="space-y-4">
      {questions.map((entry, index) => {
        const draft = drafts[index] ?? emptyDraft
        const questionId = `${id}-${index}`
        const input = <Input
          id={`${questionId}-text`}
          aria-label={entry.options.length > 0 ? `${copy.other}: ${entry.question}` : undefined}
          value={draft.text}
          onChange={(event) => update(index, (current) => ({ selected: entry.multiSelect ? current.selected : [], text: event.target.value }))}
          onKeyDown={onEnter}
          placeholder={entry.options.length > 0 ? copy.other : copy.placeholder}
          disabled={isSubmitting}
          size="sm"
        />
        if (entry.options.length === 0) {
          return <div key={questionId} data-ask-question={entry.question}>
            {entry.header ? <span className="text-neutral4 mb-1 block text-xs">{entry.header}</span> : null}
            <label className="text-neutral6 mb-2 block font-medium" htmlFor={`${questionId}-text`}>{entry.question}</label>
            {input}
          </div>
        }
        return <fieldset key={questionId} data-ask-question={entry.question} disabled={isSubmitting} className="space-y-2">
          {entry.header ? <span className="text-neutral4 block text-xs">{entry.header}</span> : null}
          <AskUserQuestion>{entry.question}</AskUserQuestion>
          {entry.options.map((option) => <AskUserOptionControl
            key={option.label}
            type={entry.multiSelect ? 'checkbox' : 'radio'}
            name={questionId}
            label={option.label}
            disabled={isSubmitting}
            checked={draft.selected.includes(option.label)}
            {...(option.description ? { description: option.description } : {})}
            onChange={() => update(index, (current) => entry.multiSelect
              ? { ...current, selected: current.selected.includes(option.label) ? current.selected.filter((chosen) => chosen !== option.label) : [...current.selected, option.label] }
              : { selected: [option.label], text: '' })}
          />)}
          {input}
        </fieldset>
      })}
      <AskUserSubmit aria-label={label} disabled={isSubmitting || !complete} onClick={submit}>{label}</AskUserSubmit>
      {isSubmitting ? <AskUserPending className="block">{copy.pending}</AskUserPending> : null}
      {footer}
    </div>
  </AskUserContainer>
}

/**
 * pt-BR drop-in for playground-ui's AskUser (see builder-copy.ts for why), for 1 to 4 questions in
 * one card with one send. Keyed by the questions, so a new card resets every draft like upstream.
 */
export function AskUserPt(props: AskUserPtProps) {
  const key = JSON.stringify(props.questions.map((entry) => [entry.question, entry.options.map((option) => option.label), entry.multiSelect]))
  return <AskUserPtInput key={key} {...props} />
}
