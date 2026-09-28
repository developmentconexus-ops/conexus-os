import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { modelAccountsQueryKey, removeApiKey, signOut, startOAuth } from '../model-accounts-api'
import type { ModelAccountRow as Row } from '../model-account-rows'
import { DeviceCodeStep, PasteCodeStep } from './connect-account'
import { Chip, StatusLine } from './states'

const connectionLabel = (kind: 'api_key' | 'oauth') => kind === 'oauth' ? 'Assinatura' : 'Chave de API'

type ReconnectState =
  | { step: 'idle' }
  | { step: 'paste-code'; sessionId: string; url: string; expiresAt: string | undefined }
  | { step: 'device-code'; sessionId: string; url: string; userCode: string; nextPollMs: number; expiresAt: string | undefined }
  | { step: 'expired' }
  | { step: 'failed'; message: string; detail: string | undefined }

export function OwnAccountRow({ row }: Readonly<{ row: Row }>) {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reconnect, setReconnect] = useState<ReconnectState>({ step: 'idle' })
  const disconnect = useMutation({
    mutationFn: () => row.own === 'oauth' ? signOut(row.provider) : removeApiKey(row.provider),
    onSuccess: () => { setFailed(false); setConfirmOpen(false); void queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey }) },
    onError: () => setFailed(true),
  })
  const startReconnect = useMutation({
    mutationFn: () => startOAuth(row.provider),
    onSuccess: (flow) => setReconnect(flow.kind === 'device-code'
      ? { step: 'device-code', sessionId: flow.sessionId, url: flow.url, userCode: flow.userCode ?? '', nextPollMs: flow.nextPollMs ?? 2000, expiresAt: flow.expiresAt }
      : { step: 'paste-code', sessionId: flow.sessionId, url: flow.url, expiresAt: flow.expiresAt }),
    onError: () => setReconnect({ step: 'failed', message: 'Não foi possível iniciar a entrada com este provedor.', detail: undefined }),
  })
  const onReconnectDone = (error?: string, detail?: string) => {
    if (error) { setReconnect({ step: 'failed', message: error, detail }); return }
    setReconnect({ step: 'idle' })
    setFailed(false)
    void queryClient.invalidateQueries({ queryKey: modelAccountsQueryKey })
    void queryClient.invalidateQueries({ queryKey: ['builder-models'] })
  }
  const onReconnectExpired = () => setReconnect({ step: 'expired' })
  if (!row.own) return null
  return <li className="cxs-row">
    <div className="cxs-row-main">
      <strong>{row.label}</strong>
      <span className="cxs-row-meta">{connectionLabel(row.own)}</span>
    </div>
    <Chip tone={row.state === 'needs-reconnect' ? 'warning' : 'positive'}>{row.state === 'needs-reconnect' ? 'Precisa entrar de novo' : 'Conectada'}</Chip>
    <div className="cxs-row-actions">
      {row.state === 'needs-reconnect' && reconnect.step === 'idle' && <Button type="button" variant="outline" disabled={startReconnect.isPending} onClick={() => startReconnect.mutate()}>Entrar de novo</Button>}
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
    {reconnect.step === 'failed' && <StatusLine tone="danger">
      {reconnect.message}
      {reconnect.detail && <details className="cxs-disclosure"><summary>Detalhe técnico</summary><code>{reconnect.detail}</code></details>}
    </StatusLine>}
    {reconnect.step === 'expired' && <>
      <StatusLine tone="danger">O código expirou.</StatusLine>
      <Button type="button" variant="primary" disabled={startReconnect.isPending} onClick={() => startReconnect.mutate()}>Gerar outro código</Button>
    </>}
    {reconnect.step === 'paste-code' && <PasteCodeStep provider={row.provider} sessionId={reconnect.sessionId} url={reconnect.url} expiresAt={reconnect.expiresAt} onDone={onReconnectDone} onExpired={onReconnectExpired} />}
    {reconnect.step === 'device-code' && <DeviceCodeStep provider={row.provider} sessionId={reconnect.sessionId} url={reconnect.url} userCode={reconnect.userCode} nextPollMs={reconnect.nextPollMs} expiresAt={reconnect.expiresAt} onDone={onReconnectDone} onExpired={onReconnectExpired} />}
    {failed && <StatusLine tone="danger">Não foi possível concluir. Tente de novo.</StatusLine>}
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

export function ProviderCard({
  row,
  onConnect,
}: Readonly<{
  row: Row
  onConnect: (provider: string) => void
}>) {
  if (row.state === 'connected' || row.state === 'needs-reconnect') {
    return <OwnAccountRow row={row} />
  }

  if (row.state === 'shared') {
    return <li className="cxs-row">
      <div className="cxs-row-main">
        <strong>{row.label}</strong>
        {row.shared && <span className="cxs-row-meta">{connectionLabel(row.shared)}</span>}
      </div>
      <Chip tone="neutral">Compartilhada pela instalação</Chip>
      <div className="cxs-row-actions">
        <Button type="button" variant="outline" onClick={() => onConnect(row.provider)}>
          Conectar a sua conta
        </Button>
      </div>
    </li>
  }

  return <li className="cxs-row">
    <div className="cxs-row-main">
      <strong>{row.label}</strong>
    </div>
    <Chip tone="neutral">Não conectado</Chip>
    <div className="cxs-row-actions">
      <Button type="button" variant="primary" onClick={() => onConnect(row.provider)}>
        Conectar
      </Button>
    </div>
  </li>
}
