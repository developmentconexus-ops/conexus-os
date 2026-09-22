import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { type BuilderRun, compareProjectSource, getProjectSourceFile, type SourceChange } from '../api'
import './lens-surfaces.css'

const DiffView = lazy(() => import('./code-surfaces').then((module) => ({ default: module.DiffView })))
const DiffViewSideBySide = lazy(() => import('./code-surfaces').then((module) => ({ default: module.DiffViewSideBySide })))

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

type FileSides = Readonly<{ before: string; after: string; added: number; removed: number }>
type DiffMode = 'unified' | 'split'

export function LensDiff({ projectId, basis, runLabel }: Readonly<{ projectId: string; basis: ChangeBasis | null; runLabel: string | null }>) {
  const [chosenPath, setChosenPath] = useState<string | null>(null)
  const [mode, setMode] = useState<DiffMode>('unified')
  const comparison = useQuery({
    queryKey: ['builder-source-compare', projectId, basis?.baseSourceRevision, basis?.resultSourceRevision],
    queryFn: () => compareProjectSource(projectId, basis?.baseSourceRevision ?? '', basis?.resultSourceRevision ?? ''),
    enabled: Boolean(basis),
  })
  const files = comparison.data?.files ?? []
  const change = files.find((entry) => entry.path === chosenPath) ?? files.at(0) ?? null

  // Every file's both sides, read once per comparison. This is what a per-file line count needs,
  // and the selected file's panel reuses the same fetch instead of asking for it twice.
  const sides = useQuery({
    queryKey: ['builder-source-sides', projectId, basis?.baseSourceRevision, basis?.resultSourceRevision, files.map((entry) => entry.path)],
    queryFn: async (): Promise<ReadonlyMap<string, FileSides>> => {
      if (!basis) throw new Error('SOURCE_DIFF_NOT_READY')
      const { lineCounts } = await import('./code-surfaces')
      const entries = await Promise.all(files.map(async (entry) => {
        const [before, after] = await Promise.all([
          readSide(projectId, basis.baseSourceRevision, entry.status === 'ADDED' ? null : entry.previousPath ?? entry.path),
          readSide(projectId, basis.resultSourceRevision, entry.status === 'REMOVED' ? null : entry.path),
        ])
        return [entry.path, { before, after, ...lineCounts(before, after) }] as const
      }))
      return new Map(entries)
    },
    enabled: Boolean(basis && files.length),
  })
  const selectedSides = change ? sides.data?.get(change.path) ?? null : null
  const totals = sides.data ? [...sides.data.values()].reduce((sum, entry) => ({ added: sum.added + entry.added, removed: sum.removed + entry.removed }), { added: 0, removed: 0 }) : null

  if (!basis) return <p className="cx-lens-empty">Nenhuma execução alterou o código ainda. As alterações aparecem aqui quando o agente mudar o app.</p>
  if (comparison.isPending) return <div className="cx-lens-split"><Skeleton className="cx-skeleton" /><Skeleton className="cx-skeleton" /></div>
  if (comparison.isError) return <div className="cx-note" role="alert"><p>Não foi possível comparar as versões.</p><Button size="sm" onClick={() => void comparison.refetch()}>Tentar novamente</Button></div>
  if (!files.length) return <p className="cx-lens-empty">Esta execução não mudou nenhum arquivo.</p>

  return <div className="cx-diff-lens">
    <header className="cx-diff-head">
      {runLabel && <p className="cx-files-caption">{runLabel}</p>}
      <div className="cx-diff-headrow">
        <p className="cx-diff-summary">
          {files.length} {files.length === 1 ? 'arquivo alterado' : 'arquivos alterados'}
          {totals && <>
            <span className="cx-diff-add"> +{totals.added}</span>
            <span className="cx-diff-del"> −{totals.removed}</span>
          </>}
        </p>
        <fieldset className="cx-seg">
          <legend className="cx-sr">Modo do diff</legend>
          <button type="button" aria-pressed={mode === 'unified'} onClick={() => setMode('unified')}>Unificado</button>
          <button type="button" aria-pressed={mode === 'split'} onClick={() => setMode('split')}>Lado a lado</button>
        </fieldset>
      </div>
    </header>
    <div className="cx-lens-split">
      <nav className="cx-files" aria-label="Arquivos alterados">
        <ul className="cx-change-list">
          {files.map((entry) => {
            const counts = sides.data?.get(entry.path)
            return <li key={entry.path}>
              <button type="button" className="cx-change" aria-pressed={entry.path === change?.path} onClick={() => setChosenPath(entry.path)}>
                <span className="cx-change-path">{entry.path}</span>
                <span className="cx-change-counts">
                  {counts && counts.added > 0 && <span className="cx-diff-add">+{counts.added}</span>}
                  {counts && counts.removed > 0 && <span className="cx-diff-del">−{counts.removed}</span>}
                </span>
                <span className="cx-change-kind" data-status={entry.status}>{changeLabels[entry.status]}</span>
              </button>
            </li>
          })}
        </ul>
      </nav>
      <section className="cx-file" aria-label={change?.path ?? 'Arquivo'}>
        <header className="cx-file-head">
          <code>{change?.previousPath && change.status === 'RENAMED' ? `${change.previousPath} → ${change.path}` : change?.path}</code>
          <span className="cx-revision">{basis.baseSourceRevision.slice(0, 7)} → {basis.resultSourceRevision.slice(0, 7)}</span>
        </header>
        {sides.isPending && <Skeleton className="cx-skeleton" />}
        {sides.isError && <div className="cx-note" role="alert"><p>Não foi possível ler as duas versões deste arquivo.</p><Button size="sm" onClick={() => void sides.refetch()}>Tentar novamente</Button></div>}
        {selectedSides && change && <Suspense fallback={<Skeleton className="cx-skeleton" />}>
          {mode === 'unified'
            ? <DiffView key={`${basis.baseSourceRevision}:${basis.resultSourceRevision}:${change.path}`} path={change.path} before={selectedSides.before} after={selectedSides.after} />
            : <DiffViewSideBySide key={`${basis.baseSourceRevision}:${basis.resultSourceRevision}:${change.path}:split`} path={change.path} before={selectedSides.before} after={selectedSides.after} />}
        </Suspense>}
      </section>
    </div>
  </div>
}
