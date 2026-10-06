import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Avatar } from '@mastra/playground-ui/components/Avatar'
import { Button } from '@mastra/playground-ui/components/Button'
import { DropdownMenu } from '@mastra/playground-ui/components/DropdownMenu'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@mastra/playground-ui/components/Select'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { toast } from '@mastra/playground-ui/components/Toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import { Link2, MoreHorizontal } from 'lucide-react'
import type { FormEvent } from 'react'
import { useId, useState } from 'react'
import type { AccountId, EmailAddress, InvitationId, WorkspaceInvitationEntry, WorkspaceRole } from '@conexus/contract'
import { parseEmail, sessionQueryKey } from '../api'
import {
  cancelWorkspaceInvitation,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  setWorkspaceMemberRole,
  workspaceRosterQuery,
} from '../membership-api'
import type { InvitationEntry, MemberEntry } from '../membership-api'
import '../people.css'
import { INVITATION_STATE } from '../invitation-state'
import { useAttemptKey } from '../../../app/attempt-key'
import { failureText } from '../../../app/http'
import { FailureState } from '../../../app/failure-state'

type Role = WorkspaceRole
type InviteInput = Readonly<{ email: EmailAddress; role: Role }>
const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', member: 'Membro' }
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
const formatDate = (value: string) => date.format(new Date(value))

// Nothing is emailed yet: the invited person signs in at this address with the invited email.
const entryLink = () => `${window.location.origin}/`

async function copyEntryLink(email?: string) {
  const link = entryLink()
  try {
    await navigator.clipboard.writeText(link)
    toast.success(email ? `Link copiado. Envie para ${email}.` : 'Link de entrada copiado.')
  } catch {
    toast.error(`Não foi possível copiar. O link de entrada é ${link}`)
  }
}

type Invite = UseMutationResult<WorkspaceInvitationEntry, Error, InviteInput>

type Pending = Readonly<{ kind: 'remove'; member: MemberEntry } | { kind: 'leave'; member: MemberEntry }>

