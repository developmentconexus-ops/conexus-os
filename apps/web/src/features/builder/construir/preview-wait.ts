import type { TaskSnapshot } from '../transcript.ts'
import { type ActiveRunView, activeLine, isWaiting } from './run-state'

/** What the Preview says while a first version does not exist yet: the phase, the agent's tasks and how long it has run. */
export type PreviewWait = Readonly<{ title: string; tasks: readonly TaskSnapshot[]; elapsedMs: number | null }>

/** What the conversation on screen knows about the run. A run in another conversation has none of it. */
export type WaitContext = Readonly<{ waiting: boolean; tasks: readonly TaskSnapshot[] }>

const title = (view: ActiveRunView, { waiting }: WaitContext): string => {
  if (waiting) return 'Esperando sua resposta'
  const working = view.run.phase === 'AGENT' || (view.run.phase === null && view.run.state === 'RUNNING')
  if (working) return 'Construindo o app'
  return activeLine(view)
}

export const previewWait = (view: ActiveRunView, context: WaitContext, now: number): PreviewWait => ({
  title: title(view, context),
  tasks: context.tasks,
  elapsedMs: isWaiting(view.run) ? null : now - new Date(view.run.createdAt).getTime(),
})
