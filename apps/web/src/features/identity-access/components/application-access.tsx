import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Avatar } from '@mastra/playground-ui/components/Avatar'
import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { toast } from '@mastra/playground-ui/components/Toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import type { FormEvent } from 'react'
import { useId, useState } from 'react'
import {
  applicationAccessMessage,
  applicationAccessQueryKey,
  getApplicationAccess,
  grantApplicationAccess,
  isApplicationAccessForbidden,
  revokeApplicationAccessEntry,
} from '../application-access-api'
import type { GrantEntry, InvitationEntry } from '../application-access-api'
import '../people.css'

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
const formatDate = (value: string) => date.format(new Date(value))

async function copyAddress(address: string) {
  try {
    await navigator.clipboard.writeText(address)
    toast.success('Endereço copiado.')
  } catch {
    toast.error(`Não foi possível copiar. O endereço é ${address}`)
  }
}

type Pending = Readonly<{ kind: 'grant'; entry: GrantEntry } | { kind: 'invitation'; entry: InvitationEntry }>

export function ApplicationAccess({ projectId }: Readonly<{ projectId: string }>) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const access = useQuery({ queryKey: applicationAccessQueryKey(projectId), queryFn: () => getApplicationAccess(projectId) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: applicationAccessQueryKey(projectId) })
  const fail = (error: unknown) => setMessage(applicationAccessMessage(error))

  const revoke = useMutation({
    mutationFn: ({ kind, id }: { kind: 'grant' | 'invitation'; id: string }) => revokeApplicationAccessEntry(projectId, kind, id),
    onSuccess: async () => { setMessage(''); setPending(null); await refresh() },
    onError: fail,
  })

  if (access.isPending) {
    return <div className="cx-people" aria-busy="true">
      <span className="sr-only" role="status">Carregando o acesso ao aplicativo</span>
      {[0, 1].map((index) => <div className="cx-person" key={index} aria-hidden><Skeleton className="cx-person-avatar-skeleton" /><Skeleton className="cx-skeleton-line" /></div>)}
    </div>
  }
  if (access.isError) {
    if (isApplicationAccessForbidden(access.error)) {
      return <div className="cx-state" role="alert">
        <h2>Só Owners do Workspace decidem quem usa este aplicativo.</h2>
      </div>
    }
    return <div className="cx-state" role="alert">
      <h2>Não foi possível carregar o acesso</h2>
      <p>Ninguém foi removido nem convidado. O servidor não respondeu desta vez.</p>
      <Button type="button" variant="outline" onClick={() => void access.refetch()}>Tentar de novo</Button>
    </div>
  }

  const grants = access.data.entries.filter((entry): entry is GrantEntry => entry.kind === 'grant')
  const invitations = access.data.entries.filter((entry): entry is InvitationEntry => entry.kind === 'invitation')
  const busy = revoke.isPending

  return <div className="cx-people">
    {message && <p className="cx-people-message" role="alert">{message}</p>}

    <section aria-labelledby="access-address">
      <h2 id="access-address" className="cx-section-title">Endereço do aplicativo</h2>
      <div className="cx-app-address">
        {access.data.address ? (
          <>
            <code>{access.data.address}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyAddress(access.data.address as string)}>
              <Link2 size={16} aria-hidden /> Copiar
            </Button>
          </>
        ) : (
          <span className="cx-app-address-empty">O endereço aparece quando você der o primeiro acesso</span>
        )}
      </div>
    </section>

    <section aria-labelledby="access-grants">
      <h2 id="access-grants" className="cx-section-title">Pessoas com acesso <span className="cx-count">{grants.length}</span></h2>
      {grants.length === 0 ? (
        <p className="cx-people-empty">Ninguém foi convidado ainda.</p>
      ) : (
        <ul className="cx-person-list">
          {grants.map((grant) => (
            <li className="cx-person" key={grant.grantId}>
              <Avatar name={grant.displayName} size="md" />
              <div className="cx-person-who">
                <strong>{grant.displayName}</strong>
                <span>{grant.email ?? 'Sem email'} · desde {formatDate(grant.grantedAt)}</span>
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setPending({ kind: 'grant', entry: grant })}>Remover</Button>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section aria-labelledby="access-invitations">
      <h2 id="access-invitations" className="cx-section-title">Convites pendentes <span className="cx-count">{invitations.length}</span></h2>
      {invitations.length === 0 ? (
        <p className="cx-people-empty">Nenhum convite esperando resposta.</p>
      ) : (
        <ul className="cx-person-list">
          {invitations.map((invitation) => (
            <li className="cx-person" key={invitation.invitationId}>
              <Avatar name={invitation.email} size="md" />
              <div className="cx-person-who">
                <strong>{invitation.email}</strong>
                <span>Vale até {formatDate(invitation.expiresAt)}</span>
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setPending({ kind: 'invitation', entry: invitation })}>Cancelar</Button>
            </li>
          ))}
        </ul>
      )}
    </section>

    <GrantForm projectId={projectId} onGranted={refresh} />

    <p className="cx-field-hint cx-app-note">Quem é membro do Workspace já usa o aplicativo sem precisar estar nesta lista.</p>

    <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>
            {pending?.kind === 'invitation' ? `Cancelar o convite de ${pending.entry.email}?` : `Remover o acesso de ${pending?.entry.displayName ?? ''}?`}
          </AlertDialog.Title>
          <AlertDialog.Description>
            {pending?.kind === 'invitation'
              ? 'A pessoa não entra mais com esse email.'
              : 'A pessoa deixa de usar este aplicativo com o email atual.'}
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Voltar</AlertDialog.Cancel>
          <AlertDialog.Action
            onClick={() => {
              if (!pending) return
              const id = pending.kind === 'grant' ? pending.entry.grantId : pending.entry.invitationId
              revoke.mutate({ kind: pending.kind, id })
            }}
          >
            {pending?.kind === 'invitation' ? 'Cancelar convite' : 'Remover'}
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  </div>
}

function GrantForm({ projectId, onGranted }: Readonly<{ projectId: string; onGranted: () => Promise<unknown> }>) {
  const emailId = useId()
  const [message, setMessage] = useState('')
  const [granted, setGranted] = useState<string | null>(null)
  const grant = useMutation({
    mutationFn: (email: string) => grantApplicationAccess(projectId, { email }),
    onSuccess: async (access) => {
      setMessage('')
      await onGranted()
      setGranted(access.kind === 'grant' ? `${access.displayName} já tem acesso.` : `Convite criado para ${access.email}.`)
    },
    onError: (error) => setMessage(applicationAccessMessage(error)),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (grant.isPending) return
    const form = event.currentTarget
    const email = String(new FormData(form).get('email') ?? '').trim()
    if (!email) {
      setMessage('Escreva o email da pessoa.')
      return
    }
    setGranted(null)
    grant.mutate(email, { onSuccess: () => form.reset() })
  }

  return <section aria-labelledby="access-grant" className="cx-panel cx-invite">
    <h2 id="access-grant" className="cx-section-title">Dar acesso a alguém</h2>
    <form className="cx-grant-form" onSubmit={submit} noValidate>
      <div className="cx-field">
        <Label htmlFor={emailId}>Email</Label>
        <Input id={emailId} name="email" type="email" autoComplete="off" required placeholder="nome@empresa.com.br" />
      </div>
      <Button type="submit" variant="primary" disabled={grant.isPending}>{grant.isPending ? 'Convidando…' : 'Convidar'}</Button>
    </form>
    <p className="cx-field-hint">A pessoa entra com esse e-mail no endereço acima. Ela não passa a ver o Workspace nem o Projeto.</p>
    <p className="cx-form-status" data-tone={message ? 'error' : undefined} role="status" aria-live="polite">
      {message}
      {granted && !message && granted}
    </p>
  </section>
}
