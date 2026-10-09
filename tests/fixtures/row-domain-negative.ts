import type { z } from 'zod'
import type { ProjectCard, WorkspaceId } from '@conexus/contract'
import type { ActivityRow } from '../../apps/hub/src/builder/project-activity-row.js'
import type { RunRow } from '../../apps/hub/src/builder/run-row.js'
import type { DetailRow, ListRow } from '../../apps/hub/src/project/rows.js'

type Run = z.output<typeof RunRow>
type Card = ProjectCard
type Activity = z.output<typeof ActivityRow>
declare const base: Pick<Run, 'builderRunId' | 'projectId' | 'conversationId' | 'baseSourceRevision' | 'requestText' | 'createdAt' | 'cancellationRequested'>
declare function acceptRun(run: Run): void
declare function acceptCard(card: Card): void
declare const workspaceId: WorkspaceId
declare const live: Extract<Card, { state: 'live' }>
declare const active: Extract<Activity, { createdAt: Date }>
declare function acceptActivity(row: Activity): void

acceptRun({ ...base, state: 'SUCCEEDED', phase: null, resultSourceRevision: null, resultKind: 'RESPONSE_ONLY', failureCode: null })
// @ts-expect-error Success requires a result and cannot contain a failure.
acceptRun({ ...base, state: 'SUCCEEDED', phase: null, resultSourceRevision: null, resultKind: null, failureCode: 'DATABASE_BUSY' })
// @ts-expect-error A queued run cannot have a result source revision.
acceptRun({ ...base, state: 'QUEUED', phase: null, resultSourceRevision: base.baseSourceRevision, resultKind: null, failureCode: null })
// @ts-expect-error Failure requires a failure code.
acceptRun({ ...base, state: 'FAILED', phase: null, resultSourceRevision: null, resultKind: null, failureCode: null })
// @ts-expect-error An interrupted run cannot carry a live phase.
acceptRun({ ...base, state: 'INTERRUPTED', phase: 'PREPARING', resultSourceRevision: null, resultKind: null, failureCode: 'USER_CANCELLED' })
// @ts-expect-error A Workspace id cannot identify a Builder run.
acceptRun({ ...base, builderRunId: workspaceId, state: 'QUEUED', phase: null, resultSourceRevision: null, resultKind: null, failureCode: null })
// @ts-expect-error A Project id cannot identify a conversation.
acceptRun({ ...base, conversationId: base.projectId, state: 'QUEUED', phase: null, resultSourceRevision: null, resultKind: null, failureCode: null })
// @ts-expect-error Success cannot be the latest run without a result.
acceptActivity({ ...active, latestRun: { state: 'SUCCEEDED', resultKind: null } })
// @ts-expect-error An open run cannot carry a completed result.
acceptActivity({ ...active, latestRun: { state: 'RUNNING', resultKind: 'SOURCE_CHANGED' } })
// @ts-expect-error A Workspace id cannot identify a Project card.
acceptCard({ ...live, projectId: workspaceId })

declare const list: z.output<typeof ListRow>
declare const detail: z.output<typeof DetailRow>
if (list.state === 'deleting') {
  // @ts-expect-error A deleting Project has no archived field.
  list.archived
}
if (detail.state === 'deleting') {
  // @ts-expect-error A deleting Project has no revision.
  detail.projectRevision
}
declare const run: Run
if (run.state === 'QUEUED') {
  const result: null = run.resultKind
  const phase: null = run.phase
  void result
  void phase
}

declare const activity: Extract<Activity, { latestRun: null }>
// @ts-expect-error Missing latest run cannot carry an activity date.
acceptActivity({ ...activity, createdAt: new Date() })
// @ts-expect-error Missing latest run cannot carry its sort microseconds.
acceptActivity({ ...activity, sortAt: 1n })
// @ts-expect-error A present latest run requires both its date and microseconds.
acceptActivity({ ...activity, latestRun: { state: 'QUEUED', resultKind: null } })
