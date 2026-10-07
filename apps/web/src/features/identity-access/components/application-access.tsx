import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Avatar } from '@mastra/playground-ui/components/Avatar'
import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { toast } from '@mastra/playground-ui/components/Toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import type { FormEvent } from 'react'
import { useId, useState } from 'react'
import type { ApplicationAccess as ApplicationAccessBody, ApplicationGrantEntry, ApplicationInvitationEntry, EmailAddress, ProjectId } from '@conexus/contract'
import { parseEmail } from '../api'
import {
  applicationAccessQuery,
  grantApplicationAccess,
  removeApplicationAccessEntry,
} from '../application-access-api'
import '../people.css'
import { INVITATION_STATE } from '../invitation-state'
import { useAttemptKey } from '../../../app/attempt-key'
import { failureText, isFailure } from '../../../app/http'
import { FailureState } from '../../../app/failure-state'

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })
const formatDate = (value: string) => date.format(new Date(value))
const sentenceCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

async function copyAddress(address: string) {
  try {
    await navigator.clipboard.writeText(address)
    toast.success('Endereço copiado.')
  } catch {
    toast.error(`Não foi possível copiar. O endereço é ${address}`)
  }
}

type Grant = UseMutationResult<ApplicationInvitationEntry, Error, EmailAddress>

type Pending = Readonly<{ kind: 'grant'; entry: ApplicationGrantEntry } | { kind: 'invitation'; entry: ApplicationInvitationEntry }>

export function ApplicationAccess({ projectId }: Readonly<{ projectId: ProjectId }>) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const accessQuery = applicationAccessQuery(projectId)
  const access = useQuery(accessQuery)
  const refresh = () => queryClient.invalidateQueries({ queryKey: accessQuery.queryKey })
  const grantKey = useAttemptKey()
  const fail = (error: unknown) => setMessage(failureText(error))

  const revoke = useMutation({
    mutationFn: (entry: ApplicationAccessBody['entries'][number]) => removeApplicationAccessEntry(projectId, entry),
    onSuccess: async () => { setMessage(''); setPending(null); await refresh() },
    onError: fail,
  })

  // The one grant call: the form and the row of an expired invitation both use it.
  const grant = useMutation({
    mutationFn: (email: EmailAddress) => grantApplicationAccess(projectId, email, grantKey.keyFor(`${projectId}:${email}`)),
    onSuccess: async (invitation) => { grantKey.settled(); await refresh(); setOutcome(`Convite criado para ${invitation.email}.`) },
    onError: (error) => grantKey.failed(error),
  })

  if (access.isPending) {
    return <div className="cx-people" aria-busy="true">
      <span className="sr-only" role="status">Carregando o acesso ao aplicativo</span>
      {[0, 1].map((index) => <div className="cx-person" key={index} aria-hidden><Skeleton className="cx-person-avatar-skeleton" /><Skeleton className="cx-skeleton-line" /></div>)}
    </div>
  }
  if (access.isError) {
    // A person who may not manage access sees why once; it is no failure to retry.
    if (isFailure(access.error, 'APPLICATION_ACCESS_MANAGE_REQUIRED')) {
      return <div className="cx-state" role="alert">
        <h2>{failureText(access.error)}</h2>
      </div>
    }
    return <FailureState title="Não foi possível carregar o acesso" error={access.error} onRetry={() => void access.refetch()} />
  }

  const grants = access.data.entries.filter((entry): entry is ApplicationGrantEntry => entry.kind === 'grant')
  const invitations = access.data.entries.filter((entry): entry is ApplicationInvitationEntry => entry.kind === 'invitation')
  const address = access.data.address
  const busy = revoke.isPending || grant.isPending

  return <div className="cx-people">
    {message && <p className="cx-people-message" role="alert">{message}</p>}

    <section aria-labelledby="access-address">
      <h2 id="access-address" className="cx-section-title">Endereço do aplicativo</h2>
      <div className="cx-app-address">
        {address ? (
          <>
            <code>{address}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyAddress(address)}>
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
      <h2 id="access-invitations" className="cx-section-title">Convites <span className="cx-count">{invitations.length}</span></h2>
      {invitations.length === 0 ? (
        <p className="cx-people-empty">Nenhum convite.</p>
      ) : (
        <ul className="cx-person-list">
          {invitations.map((invitation) => (
            <li className="cx-person" key={invitation.invitationId}>
              <Avatar name={invitation.email} size="md" />
              <div className="cx-person-who">
                <strong>{invitation.email}</strong>
                <span>{sentenceCase(INVITATION_STATE[invitation.state].dateWord)} {formatDate(invitation.expiresAt)}</span>
              </div>
              <span className="cx-chip" data-tone={INVITATION_STATE[invitation.state].tone}>{INVITATION_STATE[invitation.state].word}</span>
              {invitation.state === 'EXPIRED' && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setOutcome(null); grant.mutate(invitation.email, { onError: fail }) }}>Convidar de novo</Button>
              )}
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setPending({ kind: 'invitation', entry: invitation })}>Cancelar</Button>
            </li>
          ))}
        </ul>
      )}
    </section>

    <GrantForm grant={grant} outcome={outcome} onSubmit={() => setOutcome(null)} />

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
              if (pending) revoke.mutate(pending.entry)
            }}
          >
            {pending?.kind === 'invitation' ? 'Cancelar convite' : 'Remover'}
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  </div>
}

function GrantForm({ grant, outcome, onSubmit }: Readonly<{ grant: Grant; outcome: string | null; onSubmit: () => void }>) {
  const emailId = useId()
  const [message, setMessage] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (grant.isPending) return
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
    onSubmit()
    grant.mutate(parsed.email, {
      onSuccess: () => { setMessage(''); form.reset() },
      onError: (error) => setMessage(failureText(error)),
    })
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
      {outcome && !message && outcome}
    </p>
  </section>
}
