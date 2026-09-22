import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { modelAccountsQueryKey, removeApiKey, signOut } from '../model-accounts-api'
import type { ModelAccountRow as Row } from '../model-account-rows'
import { Chip } from './states'

const connectionLabel = (kind: 'api_key' | 'oauth') => kind === 'oauth' ? 'Assinatura' : 'Chave de API'

export function OwnAccountRow({ row, onReconnect }: Readonly<{ row: Row; onReconnect: (provider: string) => void }>) {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const disconnect = useMutation({
    mutationFn: () => row.own === 'oauth' ? signOut(row.provider) : removeApiKey(row.provider),
    onSuccess: () => { setFailed(false); setConfirmOpen(false); void queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey }) },
    onError: () => setFailed(true),
  })
  if (!row.own) return null
  return <li className="cxs-row">
    <div className="cxs-row-main">
      <strong>{row.label}</strong>
      <span className="cxs-row-meta">{connectionLabel(row.own)}</span>
    </div>
    <Chip tone={row.state === 'needs-reconnect' ? 'warning' : 'positive'}>{row.state === 'needs-reconnect' ? 'Precisa reconectar' : 'Conectada'}</Chip>
    <div className="cxs-row-actions">
      {row.state === 'needs-reconnect' && <Button type="button" variant="outline" onClick={() => onReconnect(row.provider)}>Reconectar</Button>}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Trigger render={<Button type="button" variant="outline">Desconectar</Button>} />
        <AlertDialog.Portal>
          <AlertDialog.Overlay />
          <AlertDialog.Content>
            <AlertDialog.Header><AlertDialog.Title>Desconectar {row.label}</AlertDialog.Title></AlertDialog.Header>
            <AlertDialog.Body><AlertDialog.Description>As próximas conversas deixam de usar esta conta.</AlertDialog.Description></AlertDialog.Body>
            <AlertDialog.Footer>
              <AlertDialog.Cancel render={<Button type="button" variant="outline">Cancelar</Button>} />
              <AlertDialog.Action render={<Button type="button" variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>Desconectar</Button>} />
            </AlertDialog.Footer>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog>
    </div>
    {failed && <p role="alert">Não foi possível concluir. Tente novamente.</p>}
  </li>
}

export function SharedAccountRow({ row, manageAction }: Readonly<{ row: Row; manageAction?: ReactNode }>) {
  if (!row.shared) return null
  return <li className="cxs-row">
    <div className="cxs-row-main">
      <strong>{row.label}</strong>
      <span className="cxs-row-meta">{connectionLabel(row.shared)}</span>
    </div>
    <Chip tone="neutral">Compartilhada pela instalação</Chip>
    {manageAction && <div className="cxs-row-actions">{manageAction}</div>}
  </li>
}
