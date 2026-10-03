import type { Environment } from './model.js'

declare const scopeBrand: unique symbol

/**
 * The authority a broker call runs under. Only this module mints one: the brand stops typed code from
 * building a scope, and the terms map stops untyped code (JSON, a RequestContext filled from a request)
 * from passing a look-alike object.
 */
export type ConsumerScope = Readonly<{ projectId: string; environment: Environment }> & { readonly [scopeBrand]: true }

/** `calls` null: no budget of the scope's own. */
type Terms = { readonly expiresAt: number | null; calls: number | null; revoked: boolean }

// Keyed by the frozen scope, so its lifetime and budget stay out of the object a consumer holds.
const terms = new WeakMap<object, Terms>()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const mint = (projectId: string, environment: Environment, term: Terms): ConsumerScope => {
  if (!UUID.test(projectId)) throw new Error('CONNECTOR_SCOPE_REFUSED')
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
  const scope = Object.freeze({ projectId, environment }) as ConsumerScope
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
 * invocation's timeout and its port's call limit bound it. */
export const scopeFromArtifactSource = (source: Readonly<{ via: 'PREVIEW' | 'APPLICATION'; projectId: string }>): ConsumerScope =>
  mint(source.projectId, 'preview', { expiresAt: null, calls: null, revoked: false })

/** One per Builder run: it expires, and every call through it spends one of its calls. */
export const scopeForBuilderRun = (projectId: string, runTerms: Readonly<{ ttlMs: number; calls: number }>, now: number = Date.now()): ConsumerScope =>
  mint(projectId, 'preview', { expiresAt: now + runTerms.ttlMs, calls: runTerms.calls, revoked: false })
