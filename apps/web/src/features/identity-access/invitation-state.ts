import type { WorkspaceInvitation } from '../../generated/iam-client'

export type InvitationState = WorkspaceInvitation['state']

export const INVITATION_STATE: Record<InvitationState, Readonly<{ word: string; tone: 'pending' | 'neutral'; dateWord: string }>> = {
  PENDING: { word: 'Pendente', tone: 'pending', dateWord: 'vale até' },
  EXPIRED: { word: 'Vencido', tone: 'neutral', dateWord: 'venceu em' },
}
