import type { FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault, RouteHandlerMethod } from 'fastify'
import type { AccountId, ApplicationNoAccessReason, HubNoAccessReason, ProjectId } from '@conexus/contract'
import { routes } from '../http/access.js'
import { clearCookie, readCookie, setCookie } from '../http/cookies.js'
import { parseApplicationSlug } from '../platform/application-slug.js'
import type { ApplicationSlug } from '../platform/application-slug.js'
import { Digest, digest } from '../platform/db.js'
import type { AuthenticationGate, Database, RawToken } from '../platform/db.js'
import { Failure, logFailure } from '../platform/failure.js'
import { logLine } from '../platform/logger.js'
import { presentedToken } from '../platform/opaque-token.js'
import { admitAccount, admitApplication, admitBootstrap } from './admission.js'
import type { ConfiguredIdentity } from './admission.js'
import { grantFirstTenure, tenureGranted } from './administrators.js'
import { grantClaimed } from './application-access.js'
import { claimInvitations, consumeOidcState, lockProject, lookupIdentity, lookupSlug, provisionIdentity, refreshEmail, startOidc } from './authentication.js'
import type { Claim, KnownAccount } from './authentication.js'
import type { OidcAdapter, SignInClaims } from './oidc.js'
import { joinClaimed } from './roster.js'
import type { Sessions } from './sessions.js'
import { mayEnterHub } from './hub-session.js'

/** The origin URL of an application, as its host serves it. */
type ApplicationOrigin = string

/** Why a sign in did not open: the Hub's reasons, and an application that this account may not use. */
type Refusal = HubNoAccessReason | 'NOT_GRANTED'

/** What each surface discloses for each refusal: the Hub names its own reason; an application host shows one of its three pages. */
const NO_ACCESS = {
  SIGN_IN_EXPIRED: { hub: 'SIGN_IN_EXPIRED', application: 'SIGN_IN_FAILED' },
  SIGN_IN_FAILED: { hub: 'SIGN_IN_FAILED', application: 'SIGN_IN_FAILED' },
  IDENTITY_EMAIL_NOT_VERIFIED: { hub: 'IDENTITY_EMAIL_NOT_VERIFIED', application: 'EMAIL_NOT_VERIFIED' },
  IDENTITY_NOT_ELIGIBLE: { hub: 'IDENTITY_NOT_ELIGIBLE', application: 'NOT_GRANTED' },
  ACCOUNT_INACTIVE: { hub: 'ACCOUNT_INACTIVE', application: 'NOT_GRANTED' },
  NOT_GRANTED: { hub: 'IDENTITY_NOT_ELIGIBLE', application: 'NOT_GRANTED' },
} as const satisfies Readonly<Record<Refusal, Readonly<{ hub: HubNoAccessReason; application: ApplicationNoAccessReason }>>>

/** Where a sign in returns: the Hub, or the application that began it, from the browser that holds its binding. */
export type Venue = Readonly<{ kind: 'HUB' }> | Readonly<{ kind: 'APPLICATION'; projectId: ProjectId; origin: ApplicationOrigin; bindingDigest: Digest }>

export type SignInOutcome =
  | Readonly<{ kind: 'HUB'; session: RawToken }>
  | Readonly<{ kind: 'APPLICATION'; handoff: RawToken; origin: ApplicationOrigin }>
  | Readonly<{ kind: 'REFUSED'; venue: 'HUB'; reason: HubNoAccessReason }>
  | Readonly<{ kind: 'REFUSED'; venue: 'APPLICATION'; reason: ApplicationNoAccessReason; origin: ApplicationOrigin }>

const refusedAt = (venue: Venue, refusal: Refusal): SignInOutcome =>
  venue.kind === 'HUB'
    ? { kind: 'REFUSED', venue: 'HUB', reason: NO_ACCESS[refusal].hub }
    : { kind: 'REFUSED', venue: 'APPLICATION', reason: NO_ACCESS[refusal].application, origin: venue.origin }

