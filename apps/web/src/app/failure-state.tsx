import { Button } from '@mastra/playground-ui/components/Button'
import { failureText, isRetryable } from './http'

/** A screen that could not load: what failed in the table's words, and a button only when the row says waiting helps. */
export function FailureState({ title, error, onRetry }: Readonly<{ title: string; error: unknown; onRetry: () => void }>) {
  return <div className="cx-state" role="alert">
    <h2>{title}</h2>
    <p>{failureText(error)}</p>
    {isRetryable(error) && <Button type="button" variant="outline" onClick={onRetry}>Tentar de novo</Button>}
  </div>
}

/** The same inside a panel: one note under the thing that failed to load. */
export function FailureNotice({ title, error, onRetry }: Readonly<{ title: string; error: unknown; onRetry: () => void }>) {
  return <div className="cx-note" role="alert">
    <p>{title} {failureText(error)}</p>
    {isRetryable(error) && <Button size="sm" onClick={onRetry}>Tentar novamente</Button>}
  </div>
}
