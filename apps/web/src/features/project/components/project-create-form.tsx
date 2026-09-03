import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import type { CreateProjectInput, CreateProjectResponse } from '../../../generated/project-client'
import { createProject, ProjectRequestError, projectListQueryKey } from '../api'

type Attempt = Readonly<{ input: CreateProjectInput; fingerprint: string; idempotencyKey: string }>

export function ProjectCreateForm({
  workspaceId,
  onCreated,
  onAuthenticationRequired,
}: {
  workspaceId: string
  onCreated: (project: CreateProjectResponse) => void
  onAuthenticationRequired: () => void
}) {
  const nameId = useId()
  const newId = useId()
  const existingId = useId()
  const locatorId = useId()
  const queryClient = useQueryClient()
  const attempt = useRef<Attempt | undefined>(undefined)
  const createInFlight = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const locatorInput = useRef<HTMLInputElement>(null)
  const [sourceMode, setSourceMode] = useState<'NEW' | 'EXISTING_GIT'>('NEW')
  const [message, setMessage] = useState('')
  const mutation = useMutation({
    mutationFn: (current: Attempt) => createProject(workspaceId, current.input, current.idempotencyKey),
    onSuccess: async (project) => {
      attempt.current = undefined
      await queryClient.invalidateQueries({ queryKey: projectListQueryKey(workspaceId) })
      onCreated(project)
    },
    onError: (error) => {
      if (error instanceof ProjectRequestError && error.status === 401) {
        onAuthenticationRequired()
      } else if (error instanceof ProjectRequestError && error.status === 403) {
        setMessage('A autoridade atual não permite criar um Project neste Workspace.')
      } else if (error instanceof ProjectRequestError && error.status === 409) {
        setMessage('A criação ainda não pôde ser confirmada. Reenvie os mesmos dados para consultar o resultado.')
      } else if (error instanceof ProjectRequestError && error.status === 422) {
        setMessage('O localizador não foi admitido. Revise a origem informada.')
      } else if (error instanceof ProjectRequestError && error.status === 503) {
        setMessage('A origem está indisponível. Nenhum sucesso foi confirmado; tente novamente com os mesmos dados.')
      } else {
        setMessage('A criação não foi confirmada. Tente novamente com os mesmos dados.')
      }
    },
    onSettled: () => {
      createInFlight.current = false
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (createInFlight.current) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const repositoryLocator = String(data.get('repositoryLocator') ?? '').trim()
    if (!name) {
      setMessage('Informe o nome do Project.')
      nameInput.current?.focus()
      return
    }
    if (sourceMode === 'EXISTING_GIT' && !repositoryLocator) {
      setMessage('Informe o localizador do repositório admitido.')
      locatorInput.current?.focus()
      return
    }
    const input: CreateProjectInput = sourceMode === 'NEW'
      ? { name, sourceBootstrap: { mode: 'NEW' } }
      : { name, sourceBootstrap: { mode: 'EXISTING_GIT', repositoryLocator } }
    const fingerprint = JSON.stringify(input)
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { input, fingerprint, idempotencyKey: crypto.randomUUID() }
    }
    setMessage('Criando o Project…')
    createInFlight.current = true
    mutation.mutate(attempt.current)
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={nameId}>Nome do Project</label>
      <input id={nameId} name="name" required ref={nameInput} />
      <fieldset>
        <legend>Origem inicial</legend>
        <label htmlFor={newId}>
          <input id={newId} type="radio" name="sourceMode" value="NEW" checked={sourceMode === 'NEW'} onChange={() => setSourceMode('NEW')} />
          Novo repositório
        </label>
        <label htmlFor={existingId}>
          <input id={existingId} type="radio" name="sourceMode" value="EXISTING_GIT" checked={sourceMode === 'EXISTING_GIT'} onChange={() => setSourceMode('EXISTING_GIT')} />
          Repositório Git existente
        </label>
      </fieldset>
      {sourceMode === 'EXISTING_GIT' && (
        <>
          <label htmlFor={locatorId}>Localizador do repositório</label>
          <input id={locatorId} name="repositoryLocator" required ref={locatorInput} />
        </>
      )}
      <button className="primary" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Criando…' : 'Criar Project'}
      </button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  )
}
