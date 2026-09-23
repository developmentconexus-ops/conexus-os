import { useId, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import {
  AskUserContainer, AskUserOptionControl, AskUserPending, AskUserQuestion, AskUserSubmit,
  type AskUserAnswer, type AskUserOption, type AskUserPayload,
} from '@mastra/playground-ui/components/ai/ask-user'
import { Input } from '@mastra/playground-ui/components/Input'
import { builderCopy } from './builder-copy'

const copy = builderCopy.askUser

const validOptions = (options?: readonly AskUserOption[]): AskUserOption[] =>
  options?.filter((option) => Boolean(option && typeof option.label === 'string' && option.label)) ?? []

export interface AskUserPtProps extends Omit<ComponentProps<typeof AskUserContainer>, 'children' | 'onSubmit'> {
  payload: AskUserPayload
  isSubmitting?: boolean
  onSubmit: (answer: AskUserAnswer) => void
  footer?: ReactNode
}

function AskUserPtInput({
  payload, options, isSubmitting = false, onSubmit, footer, ...props
}: AskUserPtProps & { options: AskUserOption[] }) {
  const inputId = useId()
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<string[]>([])


  const submitText = () => {
    const answer = text.trim()
    if (answer && !isSubmitting) onSubmit(answer)
  }

  if (options.length === 0) {
    return <AskUserContainer data-testid="ask-user" {...props}>
      <label className="text-neutral6 mb-2 block font-medium" htmlFor={inputId}>{payload.question}</label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitText() } }}
          placeholder={copy.placeholder}
          disabled={isSubmitting}
          size="sm"
        />
        <AskUserSubmit aria-label={copy.submit} disabled={isSubmitting || !text.trim()} onClick={submitText}>{copy.submit}</AskUserSubmit>
      </div>
      {isSubmitting ? <AskUserPending className="mt-2 block">{copy.pending}</AskUserPending> : null}
      {footer}
    </AskUserContainer>
  }

  const isMulti = payload.selectionMode === 'multi_select'
  return <AskUserContainer data-testid="ask-user" {...props}>
    <fieldset disabled={isSubmitting} className="space-y-2">
      <AskUserQuestion>{payload.question}</AskUserQuestion>
      {options.map((option) => {
        const checked = selected.includes(option.label)
        return <AskUserOptionControl
          key={option.label}
          type={isMulti ? 'checkbox' : 'radio'}
          name={inputId}
          label={option.label}
          disabled={isSubmitting}
          checked={checked}
          {...(option.description ? { description: option.description } : {})}
          onChange={() => {
            if (isSubmitting) return
            if (!isMulti) {
              setSelected([option.label])
              onSubmit(option.label)
              return
            }
            setSelected((current) => current.includes(option.label) ? current.filter((label) => label !== option.label) : [...current, option.label])
          }}
        />
      })}
      {isMulti ? <AskUserSubmit disabled={isSubmitting || selected.length === 0} onClick={() => onSubmit(selected)}>{copy.submit}</AskUserSubmit> : null}
      {isSubmitting ? <AskUserPending>{copy.pending}</AskUserPending> : null}
      {footer}
    </fieldset>
  </AskUserContainer>
}

/**
 * pt-BR drop-in for playground-ui's AskUser (see builder-copy.ts for why). Keeps the same
 * payload-keyed remount so a new question resets local text/selection state exactly like upstream.
 */
export function AskUserPt({ payload, ...props }: AskUserPtProps) {
  const options = validOptions(payload.options)
  const payloadKey = JSON.stringify([payload.question, options.map((option) => option.label), payload.selectionMode])
  return <AskUserPtInput key={payloadKey} payload={payload} options={options} {...props} />
}
