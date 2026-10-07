import type { AccountId, ProjectId } from '@conexus/contract'
import type { Admitted, SystemScope } from './types.js'
import type { DeletionPorts } from './data.js'
import type { Database, Sql } from '../../../../apps/hub/src/platform/db.js'

// Produces the existing hashtextextended SQL expression; initial admitted transaction evaluates it.
export declare function deletionLockKey(projectId: ProjectId): Sql
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
export declare function createDeletionDriver(database: Database, ports: DeletionPorts, purges: PurgePorts): DeletionDriver
export type ProjectSessions = Readonly<{
  withOpen<T>(projectId: ProjectId, open: () => Promise<T>): Promise<T>
  seal(projectId: ProjectId, begin: () => Promise<void>): Promise<void>
}>
