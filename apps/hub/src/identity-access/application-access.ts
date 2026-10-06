import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AccountId, EmailAddress, GrantId, InvitationId,
  cancelApplicationInvitation, getApplicationAccess, grantApplicationAccess, revokeApplicationGrant,
} from '@conexus/contract'
import type { ApplicationAccess, ApplicationGrantEntry, ApplicationInvitationEntry, ProjectId } from '@conexus/contract'
import { routes } from '../http/access.js'
import { ApplicationSlug, SLUG_LENGTH, slugBase } from '../platform/application-slug.js'
import { sql } from '../platform/db.js'
import type { Database, Sql, WriteTx } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { INVITATION_DAYS } from '../platform/lifetimes.js'
import { idempotent } from '../platform/receipt.js'
import { admitProject, admitSystem, receiptOf } from './admission.js'
import type { AccountScope, Admitted, ProjectScope, SystemScope } from './admission.js'
import type { Claim } from './authentication.js'
import { invitationState } from './roster.js'

/**
 * The address label of a Project's application: the base from its name, then `-2`, `-3` and so on, inside the 40 characters a label may have.
 * @public Tests call it through the built Hub.
 */
export const slugFor = (projectName: string, attempt: number): ApplicationSlug => {
  const base = slugBase(projectName)
  if (attempt === 1) return ApplicationSlug.parse(base)
  const suffix = `-${attempt}`
  return ApplicationSlug.parse(`${base.slice(0, SLUG_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`)
}

// One expression names the presence lock of an application, for the grant's exclusive lock and the
// prepare's shared one, so the two can never disagree. The prefix is a parameter: SQL text never
// spells the installation's own name.
const APPLICATION_LOCK_PREFIX = 'conexus:application:'
const applicationLockKey = (projectId: ProjectId): Sql => sql`hashtextextended(${APPLICATION_LOCK_PREFIX}::text || ${projectId}::text, 0)`

const PresenceRow = z.object({ present: z.boolean(), lock_key: z.string().regex(/^-?\d+$/) })

/** What a prepare runs on: a Project with an application, or one without, held so while `lockLost` has not aborted. */
export type Presence = Readonly<{ hasApplication: true }> | Readonly<{ hasApplication: false; lockLost: AbortSignal }>
const Named = z.object({ name: z.string() })
const Slug = z.object({ slug: ApplicationSlug })
const GrantRow = z.object({ grant_id: GrantId, account_id: AccountId, display_name: z.string(), email: EmailAddress.nullable(), granted_at: z.date() })
const InvitationRow = z.object({ invitation_id: InvitationId, email: EmailAddress, invited_at: z.date(), expires_at: z.date(), open: z.boolean() })

const grantEntry = (row: z.output<typeof GrantRow>): ApplicationGrantEntry => ({
  kind: 'grant', grantId: row.grant_id, accountId: row.account_id, displayName: row.display_name, ...(row.email ? { email: row.email } : {}), grantedAt: row.granted_at.toISOString(),
})

const invitationEntry = (row: z.output<typeof InvitationRow>): ApplicationInvitationEntry => ({
  kind: 'invitation', invitationId: row.invitation_id, email: row.email, invitedAt: row.invited_at.toISOString(), expiresAt: row.expires_at.toISOString(), state: invitationState(row),
})

// The first grant fixes the address: the base label, then the next free suffix. A label another
// Project took meanwhile conflicts on the slug key and the next suffix is tried.
const ensureApplication = async (proof: Admitted<ProjectScope<'application.manage'>>): Promise<void> => {
  const { tx, scope } = proof
  if (await tx.maybe(Slug, sql`SELECT slug FROM iam.application WHERE project_id = ${scope.projectId}`)) return
  const { name } = await tx.one(Named, sql`SELECT name FROM project.project WHERE project_id = ${scope.projectId}`, 'PROJECT_NOT_FOUND')
  for (let attempt = 1; ; attempt += 1) {
    const created = await tx.run(sql`
      INSERT INTO iam.application (project_id, slug, created_by) VALUES (${scope.projectId}, ${slugFor(name, attempt)}, ${scope.accountId})
      ON CONFLICT (slug) DO NOTHING`)
    if (created === 1) return
  }
}

