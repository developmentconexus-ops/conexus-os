import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { Button } from '@mastra/playground-ui/components/Button'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { launchBuilderPreview } from '../../builder/api'
import type { ProjectCardSummary } from '../api'

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
  FAILED: { label: 'Falhou', tone: 'failed' },
  LIVE: { label: 'Em uso', tone: 'live' },
  NEW: { label: 'Sem prévia ainda', tone: 'neutral' },
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' })
const STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [['minute', 60], ['hour', 24], ['day', 30], ['month', 12], ['year', Number.POSITIVE_INFINITY]]

export function lastChangeLabel(iso: string, now: number = Date.now()): string {
  let value = (new Date(iso).getTime() - now) / 60_000
  if (Math.abs(value) < 1) return 'Última alteração agora'
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return `Última alteração ${relative.format(Math.round(value), unit)}`
    value /= size
  }
  return 'Última alteração há muito tempo'
}

// The Preview renders at this desktop width and is scaled to the card, whatever the card's size.
const PREVIEW_WIDTH = 1280

function useThumbnailFrame<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const intersection = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
    }, { rootMargin: '200px' })
    const resize = new ResizeObserver(([entry]) => {
      if (entry) element.style.setProperty('--cx-thumb-scale', String(entry.contentRect.width / PREVIEW_WIDTH))
    })
    intersection.observe(element)
    resize.observe(element)
    return () => {
      intersection.disconnect()
      resize.disconnect()
    }
  }, [])
  return [ref, visible] as const
}

function PreviewThumbnail({ projectId, name, hasPreview }: Readonly<{ projectId: string; name: string; hasPreview: boolean }>) {
  const [ref, visible] = useThumbnailFrame<HTMLDivElement>()
  const [loaded, setLoaded] = useState(false)
  const entered = useRef(false)
  const entryForm = useRef<HTMLFormElement>(null)
  const frameName = `cx-thumb-${projectId}`
  // The entry grant is spent by its first use, so every mounted card launches its own and the
  // result is never served from the cache to a later mount.
  const preview = useQuery({
    queryKey: ['project-thumbnail', projectId],
    queryFn: () => launchBuilderPreview(projectId),
    enabled: hasPreview && visible,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
  // The Preview host only admits a POST carrying the grant, the same entry the Construir Preview
  // uses. The blank frame's own load fires on insertion, before React listens, so the first load
  // observed after the post is the Preview.
  useEffect(() => {
    if (!preview.data || entered.current) return
    entered.current = true
    entryForm.current?.submit()
  }, [preview.data])
  const onFrameLoad = () => {
    if (entered.current) setLoaded(true)
  }
  return <div className="cx-thumb" ref={ref} data-loaded={loaded || undefined}>
    <div className="cx-thumb-placeholder" aria-hidden>
      <ConexusMark size={28} />
    </div>
    {preview.data && <>
      <iframe
        title={`Prévia de ${name}`}
        name={frameName}
        aria-hidden
        tabIndex={-1}
        src="about:blank"
        onLoad={onFrameLoad}
      />
      <form ref={entryForm} hidden method="post" action={preview.data.entryUrl} target={frameName}>
        <input type="hidden" name="entryGrant" value={preview.data.entryGrant} />
      </form>
    </>}
  </div>
}

function ProjectCard({ summary }: Readonly<{ summary: ProjectCardSummary }>) {
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
