import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import type { BuilderRun } from '../api'
import { compareProjectSource, retryBuilderRunPublish } from '../api'
import { getProject, projectQueryKey } from '../../project/api'
import { builderSessionKey } from '../builder-session'

// The runs that changed the app are the only ones worth a card: a response-only turn already speaks
// for itself in the message above it, and a run still in flight has no result yet.
export const showsResultCard = (run: BuilderRun): boolean =>
  run.resultKind === 'SOURCE_CHANGED' || run.resultKind === 'SOURCE_CHANGED_BUILD_FAILED' || run.resultKind === 'SOURCE_CHANGED_PUBLISH_FAILED'

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
  const publishFailed = run.resultKind === 'SOURCE_CHANGED_PUBLISH_FAILED'
  const queryClient = useQueryClient()
  // The retry reopens this run; the session read then follows it like any active run.
  const retry = useMutation({
    mutationFn: () => retryBuilderRunPublish(projectId, run.builderRunId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: builderSessionKey(projectId) }),
  })
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
      {projectName} · versão {versionNumber} · {built ? 'Build passou' : publishFailed ? 'Não publicada por uma falha do Conexus' : 'Build falhou'}
    </p>
    {publishFailed && <button type="button" className="cx-result-card-link" disabled={retry.isPending} onClick={() => retry.mutate()}>Tentar de novo</button>}
    {retry.isError && <p className="cx-note-line" role="alert">Esta versão não pode ser publicada de novo agora. Uma versão mais nova pode ter tomado o lugar dela.</p>}
    <div className="cx-result-card-actions">
      <button type="button" className="cx-result-card-link" onClick={onOpenPreview}>Ver aplicativo</button>
      <span className="cx-result-card-count">{fileCount === null ? '…' : `${fileCount} ${fileCount === 1 ? 'arquivo' : 'arquivos'}`}</span>
      <button type="button" className="cx-result-card-link" onClick={onOpenDiff}>Alterações</button>
    </div>
  </div>
}
