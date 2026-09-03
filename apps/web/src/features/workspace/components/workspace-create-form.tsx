import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import type { CreateWorkspaceResponse } from '../../../generated/workspace-client'
import { accessContextQueryKey } from '../../identity-access/api'
import {
  createWorkspace,
  isWorkspaceAuthenticationRequired,
  WorkspaceRequestError,
} from '../api'

type Attempt = { name: string; idempotencyKey: string }

export function WorkspaceCreateForm({
  currentAccountId,
  onCreated,
  onAuthenticationRequired,
}: {
  currentAccountId: string
  onCreated: (workspace: CreateWorkspaceResponse) => void
  onAuthenticationRequired: () => void
}) {
  const nameId = useId()
  const queryClient = useQueryClient()
  const attempt = useRef<Attempt | undefined>(undefined)
  const createInFlight = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const mutation = useMutation({
    mutationFn: ({ name, idempotencyKey }: Attempt) => createWorkspace({ name }, idempotencyKey),
    onSuccess: async (workspace) => {
      if (
        workspace.initialAccessEstablished !== true ||
        workspace.creatorAccountId !== currentAccountId
      ) {
        setMessage('O servidor não confirmou o acesso inicial desta conta ao Workspace.')
        return
      }
      attempt.current = undefined
      await queryClient.invalidateQueries({ queryKey: accessContextQueryKey })
      onCreated(workspace)
    },
    onError: (error) => {
      if (isWorkspaceAuthenticationRequired(error)) {
        onAuthenticationRequired()
        return
      }
      if (error instanceof WorkspaceRequestError && error.status === 403) {
        setMessage('A autoridade atual não permite criar este Workspace.')
      } else if (error instanceof WorkspaceRequestError && error.status === 409) {
        setMessage('A criação ainda não pôde ser confirmada. Tente novamente com o mesmo nome.')
      } else {
        setMessage('A criação não foi confirmada. Tente novamente com o mesmo nome.')
      }
    },
    onSettled: () => {
      createInFlight.current = false
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (createInFlight.current) return
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (!name) {
      setMessage('Informe o nome do Workspace.')
      nameInput.current?.focus()
      return
    }
    if (attempt.current?.name !== name) {
      attempt.current = { name, idempotencyKey: crypto.randomUUID() }
    }
    setMessage('Criando o Workspace…')
    createInFlight.current = true
    mutation.mutate(attempt.current)
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={nameId}>Nome do Workspace</label>
      <input id={nameId} name="name" required ref={nameInput} />
      <button type="submit" className="primary" disabled={mutation.isPending}>
        {mutation.isPending ? 'Criando…' : 'Criar Workspace'}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  )
}
