import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { Button } from '@mastra/playground-ui/components/Button'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { projectThumbnailUrl, type ProjectCardSummary } from '../api'

export type ProjectActivity = 'BUILDING' | 'FAILED' | 'LIVE' | 'NEW'

// The chip reads the latest run the Hub reports, and falls back to whether a Preview exists.
export function projectActivity(summary: ProjectCardSummary): ProjectActivity {
  const run = summary.latestRun
  if (run?.state === 'QUEUED' || run?.state === 'RUNNING') return 'BUILDING'
  if (run?.state === 'FAILED' || run?.resultKind === 'SOURCE_CHANGED_BUILD_FAILED') return 'FAILED'
  return summary.hasPreview ? 'LIVE' : 'NEW'
}

const CHIPS: Record<ProjectActivity, Readonly<{ label: string; tone: string }>> = {
  BUILDING: { label: 'Construindo', tone: 'working' },
  FAILED: { label: 'Falhou: build do aplicativo', tone: 'failed' },
  LIVE: { label: 'Em uso', tone: 'live' },
  NEW: { label: 'Sem prévia ainda', tone: 'neutral' },
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' })
const STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [['minute', 60], ['hour', 24], ['day', 30], ['month', 12], ['year', Number.POSITIVE_INFINITY]]

function lastChangeLabel(iso: string, now: number = Date.now()): string {
  let value = (new Date(iso).getTime() - now) / 60_000
  if (Math.abs(value) < 1) return 'Alterado agora'
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return `Alterado ${relative.format(Math.round(value), unit)}`
    value /= size
  }
  return 'Alterado há muito tempo'
}

function PreviewThumbnail({ projectId, name, hasPreview }: Readonly<{ projectId: string; name: string; hasPreview: boolean }>) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return <div className="cx-thumb" data-loaded={loaded && !error ? true : undefined}>
    <div className="cx-thumb-placeholder" aria-hidden>
      <ConexusMark size={28} />
    </div>
    {hasPreview && !error && (
      <img
        src={projectThumbnailUrl(projectId)}
        alt={`Prévia de ${name}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    )}
  </div>
}

// A tombstoned Project cannot open the Construir page anymore: its data may already be purged, so
// the card instead points at the settings screen's own recovery view, the only place left to finish
// or watch the deletion the administrator started.
function DeletingProjectCard({ summary }: Readonly<{ summary: ProjectCardSummary }>) {
  return <li className="cx-project-cell">
    <Link to="/projects/$projectId/settings" params={{ projectId: summary.projectId }} className="cx-project-card">
      <div className="cx-thumb" data-loaded>
        <div className="cx-thumb-placeholder" aria-hidden><ConexusMark size={28} /></div>
      </div>
      <div className="cx-project-body">
        <h3>{summary.name}</h3>
        <div className="cx-project-meta">
          <span className="cx-chip" data-tone="failed">Exclusão pendente</span>
          <span className="cx-project-time">{lastChangeLabel(summary.lastActivityAt)}</span>
        </div>
      </div>
    </Link>
  </li>
}

function ProjectCard({ summary }: Readonly<{ summary: ProjectCardSummary }>) {
  if (summary.deleting) return <DeletingProjectCard summary={summary} />
  const activity = projectActivity(summary)
  const chip = CHIPS[activity]
  return <li className="cx-project-cell">
    <Link to="/projects/$projectId" params={{ projectId: summary.projectId }} className="cx-project-card">
      <PreviewThumbnail projectId={summary.projectId} name={summary.name} hasPreview={summary.hasPreview} />
      <div className="cx-project-body">
        <h3>{summary.name}</h3>
        <div className="cx-project-meta">
          <span className="cx-chip" data-tone={chip.tone}>
            {activity === 'BUILDING' && <ConexusMark size={12} working />}
            {chip.label}
          </span>
          <span className="cx-project-time">{lastChangeLabel(summary.lastActivityAt)}</span>
        </div>
      </div>
    </Link>
  </li>
}

export function ProjectGridSkeleton() {
  return <ul className="cx-project-grid" aria-hidden>
    {[0, 1, 2].map((index) => (
      <li key={index} className="cx-project-cell">
        <div className="cx-project-card cx-project-card--skeleton">
          <Skeleton className="cx-thumb" />
          <div className="cx-project-body"><Skeleton className="cx-skeleton-line" /><Skeleton className="cx-skeleton-line cx-skeleton-line--short" /></div>
        </div>
      </li>
    ))}
  </ul>
}

export function ProjectGridFailure({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return <div className="cx-state" role="alert">
    <h2>Não foi possível carregar os Projetos</h2>
    <p>Seus Projetos continuam onde estavam. O servidor não respondeu desta vez.</p>
    <Button type="button" variant="outline" onClick={onRetry}>Tentar de novo</Button>
  </div>
}

export function ProjectGrid({ projects }: Readonly<{ projects: readonly ProjectCardSummary[] }>) {
  return <ul className="cx-project-grid">
    {projects.map((summary) => <ProjectCard key={summary.projectId} summary={summary} />)}
  </ul>
}