/**
 * The address a callback redirects to, from its outcome alone.
 * @public Tests call it through the built Hub.
 */
export const locationOf = (outcome: SignInOutcome): string => {
  switch (outcome.kind) {
    case 'HUB': return '/'
    case 'APPLICATION': return `${outcome.origin}/__conexus/sign-in/complete?handoff=${outcome.handoff}`
    case 'REFUSED': return outcome.venue === 'HUB' ? `/no-access?reason=${outcome.reason}` : `${outcome.origin}/__conexus/no-access?reason=${outcome.reason}`
  }
}

// An account that this sign in founded the installation with carries it, so its first tenure is logged once committed.
type Entrant = Readonly<{ kind: 'account'; claim: Claim | null; founded: AccountId | null }> | Readonly<{ kind: 'refused'; refusal: Refusal }>

const sameIdentity = (claims: SignInClaims, configured: ConfiguredIdentity): boolean =>
  claims.identity.issuer === configured.issuer && claims.identity.subject === configured.subject

const known = (account: KnownAccount, claim: Claim | null): Entrant => (account.active ? { kind: 'account', claim, founded: null } : { kind: 'refused', refusal: 'ACCOUNT_INACTIVE' })

// The identity steps of a callback: a known account, the founding of the installation, or the claim of an invitation.
const identify = async (gate: AuthenticationGate, claims: SignInClaims, configured: ConfiguredIdentity): Promise<Entrant> => {
  const verified = claims.email.kind === 'verified' ? claims.email.email : null
  const found = await lookupIdentity(gate, claims.identity)
  if (found) {
    if (!found.active || !verified) return known(found, null)
    await refreshEmail(gate, verified)
    return known(found, await claimInvitations(gate, verified))
  }
  if (sameIdentity(claims, configured)) {
    const proof = await admitBootstrap(gate, configured)
    if (proof) {
      const founder = await provisionIdentity(gate, claims, { kind: 'bootstrap', proof })
      await grantFirstTenure(proof, founder)
      return { kind: 'account', claim: null, founded: founder }
    }
    const founder = await lookupIdentity(gate, claims.identity)
    if (founder) return known(founder, null)
  }
  if (!verified) return { kind: 'refused', refusal: 'IDENTITY_EMAIL_NOT_VERIFIED' }
  const claim = await claimInvitations(gate, verified)
  if (claim) {
    await provisionIdentity(gate, claims, { kind: 'claim', claim })
    return { kind: 'account', claim, founded: null }
  }
  // A parallel callback of the same person may have claimed the invitations and created the account first.
  const parallel = await lookupIdentity(gate, claims.identity)
  return parallel ? known(parallel, null) : { kind: 'refused', refusal: 'IDENTITY_NOT_ELIGIBLE' }
}

type SignInPorts = Readonly<{
  database: Database
  oidc: OidcAdapter
  sessions: Pick<Sessions, 'openHubSession' | 'mintApplicationHandoff'>
  configured: ConfiguredIdentity
  /** The Hub's own origin, against which Keycloak's redirect back is read. */
  origin: string
  /** The origin of an application, when this installation serves applications. */
  applicationOrigin: ((slug: ApplicationSlug) => ApplicationOrigin) | null
}>
type QueryHandler = RouteHandlerMethod<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, { Querystring: Record<string, unknown> }>

