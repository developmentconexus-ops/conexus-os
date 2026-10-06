import { z } from 'zod'
import { AccountId, ProjectId } from '@conexus/contract'
import { Failure } from '../platform/failure.js'

/** Whether the consumer's account reads as a member of the Project or as a holder of an application grant. */
type ConsumerAccess = 'project' | 'application'

/** A Builder run's scope expires, spends a budget and is revoked; an invocation's has none of the three, its timeout and its port's call limit bound it. */
type Term =
  | { kind: 'run'; readonly expiresAt: number; calls: number; revoked: boolean }
  | { kind: 'invocation' }

/**
 * The authority a broker call runs under. Only this module constructs one, so an object from JSON or
 * from a request context never passes for it.
 */
class Scope {
  readonly #term: Term
  constructor(
    readonly projectId: ProjectId,
    readonly accountId: AccountId,
    readonly access: ConsumerAccess,
    term: Term,
  ) {
    this.#term = term
  }

  live(now: number): boolean {
    return this.#term.kind === 'invocation' || (!this.#term.revoked && now < this.#term.expiresAt)
  }

  spend(): boolean {
    if (this.#term.kind === 'invocation') return true
    if (this.#term.calls <= 0) return false
    this.#term.calls -= 1
    return true
  }

  /** The Builder run that minted the scope revokes it when the run ends. */
  revoke(): void {
    if (this.#term.kind === 'run') this.#term.revoked = true
  }
}
export type ConsumerScope = Scope

const Identity = z.object({ projectId: ProjectId, accountId: AccountId })

const mint = (projectId: string, accountId: string, access: ConsumerAccess, term: Term): ConsumerScope => {
  const identity = Identity.safeParse({ projectId, accountId })
  if (!identity.success) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'CONNECTOR_SCOPE_REFUSED' } })
  return new Scope(identity.data.projectId, identity.data.accountId, access, term)
}

/** Minted here, not revoked and not expired. */
export const isMintedScope = (value: unknown, now: number = Date.now()): value is ConsumerScope => value instanceof Scope && value.live(now)

/** Preview and the application host both serve the Preview environment for now; that will change
 * once the application host gets its own environment. A Preview reads as a member of the
 * Project and the application host as the account that holds access to the application. */
export const scopeFromArtifactSource = (source: Readonly<{ via: 'PREVIEW' | 'APPLICATION'; accountId: string; projectId: string }>): ConsumerScope =>
  mint(source.projectId, source.accountId, source.via === 'PREVIEW' ? 'project' : 'application', { kind: 'invocation' })

/** One per Builder run, under the account that opened it: it expires, and every call through it spends one of its calls. */
export const scopeForBuilderRun = (
  run: Readonly<{ projectId: string; accountId: string }>,
  runTerms: Readonly<{ ttlMs: number; calls: number }>,
  now: number = Date.now(),
): ConsumerScope => mint(run.projectId, run.accountId, 'project', { kind: 'run', expiresAt: now + runTerms.ttlMs, calls: runTerms.calls, revoked: false })
