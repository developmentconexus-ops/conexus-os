import { randomUUID } from 'node:crypto'
import type { Database } from '../platform/db.js'
import { createConversationStore, type ConversationStore } from './conversation-store.js'
import { createRunLease, type RunLease } from './run-lease.js'
import { createRunReads, type RunReads } from './run-reads.js'
import { createRunStart, type RunStart } from './run-start.js'
import { createRunSteps, type RunSteps } from './run-steps.js'

export type { BuilderRunSummary, BuilderRunView } from './run-row.js'
export type { TakenOverRun } from './run-lease.js'
export type { InterruptionCode } from './run-steps.js'

export type BuilderStore = ConversationStore & RunStart & RunSteps & RunReads & RunLease & Readonly<{
  /** This Hub process as the owner of the runs it works. */
  ownerId: string
}>

export const createBuilderStore = ({
  database,
  ownerId,
  mintIdentity = randomUUID,
}: Readonly<{
  database: Database
  ownerId: string
  mintIdentity?: () => string
}>): BuilderStore => Object.freeze({
  ownerId,
  ...createConversationStore({ database, ownerId }),
  ...createRunStart({ database, mintIdentity }),
  ...createRunSteps({ database, ownerId }),
  ...createRunReads({ database }),
  ...createRunLease({ database }),
})
