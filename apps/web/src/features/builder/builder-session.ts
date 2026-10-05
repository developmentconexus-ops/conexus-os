import { type QueryClient, useQuery } from '@tanstack/react-query'
import { type BuilderRun, type BuilderSession, getBuilderSession } from './api'
import type { BuilderRunView } from '../../../../../packages/contract/dist/index.js'
import { isActive, isWaiting } from './construir/run-state'

// One cache entry holds the Project's run, written by two sources: the builder-session read, and the
// run the Hub publishes into the stream of the conversation on screen. The stream is the live one;
// the read is the record and the resync, and it runs often only while the stream is down.

export const builderSessionKey = (projectId: string) => ['builder-session', projectId] as const

// A stream write that lands while a read is in flight is newer than that read's answer, so the
// generation the read started at tells it whether to keep the streamed run over its own.
// Ported from the Factory's useAgentControllerSessionSync (generation and live state).
type LiveRun = { generation: number; run: BuilderRunView | null }
const liveRuns = new Map<string, LiveRun>()
const liveRunOf = (projectId: string): LiveRun => {
  let live = liveRuns.get(projectId)
  if (!live) {
    live = { generation: 0, run: null }
    liveRuns.set(projectId, live)
  }
  return live
}

const settled = (before: BuilderRun | null | undefined, after: BuilderRun | null | undefined): boolean =>
  Boolean(before && after && before.builderRunId === after.builderRunId && isActive(before) && !isActive(after))

// The one place a run's end is acted on, whichever source saw it first: what the run changed is read
// again, its thread, the conversation titles and the memory it stored.
const runSettled = (queryClient: QueryClient, projectId: string, rereadSession: boolean): void => {
  if (rereadSession) void queryClient.invalidateQueries({ queryKey: builderSessionKey(projectId) })
  void queryClient.invalidateQueries({ queryKey: ['builder-thread-messages', projectId] })
  void queryClient.invalidateQueries({ queryKey: ['project-conversations', projectId] })
  void queryClient.invalidateQueries({ queryKey: ['builder-session-model', projectId] })
}

// A run that waits on a question stored the open call in its thread message, so the thread is read
// again once when the wait starts, whichever source saw that first. Without it a window read before
// the wait keeps showing the question as a failed row.
const waitingNow = (before: BuilderRun | null | undefined, after: BuilderRun | null | undefined): boolean =>
  isWaiting(after) && !(isWaiting(before) && before?.builderRunId === after?.builderRunId)

const questionAsked = (queryClient: QueryClient, projectId: string): void => {
  void queryClient.invalidateQueries({ queryKey: ['builder-thread-messages', projectId] })
}

/** Writes the run the stream carried, keeping when the entry was last read so the poll keeps its pace. */
export const writeStreamedRun = (queryClient: QueryClient, projectId: string, run: BuilderRunView): void => {
  const live = liveRunOf(projectId)
  live.generation += 1
  live.run = run
  const key = builderSessionKey(projectId)
  const before = queryClient.getQueryData<BuilderSession>(key)?.latestBuilderRun
  const updatedAt = queryClient.getQueryState(key)?.dataUpdatedAt
  queryClient.setQueryData<BuilderSession>(key, (current) => current ? { ...current, latestBuilderRun: run } : current, updatedAt ? { updatedAt } : {})
  if (settled(before, run)) runSettled(queryClient, projectId, true)
  if (waitingNow(before, run)) questionAsked(queryClient, projectId)
}

/**
 * The Project's builder session. It is read only while a run is active: every 2 s while one works in
 * another conversation, and while one works here every 15 s with the stream open, or every second,
 * backing off on failures, with it down. The stream stays open while the run is open, waiting on the
 * person included, and the Hub publishes each change of the run into it.
 */
export const useBuilderSession = (queryClient: QueryClient, projectId: string, conversationId: string, streamOpen: boolean) => useQuery({
  queryKey: builderSessionKey(projectId),
  queryFn: async (): Promise<BuilderSession> => {
    const live = liveRunOf(projectId)
    const generation = live.generation
    const before = queryClient.getQueryData<BuilderSession>(builderSessionKey(projectId))?.latestBuilderRun
    const read = await getBuilderSession(projectId)
    const overtaken = generation !== live.generation && live.run !== null
    const session = overtaken ? { ...read, latestBuilderRun: live.run } : read
    if (settled(before, session.latestBuilderRun)) runSettled(queryClient, projectId, false)
    if (waitingNow(before, session.latestBuilderRun)) questionAsked(queryClient, projectId)
    return session
  },
  refetchInterval: (query) => {
    const latest = query.state.data?.latestBuilderRun
    if (!isActive(latest)) return false
    if (latest.conversationId !== conversationId) return 2_000
    if (streamOpen) return 15_000
    return Math.min(1_000 * 2 ** query.state.fetchFailureCount, 30_000)
  },
})
