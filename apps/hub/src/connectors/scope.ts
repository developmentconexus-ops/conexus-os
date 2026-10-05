import { z } from 'zod'
import { AccountId, ProjectId } from '../../../../packages/contract/dist/index.js'
import { Failure } from '../platform/failure.js'
import type { Environment } from './model.js'

/** Whether the consumer's account reads as a member of the Project or as a holder of an application grant. */
type ConsumerAccess = 'project' | 'application'

/**
 * The authority a broker call runs under. Only this module constructs one, and the terms map stops
 * untyped code (JSON, a RequestContext filled from a request) from passing a look-alike object.
 */
class Scope {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: type identity is the use
  readonly #minted = true
  constructor(
    readonly projectId: ProjectId,
    readonly accountId: AccountId,
    readonly access: ConsumerAccess,
    readonly environment: Environment,
  ) {}
}
export type ConsumerScope = Scope

/** `calls` null: no budget of the scope's own. */
type Terms = { readonly expiresAt: number | null; calls: number | null; revoked: boolean }

// Keyed by the scope, so its lifetime and budget stay out of the object a consumer holds.
const terms = new WeakMap<object, Terms>()
const Identity = z.object({ projectId: ProjectId, accountId: AccountId })

const mint = (projectId: string, accountId: string, access: ConsumerAccess, term: Terms): ConsumerScope => {
  const identity = Identity.safeParse({ projectId, accountId })
  if (!identity.success) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'CONNECTOR_SCOPE_REFUSED' } })
  const scope = new Scope(identity.data.projectId, identity.data.accountId, access, 'preview')
  Object.freeze(scope)
  terms.set(scope, term)
  return scope
}

/** Minted here, not revoked and not expired. */
export const isMintedScope = (value: unknown, now: number = Date.now()): value is ConsumerScope => {
  const term = typeof value === 'object' && value !== null ? terms.get(value) : undefined
  return term !== undefined && !term.revoked && (term.expiresAt === null || now < term.expiresAt)
}

export const spendCall = (scope: ConsumerScope): boolean => {
  const term = terms.get(scope)
  if (!term) return false
  if (term.calls === null) return true
  if (term.calls <= 0) return false
  term.calls -= 1
  return true
}

/** The Builder run that minted the scope revokes it when the run ends. */
export const revokeScope = (scope: ConsumerScope): void => {
  const term = terms.get(scope)
  if (term) term.revoked = true
}

/** Preview and the application host both serve the Preview environment for now; that will change
 * once the application host gets its own environment. No expiry and no budget of its own: the
 * invocation's timeout and its port's call limit bound it. A Preview reads as a member of the
 * Project and the application host as the account that holds access to the application. */
export const scopeFromArtifactSource = (source: Readonly<{ via: 'PREVIEW' | 'APPLICATION'; accountId: string; projectId: string }>): ConsumerScope =>
  mint(source.projectId, source.accountId, source.via === 'PREVIEW' ? 'project' : 'application', { expiresAt: null, calls: null, revoked: false })

/** One per Builder run, under the account that opened it: it expires, and every call through it spends one of its calls. */
export const scopeForBuilderRun = (
  run: Readonly<{ projectId: string; accountId: string }>,
  runTerms: Readonly<{ ttlMs: number; calls: number }>,
  now: number = Date.now(),
): ConsumerScope => mint(run.projectId, run.accountId, 'project', { expiresAt: now + runTerms.ttlMs, calls: runTerms.calls, revoked: false })
