import {
  BindingId, BindingName, ConnectionId, ConnectorIdText, type ProjectId,
  type AccountId, type createWorkspaceConnection, type FailureCode, type bindProjectConnection, type ConnectionBinding, type ConnectionBindingEntry, type ConnectorConnection, type Input, type WorkspaceId,
} from '@conexus/contract'
import {
  admitInstallationAdministrator, admitProject, checkApplication,
  type Admitted, type ApplicationScope, type Checked, type ProjectScope, type SystemScope,
} from '../identity-access/admission.js'
import type { Database, Mode } from '../platform/db.js'
import { sql } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import type { SecretEnvelope } from '../platform/secrets.js'
import type { ConsumerScope } from './scope.js'

const ConnectionRow = z.object({
  connection_id: ConnectionId, connector_id: ConnectorIdText, label: z.string(), created_at: z.date(), disabled_at: z.date().nullable(),
})
const StoredConnection = ConnectionRow.extend({ credential_digest: z.string() })
const BindingRow = z.object({
  binding_id: BindingId, name: BindingName, connection_id: ConnectionId, connector_id: ConnectorIdText, label: z.string(), bound_at: z.date(),
})
const EntryRow = z.discriminatedUnion('kind', [
  BindingRow.extend({ kind: z.literal('binding') }),
  z.object({ kind: z.literal('bindable'), connection_id: ConnectionId, connector_id: ConnectorIdText, label: z.string() }),
])
const Present = z.object({ present: z.literal(1) })
const BindingIdRow = z.object({ binding_id: BindingId })
const CredentialRow = z.object({ connector_id: ConnectorIdText, credential_sealed: z.string() })
const SealedRow = z.object({ credential_sealed: z.string() })
const BoundRow = z.object({ binding_id: BindingId, name: BindingName, connection_id: ConnectionId, connector_id: ConnectorIdText })

/** Preview and the application host both read the one environment the column accepts. */
const ENVIRONMENT = 'preview'

const toConnection = (row: z.output<typeof ConnectionRow>): ConnectorConnection => ({
  connectionId: row.connection_id,
  connectorId: row.connector_id,
  label: row.label,
  createdAt: row.created_at.toISOString(),
  ...(row.disabled_at ? { disabledAt: row.disabled_at.toISOString() } : {}),
})

const toBinding = (row: z.output<typeof BindingRow>): ConnectionBinding => ({
  kind: 'binding',
  bindingId: row.binding_id,
  name: row.name,
  connectionId: row.connection_id,
  connectorId: row.connector_id,
  label: row.label,
  boundAt: row.bound_at.toISOString(),
})

const toEntry = (row: z.output<typeof EntryRow>): ConnectionBindingEntry => row.kind === 'binding'
  ? toBinding(row)
  : { kind: 'bindable', connectionId: row.connection_id, connectorId: row.connector_id, label: row.label }

// An archived Project refuses every binding operation, as one in deletion does through its admission.
const requireOpenProject = async <M extends Mode>(proof: Admitted<ProjectScope<'connections.bind'>, M>): Promise<void> => {
  const { tx, scope } = proof
  const found = await tx.maybe(Present, sql`
    SELECT 1 AS present FROM project.project AS stored
    WHERE stored.project_id = ${scope.projectId} AND NOT stored.archived
      AND NOT EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = stored.project_id)`)
  if (!found) throw new Failure('PROJECT_NOT_FOUND')
}

export type ConnectorStore = Readonly<{
  listConnections(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId }>): Promise<ConnectorConnection[]>
  createConnection(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId; body: Input<typeof createWorkspaceConnection>['body'] }>): Promise<Readonly<{ connection: ConnectorConnection; created: boolean }>>
  /** The sealed credential of an enabled Connection, read in the administrator's own transaction, which ends before any provider call. */
  readCredentialForCheck(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId; connectionId: ConnectionId }>): Promise<Readonly<{ connectorId: string; sealed: string }>>
  disableConnection(input: Readonly<{ accountId: AccountId; workspaceId: WorkspaceId; connectionId: ConnectionId }>): Promise<void>
  listProjectBindings(input: Readonly<{ accountId: AccountId; projectId: ProjectId }>): Promise<ConnectionBindingEntry[]>
  bindConnection(input: Readonly<{ accountId: AccountId; projectId: ProjectId; body: Input<typeof bindProjectConnection>['body'] }>): Promise<Readonly<{ binding: ConnectionBinding; created: boolean }>>
  unbindConnection(input: Readonly<{ accountId: AccountId; projectId: ProjectId; bindingId: BindingId }>): Promise<void>
}>

