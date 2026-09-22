import { Button } from '@mastra/playground-ui/components/Button'
import { Monitor, RotateCw, Smartphone } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import type { BuilderRun } from '../api'
import { failureReason } from '../failure-reasons'
import './lens-surfaces.css'
import { clockLabel, nextVersionLine, type RunView } from './run-state'
import type { Preview } from './use-preview'

const changedRuns = (history: readonly BuilderRun[]): readonly BuilderRun[] =>
  [...history].filter((entry) => entry.resultKind === 'SOURCE_CHANGED').sort((left, right) => left.createdAt.localeCompare(right.createdAt))

const inUseRun = (history: readonly BuilderRun[], sourceRevision: string | null): BuilderRun | null =>
  sourceRevision ? history.find((entry) => entry.resultSourceRevision === sourceRevision && entry.resultKind === 'SOURCE_CHANGED') ?? null : null

/** The version's 1-based ordinal among every change this Project has published, oldest first. */
const versionNumber = (history: readonly BuilderRun[], sourceRevision: string | null): number | null => {
  if (!sourceRevision) return null
  const index = changedRuns(history).findIndex((entry) => entry.resultSourceRevision === sourceRevision)
  return index === -1 ? null : index + 1
}

const addressOf = (url: string): string => {
  try { return new URL(url).host } catch { return url }
}

export function LensPreview({ preview, view, history, lastGoodSourceRevision, sourceAhead }: Readonly<{
  preview: Preview
  view: RunView
  history: readonly BuilderRun[]
  lastGoodSourceRevision: string | null
  sourceAhead: boolean
}>) {
  const frameName = `cx-preview-${useId().replaceAll(':', '')}`
  const entryForm = useRef<HTMLFormElement>(null)
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const lease = preview.lease
  const leaseKeyId = lease?.keyId ?? null
  // The frame starts at about:blank, whose own load fires before any grant exists, so a load only
  // counts once the entry for this exact lease has been submitted.
  const submitted = useRef<string | null>(null)
  const [navigated, setNavigated] = useState<string | null>(null)
  // Only the very first open is veiled. A newer version replaces the old one in place, so the frame
  // never dims or flashes when a build lands.
  const [everOpened, setEverOpened] = useState(false)
  useEffect(() => {
    if (!lease || !leaseKeyId) return
    submitted.current = leaseKeyId
    setNavigated(null)
    queueMicrotask(() => entryForm.current?.requestSubmit())
  }, [lease, leaseKeyId])
  const frameOpen = navigated !== null && navigated === leaseKeyId
  const inUse = inUseRun(history, lastGoodSourceRevision)
  const since = inUse ? clockLabel(inUse.createdAt) : null
  const version = versionNumber(history, lastGoodSourceRevision)
  const failedRun = view.kind === 'SETTLED' && (view.outcome === 'BUILD_FAILED' || view.outcome === 'FAILED') ? view.run : null

  if (!preview.ready && !lease) {
    return <div className="cx-preview-empty">
      <ConexusMark size={40} working={view.kind === 'ACTIVE'} />
      <p>{view.kind === 'ACTIVE' ? 'Gerando a primeira prévia…' : 'Ainda não há uma prévia disponível. Descreva o aplicativo para começar.'}</p>
      {failedRun && <FailureNote run={failedRun} />}
    </div>
  }

  return <div className="cx-preview">
    {lease && <div className="cx-preview-toolbar" role="toolbar" aria-label="Janela da prévia">
      <fieldset className="cx-seg cx-seg-icons">
        <legend className="cx-sr">Dispositivo</legend>
        <button type="button" aria-pressed={viewport === 'desktop'} aria-label="Computador" title="Computador" onClick={() => setViewport('desktop')}>
          <Monitor size={14} aria-hidden="true" />
        </button>
        <button type="button" aria-pressed={viewport === 'mobile'} aria-label="Celular" title="Celular" onClick={() => setViewport('mobile')}>
          <Smartphone size={14} aria-hidden="true" />
        </button>
      </fieldset>
      <button type="button" className="cx-icon-button" aria-label="Recarregar prévia" title="Recarregar" onClick={preview.retry}>
        <RotateCw size={14} aria-hidden="true" />
      </button>
      <span className="cx-preview-address">{addressOf(lease.launch.previewUrl)}</span>
      <span className="cx-chip" data-tone={view.kind === 'ACTIVE' ? 'active' : 'ok'}>
        {version !== null ? `Versão ${version} · em uso` : 'Em uso'}
      </span>
    </div>}
    <div className="cx-inuse">
      <span className="cx-inuse-dot" data-state={view.kind === 'ACTIVE' ? 'building' : 'live'} aria-hidden="true" />
      <p role="status" aria-live="polite">
        <span>Em uso: {since ? `versão das ${since}` : 'última versão boa'}</span>
        <span className="cx-inuse-sep" aria-hidden="true"> · </span>
        <span>Próxima: {nextVersionLine(view, sourceAhead)}</span>
      </p>
    </div>
    {failedRun && <FailureNote run={failedRun} />}
    {preview.failed && <div className="cx-note" role="alert">
      <p><strong>Não foi possível abrir a prévia atual.</strong> A última prévia boa continua aqui.</p>
      <Button size="sm" onClick={preview.retry}>Tentar novamente</Button>
    </div>}
    {lease && <>
      <div className="cx-frame" data-viewport={viewport}>
        <iframe title="Prévia do aplicativo" name={frameName} src="about:blank" onLoad={() => {
          if (submitted.current !== leaseKeyId) return
          setNavigated(leaseKeyId)
          setEverOpened(true)
        }} />
        {!everOpened && <div className="cx-frame-veil" aria-hidden="true"><ConexusMark size={28} working /></div>}
      </div>
      <form ref={entryForm} hidden method="post" action={lease.launch.entryUrl} target={frameName}>
        <input type="hidden" name="entryGrant" value={lease.launch.entryGrant} />
      </form>
      {/* Only what the browser can observe. A cross-origin load fires for a refusal as readily as
          for a working app, so navigation is the furthest this can honestly claim. */}
      <p className="cx-sr" role="status" aria-live="polite">{frameOpen
        ? 'Prévia aberta. Se a área ficar vazia, o aplicativo não desenhou nada.'
        : 'Acesso autorizado. Abrindo a prévia…'}</p>
    </>}
  </div>
}

function FailureNote({ run }: Readonly<{ run: BuilderRun }>) {
  const sentence = run.resultKind === 'SOURCE_CHANGED_BUILD_FAILED'
    ? 'A última alteração não compilou. A prévia continua na versão anterior.'
    : failureReason(run.failureCategory)
  return <div className="cx-note" data-tone="warning" role="alert">
    <p>{sentence}</p>
    {run.failureCode && <details>
      <summary>Detalhe técnico</summary>
      <code>{run.failureCode}</code>
    </details>}
  </div>
}