export function WorkspaceMembers({
  workspaceId,
  currentAccountId,
  onLeft,
}: {
  workspaceId: string
  currentAccountId: string
  onLeft: () => void
}) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const rosterQuery = workspaceRosterQuery(workspaceId)
  const roster = useQuery(rosterQuery)
  const refresh = () => queryClient.invalidateQueries({ queryKey: rosterQuery.queryKey })
  const inviteKey = useAttemptKey()
  const fail = (error: unknown) => setMessage(failureText(error))

  const changeRole = useMutation({
    mutationFn: ({ accountId, role }: { accountId: AccountId; role: Role }) => setWorkspaceMemberRole(workspaceId, accountId, role),
    onSuccess: async () => { setMessage(''); await refresh() },
    onError: fail,
  })
  const removeMember = useMutation({
    mutationFn: (accountId: AccountId) => removeWorkspaceMember(workspaceId, accountId),
    onSuccess: async (_result, accountId) => {
      setMessage('')
      if (accountId === currentAccountId) {
        await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
        onLeft()
        return
      }
      await refresh()
    },
    onError: fail,
  })
  // The one invite call: the form and the row of an expired invitation both use it.
  const invite = useMutation({
    mutationFn: ({ email, role }: InviteInput) => inviteWorkspaceMember(workspaceId, email, role, inviteKey.keyFor(`${email}:${role}`)),
    onSuccess: async () => { inviteKey.settled(); await refresh() },
  })
  const cancelInvitation = useMutation({
    mutationFn: (invitationId: InvitationId) => cancelWorkspaceInvitation(workspaceId, invitationId),
    onSuccess: async () => { setMessage(''); await refresh() },
    onError: fail,
  })

  if (roster.isPending) {
    return <div className="cx-people" aria-busy="true">
      <span className="sr-only" role="status">Carregando as pessoas</span>
      {[0, 1, 2].map((index) => <div className="cx-person" key={index} aria-hidden><Skeleton className="cx-person-avatar-skeleton" /><Skeleton className="cx-skeleton-line" /></div>)}
    </div>
  }
  if (roster.isError) {
    return <FailureState title="Não foi possível carregar as pessoas" error={roster.error} onRetry={() => void roster.refetch()} />
  }

  // The server tells which role the viewer holds and refuses anything that role may not do.
  const viewerIsOwner = roster.data.viewerRole === 'owner'
  const members = roster.data.entries.filter((entry): entry is MemberEntry => entry.kind === 'member')
  const invitations = roster.data.entries.filter((entry): entry is InvitationEntry => entry.kind === 'invitation')
  const busy = changeRole.isPending || removeMember.isPending || cancelInvitation.isPending || invite.isPending

  return <div className="cx-people">
    {message && <p className="cx-people-message" role="alert">{message}</p>}

    <section aria-labelledby="people-members">
      <h2 id="people-members" className="cx-section-title">Membros <span className="cx-count">{members.length}</span></h2>
      <ul className="cx-person-list">
        {members.map((member) => {
          const self = member.accountId === currentAccountId
          const role = member.role
          return <li className="cx-person" key={member.accountId}>
            <Avatar name={member.displayName} size="md" />
            <div className="cx-person-who">
              <strong>{member.displayName}{self && <span className="cx-person-you"> (você)</span>}</strong>
              <span>{member.email ?? 'Sem email'} · desde {formatDate(member.since)}</span>
            </div>
            <span className="cx-chip" data-tone={role === 'owner' ? 'working' : undefined}>{ROLE_LABEL[role]}</span>
            {self ? (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setPending({ kind: 'leave', member })}>Sair</Button>
            ) : viewerIsOwner ? (
              <DropdownMenu>
                <DropdownMenu.Trigger className="cx-row-menu" aria-label={`Ações para ${member.displayName}`} disabled={busy}>
                  <MoreHorizontal size={16} aria-hidden />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" className="cx-menu">
                  <DropdownMenu.Item onClick={() => changeRole.mutate({ accountId: member.accountId, role: role === 'owner' ? 'member' : 'owner' })}>
                    {role === 'owner' ? 'Tornar membro' : 'Tornar owner'}
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item variant="destructive" onClick={() => setPending({ kind: 'remove', member })}>Remover do Workspace</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            ) : <span className="cx-row-menu-placeholder" aria-hidden />}
          </li>
        })}
      </ul>
    </section>

    <section aria-labelledby="people-invitations">
      <h2 id="people-invitations" className="cx-section-title">Convites <span className="cx-count">{invitations.length}</span></h2>
      {invitations.length === 0 ? (
        <p className="cx-people-empty">Nenhum convite.</p>
      ) : (
        <ul className="cx-person-list">
          {invitations.map((invitation) => (
            <li className="cx-person" key={invitation.invitationId}>
              <Avatar name={invitation.email} size="md" />
              <div className="cx-person-who">
                <strong>{invitation.email}</strong>
                <span>{ROLE_LABEL[invitation.role]} · {INVITATION_STATE[invitation.state].dateWord} {formatDate(invitation.expiresAt)}</span>
              </div>
              <span className="cx-chip" data-tone={INVITATION_STATE[invitation.state].tone}>{INVITATION_STATE[invitation.state].word}</span>
              {viewerIsOwner ? (
                <DropdownMenu>
                  <DropdownMenu.Trigger className="cx-row-menu" aria-label={`Ações para o convite de ${invitation.email}`} disabled={busy}>
                    <MoreHorizontal size={16} aria-hidden />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end" className="cx-menu">
                    {invitation.state === 'EXPIRED' ? (
                      <DropdownMenu.Item onClick={() => invite.mutate({ email: invitation.email, role: invitation.role }, { onSuccess: () => setMessage(''), onError: fail })}>Convidar de novo</DropdownMenu.Item>
                    ) : (
                      <DropdownMenu.Item onClick={() => void copyEntryLink(invitation.email)}>Copiar link de entrada</DropdownMenu.Item>
                    )}
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item variant="destructive" onClick={() => cancelInvitation.mutate(invitation.invitationId)}>Cancelar convite</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu>
              ) : <span className="cx-row-menu-placeholder" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </section>

    {viewerIsOwner && <InviteForm invite={invite} />}

    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>{pending?.kind === 'leave' ? 'Sair deste Workspace?' : `Remover ${pending?.member.displayName ?? ''}?`}</AlertDialog.Title>
          <AlertDialog.Description>
            {pending?.kind === 'leave'
              ? 'Você perde o acesso aos Projetos daqui. Para voltar, precisa de um novo convite.'
              : 'A pessoa perde o acesso aos Projetos deste Workspace. Os Projetos continuam como estão.'}
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
          <AlertDialog.Action onClick={() => { if (pending) removeMember.mutate(pending.member.accountId) }}>
            {pending?.kind === 'leave' ? 'Sair do Workspace' : 'Remover'}
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  </div>
}

function InviteForm({ invite }: Readonly<{ invite: Invite }>) {
  const emailId = useId()
  const roleId = useId()
  const [role, setRole] = useState<Role>('member')
  const [message, setMessage] = useState('')
  const [invited, setInvited] = useState<string | null>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (invite.isPending) return
    const form = event.currentTarget
    const raw = String(new FormData(form).get('email') ?? '').trim()
    if (!raw) {
      setMessage('Escreva o email da pessoa.')
      return
    }
    const parsed = parseEmail(raw)
    if ('message' in parsed) {
      setMessage(parsed.message)
      return
    }
    setInvited(null)
    invite.mutate({ email: parsed.email, role }, {
      onSuccess: (invitation) => { setMessage(''); setInvited(invitation.email); form.reset() },
      onError: (error) => setMessage(failureText(error)),
    })
  }

  return <section aria-labelledby="people-invite" className="cx-panel cx-invite">
    <h2 id="people-invite" className="cx-section-title">Convidar alguém</h2>
    <p className="cx-field-hint">A pessoa entra pelo login da empresa com exatamente este email, já confirmado. Nenhum email é enviado: copie o link de entrada e mande você mesmo.</p>
    <form className="cx-invite-form" onSubmit={submit} noValidate>
      <div className="cx-field">
        <Label htmlFor={emailId}>Email</Label>
        <Input id={emailId} name="email" type="email" autoComplete="off" required placeholder="nome@empresa.com.br" />
      </div>
      <div className="cx-field">
        <Label htmlFor={roleId}>Papel</Label>
        <Select value={role} onValueChange={(value) => { if (value) setRole(value) }} items={[{ value: 'member', label: 'Membro' }, { value: 'owner', label: 'Owner' }]}>
          <SelectTrigger id={roleId} className="cx-invite-role"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Membro</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" variant="primary" disabled={invite.isPending}>{invite.isPending ? 'Convidando…' : 'Convidar'}</Button>
    </form>
    <p className="cx-form-status" data-tone={message ? 'error' : undefined} role="status" aria-live="polite">
      {message}
      {invited && !message && <>Convite criado para {invited}.{' '}</>}
    </p>
    {invited && !message && (
      <Button type="button" variant="outline" onClick={() => void copyEntryLink(invited)}><Link2 size={16} aria-hidden /> Copiar link de entrada</Button>
    )}
  </section>
}
