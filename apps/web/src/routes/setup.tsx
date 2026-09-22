import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { useMutation } from '@tanstack/react-query'
import { createRoute, Navigate } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import { useAccessContext } from '../app/access-gate'
import { EntryFrame, SIGN_IN_URL } from '../features/entry/entry-screens'
import { IdentityAccessRequestError, provisionCurrentAccount } from '../features/identity-access/api'
import type { ProvisionAccountInput } from '../generated/iam-client'
import { rootRoute } from './__root'

type ProvisionAttempt = { input: ProvisionAccountInput; idempotencyKey: string }

export const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupRoute,
})

const refusal = (error: unknown): string => {
  if (error instanceof IdentityAccessRequestError && error.status === 409) return 'A criação ainda não foi confirmada. Envie de novo com os mesmos dados.'
  if (error instanceof IdentityAccessRequestError && error.status === 422) return 'Revise o nome e o email antes de enviar de novo.'
  if (error instanceof IdentityAccessRequestError && error.status === 401) return 'O tempo para criar a conta acabou. Entre de novo para recomeçar.'
  return 'A conta não foi criada. Envie de novo com os mesmos dados.'
}

function SetupRoute() {
  const displayNameId = useId()
  const emailId = useId()
  const [message, setMessage] = useState('')
  const attempt = useRef<ProvisionAttempt | undefined>(undefined)
  const provisionInFlight = useRef(false)
  const displayNameInput = useRef<HTMLInputElement>(null)
  const access = useAccessContext()
  const provision = useMutation({
    mutationFn: ({ input, idempotencyKey }: ProvisionAttempt) => provisionCurrentAccount(input, idempotencyKey),
    onSuccess: () => {
      attempt.current = undefined
    },
    onError: (error) => setMessage(refusal(error)),
    onSettled: () => {
      provisionInFlight.current = false
    },
  })

  if (access.isSuccess) return <Navigate to="/" replace />
  if (provision.error instanceof IdentityAccessRequestError && provision.error.status === 403) return <Navigate to="/no-access" replace />

  if (provision.isSuccess) {
    return (
      <EntryFrame title="Conta criada">
        <p>{provision.data.displayName}, sua conta está pronta. Entre de novo para abrir o Conexus.</p>
        <Button as="a" href={SIGN_IN_URL} variant="primary" size="lg">Entrar</Button>
      </EntryFrame>
    )
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (provisionInFlight.current) return
    const form = new FormData(event.currentTarget)
    const displayName = String(form.get('displayName') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    if (!displayName) {
      setMessage('Escreva como você quer ser chamado no Conexus.')
      displayNameInput.current?.focus()
      return
    }
    const input = { displayName, ...(email ? { email } : {}) }
    let currentAttempt = attempt.current
    if (!currentAttempt || JSON.stringify(currentAttempt.input) !== JSON.stringify(input)) {
      currentAttempt = { input, idempotencyKey: crypto.randomUUID() }
    }
    attempt.current = currentAttempt
    setMessage('')
    provisionInFlight.current = true
    provision.mutate(currentAttempt)
  }

  return (
    <EntryFrame title="Criar minha conta" arrive>
      <p>Você é a primeira pessoa desta instalação. Confirme como quer ser chamado; o resto já veio do login.</p>
      <form onSubmit={submit} noValidate>
        <div className="cx-field">
          <Label htmlFor={displayNameId}>Seu nome</Label>
          <Input id={displayNameId} name="displayName" size="lg" autoComplete="name" required ref={displayNameInput} />
        </div>
        <div className="cx-field">
          <Label htmlFor={emailId}>Email (opcional)</Label>
          <Input id={emailId} name="email" type="email" size="lg" autoComplete="email" />
        </div>
        <div className="cx-form-actions">
          <Button type="submit" variant="primary" size="lg" disabled={provision.isPending}>
            {provision.isPending ? 'Criando…' : 'Criar minha conta'}
          </Button>
        </div>
        <p className="cx-form-status" data-tone={provision.isError || message ? 'error' : undefined} role="status" aria-live="polite">{message}</p>
      </form>
    </EntryFrame>
  )
}
