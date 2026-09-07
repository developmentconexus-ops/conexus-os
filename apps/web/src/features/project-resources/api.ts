import type {
  R2ClientPRJ10Contract,
  R2ClientPRJ11Contract,
  R2ClientPRJ13Contract,
  R2ClientPRJ14Contract,
  R2ClientPRJ15Contract,
} from '../../generated/r2-client'
import { r2Client } from '../../generated/r2-client'
import { expectR2Empty, expectR2Json } from '../r2-response'

export type ProjectBrainBinding = R2ClientPRJ10Contract['responses']['200']
export type SetProjectBrainBindingInput = R2ClientPRJ11Contract['body']
export type ProjectConnectionBinding = R2ClientPRJ13Contract['responses']['200'][number]
export type SetProjectConnectionBindingInput = R2ClientPRJ14Contract['body']
export type RemoveProjectConnectionBindingInput = R2ClientPRJ15Contract['body']
export type ProjectBrainBindingState = Readonly<
  | { state: 'ABSENT' }
  | { state: 'PRESENT'; etag: string }
>

export const projectBrainBindingQueryKey = (projectId: string) => (
  ['project-resources', projectId, 'brain-binding'] as const
)
export const projectConnectionBindingsQueryKey = (projectId: string) => (
  ['project-resources', projectId, 'connection-bindings'] as const
)

export function getProjectBrainBinding(projectId: string) {
  return expectR2Json<ProjectBrainBinding>(
    r2Client.request('PRJ-10', { params: { projectId } }),
    [200],
  )
}

export function setProjectBrainBinding(
  projectId: string,
  body: SetProjectBrainBindingInput,
  expected: ProjectBrainBindingState,
) {
  const headers: R2ClientPRJ11Contract['headers'] = expected.state === 'ABSENT'
    ? { 'if-none-match': '*' }
    : { 'if-match': expected.etag }
  return expectR2Json<ProjectBrainBinding>(
    r2Client.request('PRJ-11', { params: { projectId }, headers, body }),
    [200, 201],
  )
}

export function clearProjectBrainBinding(projectId: string, etag: string) {
  return expectR2Empty(
    r2Client.request('PRJ-12', {
      params: { projectId },
      headers: { 'if-match': etag },
    }),
    [204],
  )
}

export function listProjectConnectionBindings(projectId: string) {
  return expectR2Json<ProjectConnectionBinding[]>(
    r2Client.request('PRJ-13', { params: { projectId } }),
    [200],
  )
}

export function setProjectConnectionBinding(projectId: string, body: SetProjectConnectionBindingInput) {
  return expectR2Json<ProjectConnectionBinding>(
    r2Client.request('PRJ-14', { params: { projectId }, body }),
    [200],
  )
}

export function removeProjectConnectionBinding(projectId: string, body: RemoveProjectConnectionBindingInput) {
  return expectR2Empty(
    r2Client.request('PRJ-15', { params: { projectId }, body }),
    [204],
  )
}
