import { fastifyCookie } from '@fastify/cookie'
import { getRequestHeader, type IOrganizationsProvider, MastraAuthProvider, type MastraAuthRequest } from '@mastra/core/server'
import { type AccountId, accountId, type ResolveCurrentSession } from '../identity-access/current-session.js'

export type HubSessionUser = Readonly<{ id: string; organizationId: string }>

/**
 * The Factory's auth provider is the Hub session that already exists: it signs nobody in, has no
 * login, callback or credential route, and answers only who holds the session cookie. Every Account
 * belongs to the one installation organization, and the installation administrator is its admin.
 */
export class HubSessionAuthProvider extends MastraAuthProvider<HubSessionUser> implements IOrganizationsProvider {
  readonly #orgId: string
  readonly #resolveCurrentSession: ResolveCurrentSession
  readonly #isInstallationAdministrator: (account: AccountId) => Promise<boolean>

  constructor({ orgId, resolveCurrentSession, isInstallationAdministrator }: Readonly<{
    orgId: string
    resolveCurrentSession: ResolveCurrentSession
    isInstallationAdministrator(account: AccountId): Promise<boolean>
  }>) {
    super({ name: 'conexus-hub-session' })
    this.#orgId = orgId
    this.#resolveCurrentSession = resolveCurrentSession
    this.#isInstallationAdministrator = isInstallationAdministrator
  }

  async authenticateToken(_token: string, request: MastraAuthRequest): Promise<HubSessionUser | null> {
    const cookie = getRequestHeader(request, 'cookie')
    const csrf = getRequestHeader(request, 'x-conexus-csrf')
    const session = await this.#resolveCurrentSession({
      cookies: cookie ? fastifyCookie.parse(cookie) : {},
      headers: csrf ? { 'x-conexus-csrf': csrf } : {},
    })
    return session ? { id: session.account.accountId, organizationId: this.#orgId } : null
  }

  authorizeUser(user: HubSessionUser): boolean {
    return user.organizationId === this.#orgId
  }

  async ensureOrganization(): Promise<string> {
    return this.#orgId
  }

  async isOrganizationAdmin(organizationId: string, userId: string): Promise<boolean> {
    return organizationId === this.#orgId && this.#isInstallationAdministrator(accountId(userId))
  }
}
