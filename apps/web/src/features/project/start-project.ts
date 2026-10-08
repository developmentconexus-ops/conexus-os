import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { sendBuilderMessage } from '../builder/api'
import { applyThreadSettings, openConversation, type ReasoningLevel } from '../builder/mastra-session'
import { IdempotencyKey, listProjects, listProjectSummaries, type ProjectCreated } from '@conexus/contract'
import { createProject } from './api'

import { failureText, isFailure } from '@conexus/contract'
export type StartProjectInput = Readonly<{ name: string; description: string; modelId: string | undefined; reasoning: ReasoningLevel | null | undefined }>
export type StartedProject = Readonly<{ project: ProjectCreated; firstRequest: 'SENT' | 'NONE' | 'REFUSED' }>

// Every id is chosen once per distinct input, so a retry after a lost response lands on the
// Project, conversation and request the first attempt already made instead of making new ones.
type Attempt = Readonly<{ fingerprint: string; projectKey: IdempotencyKey; conversationId: string; requestKey: string }>

export function useStartProject(workspaceId: string) {
  const queryClient = useQueryClient()
  const attempt = useRef<Attempt | undefined>(undefined)
  const inFlight = useRef(false)
  const mutation = useMutation({
    mutationFn: async ({ input, current }: Readonly<{ input: StartProjectInput; current: Attempt }>): Promise<StartedProject> => {
      const project = await createProject(workspaceId, input.name, current.projectKey)
      if (!input.description) return { project, firstRequest: 'NONE' }
      try {
        await openConversation(project.projectId, current.conversationId)
        // The model chosen before the Project existed follows the first request onto its new
        // conversation. If it cannot be set, the first request is refused instead of running on another model.
        await applyThreadSettings(project.projectId, current.conversationId, { modelId: input.modelId, reasoning: input.reasoning ?? null })
        await sendBuilderMessage(project.projectId, current.conversationId, input.description, current.requestKey)
        return { project, firstRequest: 'SENT' }
      } catch (error) {
        if (isFailure(error, 'AUTHENTICATION_REQUIRED')) throw error
        return { project, firstRequest: 'REFUSED' }
      }
    },
    onSuccess: async () => {
      attempt.current = undefined
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [listProjectSummaries.id] }),
        queryClient.invalidateQueries({ queryKey: [listProjects.id] }),
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
      attempt.current = { fingerprint, projectKey: IdempotencyKey.parse(crypto.randomUUID()), conversationId: crypto.randomUUID(), requestKey: crypto.randomUUID() }
    }
    inFlight.current = true
    mutation.mutate({ input, current: attempt.current }, {
      onSuccess: handlers.onStarted,
      onError: (error) => handlers.onRefused(failureText(error)),
    })
  }

  return { start, mutation }
}
