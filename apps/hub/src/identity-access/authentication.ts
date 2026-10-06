import { z } from 'zod'
import { AccountId, ArtifactRevisionId, DisplayName, EmailAddress, ProjectId, WorkspaceId, WorkspaceRole } from '@conexus/contract'
import type { ArtifactRevisionId as ArtifactRevisionIdType } from '@conexus/contract'
import { ApplicationSlug } from '../platform/application-slug.js'
import { bindAccount, Digest, openGate, sql } from '../platform/db.js'
import type { AuthenticationGate, Sql, WriteTx } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import { HUB_IDLE_SECONDS, HUB_SLIDE_EVERY_SECONDS, OIDC_TRANSACTION_SECONDS, PROVIDER_RECHECK_SECONDS } from '../platform/lifetimes.js'
import { ActiveAccount, notInDeletion, Present } from './admission.js'
import type { Admitted, BootstrapScope, ProviderIdentity } from './admission.js'
import type { SignInClaims } from './oidc.js'

const Liveness = z.enum(['LIVE', 'IDLE_EXPIRED', 'ABSOLUTE_EXPIRED'])
const Person = { account_id: AccountId, display_name: DisplayName, email: EmailAddress.nullable(), subject: z.string() }
// A Hub or application session always holds its sealed token and its last check (the host_session CHECKs).
const Standing = { liveness: Liveness, recheck_due: z.boolean(), sealed_token: z.string(), checked_at: z.string() }

const OidcState = z.object({
  pkce_verifier: z.string(), nonce: z.string(), application_project_id: ProjectId.nullable(), application_slug: ApplicationSlug.nullable(), sign_in_binding_digest: Digest.nullable(),
})
const HubSessionRow = z.object({ ...Person, ...Standing, active: z.boolean(), hub_entry: z.boolean() })
const ApplicationSessionRow = z.object({ ...Person, ...Standing, project_id: ProjectId })
const PreviewSessionRow = z.object({
  ...Person, project_id: ProjectId, liveness: Liveness,
  parent_digest: Digest, parent_liveness: Liveness, parent_active: z.boolean(), parent_entry: z.boolean(), parent_recheck_due: z.boolean(), parent_sealed_token: z.string(), parent_checked_at: z.string(),
})
const ApplicationHandoffRow = z.object({ account_id: AccountId, project_id: ProjectId, minted_at: z.string(), sealed_token: z.string() })
const PreviewHandoffRow = z.object({ account_id: AccountId, project_id: ProjectId, artifact_revision_id: ArtifactRevisionId, parent_digest: Digest, session_expires_at: z.string() })

export type OidcStateRow = z.output<typeof OidcState>
export type HubSessionRow = z.output<typeof HubSessionRow>
export type ApplicationSessionRow = z.output<typeof ApplicationSessionRow>
export type PreviewSessionRow = z.output<typeof PreviewSessionRow>
export type ApplicationHandoffRow = z.output<typeof ApplicationHandoffRow>
export type PreviewHandoffRow = z.output<typeof PreviewHandoffRow>

const txOf = (gate: AuthenticationGate): WriteTx => openGate(gate).tx

// Deadlines are compared with the database's now(), so no TypeScript clock decides whether a credential is alive.
/** The one spelling of a session's standing, for every kind: an application or Preview session has no idle limit. */
export const liveness = (session: Sql) => sql`CASE WHEN ${session}.absolute_expires_at <= now() THEN 'ABSOLUTE_EXPIRED' WHEN ${session}.idle_expires_at <= now() THEN 'IDLE_EXPIRED' ELSE 'LIVE' END`
const live = (session: Sql) => sql`(${liveness(session)} = 'LIVE')`
const recheckDue = (session: Sql) => sql`${session}.provider_checked_at <= now() - make_interval(secs => ${PROVIDER_RECHECK_SECONDS})`
/** Whether an account enters the Hub: an account of the Control Plane, or one with a membership. */
export const hubEntry = (account: Sql) => sql`(${account}.origin = 'CONTROL_PLANE' OR EXISTS (SELECT 1 FROM iam.workspace_membership AS membership WHERE membership.account_id = ${account}.account_id))`
const personColumns = sql`person.account_id, person.display_name, person.email, person.external_subject AS subject`
const standingColumns = sql`${liveness(sql`session`)} AS liveness, ${recheckDue(sql`session`)} AS recheck_due, session.provider_refresh_token AS sealed_token, session.provider_checked_at::text AS checked_at`

