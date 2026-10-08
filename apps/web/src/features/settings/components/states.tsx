import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import type { ReactNode } from 'react'

import { failureText, isRetryable } from '@conexus/contract'
export function SectionLoading({ rows = 3 }: Readonly<{ rows?: number }>) {
  // A pure loading placeholder: rows never reorder or get removed individually, so the position
  // is a stable identity here.
  return <div className="cxs-loading" aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => `cxs-skeleton-${index}`).map((key) => <Skeleton key={key} className="cxs-loading-row" />)}
  </div>
}

export function SectionError({ description, error, onRetry }: Readonly<{ description: string; error: unknown; onRetry: () => void }>) {
  return <div className="cxs-error" role="alert">
    <p>{description} {failureText(error)}</p>
    {isRetryable(error) && <Button type="button" variant="outline" onClick={onRetry}>Tentar de novo</Button>}
  </div>
}

export function SectionEmpty({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="cxs-empty">{children}</p>
}

export function StatusLine({ tone = 'positive', children }: Readonly<{ tone?: 'positive' | 'danger'; children: ReactNode }>) {
  if (tone === 'danger') return <p className="cxs-alert" role="alert">{children}</p>
  return <p className="cxs-status" role="status">{children}</p>
}

export type ChipTone = 'positive' | 'warning' | 'neutral'

const CHIP_CLASS = { positive: 'cxs-chip-positive', warning: 'cxs-chip-warning', neutral: 'cxs-chip-neutral' } as const

export function Chip({ tone, children }: Readonly<{ tone: ChipTone; children: ReactNode }>) {
  return <span className={`cxs-chip ${CHIP_CLASS[tone]}`}><span className="cxs-chip-dot" aria-hidden="true" />{children}</span>
}
