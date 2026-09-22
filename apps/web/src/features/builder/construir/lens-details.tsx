import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { type BuilderRun, getBuilderRunTrace } from '../api'
import { failureReason } from '../failure-reasons'
import './lens-surfaces.css'
import { clockLabel, isActive, statusLine, viewRun } from './run-state'

const dateTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** A revision hash, shown short, with a button that copies the full value. */
function Hash({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false)
  return <tr>
    <td>{label}</td>
    <td className="cx-hash">
      <code title={value}>{value.slice(0, 7)}</code>
      <button
        type="button"
        className="cx-icon-button"
        aria-label={`Copiar ${label.toLowerCase()}`}
        onClick={async () => {
          try { await navigator.clipboard.writeText(value) } catch { /* clipboard may be unavailable; the short hash is still visible */ }
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        }}
      >
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      </button>
    </td>
  </tr>
}

const timelineTone = (run: BuilderRun): 'ok' | 'fail' | 'active' | 'neutral' => {
  const view = viewRun(run)
  if (view.kind === 'ACTIVE') return 'active'
  if (view.kind === 'IDLE') return 'neutral'
  if (view.outcome === 'CHANGED' || view.outcome === 'RESPONDED') return 'ok'
  if (view.outcome === 'FAILED' || view.outcome === 'BUILD_FAILED') return 'fail'
  return 'neutral'
}

const timelinePillText = (run: BuilderRun): string => {
  const view = viewRun(run)
  if (view.kind === 'ACTIVE') return 'Em andamento'
  if (view.kind === 'IDLE') return ''
  if (view.outcome === 'FAILED' || view.outcome === 'BUILD_FAILED') return 'Falhou'
  if (view.outcome === 'BASE_MOVED') return 'Não aplicado'
  if (view.outcome === 'STOPPED') return 'Parado'
  if (view.outcome === 'DISCARDED') return 'Interrompido'
  return 'Concluído'
}

export function LensDetails({ projectId, runs, selected, onSelect, preview, onRetry }: Readonly<{
  projectId: string
  runs: readonly BuilderRun[]
  selected: BuilderRun | null
  onSelect: (builderRunId: string) => void
  preview: Readonly<{ workingSourceRevision: string | null; lastGoodSourceRevision: string | null }>
  /** Re-sends a past request's text as a new one. Omitted where no re-send capability is wired in yet. */
  onRetry?: (requestText: string) => void
}>) {
  const trace = useQuery({
    queryKey: ['builder-run-trace', projectId, selected?.builderRunId],
    queryFn: () => getBuilderRunTrace(projectId, selected?.builderRunId ?? ''),
    enabled: Boolean(selected),
  })
  if (!selected) return <p className="cx-lens-empty">Nenhuma execução ainda. Os fatos de cada pedido aparecem aqui.</p>

  return <div className="cx-details">
    <section aria-labelledby="cx-about-heading" className="cx-details-card">
      <h3 id="cx-about-heading">Sobre este pedido</h3>
      <dl className="cx-run-facts">
        <div><dt>Pedido</dt><dd>{selected.requestText ?? 'Sem texto registrado'}</dd></div>
        <div><dt>Resultado</dt><dd>{statusLine(viewRun(selected))}</dd></div>
        <div><dt>Início</dt><dd>{dateTime.format(new Date(selected.createdAt))}</dd></div>
        <div><dt>Código atual</dt><dd>{preview.workingSourceRevision ? `versão ${preview.workingSourceRevision.slice(0, 7)}` : 'Ainda não disponível'}</dd></div>
        <div><dt>Prévia em uso</dt><dd>{preview.lastGoodSourceRevision ? `versão ${preview.lastGoodSourceRevision.slice(0, 7)}` : 'Ainda não disponível'}</dd></div>
      </dl>
      <details className="cx-tech">
        <summary>Detalhes técnicos</summary>
        <table className="cx-hash-table">
          <tbody>
            <Hash label="Execução" value={selected.builderRunId} />
            <Hash label="Versão de partida" value={selected.baseSourceRevision} />
            {selected.resultSourceRevision && <Hash label="Versão resultante" value={selected.resultSourceRevision} />}
            {selected.failureCode && <tr><td>Código da falha</td><td className="cx-hash"><code>{selected.failureCode}</code></td></tr>}
            {preview.workingSourceRevision && <Hash label="Código atual" value={preview.workingSourceRevision} />}
            {preview.lastGoodSourceRevision && <Hash label="Prévia em uso" value={preview.lastGoodSourceRevision} />}
          </tbody>
        </table>
        {trace.isPending && <Skeleton className="cx-skeleton" />}
        {trace.isError && <div className="cx-note" role="alert"><p>Não foi possível ler o rastro desta execução.</p><Button size="sm" onClick={() => void trace.refetch()}>Tentar novamente</Button></div>}
        {trace.data && !trace.data.available && <p className="cx-note-line">Esta execução não deixou rastro.</p>}
        {trace.data?.available && <div className="cx-trace">
          <p className="cx-note-line">{trace.data.spans.length} etapas registradas · <code>{trace.data.traceId}</code></p>
          <ul>{trace.data.spans.map((span) => <li key={`${span.spanType}-${span.name}-${span.startedAt}`} data-error={span.error || undefined}>
            <code>{span.spanType}</code><span>{span.name}</span>
            <small>{span.durationMs === null ? 'duração desconhecida' : `${span.durationMs} ms`}{span.error ? ' · erro' : ''}</small>
          </li>)}</ul>
        </div>}
      </details>
    </section>

    <section aria-labelledby="cx-history-heading" className="cx-details-card">
      <h3 id="cx-history-heading">O que já foi feito</h3>
      <ol className="cx-run-timeline">
        {runs.map((run) => {
          const failed = timelineTone(run) === 'fail'
          const reason = failed ? failureReason(run.failureCategory) : null
          const requestText = run.requestText
          return <li key={run.builderRunId} data-selected={run.builderRunId === selected.builderRunId || undefined}>
            <button type="button" className="cx-run-entry" aria-pressed={run.builderRunId === selected.builderRunId} onClick={() => onSelect(run.builderRunId)}>
              <time className="cx-history-time">{clockLabel(run.createdAt)}</time>
              <div className="cx-run-entry-body">
                <p className="cx-history-text">{run.requestText ?? 'Pedido sem texto'}</p>
                {reason && <p className="cx-run-reason"><strong>Motivo:</strong> {reason}</p>}
              </div>
              <span className="cx-chip" data-tone={timelineTone(run)}>{timelinePillText(run)}</span>
            </button>
            {failed && onRetry && requestText && !isActive(run) && <Button
              size="sm" variant="outline" className="cx-run-retry"
              icon={<RotateCw size={13} aria-hidden="true" />}
              onClick={() => onRetry(requestText)}
            >Tentar de novo</Button>}
          </li>
        })}
      </ol>
    </section>
  </div>
}
