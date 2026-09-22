import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import type { CreateWorkspaceResponse } from '../../../generated/workspace-client'
import { accessContextQueryKey } from '../../identity-access/api'
import { createWorkspace, WorkspaceRequestError } from '../api'

type Attempt = { name: string; idempotencyKey: string }

const refusal = (error: unknown): string => {
  if (error instanceof WorkspaceRequestError && error.status === 403) return 'Sua conta não pode criar Workspaces nesta instalação.'
  if (error instanceof WorkspaceRequestError && error.status === 409) return 'A criação ainda não foi confirmada. Envie de novo com o mesmo nome.'
  return 'O Workspace não foi criado. Envie de novo com o mesmo nome.'
}

export function WorkspaceCreateForm({
  currentAccountId,
  firstWorkspace,
  onCreated,
}: {
  currentAccountId: string
  firstWorkspace: boolean
  onCreated: (workspace: CreateWorkspaceResponse) => void
}) {
  const nameId = useId()
  const hintId = useId()
  const queryClient = useQueryClient()
  const attempt = useRef<Attempt | undefined>(undefined)
  const createInFlight = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const mutation = useMutation({
    mutationFn: ({ name, idempotencyKey }: Attempt) => createWorkspace({ name }, idempotencyKey),
    onSuccess: async (workspace) => {
      if (workspace.initialAccessEstablished !== true || workspace.creatorAccountId !== currentAccountId) {
        setMessage('O Workspace foi criado, mas o servidor não confirmou seu acesso a ele. Recarregue a página.')
        return
      }
      attempt.current = undefined
      await queryClient.invalidateQueries({ queryKey: accessContextQueryKey })
      onCreated(workspace)
    },
    onError: (error) => setMessage(refusal(error)),
    onSettled: () => {
      createInFlight.current = false
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (createInFlight.current) return
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (!name) {
      setMessage('Dê um nome ao Workspace.')
      nameInput.current?.focus()
      return
    }
    if (attempt.current?.name !== name) attempt.current = { name, idempotencyKey: crypto.randomUUID() }
    setMessage('')
    createInFlight.current = true
    mutation.mutate(attempt.current)
  }

  return (
    <form className="cx-form" onSubmit={submit} noValidate>
      <div className="cx-field">
        <Label htmlFor={nameId}>Nome do Workspace</Label>
        <Input id={nameId} name="name" size="lg" required ref={nameInput} aria-describedby={hintId} autoFocus placeholder="Ex.: Operações" />
        <p className="cx-field-hint" id={hintId}>Use o nome da equipe ou da área, como as pessoas já a chamam.</p>
      </div>
      <div className="cx-form-actions">
        <Button type="submit" variant="primary" size="lg" disabled={mutation.isPending}>
          {mutation.isPending ? 'Criando…' : 'Criar Workspace'}
        </Button>
        {!firstWorkspace && <Button as={Link} to="/workspaces" variant="ghost" size="lg">Cancelar</Button>}
      </div>
      <p className="cx-form-status" data-tone={message ? 'error' : undefined} role="status" aria-live="polite">{message}</p>
    </form>
  )
}
