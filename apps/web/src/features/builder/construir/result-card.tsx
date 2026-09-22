import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import type { BuilderRun } from '../api'
import { compareProjectSource } from '../api'
import { getProject, projectQueryKey } from '../../project/api'

// The runs that changed the app are the only ones worth a card: a response-only turn already speaks
// for itself in the message above it, and a run still in flight has no result yet.
export const showsResultCard = (run: BuilderRun): boolean =>
  run.resultKind === 'SOURCE_CHANGED' || run.resultKind === 'SOURCE_CHANGED_BUILD_FAILED'

/** The card that closes out a code-changing turn: what changed, whether it built, and where to look. */
export function ResultCard({ projectId, run, versionNumber, onOpenPreview, onOpenDiff }: Readonly<{
  projectId: string
  run: BuilderRun
  /** This run's 1-based position among the Project's own code-changing runs, oldest first. */
  versionNumber: number
  onOpenPreview: () => void
  onOpenDiff: () => void
}>) {
  const project = useQuery({ queryKey: projectQueryKey(projectId), queryFn: () => getProject(projectId) })
  const built = run.resultKind === 'SOURCE_CHANGED'
  const diff = useQuery({
    queryKey: ['builder-result-diff', projectId, run.baseSourceRevision, run.resultSourceRevision],
    queryFn: () => compareProjectSource(projectId, run.baseSourceRevision, run.resultSourceRevision ?? run.baseSourceRevision),
    enabled: Boolean(run.resultSourceRevision),
  })
  const fileCount = diff.data?.files.length ?? null
  const projectName = project.data?.name ?? 'Projeto'

  return <div className="cx-result-card">
    <p className="cx-result-card-title" data-tone={built ? undefined : 'danger'}>
      {built && <Check size={15} className="cx-result-card-check" aria-hidden="true" />}
      {projectName} · versão {versionNumber} · {built ? 'Build passou' : 'Build falhou'}
    </p>
    <div className="cx-result-card-actions">
      <button type="button" className="cx-result-card-link" onClick={onOpenPreview}>Ver aplicativo</button>
      <span className="cx-result-card-count">{fileCount === null ? '…' : `${fileCount} ${fileCount === 1 ? 'arquivo' : 'arquivos'}`}</span>
      <button type="button" className="cx-result-card-link" onClick={onOpenDiff}>Alterações</button>
    </div>
  </div>
}
