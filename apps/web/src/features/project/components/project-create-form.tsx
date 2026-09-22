import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
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
  const queryClient = useQueryClient()
  const attempt = useRef<Attempt | undefined>(undefined)
  const createInFlight = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
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
      } else if (error instanceof ProjectRequestError && error.status === 503) {
        setMessage('O repositório do Project não pôde ser criado no GitHub. Nenhum Project foi criado; tente novamente com os mesmos dados.')
      } else {
        setMessage('A criação não foi confirmada. Tente novamente com os mesmos dados.')
      }
    },
    onSettled: () => {
      createInFlight.current = false
    },
  })

  useEffect(() => {
    if (!mutation.isPending) {
      setElapsedSeconds(0)
      return undefined
    }
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [mutation.isPending])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (createInFlight.current) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    if (!name) {
      setMessage('Informe o nome do Project.')
      nameInput.current?.focus()
      return
    }
    const input: CreateProjectInput = { name, sourceBootstrap: { mode: 'NEW' } }
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
      <button className="primary" type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Criando…' : 'Criar Project'}
      </button>
      <p role="status" aria-live="polite">{mutation.isPending
        ? elapsedSeconds < 8
          ? 'Criando o Project…'
          : `Criando o repositório do Project no GitHub… ${elapsedSeconds}s`
        : message}</p>
    </form>
  )
}
