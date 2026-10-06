import { randomUUID } from 'node:crypto'
import type { Database } from '../platform/db.js'
import type { BuilderRegistry } from './application-build.js'
import { createConversationStore, type ConversationStore } from './conversation-store.js'
import { createRunLease, type RunLease } from './run-lease.js'
import { createRunReads, type RunReads } from './run-reads.js'
import { createRunStart, createRunSteps, type RunStart, type RunSteps } from './run-lifecycle.js'
import { createPreviewState, type PreviewState } from './preview-state.js'

export type { BuilderRunSummary, BuilderRunView } from './run-row.js'
export type { TakenOverRun } from './run-lease.js'
export type { InterruptionCode } from './run-lifecycle.js'

export type BuilderStore = ConversationStore & RunStart & RunSteps & RunReads & PreviewState & RunLease & Readonly<{
  /** This Hub process as the owner of the runs it works. */
  ownerId: string
}>

export const createBuilderStore = ({
  database,
  ownerId,
  registry,
  mintIdentity = randomUUID,
}: Readonly<{
  database: Database
  ownerId: string
  registry: Pick<BuilderRegistry, 'retain' | 'readLaunch'>
  mintIdentity?: () => string
}>): BuilderStore => Object.freeze({
  ownerId,
  ...createConversationStore({ database, ownerId }),
  ...createRunStart({ database, mintIdentity }),
  ...createRunSteps({ database, ownerId, registry }),
  ...createRunReads({ database }),
  ...createPreviewState({ database, registry }),
  ...createRunLease({ database, ownerId }),
})
