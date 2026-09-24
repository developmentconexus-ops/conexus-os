import type { Environment } from './model.js'

declare const scopeBrand: unique symbol

/**
 * The authority a broker call runs under. Only this module mints one: the brand stops typed code from
 * building a scope, and the WeakSet stops untyped code (JSON, a RequestContext filled from a request)
 * from passing a look-alike object.
 */
export type ConsumerScope = Readonly<{ projectId: string; environment: Environment }> & { readonly [scopeBrand]: true }

const minted = new WeakSet<object>()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const mint = (projectId: string, environment: Environment): ConsumerScope => {
  if (!UUID.test(projectId)) throw new Error('CONNECTOR_SCOPE_REFUSED')
  const scope = Object.freeze({ projectId, environment }) as ConsumerScope
  minted.add(scope)
  return scope
}

export const isMintedScope = (value: unknown): value is ConsumerScope =>
  typeof value === 'object' && value !== null && minted.has(value)

/** Preview and the application host both serve the Preview environment until Q5. */
export const scopeFromArtifactSource = (source: Readonly<{ via: 'PREVIEW' | 'APPLICATION'; projectId: string }>): ConsumerScope =>
  mint(source.projectId, 'preview')

// Q4.9: the agent tool's scope, minted by the Hub for the session's own Project and carried in the
// session's RequestContext under this key. No agent tool exists yet.
export const CONNECTOR_SCOPE_CONTEXT_KEY = 'conexus.connectorScope'

export const scopeForAgentSession = (session: Readonly<{ projectId: string }>): ConsumerScope => mint(session.projectId, 'preview')

/** Only a scope this module minted is read back; anything a request could have filled is refused. */
export const scopeFromRequestContext = (context: Readonly<{ get(key: string): unknown }>): ConsumerScope | null => {
  const value = context.get(CONNECTOR_SCOPE_CONTEXT_KEY)
  return isMintedScope(value) ? value : null
}