/** The callback's one decision: who signed in, what their verified email claims, and the session or handoff it opens, in one entry. */
const decideWith = ({ database, sessions, configured }: SignInPorts) => (claims: SignInClaims, venue: Venue): Promise<Readonly<{ outcome: SignInOutcome; founded: AccountId | null }>> =>
  database.authenticate(async (gate) => {
    // The Project first, in the purge's order, before the claim deletes its invitations and inserts its grants.
    if (venue.kind === 'APPLICATION' && !(await lockProject(gate, venue.projectId))) return { outcome: refusedAt(venue, 'NOT_GRANTED'), founded: null }
    const entrant = await identify(gate, claims, configured)
    if (entrant.kind === 'refused') return { outcome: refusedAt(venue, entrant.refusal), founded: null }
    const { founded } = entrant
    const proof = await admitAccount(gate)
    if (entrant.claim) {
      await joinClaimed(proof, entrant.claim)
      await grantClaimed(proof, entrant.claim)
    }
    if (venue.kind === 'HUB') {
      if (!(await mayEnterHub(proof))) return { outcome: refusedAt(venue, 'IDENTITY_NOT_ELIGIBLE'), founded }
      return { outcome: { kind: 'HUB', session: await sessions.openHubSession(proof, claims.refreshToken) }, founded }
    }
    // A refusal here keeps what the claim committed: the invitation was accepted by the email it named.
    const admitted = await admitApplication(gate, venue.projectId).catch((error: unknown) => {
      if (error instanceof Failure && error.id === 'APPLICATION_NOT_FOUND') return null
      throw error
    })
    if (!admitted) return { outcome: refusedAt(venue, 'NOT_GRANTED'), founded }
    return { outcome: { kind: 'APPLICATION', handoff: await sessions.mintApplicationHandoff(admitted, venue.bindingDigest, claims.refreshToken), origin: venue.origin }, founded }
  })

/**
 * Begins a sign in. An application host begins one with its slug and the digest of a binding only that
 * browser holds. Both or neither: the Hub's own sign in takes no parameter.
 */
const beginSignIn = ({ database, oidc, applicationOrigin }: SignInPorts): QueryHandler => async (request, reply) => {
  const { application, binding } = request.query
  const refused = (outcome: SignInOutcome) => reply.header('referrer-policy', 'no-referrer').redirect(locationOf(outcome), 303)
  let target: Readonly<{ slug: ApplicationSlug; origin: ApplicationOrigin; bindingDigest: Digest }> | null = null
  if (application !== undefined || binding !== undefined) {
    const slug = parseApplicationSlug(application)
    if (!slug || !applicationOrigin) return refused(refusedAt({ kind: 'HUB' }, 'SIGN_IN_FAILED'))
    const venue = { kind: 'APPLICATION', origin: applicationOrigin(slug) } as const
    const bindingText = typeof binding === 'string' ? binding : ''
    const bound = Digest.safeParse(Buffer.from(bindingText, 'base64url'))
    // Only the canonical encoding of a digest, so one binding has exactly one spelling.
    if (!bound.success || bound.data.toString('base64url') !== bindingText) return refused({ kind: 'REFUSED', venue: 'APPLICATION', reason: 'SIGN_IN_FAILED', origin: venue.origin })
    target = { slug, origin: venue.origin, bindingDigest: bound.data }
  }
  let begun: Awaited<ReturnType<OidcAdapter['begin']>>
  try {
    begun = await oidc.begin()
  } catch (error) {
    logFailure(request.log, new Failure('OIDC_BEGIN_FAILED', { cause: error }))
    return refused(refusedAt({ kind: 'HUB' }, 'SIGN_IN_FAILED'))
  }
  const state = presentedToken(begun.state)
  if (!state) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'OIDC_STATE_UNREADABLE' } })
  const started = await database.authenticate(async (gate) => {
    const projectId = target ? await lookupSlug(gate, target.slug) : null
    if (target && !projectId) return false
    await startOidc(gate, {
      stateDigest: digest(state), pkceVerifier: begun.pkceVerifier, nonce: begun.nonce,
      application: target && projectId ? { projectId, bindingDigest: target.bindingDigest } : null,
    })
    return true
  })
  if (!started && target) return refused({ kind: 'REFUSED', venue: 'APPLICATION', reason: 'NOT_GRANTED', origin: target.origin })
  return setCookie(reply, 'oidcState', begun.state).redirect(begun.location, 302)
}