const bound = <R extends Readonly<{ account_id: AccountId }>>(gate: AuthenticationGate, row: R | null): R | null => {
  if (row) bindAccount(gate, row.account_id)
  return row
}

// Each lookup below finds the row of one presented credential by its digest, and binds the account a row carries to the gate.

/** Consumes a sign in in flight: one use, within its deadline. */
export const consumeOidcState = (gate: AuthenticationGate, key: Digest): Promise<OidcStateRow | null> => txOf(gate).maybe(OidcState, sql`
  DELETE FROM iam.oidc_transaction WHERE state_digest = ${key} AND expires_at > now()
  RETURNING pkce_verifier, nonce, application_project_id, sign_in_binding_digest,
    (SELECT application.slug FROM iam.application AS application WHERE application.project_id = oidc_transaction.application_project_id) AS application_slug`)

/** Reads a Hub session and its standing, with no lock: the slide and the end are each one guarded statement. */
export const readHubSession = async (gate: AuthenticationGate, key: Digest): Promise<HubSessionRow | null> => bound(gate, await txOf(gate).maybe(HubSessionRow, sql`
  SELECT ${personColumns}, ${standingColumns}, person.active, ${hubEntry(sql`person`)} AS hub_entry
  FROM iam.host_session AS session JOIN iam.account AS person ON person.account_id = session.account_id
  WHERE session.token_digest = ${key} AND session.kind = 'HUB'`))

/** Reads an application session of one application's host, with no lock. */
export const readApplicationSession = async (gate: AuthenticationGate, key: Digest, slug: ApplicationSlug): Promise<ApplicationSessionRow | null> => bound(gate, await txOf(gate).maybe(ApplicationSessionRow, sql`
  SELECT ${personColumns}, ${standingColumns}, session.project_id
  FROM iam.host_session AS session
  JOIN iam.application AS application ON application.project_id = session.project_id AND application.slug = ${slug}
  JOIN iam.account AS person ON person.account_id = session.account_id
  WHERE session.token_digest = ${key} AND session.kind = 'APPLICATION'`))

/** Reads a Preview session of one revision and its parent Hub session's standing, with no lock. */
export const readPreviewSession = async (gate: AuthenticationGate, key: Digest, artifactRevisionId: ArtifactRevisionIdType): Promise<PreviewSessionRow | null> => bound(gate, await txOf(gate).maybe(PreviewSessionRow, sql`
  SELECT ${personColumns}, session.project_id, ${liveness(sql`session`)} AS liveness,
    parent.token_digest AS parent_digest,
    ${liveness(sql`parent`)} AS parent_liveness,
    person.active AS parent_active, ${hubEntry(sql`person`)} AS parent_entry,
    ${recheckDue(sql`parent`)} AS parent_recheck_due,
    parent.provider_refresh_token AS parent_sealed_token, parent.provider_checked_at::text AS parent_checked_at
  FROM iam.host_session AS session
  JOIN iam.host_session AS parent ON parent.token_digest = session.parent_digest AND parent.account_id = session.account_id
  JOIN iam.account AS person ON person.account_id = session.account_id
  WHERE session.token_digest = ${key} AND session.kind = 'PREVIEW' AND session.artifact_revision_id = ${artifactRevisionId}`))

const ProjectOf = z.object({ project_id: ProjectId })

