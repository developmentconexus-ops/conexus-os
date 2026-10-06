import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Avatar } from '@mastra/playground-ui/components/Avatar'
import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import type { AccountId, AdministratorEntry, EmailAddress } from '@conexus/contract'
import { useSession } from '../../../app/access-gate'
import { useAttemptKey } from '../../../app/attempt-key'
import { failureText } from '../../../app/http'
import { parseEmail, sessionQueryKey } from '../../identity-access/api'
import { addAdministrator, administratorsQuery, removeAdministrator } from '../installation-api'
import { PageHeader } from './page-header'
import { SectionError, SectionLoading, StatusLine } from './states'

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })

function GrantedBy({ administrator }: Readonly<{ administrator: AdministratorEntry }>) {
  if (administrator.grantedVia === 'OPERATOR_BOOTSTRAP') return <span>Definido pelo operador na instalação</span>
  return <span>Concedido por {administrator.grantedBy.displayName} em {dateFormat.format(new Date(administrator.grantedAt))}</span>
}

function GrantForm({ onGranted }: Readonly<{ onGranted: () => void }>) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const emailId = useId()
  const key = useAttemptKey()
  const grant = useMutation({
    mutationFn: (parsed: EmailAddress) => addAdministrator(parsed, key.keyFor(parsed)),
    onSuccess: () => { key.settled(); setEmail(''); setMessage(null); onGranted() },
    onError: (error) => setMessage(failureText(error)),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseEmail(email)
    if ('message' in parsed) {
      setMessage(parsed.message)
      return
    }
    grant.mutate(parsed.email)
  }
  return <form className="cxs-form" onSubmit={submit}>
    <label htmlFor={emailId}>E-mail</label>
    <Input id={emailId} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
    <Button type="submit" variant="primary" disabled={!email.trim() || grant.isPending}>Tornar administrador</Button>
    {message && <StatusLine tone="danger">{message}</StatusLine>}
  </form>
}

export function AdminsScreen() {
  const session = useSession()
  const administrators = useQuery(administratorsQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: administratorsQuery.queryKey })
  const revoke = useMutation({
    mutationFn: (accountId: AccountId) => removeAdministrator(accountId),
    onSuccess: (_data, accountId) => {
      setRevokeMessage(null)
      refresh()
      if (accountId === session.data?.account.accountId) {
        void queryClient.invalidateQueries({ queryKey: sessionQueryKey })
        void navigate({ to: '/settings/account' })
      }
    },
    onError: (error) => setRevokeMessage(failureText(error)),
  })

  return <main className="cxs-page">
    <PageHeader title="Administradores" lead="Quem pode conectar o GitHub, compartilhar contas e definir os padrões da instalação." />
    {administrators.isPending && <SectionLoading />}
    {administrators.isError && <SectionError error={administrators.error} description="Não foi possível consultar os administradores." onRetry={() => void administrators.refetch()} />}
    {administrators.isSuccess && <ul className="cxs-list">
      {administrators.data.administrators.map((administrator) => {
        const isViewer = administrator.accountId === session.data?.account.accountId
        return <li key={administrator.accountId}>
          <Avatar name={administrator.displayName} size="sm" />
          <div className="cxs-row-main">
            <strong>{administrator.displayName}{isViewer && ' (você)'}</strong>
            {administrator.email && <span className="cxs-row-meta">{administrator.email}</span>}
            <GrantedBy administrator={administrator} />
          </div>
          <AlertDialog>
            <AlertDialog.Trigger render={<Button type="button" variant="outline">Revogar</Button>} />
            <AlertDialog.Portal>
              <AlertDialog.Overlay />
              <AlertDialog.Content>
                <AlertDialog.Header><AlertDialog.Title>Revogar administrador</AlertDialog.Title></AlertDialog.Header>
                <AlertDialog.Body><AlertDialog.Description>{administrator.displayName} deixa de administrar a instalação.</AlertDialog.Description></AlertDialog.Body>
                <AlertDialog.Footer>
                  <AlertDialog.Cancel render={<Button type="button" variant="outline">Cancelar</Button>} />
                  <AlertDialog.Action render={<Button type="button" variant="destructive" disabled={revoke.isPending} onClick={() => revoke.mutate(administrator.accountId)}>Revogar</Button>} />
                </AlertDialog.Footer>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog>
        </li>
      })}
    </ul>}
    {revokeMessage && <StatusLine tone="danger">{revokeMessage}</StatusLine>}
    <section aria-labelledby="cxs-grant-title">
      <h2 id="cxs-grant-title">Tornar alguém administrador</h2>
      <GrantForm onGranted={refresh} />
    </section>
  </main>
}