export const createConnectorStore = ({ database, envelope }: Readonly<{ database: Database; envelope: SecretEnvelope }>): ConnectorStore => Object.freeze({
  listConnections: ({ accountId, workspaceId }) => database.read(accountId, async (gate) => {
    const proof = await admitInstallationAdministrator(gate, { action: 'connection.manage', workspaceId })
    return (await proof.tx.rows(ConnectionRow, sql`
      SELECT connection_id, connector_id, label, created_at, disabled_at FROM connector.connection
      WHERE workspace_id = ${workspaceId} ORDER BY created_at`)).map(toConnection)
  }),

  createConnection: async ({ accountId, workspaceId, body }) => {
    const sealed = await envelope.seal(JSON.stringify(body.credential))
    // Sorted keys, so a retry that sends the same fields in another order has the same digest.
    const digests = envelope.fingerprints(JSON.stringify(body.credential, Object.keys(body.credential).sort()))
    const [current] = digests
    return database.transaction(accountId, async (gate) => {
      const proof = await admitInstallationAdministrator(gate, { action: 'connection.manage', workspaceId })
      const inserted = await proof.tx.run(sql`
        INSERT INTO connector.connection (connection_id, workspace_id, connector_id, label, credential_sealed, credential_digest, created_by)
        VALUES (${body.connectionId}, ${workspaceId}, ${body.connectorId}, ${body.label}, ${sealed}, ${current}, ${proof.scope.accountId})
        ON CONFLICT DO NOTHING`)
      const stored = await proof.tx.maybe(StoredConnection, sql`
        SELECT connection_id, connector_id, label, created_at, disabled_at, credential_digest FROM connector.connection
        WHERE connection_id = ${body.connectionId} AND workspace_id = ${workspaceId}`)
      // No stored row after a no op insert: the id belongs to another Workspace.
      if (!stored) throw new Failure('CONNECTOR_CONNECTION_CONFLICT')
      if (inserted === 0 && (stored.connector_id !== body.connectorId || stored.label !== body.label || !digests.includes(stored.credential_digest))) {
        throw new Failure('CONNECTOR_CONNECTION_CONFLICT')
      }
      return { connection: toConnection(stored), created: inserted === 1 }
    })
  },

  readCredentialForCheck: ({ accountId, workspaceId, connectionId }) => database.transaction(accountId, async (gate) => {
    const proof = await admitInstallationAdministrator(gate, { action: 'connection.manage', workspaceId })
    const found = await proof.tx.maybe(CredentialRow, sql`
      SELECT connector_id, credential_sealed FROM connector.connection
      WHERE connection_id = ${connectionId} AND workspace_id = ${workspaceId} AND disabled_at IS NULL`)
    if (!found) throw new Failure('CONNECTOR_CONNECTION_NOT_FOUND')
    return { connectorId: found.connector_id, sealed: found.credential_sealed }
  }),

  disableConnection: ({ accountId, workspaceId, connectionId }) => database.transaction(accountId, async (gate) => {
    const proof = await admitInstallationAdministrator(gate, { action: 'connection.manage', workspaceId })
    const disabled = await proof.tx.run(sql`
      UPDATE connector.connection SET disabled_at = clock_timestamp(), disabled_by = ${proof.scope.accountId}
      WHERE connection_id = ${connectionId} AND workspace_id = ${workspaceId} AND disabled_at IS NULL`)
    if (disabled === 1) {
      await proof.tx.run(sql`
        UPDATE connector.project_binding SET unbound_at = clock_timestamp(), unbound_by = ${proof.scope.accountId}
        WHERE connection_id = ${connectionId} AND unbound_at IS NULL`)
      return
    }
    const known = await proof.tx.maybe(Present, sql`
      SELECT 1 AS present FROM connector.connection WHERE connection_id = ${connectionId} AND workspace_id = ${workspaceId}`)
    if (!known) throw new Failure('CONNECTOR_CONNECTION_NOT_FOUND')
  }),

  listProjectBindings: ({ accountId, projectId }) => database.read(accountId, async (gate) => {
    const proof = await admitProject(gate, { projectId, action: 'connections.bind' })
    await requireOpenProject(proof)
    const { projectId: scopedProject, workspaceId } = proof.scope
    return (await proof.tx.rows(EntryRow, sql`
      SELECT entry.kind, entry.binding_id, entry.name, entry.connection_id, entry.connector_id, entry.label, entry.bound_at
      FROM (
        SELECT 'binding'::text AS kind, bound.binding_id, bound.name, stored.connection_id, stored.connector_id, stored.label, bound.bound_at
        FROM connector.project_binding AS bound
        JOIN connector.connection AS stored ON stored.connection_id = bound.connection_id
        WHERE bound.project_id = ${scopedProject} AND bound.environment = ${ENVIRONMENT} AND bound.unbound_at IS NULL AND stored.disabled_at IS NULL
        UNION ALL
        SELECT 'bindable'::text, NULL::uuid, NULL::text, stored.connection_id, stored.connector_id, stored.label, NULL::timestamptz
        FROM connector.connection AS stored
        WHERE stored.workspace_id = ${workspaceId} AND stored.disabled_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM connector.project_binding AS bound
            WHERE bound.project_id = ${scopedProject} AND bound.environment = ${ENVIRONMENT}
              AND bound.connection_id = stored.connection_id AND bound.unbound_at IS NULL)
      ) AS entry
      ORDER BY entry.kind = 'binding' DESC, entry.name, entry.label, entry.connection_id`)).map(toEntry)
  }),

  bindConnection: ({ accountId, projectId, body }) => database.transaction(accountId, async (gate) => {
    const proof = await admitProject(gate, { projectId, action: 'connections.bind' })
    const { projectId: scopedProject, workspaceId } = proof.scope
    await requireOpenProject(proof)
    const available = await proof.tx.maybe(Present, sql`
      SELECT 1 AS present FROM connector.connection
      WHERE connection_id = ${body.connectionId} AND workspace_id = ${workspaceId} AND disabled_at IS NULL FOR SHARE`)
    if (!available) throw new Failure('CONNECTOR_CONNECTION_NOT_AVAILABLE')
    const inserted = await proof.tx.maybe(BindingIdRow, sql`
      INSERT INTO connector.project_binding (workspace_id, project_id, environment, connection_id, name, bound_by)
      VALUES (${workspaceId}, ${scopedProject}, ${ENVIRONMENT}, ${body.connectionId}, ${body.name}, ${proof.scope.accountId})
      ON CONFLICT DO NOTHING RETURNING binding_id`)
    const settled = inserted ?? await proof.tx.maybe(BindingIdRow, sql`
      SELECT binding_id FROM connector.project_binding
      WHERE project_id = ${scopedProject} AND environment = ${ENVIRONMENT} AND connection_id = ${body.connectionId}
        AND name = ${body.name} AND unbound_at IS NULL`)
    if (!settled) throw new Failure('CONNECTOR_BINDING_CONFLICT')
    const binding = toBinding(await proof.tx.one(BindingRow, sql`
      SELECT bound.binding_id, bound.name, stored.connection_id, stored.connector_id, stored.label, bound.bound_at
      FROM connector.project_binding AS bound
      JOIN connector.connection AS stored ON stored.connection_id = bound.connection_id
      WHERE bound.binding_id = ${settled.binding_id} AND bound.project_id = ${scopedProject}`, 'INTERNAL_UNEXPECTED'))
    return { binding, created: inserted !== null }
  }),

  unbindConnection: ({ accountId, projectId, bindingId }) => database.transaction(accountId, async (gate) => {
    const proof = await admitProject(gate, { projectId, action: 'connections.bind' })
    await requireOpenProject(proof)
    const unbound = await proof.tx.run(sql`
      UPDATE connector.project_binding SET unbound_at = clock_timestamp(), unbound_by = ${proof.scope.accountId}
      WHERE binding_id = ${bindingId} AND project_id = ${proof.scope.projectId} AND unbound_at IS NULL`)
    if (unbound === 0) throw new Failure('CONNECTOR_BINDING_NOT_FOUND')
  }),
})

