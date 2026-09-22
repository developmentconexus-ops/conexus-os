import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { type BuilderRun, compareProjectSource, getProjectSourceFile, type SourceChange } from '../api'

const DiffView = lazy(() => import('./code-surfaces').then((module) => ({ default: module.DiffView })))

const changeLabels: Readonly<Record<SourceChange['status'], string>> = {
  ADDED: 'Novo',
  REMOVED: 'Removido',
  MODIFIED: 'Alterado',
  RENAMED: 'Renomeado',
}

export type ChangeBasis = Readonly<{ baseSourceRevision: string; resultSourceRevision: string }>

export const changeBasisOf = (run: BuilderRun | null | undefined): ChangeBasis | null =>
  run?.resultSourceRevision ? { baseSourceRevision: run.baseSourceRevision, resultSourceRevision: run.resultSourceRevision } : null

const readSide = async (projectId: string, revision: string, path: string | null): Promise<string> =>
  path === null ? '' : (await getProjectSourceFile(projectId, revision, path)).content

export function LensDiff({ projectId, basis, runLabel }: Readonly<{ projectId: string; basis: ChangeBasis | null; runLabel: string | null }>) {
  const [chosenPath, setChosenPath] = useState<string | null>(null)
  const comparison = useQuery({
    queryKey: ['builder-source-compare', projectId, basis?.baseSourceRevision, basis?.resultSourceRevision],
    queryFn: () => compareProjectSource(projectId, basis?.baseSourceRevision ?? '', basis?.resultSourceRevision ?? ''),
    enabled: Boolean(basis),
  })
  const files = comparison.data?.files ?? []
  const change = files.find((entry) => entry.path === chosenPath) ?? files.at(0) ?? null
  const sides = useQuery({
    queryKey: ['builder-source-sides', projectId, basis?.baseSourceRevision, basis?.resultSourceRevision, change?.path],
    queryFn: async () => {
      if (!basis || !change) throw new Error('SOURCE_DIFF_NOT_READY')
      const [before, after] = await Promise.all([
        readSide(projectId, basis.baseSourceRevision, change.status === 'ADDED' ? null : change.previousPath ?? change.path),
        readSide(projectId, basis.resultSourceRevision, change.status === 'REMOVED' ? null : change.path),
      ])
      return { before, after }
    },
    enabled: Boolean(basis && change),
  })

  if (!basis) return <p className="cx-lens-empty">Nenhuma execução alterou o código ainda. As alterações aparecem aqui quando o agente mudar o app.</p>
  if (comparison.isPending) return <div className="cx-lens-split"><Skeleton className="cx-skeleton" /><Skeleton className="cx-skeleton" /></div>
  if (comparison.isError) return <div className="cx-note" role="alert"><p>Não foi possível comparar as versões.</p><Button size="sm" onClick={() => void comparison.refetch()}>Tentar novamente</Button></div>
  if (!files.length) return <p className="cx-lens-empty">Esta execução não mudou nenhum arquivo.</p>

  return <div className="cx-lens-split">
    <nav className="cx-files" aria-label="Arquivos alterados">
      {runLabel && <p className="cx-files-caption">{runLabel}</p>}
      <ul className="cx-change-list">
        {files.map((entry) => <li key={entry.path}>
          <button type="button" className="cx-change" aria-pressed={entry.path === change?.path} onClick={() => setChosenPath(entry.path)}>
            <span className="cx-change-path">{entry.path}</span>
            <span className="cx-change-kind" data-status={entry.status}>{changeLabels[entry.status]}</span>
          </button>
        </li>)}
      </ul>
    </nav>
    <section className="cx-file" aria-label={change?.path ?? 'Arquivo'}>
      <header className="cx-file-head">
        <code>{change?.previousPath && change.status === 'RENAMED' ? `${change.previousPath} → ${change.path}` : change?.path}</code>
        <span className="cx-revision">{basis.baseSourceRevision.slice(0, 7)} → {basis.resultSourceRevision.slice(0, 7)}</span>
      </header>
      {sides.isPending && <Skeleton className="cx-skeleton" />}
      {sides.isError && <div className="cx-note" role="alert"><p>Não foi possível ler as duas versões deste arquivo.</p><Button size="sm" onClick={() => void sides.refetch()}>Tentar novamente</Button></div>}
      {sides.data && change && <Suspense fallback={<Skeleton className="cx-skeleton" />}>
        <DiffView key={`${basis.baseSourceRevision}:${basis.resultSourceRevision}:${change.path}`} path={change.path} before={sides.data.before} after={sides.data.after} />
      </Suspense>}
    </section>
  </div>
}
