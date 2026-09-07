import type {
  R2ClientBRN01Contract,
  R2ClientBRN02Contract,
  R2ClientBRN03Contract,
  R2ClientBRN10Contract,
  R2ClientBRN14Contract,
} from '../../generated/r2-client'
import { r2Client } from '../../generated/r2-client'
import { expectR2Json } from '../r2-response'

export type WorkspaceBrain = R2ClientBRN01Contract['responses']['200']
export type BrainRevisionSummary = R2ClientBRN02Contract['responses']['200'][number]
export type BrainRevision = R2ClientBRN03Contract['responses']['200']
export type BrainHealth = R2ClientBRN10Contract['responses']['200']
export type ProjectBrainContext = R2ClientBRN14Contract['responses']['200']

export const workspaceBrainQueryKey = (workspaceId: string) => ['brain', 'workspace', workspaceId] as const
export const brainRevisionsQueryKey = (workspaceId: string, forProjectId?: string) => (
  ['brain', 'revisions', workspaceId, forProjectId ?? null] as const
)
export const brainRevisionQueryKey = (workspaceId: string, brainRevisionId: string) => (
  ['brain', 'revision', workspaceId, brainRevisionId] as const
)
export const brainHealthQueryKey = (workspaceId: string) => ['brain', 'health', workspaceId] as const
export const projectBrainContextQueryKey = (projectId: string) => ['brain', 'project-context', projectId] as const

export function getWorkspaceBrain(workspaceId: string) {
  return expectR2Json<WorkspaceBrain>(
    r2Client.request('BRN-01', { params: { workspaceId } }),
    [200],
  )
}

export function listBrainRevisions(workspaceId: string, forProjectId?: string) {
  return expectR2Json<BrainRevisionSummary[]>(
    r2Client.request('BRN-02', {
      params: { workspaceId },
      ...(forProjectId === undefined ? {} : { querystring: { forProjectId } }),
    }),
    [200],
  )
}

export function getBrainRevision(workspaceId: string, brainRevisionId: string) {
  return expectR2Json<BrainRevision>(
    r2Client.request('BRN-03', { params: { workspaceId, brainRevisionId } }),
    [200],
  )
}

export function getBrainHealth(workspaceId: string) {
  return expectR2Json<BrainHealth>(
    r2Client.request('BRN-10', { params: { workspaceId } }),
    [200],
  )
}

export function getProjectBrainContext(projectId: string) {
  return expectR2Json<ProjectBrainContext>(
    r2Client.request('BRN-14', { params: { projectId } }),
    [200],
  )
}
