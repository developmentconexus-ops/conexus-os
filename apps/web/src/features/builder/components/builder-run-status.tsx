import { PendingIndicator } from '@mastra/playground-ui/components/PendingIndicator'
import { Shimmer } from '@mastra/playground-ui/components/Shimmer'
import { useEffect, useState } from 'react'
import type { BuilderRun } from '../api'

export const phaseLabels: Record<NonNullable<BuilderRun['phase']>, string> = {
  PREPARING: 'Preparando o ambiente de código',
  AGENT: 'Conexus está trabalhando',
  SOURCE_ADMISSION: 'Conferindo a nova fonte',
  COMPILING: 'Compilando o aplicativo',
  FINALIZING: 'Publicando o Preview',
}

export const activeRunLabel = (run: BuilderRun): string =>
  run.state === 'QUEUED' ? 'Na fila para iniciar' : run.phase ? phaseLabels[run.phase] : 'Executando no Builder'

export const elapsedLabel = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes === 0 ? `${seconds} s` : `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`
}

// Pinned above the composer rather than inside the scrolling conversation: an agent often speaks
// once and then works in silence, and a status that scrolls away reads as a run that stopped.
export function BuilderRunStatus({ run, inThisConversation, stopping, onStop }: Readonly<{
  run: BuilderRun
  inThisConversation: boolean
  stopping: boolean
  onStop: () => void
}>) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const label = inThisConversation ? activeRunLabel(run) : `${activeRunLabel(run)} em outra conversa`
  return <div className="builder-run-status" role="status" aria-live="polite">
    <PendingIndicator />
    <Shimmer active>{label}</Shimmer>
    <span className="builder-run-status-elapsed">há {elapsedLabel(now - new Date(run.createdAt).getTime())}</span>
    <button className="builder-stop-button" type="button" onClick={onStop} disabled={stopping}>
      {stopping ? 'Parando…' : 'Parar'}
    </button>
  </div>
}
