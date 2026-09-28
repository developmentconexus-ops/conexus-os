import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { BuilderRequestError, sendBuilderMessage } from '../builder/api'
import { applyThreadSettings, type BuilderMode, openConversation, type ReasoningLevel } from '../builder/mastra-session'
import type { CreateProjectResponse } from '../../generated/project-client'
import { createProject, ProjectRequestError, projectListQueryKey, projectSummariesQueryKey } from './api'

export type StartProjectInput = Readonly<{ name: string; description: string; modelId: string | undefined; reasoning: ReasoningLevel | null | undefined; mode: BuilderMode }>
export type StartedProject = Readonly<{ project: CreateProjectResponse; firstRequest: 'SENT' | 'NONE' | 'REFUSED' }>

// Every id is chosen once per distinct input, so a retry after a lost response lands on the
// Project, conversation and request the first attempt already made instead of making new ones.
type Attempt = Readonly<{ fingerprint: string; projectKey: string; conversationId: string; requestKey: string }>

function startProjectRefusal(error: unknown): string {
  if (error instanceof ProjectRequestError && error.status === 403) return 'Sua conta não pode criar Projetos neste Workspace.'
  if (error instanceof ProjectRequestError && error.status === 409) return 'A criação ainda não foi confirmada. Envie de novo com os mesmos dados.'
  if (error instanceof ProjectRequestError && error.status === 503) return 'O Conexus não conseguiu criar o repositório do Projeto, então nenhum Projeto foi criado. Envie de novo.'
  if (error instanceof ProjectRequestError && error.status === null) return 'O servidor não respondeu. Nada foi perdido; envie de novo.'
  return 'O Projeto não foi criado. Envie de novo com os mesmos dados.'
}

export function useStartProject(workspaceId: string) {
  const queryClient = useQueryClient()
  const attempt = useRef<Attempt | undefined>(undefined)
  const inFlight = useRef(false)
  const mutation = useMutation({
    mutationFn: async ({ input, current }: Readonly<{ input: StartProjectInput; current: Attempt }>): Promise<StartedProject> => {
      const project = await createProject(workspaceId, { name: input.name, sourceBootstrap: { mode: 'NEW' } }, current.projectKey)
      if (!input.description) return { project, firstRequest: 'NONE' }
      try {
        await openConversation(project.projectId, current.conversationId)
        // Best-effort: the mode and model chosen before the Project existed follow the first request
        // onto its new conversation. Losing these writes is not worth losing the Project or the first
        // request over, so they never turn a started run into a refusal; the run falls back to
        // Planejar and the installation's default model instead.
        await applyThreadSettings(project.projectId, current.conversationId, { modelId: input.modelId, reasoning: input.reasoning ?? null, mode: input.mode }).catch(() => {})
        await sendBuilderMessage(project.projectId, current.conversationId, input.description, current.requestKey)
        return { project, firstRequest: 'SENT' }
      } catch (error) {
        if (error instanceof BuilderRequestError && error.status === 401) throw error
        return { project, firstRequest: 'REFUSED' }
      }
    },
    onSuccess: async () => {
      attempt.current = undefined
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectSummariesQueryKey(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: projectListQueryKey(workspaceId) }),
      ])
    },
    onSettled: () => {
      inFlight.current = false
    },
  })

  const start = (input: StartProjectInput, handlers: Readonly<{ onStarted: (started: StartedProject) => void; onRefused: (reason: string) => void }>) => {
    if (inFlight.current) return
    const fingerprint = JSON.stringify(input)
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, projectKey: crypto.randomUUID(), conversationId: crypto.randomUUID(), requestKey: crypto.randomUUID() }
    }
    inFlight.current = true
    mutation.mutate({ input, current: attempt.current }, {
      onSuccess: handlers.onStarted,
      onError: (error) => handlers.onRefused(startProjectRefusal(error)),
    })
  }

  return { start, mutation }
}
