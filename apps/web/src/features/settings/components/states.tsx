import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import type { ReactNode } from 'react'

export function SectionLoading({ rows = 3 }: Readonly<{ rows?: number }>) {
  // A pure loading placeholder: rows never reorder or get removed individually, so the position
  // is a stable identity here.
  return <div className="cxs-loading" aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => `cxs-skeleton-${index}`).map((key) => <Skeleton key={key} className="cxs-loading-row" />)}
  </div>
}

export function SectionError({ description, onRetry }: Readonly<{ description: string; onRetry: () => void }>) {
  return <div className="cxs-error" role="alert">
    <p>{description}</p>
    <Button type="button" variant="outline" onClick={onRetry}>Tentar de novo</Button>
  </div>
}

export function SectionEmpty({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="cxs-empty">{children}</p>
}

export function StatusLine({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="cxs-status" role="status">{children}</p>
}

export type ChipTone = 'positive' | 'warning' | 'neutral'

export function Chip({ tone, children }: Readonly<{ tone: ChipTone; children: ReactNode }>) {
  return <span className={`cxs-chip cxs-chip-${tone}`}><span className="cxs-chip-dot" aria-hidden="true" />{children}</span>
}