// A step that writes a Project's children takes the Project row FOR SHARE first, in the order the purge
// takes it FOR UPDATE, so the two wait on each other in one order and never deadlock. A Project in deletion has none.
const shareProject = async (tx: WriteTx, projectId: ProjectId): Promise<ProjectId | null> => (await tx.maybe(ProjectOf, sql`
  SELECT stored.project_id FROM project.project AS stored WHERE stored.project_id = ${projectId} AND ${notInDeletion(sql`stored`)} FOR SHARE`))?.project_id ?? null

const shareProjectOfSlug = async (tx: WriteTx, slug: ApplicationSlug): Promise<ProjectId | null> => (await tx.maybe(ProjectOf, sql`
  SELECT stored.project_id FROM iam.application AS application
  JOIN project.project AS stored ON stored.project_id = application.project_id
  WHERE application.slug = ${slug} AND ${notInDeletion(sql`stored`)}
  FOR SHARE OF stored`))?.project_id ?? null

/** Consumes an application handoff once, on its own host and from the browser that holds its binding, after its Project. */
export const consumeApplicationHandoff = async (gate: AuthenticationGate, key: Digest, slug: ApplicationSlug, bindingDigest: Digest): Promise<ApplicationHandoffRow | null> => {
  const tx = txOf(gate)
  if (!(await shareProjectOfSlug(tx, slug))) return null
  return bound(gate, await tx.maybe(ApplicationHandoffRow, sql`
    DELETE FROM iam.handoff AS handoff USING iam.application AS application
    WHERE handoff.handoff_digest = ${key} AND handoff.kind = 'APPLICATION' AND handoff.expires_at > now()
      AND application.project_id = handoff.project_id AND application.slug = ${slug} AND handoff.binding_digest = ${bindingDigest}
    RETURNING handoff.account_id, handoff.project_id, handoff.minted_at::text AS minted_at, handoff.provider_refresh_token AS sealed_token`))
}

/** Consumes a Preview handoff once, while its parent Hub session is alive, after its Project. */
export const consumePreviewHandoff = async (gate: AuthenticationGate, key: Digest, artifactRevisionId: ArtifactRevisionIdType): Promise<PreviewHandoffRow | null> => {
  const tx = txOf(gate)
  const pending = await tx.maybe(ProjectOf, sql`SELECT project_id FROM iam.handoff WHERE handoff_digest = ${key} AND kind = 'PREVIEW'`)
  if (!pending) return null
  if (!(await shareProject(tx, pending.project_id))) return null
  return bound(gate, await tx.maybe(PreviewHandoffRow, sql`
    DELETE FROM iam.handoff AS handoff
    WHERE handoff.handoff_digest = ${key} AND handoff.kind = 'PREVIEW' AND handoff.artifact_revision_id = ${artifactRevisionId} AND handoff.expires_at > now()
      AND EXISTS (SELECT 1 FROM iam.host_session AS parent JOIN iam.account AS person ON person.account_id = parent.account_id
        WHERE parent.token_digest = handoff.parent_digest AND parent.account_id = handoff.account_id
          AND ${live(sql`parent`)} AND person.active AND ${hubEntry(sql`person`)})
    RETURNING handoff.account_id, handoff.project_id, handoff.artifact_revision_id, handoff.parent_digest, handoff.session_expires_at::text AS session_expires_at`))
}

export type KnownAccount = z.output<typeof ActiveAccount>

/** The account of a provider pair, bound to the gate when it exists. */
export const lookupIdentity = async (gate: AuthenticationGate, identity: ProviderIdentity): Promise<KnownAccount | null> =>
  bound(gate, await txOf(gate).maybe(ActiveAccount, sql`
    SELECT account_id, active FROM iam.account WHERE issuer = ${identity.issuer} AND external_subject = ${identity.subject}`))

const WorkspaceClaim = z.object({ workspace_id: WorkspaceId, role: WorkspaceRole, invited_by: AccountId })
const ApplicationClaim = z.object({ project_id: ProjectId, invited_by: AccountId, created_at: z.string() })
/**
 * The invitations one verified email took: never empty, since an empty claim is null. It is the only
 * authority for the memberships and grants a claim inserts, so only claimInvitations makes one.
 */