const completeSignIn = ({ database, oidc, origin, applicationOrigin }: SignInPorts, decide: ReturnType<typeof decideWith>): QueryHandler => async (request, reply) => {
  clearCookie(reply, 'oidcState')
  const answer = (outcome: SignInOutcome, cause: string | null) => {
    if (outcome.kind === 'REFUSED') logLine('SIGN_IN_REFUSED', { venue: outcome.venue, reason: outcome.reason, ...(cause ? { cause } : {}) }, 'warn')
    else logLine('SIGN_IN_COMPLETED', { venue: outcome.kind })
    if (outcome.kind === 'HUB') setCookie(reply, 'hubSession', outcome.session)
    return reply.header('referrer-policy', 'no-referrer').redirect(locationOf(outcome), 303)
  }
  const hub = { kind: 'HUB' } as const
  const { state: queryState, error } = request.query
  const state = presentedToken(queryState)
  if (!state || queryState !== readCookie(request, 'oidcState')) return answer(refusedAt(hub, 'SIGN_IN_EXPIRED'), 'STATE_MISMATCH')
  const transaction = await database.authenticate((gate) => consumeOidcState(gate, digest(state)))
  if (!transaction) return answer(refusedAt(hub, 'SIGN_IN_EXPIRED'), 'STATE_UNKNOWN')
  const venue: Venue = transaction.application_project_id && transaction.application_slug && transaction.sign_in_binding_digest && applicationOrigin
    ? { kind: 'APPLICATION', projectId: transaction.application_project_id, origin: applicationOrigin(transaction.application_slug), bindingDigest: transaction.sign_in_binding_digest }
    : hub
  if (transaction.application_project_id && venue.kind === 'HUB') return answer(refusedAt(hub, 'SIGN_IN_FAILED'), 'APPLICATION_UNAVAILABLE')
  if (error !== undefined) return answer(refusedAt(venue, 'SIGN_IN_FAILED'), typeof error === 'string' ? error.slice(0, 64) : 'PROVIDER_ERROR')
  let claims: SignInClaims
  try {
    const completion = await oidc.complete({
      currentUrl: new URL(request.raw.url ?? '', origin).href,
      pkceVerifier: transaction.pkce_verifier,
      expectedState: state,
      expectedNonce: transaction.nonce,
    })
    if (completion.kind === 'no-refresh-token') {
      // Every session keeps this sign in's Keycloak refresh token, sealed, to ask Keycloak again while it lasts.
      logFailure(request.log, new Failure('OIDC_REFRESH_TOKEN_MISSING'))
      return answer(refusedAt(venue, 'SIGN_IN_FAILED'), 'REFRESH_TOKEN_MISSING')
    }
    if (completion.kind === 'malformed') {
      logLine('IDENTITY_CLAIM_MALFORMED', { claim: completion.claim }, 'warn')
      return answer(refusedAt(venue, 'SIGN_IN_FAILED'), 'CLAIM_MALFORMED')
    }
    claims = completion.claims
  } catch (cause) {
    logFailure(request.log, new Failure('OIDC_CALLBACK_FAILED', { cause }))
    return answer(refusedAt(venue, 'SIGN_IN_FAILED'), 'EXCHANGE_FAILED')
  }
  const decided = await decide(claims, venue)
  if (decided.founded) tenureGranted(decided.founded, 'OPERATOR_BOOTSTRAP')
  return answer(decided.outcome, null)
}

export const createSignIn = (ports: SignInPorts) => {
  const decide = decideWith(ports)
  const registerRoutes = async (app: FastifyInstance): Promise<void> => {
    const route = routes(app)
    route['sign-in']<{ Querystring: Record<string, unknown> }>({ url: '/protocol/oidc/login', handler: beginSignIn(ports) })
    route['sign-in']<{ Querystring: Record<string, unknown> }>({ url: '/protocol/oidc/callback', handler: completeSignIn(ports, decide) })
  }
  return Object.freeze({ registerRoutes, decide })
}
