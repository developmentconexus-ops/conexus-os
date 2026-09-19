import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useId, useState } from 'react'
import {
  cancelWorkspaceInvitation,
  getWorkspaceRoster,
  inviteWorkspaceMember,
  membershipMessage,
  removeWorkspaceMember,
  setWorkspaceMemberRole,
  workspaceRosterQueryKey,
} from '../membership-api'
import type { InvitationEntry, MemberEntry } from '../membership-api'
import { isAuthenticationRequired } from '../api'

const roleLabel = (role: string) => (role === 'owner' ? 'Responsável' : 'Membro')

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value))

export function WorkspaceMembers({
  workspaceId,
  currentAccountId,
  onAuthenticationRequired,
}: {
  workspaceId: string
  currentAccountId: string
  onAuthenticationRequired: () => void
}) {
  const emailId = useId()
  const roleId = useId()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const roster = useQuery({
    queryKey: workspaceRosterQueryKey(workspaceId),
    queryFn: () => getWorkspaceRoster(workspaceId),
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: workspaceRosterQueryKey(workspaceId) })
  }

  const handle = (error: unknown) => {
    if (isAuthenticationRequired(error)) {
      onAuthenticationRequired()
      return
    }
    setMessage(membershipMessage(error))
  }

  const invite = useMutation({
    mutationFn: (input: { email: string; role: string }) => inviteWorkspaceMember(workspaceId, input),
    onSuccess: async (invitation) => {
      setMessage(`Convite registrado para ${invitation.email}. Ele vale até ${formatDate(invitation.expiresAt)}.`)
      await refresh()
    },
    onError: handle,
  })

  const changeRole = useMutation({
    mutationFn: ({ accountId, role }: { accountId: string; role: string }) =>
      setWorkspaceMemberRole(workspaceId, accountId, role),
    onSuccess: async () => {
      setMessage('')
      await refresh()
    },
    onError: handle,
  })

  const removeMember = useMutation({
    mutationFn: (accountId: string) => removeWorkspaceMember(workspaceId, accountId),
    onSuccess: async () => {
      setMessage('')
      await refresh()
    },
    onError: handle,
  })

  const cancelInvitation = useMutation({
    mutationFn: (invitationId: string) => cancelWorkspaceInvitation(workspaceId, invitationId),
    onSuccess: async () => {
      setMessage('')
      await refresh()
    },
    onError: handle,
  })

  if (roster.isPending) return <p className="status">Carregando os membros</p>
  if (roster.isError) {
    if (isAuthenticationRequired(roster.error)) onAuthenticationRequired()
    return (
      <div className="status">
        <p>Não foi possível consultar os membros deste Workspace.</p>
        <button type="button" onClick={() => void roster.refetch()}>Tentar novamente</button>
      </div>
    )
  }

  const mayManage = roster.data.viewerRole === 'owner'
  const members = roster.data.entries.filter((entry): entry is MemberEntry => entry.kind === 'member')
  const invitations = roster.data.entries.filter(
    (entry): entry is InvitationEntry => entry.kind === 'invitation',
  )

  const submitInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (invite.isPending) return
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const role = String(form.get('role') ?? 'member')
    if (!email) {
      setMessage('Informe o email da pessoa que você quer convidar.')
      return
    }
    invite.mutate({ email, role })
  }

  return (
    <section aria-label="Membros do Workspace">
      {message && <p role="alert">{message}</p>}

      <h2>Membros</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Pessoa</th>
            <th scope="col">Papel</th>
            <th scope="col">Desde</th>
            {mayManage && <th scope="col">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.accountId}>
              <td>
                <strong>{member.displayName}</strong>
                {member.email && <span> {member.email}</span>}
              </td>
              <td>{roleLabel(member.role)}</td>
              <td>{formatDate(member.since)}</td>
              {mayManage && (
                <td>
                  <button
                    type="button"
                    disabled={changeRole.isPending}
                    onClick={() =>
                      changeRole.mutate({
                        accountId: member.accountId,
                        role: member.role === 'owner' ? 'member' : 'owner',
                      })
                    }
                  >
                    {member.role === 'owner' ? 'Tornar membro' : 'Tornar responsável'}
                  </button>
                  <button
                    type="button"
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate(member.accountId)}
                  >
                    {member.accountId === currentAccountId ? 'Sair do Workspace' : 'Remover'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Convites pendentes</h2>
      {invitations.length === 0 ? (
        <p>Nenhum convite aguardando resposta.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Papel</th>
              <th scope="col">Vale até</th>
              {mayManage && <th scope="col">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation) => (
              <tr key={invitation.invitationId}>
                <td>{invitation.email}</td>
                <td>{roleLabel(invitation.role)}</td>
                <td>{formatDate(invitation.expiresAt)}</td>
                {mayManage && (
                  <td>
                    <button
                      type="button"
                      disabled={cancelInvitation.isPending}
                      onClick={() => cancelInvitation.mutate(invitation.invitationId)}
                    >
                      Cancelar convite
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {mayManage && (
        <form onSubmit={submitInvite}>
          <h2>Convidar alguém</h2>
          <p>
            A pessoa entra pelo mesmo provedor de identidade, com exatamente este email. O email
            precisa estar marcado como verificado no provedor, senão o convite não pode ser
            aceito. Nenhuma mensagem é enviada por aqui.
          </p>
          <label htmlFor={emailId}>Email</label>
          <input id={emailId} name="email" type="email" required autoComplete="email" />
          <label htmlFor={roleId}>Papel</label>
          <select id={roleId} name="role" defaultValue="member">
            <option value="member">Membro</option>
            <option value="owner">Responsável</option>
          </select>
          <button className="primary" type="submit" disabled={invite.isPending}>
            {invite.isPending ? 'Registrando…' : 'Convidar'}
          </button>
        </form>
      )}
    </section>
  )
}