class Claim {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: type identity is the use
  readonly #claimed = true
  constructor(readonly workspaces: readonly z.output<typeof WorkspaceClaim>[], readonly applications: readonly z.output<typeof ApplicationClaim>[]) {}
}
export type { Claim }

/** Takes every open invitation of the verified email of this sign in. Each DELETE is the claim and the consumption, so a cancel and a claim of one invitation never both win. */
export const claimInvitations = async (gate: AuthenticationGate, email: EmailAddress): Promise<Claim | null> => {
  const tx = txOf(gate)
  const workspaces = await tx.rows(WorkspaceClaim, sql`
    DELETE FROM iam.workspace_invitation WHERE email = ${email} AND expires_at > now()
    RETURNING workspace_id, role, invited_by`)
  const applications = await tx.rows(ApplicationClaim, sql`
    DELETE FROM iam.application_invitation WHERE email = ${email} AND expires_at > now()
    RETURNING project_id, invited_by, created_at::text AS created_at`)
  return workspaces.length + applications.length === 0 ? null : new Claim(workspaces, applications)
}

/** What lets an unknown identity become an account: the founding of the installation, or a claim of its verified email. */
export type ProvisionBasis = Readonly<{ kind: 'bootstrap'; proof: Admitted<BootstrapScope> }> | Readonly<{ kind: 'claim'; claim: Claim }>

const Provisioned = z.object({ account_id: AccountId })

/** Inserts the account of a sign in and binds it; a parallel callback that created it first wins, and this one binds that account. */
export const provisionIdentity = async (gate: AuthenticationGate, claims: SignInClaims, basis: ProvisionBasis): Promise<AccountId> => {
  const { identity } = claims
  if (basis.kind === 'bootstrap' && (basis.proof.scope.issuer !== identity.issuer || basis.proof.scope.subject !== identity.subject)) {
    throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'BOOTSTRAP_IDENTITY_MISMATCH' } })
  }
  const origin = basis.kind === 'claim' && basis.claim.workspaces.length === 0 ? 'APPLICATION_INVITATION' : 'CONTROL_PLANE'
  const email = claims.email.kind === 'verified' ? claims.email.email : null
  const inserted = await txOf(gate).maybe(Provisioned, sql`
    INSERT INTO iam.account (account_id, issuer, external_subject, display_name, email, origin)
    VALUES (gen_random_uuid(), ${identity.issuer}, ${identity.subject}, ${claims.displayName}, ${email}, ${origin})
    ON CONFLICT (issuer, external_subject) DO NOTHING
    RETURNING account_id`)
  if (inserted) {
    bindAccount(gate, inserted.account_id)
    return inserted.account_id
  }
  const existing = await lookupIdentity(gate, identity)
  if (!existing) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'ACCOUNT_NOT_PROVISIONED' } })
  return existing.account_id
}

/** The bound account's email becomes the verified email of this sign in, for presentation and for finding a person to make administrator. */
export const refreshEmail = async (gate: AuthenticationGate, email: EmailAddress): Promise<void> => {
  const { tx, actor } = openGate(gate)
  if (actor.kind !== 'authentication' || actor.accountId === null) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'GATE_ACTOR_REFUSED' } })
  await tx.run(sql`UPDATE iam.account SET email = ${email} WHERE account_id = ${actor.accountId} AND email IS DISTINCT FROM ${email}`)
}

/** The Project of an application address, taken FOR SHARE so a purge waits; a Project in deletion has none. */
export const lookupSlug = (gate: AuthenticationGate, slug: ApplicationSlug): Promise<ProjectId | null> => shareProjectOfSlug(txOf(gate), slug)

