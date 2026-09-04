import { useMutation } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import type { RunInceptionResponse } from '../../../generated/project-client'
import { ProjectRequestError, runProjectInception } from '../api'

type Attempt = Readonly<{ intent: string; idempotencyKey: string }>

export function ProjectInception({
  projectId,
  onSucceeded,
  onAuthenticationRequired,
}: {
  projectId: string
  onSucceeded: (candidate: RunInceptionResponse) => void
  onAuthenticationRequired: () => void
}) {
  const intentId = useId()
  const intentInput = useRef<HTMLTextAreaElement>(null)
  const attempt = useRef<Attempt | undefined>(undefined)
  const inceptionInFlight = useRef(false)
  const [intent, setIntent] = useState('')
  const [message, setMessage] = useState('')
  const mutation = useMutation({
    mutationFn: (current: Attempt) => runProjectInception(
      projectId,
      { intent: current.intent },
      current.idempotencyKey,
    ),
    onSuccess: (candidate) => {
      attempt.current = undefined
      onSucceeded(candidate)
    },
    onError: (error) => {
      if (error instanceof ProjectRequestError && error.status === 401) {
        onAuthenticationRequired()
      } else if (error instanceof ProjectRequestError && error.status === 403) {
        setMessage('A autoridade atual não permite executar a Inception deste Project.')
      } else if (error instanceof ProjectRequestError && error.status === 404) {
        setMessage('O servidor não revelou o Project para esta Inception.')
      } else if (error instanceof ProjectRequestError && error.status === 409) {
        setMessage('O resultado ainda não pôde ser confirmado. Reenvie o mesmo intent para consultar o resultado.')
      } else if (error instanceof ProjectRequestError && error.status === 422) {
        setMessage('O intent foi recusado. Revise o que deve se tornar verdade.')
      } else if (error instanceof ProjectRequestError && error.status === 503) {
        setMessage('A Inception está indisponível. Nenhum Candidate foi confirmado; tente novamente com o mesmo intent.')
      } else {
        setMessage('A Inception não foi confirmada. Tente novamente com o mesmo intent.')
      }
    },
    onSettled: () => {
      inceptionInFlight.current = false
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inceptionInFlight.current) return
    const submittedIntent = intent.trim()
    if (!submittedIntent) {
      setMessage('Informe o que deve se tornar verdade neste Project.')
      intentInput.current?.focus()
      return
    }
    if (attempt.current?.intent !== submittedIntent) {
      attempt.current = { intent: submittedIntent, idempotencyKey: crypto.randomUUID() }
    }
    setMessage('Executando a Inception…')
    inceptionInFlight.current = true
    mutation.mutate(attempt.current)
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={intentId}>O que estamos construindo, para quem e sob quais restrições importantes?</label>
      <textarea
        id={intentId}
        ref={intentInput}
        required
        rows={8}
        value={intent}
        onChange={(event) => setIntent(event.target.value)}
      />
      <p>O Conexus investiga somente a fonte e o contexto já admitidos pelo servidor.</p>
      <button className="primary" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Executando Inception…' : 'Executar Inception'}
      </button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  )
}
