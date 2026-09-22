import { ConexusMark } from '../../../../../../packages/brand/src/index'
import { elapsedLabel } from './run-state'

/**
 * What the header subtitle used to say, moved into the thread itself: the mark animates while the
 * agent is live, the line names the step (or the outcome once it settles), and stopping is the
 * composer's own button just below, so there is exactly one "Parar" control on screen.
 */
export function WorkingState({ line, working, elapsedMs }: Readonly<{
  line: string
  working: boolean
  elapsedMs: number | null
}>) {
  return <div className="cx-working" data-active={working || undefined} role="status" aria-live="polite">
    <ConexusMark size={16} working={working} />
    <p className="cx-chat-step">{line}{working && elapsedMs !== null && <span className="cx-elapsed"> · há {elapsedLabel(elapsedMs)}</span>}</p>
  </div>
}
