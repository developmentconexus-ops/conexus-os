import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { Notice } from '@mastra/playground-ui/components/Notice'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { shareErrorMessage } from '../error-messages'
import {
  listModelAccounts, type ModelAccountsRequestError, modelAccountsQueryKey, shareWithEveryone, stopSharing,
} from '../model-accounts-api'
import { connectableProviders, shareableRows, sharedRows } from '../model-account-rows'
import { ConnectAccount } from './connect-account'
import { PageHeader } from './page-header'
import { Chip, SectionEmpty, SectionError, SectionLoading, StatusLine } from './states'

export function InstallationModelsScreen() {
  const accounts = useQuery({ queryKey: modelAccountsQueryKey, queryFn: listModelAccounts })
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey })
  const stop = useMutation({
    mutationFn: (provider: string) => stopSharing(provider),
    onSuccess: () => { setMessage(null); refresh() },
    onError: () => setMessage('Não foi possível concluir. Tente novamente.'),
  })
  const share = useMutation({
    mutationFn: (provider: string) => shareWithEveryone(provider),
    onSuccess: () => { setMessage(null); refresh() },
    onError: (error) => setMessage(shareErrorMessage(error as ModelAccountsRequestError)),
  })

  return <main className="cxs-page">
    <PageHeader title="Contas compartilhadas" lead="Uma conta compartilhada atende todas as pessoas que não conectaram a sua. Removê-la vale a partir da próxima execução." />
    <Notice variant="warning"><Notice.Message>Compartilhar uma assinatura pessoal pode violar os termos do provedor.</Notice.Message></Notice>
    {message && <StatusLine>{message}</StatusLine>}
    <section aria-labelledby="cxs-shared-with-everyone-title">
      <h2 id="cxs-shared-with-everyone-title">Compartilhadas com todos</h2>
      {accounts.isPending && <SectionLoading />}
      {accounts.isError && <SectionError description="Não foi possível consultar as contas compartilhadas." onRetry={() => void accounts.refetch()} />}
      {accounts.isSuccess && (() => {
        const rows = sharedRows(accounts.data.providers)
        return rows.length === 0 ? <SectionEmpty>Nenhuma conta compartilhada.</SectionEmpty> : <ul className="cxs-list">
          {rows.map((row) => <li key={row.provider} className="cxs-row">
            <strong>{row.label}</strong>
            <Chip tone="neutral">Compartilhada pela instalação</Chip>
            <AlertDialog>
              <AlertDialog.Trigger render={<Button type="button" variant="outline">Parar de compartilhar</Button>} />
              <AlertDialog.Portal>
                <AlertDialog.Overlay />
                <AlertDialog.Content>
                  <AlertDialog.Header><AlertDialog.Title>Parar de compartilhar {row.label}</AlertDialog.Title></AlertDialog.Header>
                  <AlertDialog.Body><AlertDialog.Description>Vale a partir da próxima execução.</AlertDialog.Description></AlertDialog.Body>
                  <AlertDialog.Footer>
                    <AlertDialog.Cancel render={<Button type="button" variant="outline">Cancelar</Button>} />
                    <AlertDialog.Action render={<Button type="button" variant="destructive" disabled={stop.isPending} onClick={() => stop.mutate(row.provider)}>Parar de compartilhar</Button>} />
                  </AlertDialog.Footer>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog>
          </li>)}
        </ul>
      })()}
    </section>
    <section aria-labelledby="cxs-shareable-title">
      <h2 id="cxs-shareable-title">Suas contas que podem ser compartilhadas</h2>
      {accounts.isSuccess && (() => {
        const rows = shareableRows(accounts.data.providers)
        return rows.length === 0 ? <SectionEmpty>Nenhuma conta sua disponível para compartilhar.</SectionEmpty> : <ul className="cxs-list">
          {rows.map((row) => <li key={row.provider} className="cxs-row">
            <strong>{row.label}</strong>
            <Button type="button" variant="primary" disabled={share.isPending} onClick={() => share.mutate(row.provider)}>Compartilhar com todos</Button>
          </li>)}
        </ul>
      })()}
    </section>
    <section aria-labelledby="cxs-connect-to-share-title">
      <h2 id="cxs-connect-to-share-title">Conectar uma conta para compartilhar</h2>
      {accounts.isSuccess && <ConnectAccount providers={connectableProviders(accounts.data.providers)} onConnected={refresh} />}
    </section>
  </main>
}