export const purgeProjectBindings = async ({ tx }: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void> => {
  await tx.run(sql`DELETE FROM connector.project_binding WHERE project_id = ${projectId}`)
}

// A refusal of the consumer's admission is an answer, not a fault: the consumer holds no binding.
const ADMISSION_REFUSALS: ReadonlySet<FailureCode> = new Set(['PROJECT_NOT_FOUND', 'PROJECT_DELETING', 'APPLICATION_NOT_FOUND', 'ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'])

/** What the broker reads per call. `connectorId` is the stored text: the registry decides whether it names a registered connector. */
export type BoundConnection = Readonly<{ bindingId: BindingId; name: BindingName; connectionId: ConnectionId; connectorId: string }>

export type BrokerStore = Readonly<{
  /** The Project's open bindings on enabled Connections, for a Project that is not archived; none when the consumer's account is refused. */
  listBindings(scope: ConsumerScope): Promise<readonly BoundConnection[]>
  /** The sealed credential of an enabled Connection the Project has bound, or null. */
  readConnectionCredential(scope: ConsumerScope, connectionId: ConnectionId): Promise<string | null>
}>

export const createBrokerStore = (database: Database): BrokerStore => {
  // A Builder run or a Preview reads as a member of the Project, an application host as the grantee of its application; neither writes.
  type ConsumerReadProof = Checked<ApplicationScope> | Admitted<ProjectScope<'project.read'>>
  const asConsumer = <T>(scope: ConsumerScope, refused: T, read: (proof: ConsumerReadProof, projectId: ProjectId) => Promise<T>): Promise<T> =>
    database.transaction(scope.accountId, async (gate) => {
      const proof = scope.access === 'application'
        ? await checkApplication(gate, scope.projectId)
        : await admitProject(gate, { projectId: scope.projectId, action: 'project.read' })
      return read(proof, proof.scope.projectId)
    }).catch((error: unknown) => {
      if (error instanceof Failure && ADMISSION_REFUSALS.has(error.id)) return refused
      throw error
    })

  return Object.freeze({
    listBindings: (scope) => asConsumer<readonly BoundConnection[]>(scope, [], async (proof, projectId) =>
      (await proof.tx.rows(BoundRow, sql`
        SELECT bound.binding_id, bound.name, bound.connection_id, stored.connector_id
        FROM connector.project_binding AS bound
        JOIN connector.connection AS stored ON stored.connection_id = bound.connection_id
        JOIN project.project AS bound_project ON bound_project.project_id = bound.project_id
        WHERE bound.project_id = ${projectId} AND bound.environment = ${ENVIRONMENT}
          AND bound.unbound_at IS NULL AND stored.disabled_at IS NULL AND NOT bound_project.archived
          AND NOT EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = bound_project.project_id)
        ORDER BY bound.name`)).map((row) => ({ bindingId: row.binding_id, name: row.name, connectionId: row.connection_id, connectorId: row.connector_id }))),
    readConnectionCredential: (scope, connectionId) => asConsumer<string | null>(scope, null, async (proof, projectId) =>
      (await proof.tx.maybe(SealedRow, sql`
        SELECT stored.credential_sealed FROM connector.connection AS stored
        WHERE stored.connection_id = ${connectionId} AND stored.disabled_at IS NULL
          AND EXISTS (
            SELECT 1 FROM connector.project_binding AS bound
            JOIN project.project AS bound_project ON bound_project.project_id = bound.project_id
            WHERE bound.project_id = ${projectId} AND bound.connection_id = stored.connection_id AND bound.unbound_at IS NULL
              AND NOT bound_project.archived
              AND NOT EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = bound_project.project_id))`))?.credential_sealed ?? null),
  })
}
import { z } from 'zod'
