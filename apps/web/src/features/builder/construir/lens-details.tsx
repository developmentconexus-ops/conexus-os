import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { type BuilderRun, getBuilderRunTrace } from '../api'
import { clockLabel, statusLine, viewRun } from './run-state'

const dateTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function LensDetails({ projectId, runs, selected, onSelect, preview }: Readonly<{
  projectId: string
  runs: readonly BuilderRun[]
  selected: BuilderRun | null
  onSelect: (builderRunId: string) => void
  preview: Readonly<{ workingSourceRevision: string | null; lastGoodSourceRevision: string | null }>
}>) {
  const trace = useQuery({
    queryKey: ['builder-run-trace', projectId, selected?.builderRunId],
    queryFn: () => getBuilderRunTrace(projectId, selected?.builderRunId ?? ''),
    enabled: Boolean(selected),
  })
  if (!selected) return <p className="cx-lens-empty">Nenhuma execução ainda. Os detalhes de cada pedido aparecem aqui.</p>

  return <div className="cx-details">
    <section aria-labelledby="cx-run-heading" className="cx-details-card">
      <h3 id="cx-run-heading">Execução selecionada</h3>
      <dl className="cx-run-facts">
        <div><dt>Pedido</dt><dd>{selected.requestText ?? 'Sem texto registrado'}</dd></div>
        <div><dt>Resultado</dt><dd>{statusLine(viewRun(selected))}</dd></div>
        <div><dt>Início</dt><dd>{dateTime.format(new Date(selected.createdAt))}</dd></div>
        <div><dt>Execução</dt><dd><code>{selected.builderRunId}</code></dd></div>
        <div><dt>Versão de partida</dt><dd><code>{selected.baseSourceRevision}</code></dd></div>
        <div><dt>Versão resultante</dt><dd><code>{selected.resultSourceRevision ?? 'Nenhuma'}</code></dd></div>
        {selected.failureCode && <div><dt>Código da falha</dt><dd><code>{selected.failureCode}</code></dd></div>}
        <div><dt>Código atual</dt><dd><code>{preview.workingSourceRevision ?? 'Ainda não disponível'}</code></dd></div>
        <div><dt>Prévia em uso</dt><dd><code>{preview.lastGoodSourceRevision ?? 'Ainda não disponível'}</code></dd></div>
      </dl>
    </section>

    <section aria-labelledby="cx-history-heading" className="cx-details-card">
      <h3 id="cx-history-heading">Histórico</h3>
      <ol className="cx-history">
        {runs.map((run) => <li key={run.builderRunId}>
          <button type="button" aria-pressed={run.builderRunId === selected.builderRunId} onClick={() => onSelect(run.builderRunId)}>
            <span className="cx-history-time">{clockLabel(run.createdAt)}</span>
            <span className="cx-history-text">{run.requestText ?? 'Pedido sem texto'}</span>
            <span className="cx-history-state">{statusLine(viewRun(run))}</span>
          </button>
        </li>)}
      </ol>
    </section>

    <section aria-labelledby="cx-trace-heading" className="cx-details-card">
      <h3 id="cx-trace-heading">Rastro da execução</h3>
      {trace.isPending && <Skeleton className="cx-skeleton" />}
      {trace.isError && <div className="cx-note" role="alert"><p>Não foi possível ler o rastro desta execução.</p><Button size="sm" onClick={() => void trace.refetch()}>Tentar novamente</Button></div>}
      {trace.data && !trace.data.available && <p className="cx-lens-empty">Esta execução não deixou rastro.</p>}
      {trace.data?.available && <details className="cx-trace">
        <summary>{trace.data.spans.length} etapas registradas · <code>{trace.data.traceId}</code></summary>
        <ul>{trace.data.spans.map((span) => <li key={`${span.spanType}-${span.name}-${span.startedAt}`} data-error={span.error || undefined}>
          <code>{span.spanType}</code><span>{span.name}</span>
          <small>{span.durationMs === null ? 'duração desconhecida' : `${span.durationMs} ms`}{span.error ? ' · erro' : ''}</small>
        </li>)}</ul>
      </details>}
    </section>
  </div>
}
