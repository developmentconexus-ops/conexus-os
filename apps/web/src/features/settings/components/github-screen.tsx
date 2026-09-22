import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { githubConnectErrorMessage } from '../error-messages'
import {
  connectGithub, getGithubStatus, type GithubRepository, type GithubStatus, installationGithubQueryKey, type InstallationRequestError,
} from '../installation-api'
import { PageHeader } from './page-header'
import { Chip, SectionError, SectionLoading } from './states'

const repositoryChip = (state: GithubRepository['state']) => {
  if (state === 'reachable') return <Chip tone="positive">Acessível</Chip>
  if (state === 'missing') return <Chip tone="warning">Não encontrado</Chip>
  if (state === 'identity-changed') return <Chip tone="warning">Substituído</Chip>
  return <Chip tone="neutral">Não verificado</Chip>
}

function ConnectSteps({ status, onVerify, pending }: Readonly<{ status: GithubStatus; onVerify: () => void; pending: boolean }>) {
  return <ol className="cxs-steps">
    <li>
      <a href={status.installUrl} target="_blank" rel="noreferrer">Instalar o app do Conexus na organização<ExternalLink size={14} aria-hidden="true" /></a>
    </li>
    <li><Button type="button" variant="primary" disabled={pending} onClick={onVerify}>Verificar conexão</Button></li>
  </ol>
}

export function GithubScreen() {
  const status = useQuery({ queryKey: installationGithubQueryKey, queryFn: getGithubStatus })
  const queryClient = useQueryClient()
  const [connectError, setConnectError] = useState<string | null>(null)
  const [reconnectResult, setReconnectResult] = useState<GithubStatus | null>(null)
  const connect = useMutation({
    mutationFn: () => connectGithub(),
    onSuccess: (data) => {
      setConnectError(null)
      setReconnectResult(data)
      queryClient.setQueryData(installationGithubQueryKey, data)
    },
    onError: (error) => {
      const requestError = error as InstallationRequestError
      setConnectError(githubConnectErrorMessage(requestError.type, requestError.status))
    },
  })

  if (status.isPending) return <main className="cxs-page"><PageHeader title="GitHub" /><SectionLoading /></main>
  if (status.isError) return <main className="cxs-page"><PageHeader title="GitHub" /><SectionError description="Não foi possível consultar a conexão com o GitHub." onRetry={() => void status.refetch()} /></main>

  const data = status.data

  return <main className="cxs-page">
    <PageHeader title="GitHub" lead="A organização do GitHub da empresa guarda o repositório de cada Project." />
    {data.state === 'unreachable' && <SectionError description="Não foi possível falar com o GitHub agora." onRetry={() => void status.refetch()} />}
    {data.state === 'gone' && data.organization && <div className="cxs-notice" role="alert">
      <p>O app foi removido da organização {data.organization.login} no GitHub. Os Projects não aceitam pedidos até reconectar.</p>
    </div>}
    {(data.state === 'not-connected' || data.state === 'gone') && <ConnectSteps status={data} onVerify={() => connect.mutate()} pending={connect.isPending} />}
    {data.state === 'not-connected' && <p className="cxs-hint">Instale em todos os repositórios. Precisa ser uma organização, não uma conta pessoal.</p>}
    {connectError && <p role="alert">{connectError}</p>}
    {data.state === 'connected' && data.organization && <section aria-labelledby="cxs-github-org-title">
      <h2 id="cxs-github-org-title">{data.organization.login} <Chip tone="positive">Conectada</Chip></h2>
      <p>{data.repositories.length} {data.repositories.length === 1 ? 'repositório' : 'repositórios'}</p>
      <ul className="cxs-list">
        {data.repositories.map((repository) => <li key={repository.slug} className="cxs-row">
          <span>{repository.slug}</span>
          {repositoryChip(repository.state)}
          {(repository.state === 'missing' || repository.state === 'identity-changed') && (
            <p className="cxs-hint">O Project deste repositório fica bloqueado; o Conexus não cria um substituto.</p>
          )}
        </li>)}
      </ul>
      <div className="cxs-row-actions">
        <Button type="button" variant="outline" disabled={connect.isPending} onClick={() => connect.mutate()}>Reconectar</Button>
        <AlertDialog>
          <AlertDialog.Trigger render={<Button type="button" variant="destructive">Desconectar</Button>} />
          <AlertDialog.Portal>
            <AlertDialog.Overlay />
            <AlertDialog.Content>
              <AlertDialog.Header><AlertDialog.Title>Desconectar o GitHub</AlertDialog.Title></AlertDialog.Header>
              <AlertDialog.Body><AlertDialog.Description>
                Todo Project para de aceitar pedidos até a organização ser conectada de novo. A desconexão é feita no GitHub, removendo o app da organização.
              </AlertDialog.Description></AlertDialog.Body>
              <AlertDialog.Footer>
                <AlertDialog.Cancel render={<Button type="button" variant="outline">Cancelar</Button>} />
                <AlertDialog.Action render={
                  <Button type="button" variant="destructive" onClick={() => { if (data.manageUrl) window.open(data.manageUrl, '_blank', 'noreferrer') }}>
                    Abrir no GitHub
                  </Button>
                } />
              </AlertDialog.Footer>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog>
      </div>
      {reconnectResult && <div>
        <p role="status">Projects religados pelo id do repositório no GitHub.</p>
        <ul className="cxs-list">
          {reconnectResult.repositories.map((repository) => <li key={repository.slug} className="cxs-row"><span>{repository.slug}</span>{repositoryChip(repository.state)}</li>)}
        </ul>
      </div>}
    </section>}
  </main>
}
