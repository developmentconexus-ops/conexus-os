import { useMutation, useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import {
  accessContextQueryKey,
  getAccessContext,
  IdentityAccessRequestError,
  provisionCurrentAccount,
} from '../features/identity-access/api'
import type { ProvisionAccountInput } from '../generated/iam-client'
import { rootRoute } from './__root'

type ProvisionAttempt = { input: ProvisionAccountInput; idempotencyKey: string }

export const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupRoute,
})

function SetupRoute() {
  const displayNameId = useId()
  const emailId = useId()
  const [message, setMessage] = useState('')
  const attempt = useRef<ProvisionAttempt | undefined>(undefined)
  const provisionInFlight = useRef(false)
  const displayNameInput = useRef<HTMLInputElement>(null)
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  const provision = useMutation({
    mutationFn: ({ input, idempotencyKey }: ProvisionAttempt) =>
      provisionCurrentAccount(input, idempotencyKey),
    onSuccess: () => {
      attempt.current = undefined
    },
    onError: (error) => {
      if (error instanceof IdentityAccessRequestError && error.status === 403) {
        setMessage('Esta identidade não está autorizada para configurar esta instalação.')
      } else if (error instanceof IdentityAccessRequestError && error.status === 409) {
        setMessage('A criação ainda não pôde ser confirmada. Tente novamente com os mesmos dados.')
      } else if (error instanceof IdentityAccessRequestError && error.status === 422) {
        setMessage('Revise os dados informados antes de tentar novamente.')
      } else {
        setMessage('A criação não foi confirmada. Tente novamente com os mesmos dados.')
      }
    },
    onSettled: () => {
      provisionInFlight.current = false
    },
  })

  if (access.isSuccess) {
    return (
      <main className="status">
        <p className="eyebrow">Configuração confiável</p>
        <h1>Conta disponível</h1>
        <p>A sessão normal já resolveu sua conta atual.</p>
        <Link className="primary" to="/" search={{ workspaceId: undefined }}>Continuar</Link>
      </main>
    )
  }

  if (provision.isSuccess) {
    return (
      <main className="status">
        <p className="eyebrow">Configuração confiável</p>
        <h1>Conta criada</h1>
        <p>
          {provision.data.displayName}, a configuração inicial foi selada. Entre novamente para
          criar uma sessão normal.
        </p>
        <a className="primary" href="/protocol/oidc/login">Entrar para continuar</a>
      </main>
    )
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (provisionInFlight.current) return
    const form = new FormData(event.currentTarget)
    const displayName = String(form.get('displayName') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    if (!displayName) {
      setMessage('Informe como você quer ser reconhecido no Conexus.')
      displayNameInput.current?.focus()
      return
    }
    const input = { displayName, ...(email ? { email } : {}) }
    let currentAttempt = attempt.current
    if (!currentAttempt || JSON.stringify(currentAttempt.input) !== JSON.stringify(input)) {
      currentAttempt = { input, idempotencyKey: crypto.randomUUID() }
    }
    attempt.current = currentAttempt
    setMessage('Criando sua conta…')
    provisionInFlight.current = true
    provision.mutate(currentAttempt)
  }

  return (
    <main className="setup">
      <p className="eyebrow">Configuração confiável</p>
      <h1>Configure sua conta</h1>
      <p>O servidor já fixou sua identidade externa. Você informa somente como quer ser reconhecido.</p>
      <form onSubmit={submit}>
        <label htmlFor={displayNameId}>Nome de exibição</label>
        <input id={displayNameId} name="displayName" required ref={displayNameInput} />
        <label htmlFor={emailId}>E-mail <span>(opcional)</span></label>
        <input id={emailId} name="email" type="email" />
        <button type="submit" className="primary" disabled={provision.isPending}>
          {provision.isPending ? 'Criando…' : 'Criar minha conta'}
        </button>
      </form>
      <p role="status" aria-live="polite">{message}</p>
    </main>
  )
}