/**
 * Inserts the grants a sign in's claim took, each granted by its inviter. An invitation older than a
 * revoke of the same person on the same Project grants nothing: the revoke came after it.
 */
export const grantClaimed = async (proof: Admitted<AccountScope>, claim: Claim): Promise<void> => {
  for (const invitation of claim.applications) {
    await proof.tx.run(sql`
      INSERT INTO iam.application_grant (project_id, account_id, granted_by)
      SELECT ${invitation.project_id}::uuid, ${proof.scope.accountId}::uuid, ${invitation.invited_by}::uuid
      WHERE NOT EXISTS (
        SELECT 1 FROM iam.application_grant AS revoked
        WHERE revoked.project_id = ${invitation.project_id} AND revoked.account_id = ${proof.scope.accountId}
          AND revoked.revoked_at >= ${invitation.created_at}::timestamptz)
      ON CONFLICT (project_id, account_id) WHERE revoked_at IS NULL DO NOTHING`)
  }
}

/** Deletes every IAM row of a purged Project, children first, in the purge's own transaction that holds the Project row. */
export const purgeProject = async (proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void> => {
  const { tx } = proof
  await tx.run(sql`DELETE FROM iam.handoff WHERE project_id = ${projectId}`)
  await tx.run(sql`DELETE FROM iam.host_session WHERE project_id = ${projectId}`)
  await tx.run(sql`DELETE FROM iam.oidc_transaction WHERE application_project_id = ${projectId}`)
  await tx.run(sql`DELETE FROM iam.application_invitation WHERE project_id = ${projectId}`)
  await tx.run(sql`DELETE FROM iam.application_grant WHERE project_id = ${projectId}`)
  await tx.run(sql`DELETE FROM iam.application WHERE project_id = ${projectId}`)
}

const lockApplication = (tx: WriteTx, projectId: ProjectId) => tx.run(sql`SELECT pg_advisory_xact_lock(${applicationLockKey(projectId)})`)

export const createApplicationAccess = ({ database, addressOf }: Readonly<{
  database: Database
  /** The origin URL of an application, when this installation serves applications. */
  addressOf: (slug: ApplicationSlug) => string | null
}>) => {
  const readPresence = (projectId: ProjectId) => database.system('application-presence', async (gate) => {
    const { tx } = await admitSystem(gate, 'application-presence')
    return tx.one(PresenceRow, sql`
      SELECT EXISTS (SELECT 1 FROM iam.application WHERE project_id = ${projectId}) AS present, ${applicationLockKey(projectId)}::text AS lock_key`, 'INTERNAL_UNEXPECTED')
  })

  /**
   * Runs work on whether the Project has an application. With none, the shared presence lock is held at
   * session level, with no transaction open, for as long as the work runs, so a grant cannot create the
   * application meanwhile; closing the connection releases it. The work gets the signal that aborts when
   * that connection is lost, the moment the lock stops excluding a grant. An application, once present,
   * is never taken from a Project that keeps existing.
   */
  const withApplicationPresence = async <T>(projectId: ProjectId, work: (presence: Presence) => Promise<T>): Promise<T> => {
    const first = await readPresence(projectId)
    if (first.present) return work({ hasApplication: true })
    const held = await database.session('conexus-hub:application-presence', async (lock, lost) => {
      await lock.advisoryLockShared(BigInt(first.lock_key))
      const again = await readPresence(projectId)
      return again.present ? { ran: false as const } : { ran: true as const, value: await work({ hasApplication: false, lockLost: lost }) }
    })
    return held.ran ? held.value : work({ hasApplication: true })
  }

  const registerRoutes = async (app: FastifyInstance) => {
    const route = routes(app)

    route.operation(getApplicationAccess, ({ params }, session): Promise<ApplicationAccess> => database.read(session.account.accountId, async (tx) => {
      const proof = await admitProject(tx, params.projectId, 'application.manage')
      const application = await tx.maybe(Slug, sql`SELECT slug FROM iam.application WHERE project_id = ${proof.scope.projectId}`)
      const grants = await tx.rows(GrantRow, sql`
        SELECT access_grant.grant_id, grantee.account_id, grantee.display_name, grantee.email, access_grant.granted_at
        FROM iam.application_grant AS access_grant JOIN iam.account AS grantee ON grantee.account_id = access_grant.account_id
        WHERE access_grant.project_id = ${proof.scope.projectId} AND access_grant.revoked_at IS NULL
        ORDER BY access_grant.granted_at, access_grant.grant_id`)
      const invitations = await tx.rows(InvitationRow, sql`
        SELECT invitation_id, email, created_at AS invited_at, expires_at, expires_at > now() AS open
        FROM iam.application_invitation WHERE project_id = ${proof.scope.projectId}
        ORDER BY created_at, invitation_id`)
      const address = application ? addressOf(application.slug) : null
      return { ...(address ? { address } : {}), entries: [...grants.map(grantEntry), ...invitations.map(invitationEntry)] }
    }))

    // Granting always invites: the person's next sign in claims it, as a no op when a grant already exists.
    route.operation(grantApplicationAccess, ({ params, headers, body }, session) => database.transaction(session.account.accountId, async (gate) => {
      const proof = await admitProject(gate, params.projectId, 'application.manage')
      await lockApplication(proof.tx, proof.scope.projectId)
      const { reply } = await idempotent(receiptOf(proof), grantApplicationAccess, headers['idempotency-key'], { params, query: undefined, body }, InvitationId, async (invitationId) => {
        await ensureApplication(proof)
        return invitationEntry(await proof.tx.one(InvitationRow, sql`
          INSERT INTO iam.application_invitation (invitation_id, project_id, email, invited_by, expires_at)
          VALUES (${invitationId}, ${proof.scope.projectId}, ${body.email}, ${proof.scope.accountId}, now() + make_interval(days => ${INVITATION_DAYS}))
          ON CONFLICT (project_id, email) DO UPDATE SET invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at, created_at = clock_timestamp()
          WHERE application_invitation.project_id = ${proof.scope.projectId}
          RETURNING invitation_id, email, created_at AS invited_at, expires_at, expires_at > now() AS open`, 'INTERNAL_UNEXPECTED'))
      })
      return reply
    }))

    route.operation(revokeApplicationGrant, ({ params }, session) => database.transaction(session.account.accountId, async (gate) => {
      const proof = await admitProject(gate, params.projectId, 'application.manage')
      const revoked = await proof.tx.run(sql`
        UPDATE iam.application_grant SET revoked_at = clock_timestamp(), revoked_by = ${proof.scope.accountId}
        WHERE grant_id = ${params.grantId} AND project_id = ${proof.scope.projectId} AND revoked_at IS NULL`)
      if (revoked !== 1) throw new Failure('APPLICATION_ACCESS_ENTRY_NOT_FOUND')
      return undefined
    }))

    route.operation(cancelApplicationInvitation, ({ params }, session) => database.transaction(session.account.accountId, async (gate) => {
      const proof = await admitProject(gate, params.projectId, 'application.manage')
      const cancelled = await proof.tx.run(sql`
        DELETE FROM iam.application_invitation WHERE invitation_id = ${params.invitationId} AND project_id = ${proof.scope.projectId}`)
      if (cancelled !== 1) throw new Failure('APPLICATION_ACCESS_ENTRY_NOT_FOUND')
      return undefined
    }))

    return ['getApplicationAccess', 'grantApplicationAccess', 'revokeApplicationGrant', 'cancelApplicationInvitation'] as const
  }

  return Object.freeze({ withApplicationPresence, registerRoutes })
}
