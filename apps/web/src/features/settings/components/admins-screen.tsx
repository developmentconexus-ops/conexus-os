import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Avatar } from '@mastra/playground-ui/components/Avatar'
import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import { accessContextQueryKey, getAccessContext } from '../../identity-access/api'
import { administratorErrorMessage } from '../error-messages'
import {
  type Administrator, administratorsQueryKey, grantAdministrator, type InstallationRequestError, installationQueryKey,
  listAdministrators, revokeAdministrator,
} from '../installation-api'
import { PageHeader } from './page-header'
import { SectionError, SectionLoading } from './states'

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' })

function GrantedBy({ administrator }: Readonly<{ administrator: Administrator }>) {
  if (administrator.grantedVia === 'OPERATOR_BOOTSTRAP') return <span>Definido pelo operador na instalação</span>
  return <span>Concedido por {administrator.grantedBy?.displayName ?? 'alguém'} em {dateFormat.format(new Date(administrator.grantedAt))}</span>
}

function GrantForm({ onGranted }: Readonly<{ onGranted: () => void }>) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const emailId = useId()
  const grant = useMutation({
    mutationFn: () => grantAdministrator(email.trim()),
    onSuccess: () => { setEmail(''); setMessage(null); onGranted() },
    onError: (error) => setMessage(administratorErrorMessage((error as InstallationRequestError).type)),
  })
  return <form className="cxs-form" onSubmit={(event: FormEvent) => { event.preventDefault(); grant.mutate() }}>
    <label htmlFor={emailId}>E-mail</label>
    <Input id={emailId} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
    <Button type="submit" variant="primary" disabled={!email.trim() || grant.isPending}>Tornar administrador</Button>
    {message && <p role="alert">{message}</p>}
  </form>
}

export function AdminsScreen() {
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  const administrators = useQuery({ queryKey: administratorsQueryKey, queryFn: listAdministrators })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: administratorsQueryKey })
    void queryClient.invalidateQueries({ queryKey: installationQueryKey })
  }
  const revoke = useMutation({
    mutationFn: (accountId: string) => revokeAdministrator(accountId),
    onSuccess: (_data, accountId) => {
      setRevokeMessage(null)
      refresh()
      if (accountId === access.data?.account.accountId) void navigate({ to: '/settings/account' })
    },
    onError: (error) => setRevokeMessage(administratorErrorMessage((error as InstallationRequestError).type)),
  })

  return <main className="cxs-page">
    <PageHeader title="Administradores" lead="Quem pode conectar o GitHub, compartilhar contas e definir os padrões da instalação." />
    {administrators.isPending && <SectionLoading />}
    {administrators.isError && <SectionError description="Não foi possível consultar os administradores." onRetry={() => void administrators.refetch()} />}
    {administrators.isSuccess && <ul className="cxs-list">
      {administrators.data.administrators.map((administrator) => {
        const isViewer = administrator.accountId === access.data?.account.accountId
        return <li key={administrator.accountId} className="cxs-row">
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
    {revokeMessage && <p role="alert">{revokeMessage}</p>}
    <section aria-labelledby="cxs-grant-title">
      <h2 id="cxs-grant-title">Tornar alguém administrador</h2>
      <GrantForm onGranted={refresh} />
    </section>
  </main>
}
