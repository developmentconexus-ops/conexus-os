import type { AccountId, ProjectId } from '@conexus/contract'
import type { Admitted, SystemScope } from './types.js'
import type { DeletionPorts } from './data.js'
import type { Database } from '../../../../apps/hub/src/platform/db.js'

export type PurgePorts = Readonly<{
  identityAccess(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void>
  bindings(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void>
  registry(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void>
  builder(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void>
  receipts(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void>
}>
// Private implementation signature: locks record/Project, purges, removes Project and completes atomically.
declare function finalizeDeletion(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId, ports: PurgePorts): Promise<void>
export type DeletionDriver = (input: Readonly<{ accountId: AccountId; projectId: ProjectId; confirmName: string }>) => Promise<void>
export declare function createProjectDeletion(deps: Readonly<{ database: Database; ports: DeletionPorts; purges: PurgePorts }>): Readonly<{ deleteProject: DeletionDriver }>

export type ConversationCleanup = Readonly<{
  drop(projectId: ProjectId, conversationIds: readonly import('@conexus/contract').ConversationId[]): Promise<void>
}>
// Native sessions must close successfully before their persisted threads are deleted.
// A thrown native teardown error propagates; an already absent native session is success.
export type Conversations = Readonly<{
  deleteAll(input: Readonly<{ projectId: ProjectId; beforeDelete(conversationIds: readonly import('@conexus/contract').ConversationId[]): Promise<void> }>): Promise<void>
}>