/** Takes the Project an application sign in returns to FOR SHARE, before the sign in claims or grants anything of it. */
export const lockProject = async (gate: AuthenticationGate, projectId: ProjectId): Promise<boolean> => (await shareProject(txOf(gate), projectId)) !== null

export type OidcStart = Readonly<{
  stateDigest: Digest
  pkceVerifier: string
  nonce: string
  application: Readonly<{ projectId: ProjectId; bindingDigest: Digest }> | null
}>

/** One sign in in flight, by the digest of its state. */
export const startOidc = async (gate: AuthenticationGate, start: OidcStart): Promise<void> => {
  await txOf(gate).run(sql`
    INSERT INTO iam.oidc_transaction (state_digest, pkce_verifier, nonce, expires_at, application_project_id, sign_in_binding_digest)
    VALUES (${start.stateDigest}, ${start.pkceVerifier}, ${start.nonce}, now() + make_interval(secs => ${OIDC_TRANSACTION_SECONDS}),
      ${start.application?.projectId ?? null}, ${start.application?.bindingDigest ?? null})`)
}

const Ended = z.object({ sealed_token: z.string().nullable() })

/** A session ends by being deleted, its Previews and handoffs with it; the sealed refresh token it held is handed back once. */
export const endCredential = async (gate: AuthenticationGate, credential: Readonly<{ digest: Digest; kind: 'HUB' | 'APPLICATION' | 'PREVIEW' }>): Promise<Readonly<{ sealedToken: string | null }> | null> => {
  const ended = await txOf(gate).maybe(Ended, sql`
    DELETE FROM iam.host_session WHERE token_digest = ${credential.digest} AND kind = ${credential.kind}
    RETURNING provider_refresh_token AS sealed_token`)
  return ended ? { sealedToken: ended.sealed_token } : null
}

/**
 * A live Hub request moves the idle limit, never past the absolute one, and only once it is due: one
 * write per HUB_SLIDE_EVERY_SECONDS, so parallel requests of one browser neither wait on nor repeat it.
 */
export const slideHubSession = async (gate: AuthenticationGate, key: Digest): Promise<void> => {
  await txOf(gate).run(sql`
    UPDATE iam.host_session AS session SET idle_expires_at = least(now() + make_interval(secs => ${HUB_IDLE_SECONDS}), session.absolute_expires_at)
    WHERE session.token_digest = ${key} AND session.kind = 'HUB' AND ${live(sql`session`)}
      AND session.idle_expires_at < now() + make_interval(secs => ${HUB_IDLE_SECONDS - HUB_SLIDE_EVERY_SECONDS})`)
}

/** Ends a Hub session its lookup found expired, only while it still is; null when a parallel request ended it first. */
export const endExpiredHubSession = async (gate: AuthenticationGate, key: Digest): Promise<'ENDED' | null> =>
  (await txOf(gate).run(sql`DELETE FROM iam.host_session AS session WHERE session.token_digest = ${key} AND session.kind = 'HUB' AND NOT ${live(sql`session`)}`)) === 1 ? 'ENDED' : null

/**
 * Records a Keycloak answer only over the check this request saw: two requests that found one check due
 * are each served on their own answer, and the first to record stores its token. A record that changes
 * no row reads the session once more, so "already recorded" is told apart from "ended".
 */
export const recordProviderCheck = async (gate: AuthenticationGate, check: Readonly<{ digest: Digest; seen: string; sealedToken: string }>): Promise<'RECORDED' | 'ENDED'> => {
  const tx = txOf(gate)
  const recorded = await tx.run(sql`
    UPDATE iam.host_session SET provider_checked_at = now(), provider_refresh_token = ${check.sealedToken}
    WHERE token_digest = ${check.digest} AND provider_checked_at = ${check.seen}::timestamptz`)
  if (recorded === 1) return 'RECORDED'
  return (await tx.maybe(Present, sql`SELECT 1 AS present FROM iam.host_session WHERE token_digest = ${check.digest}`)) ? 'RECORDED' : 'ENDED'
}
