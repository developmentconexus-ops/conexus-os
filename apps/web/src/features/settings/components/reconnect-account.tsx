import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { startOAuth } from '../model-accounts-api'
import { DeviceCodeStep, PasteCodeStep } from './connect-account'

type ReconnectState =
  | { step: 'idle' }
  | { step: 'paste-code'; sessionId: string; url: string }
  | { step: 'device-code'; sessionId: string; url: string; userCode: string; nextPollMs: number }
  | { step: 'failed'; message: string }

// The same subscription login the account used the first time, restarted. Unreachable while the
// Hub reports no `needs-reconnect` accounts, but the row and this flow are ready for when it does.
export function ReconnectAccount({ provider, onDone }: Readonly<{ provider: string; onDone: (error?: string) => void }>) {
  const [state, setState] = useState<ReconnectState>({ step: 'idle' })
  const start = useMutation({
    mutationFn: () => startOAuth(provider),
    onSuccess: (flow) => setState(flow.kind === 'device-code'
      ? { step: 'device-code', sessionId: flow.sessionId, url: flow.url, userCode: flow.userCode ?? '', nextPollMs: flow.nextPollMs ?? 2000 }
      : { step: 'paste-code', sessionId: flow.sessionId, url: flow.url }),
    onError: () => setState({ step: 'failed', message: 'Não foi possível iniciar a entrada com este provedor.' }),
  })
  const startFlow = start.mutate
  useEffect(() => { startFlow() }, [startFlow])
  if (state.step === 'idle') return null
  if (state.step === 'failed') return <p role="alert">{state.message}</p>
  if (state.step === 'paste-code') return <PasteCodeStep provider={provider} sessionId={state.sessionId} url={state.url} onDone={onDone} />
  return <DeviceCodeStep provider={provider} sessionId={state.sessionId} url={state.url} userCode={state.userCode} nextPollMs={state.nextPollMs} onDone={onDone} />
}
