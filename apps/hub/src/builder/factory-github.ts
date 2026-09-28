import { createAppAuth } from '@octokit/auth-app'
import { request as octokitRequest } from '@octokit/request'

const GITHUB_API_URL = 'https://api.github.com'

type GithubAccountType = 'Organization' | 'User'
export type GithubInstallation = Readonly<{ id: number; accountLogin: string; accountType: GithubAccountType }>
export type GithubRepository = Readonly<{
  id: number
  fullName: string
  owner: string
  defaultBranch: string
  private: boolean
}>

// A failure carries the HTTP status and nothing GitHub or the request said, so a token that
// reached a URL or a header can never ride out in a thrown message or a log line.
export class GithubRequestError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`FACTORY_GITHUB_REQUEST_FAILED:${status}`)
    this.status = status
  }
}

type Json = Record<string, unknown>

const statusOf = (error: unknown): number => {
  const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined
  return typeof status === 'number' ? status : 0
}

const parseRepository = (value: Json): GithubRepository => {
  const owner = value.owner as Json | undefined
  if (typeof value.id !== 'number' || typeof value.full_name !== 'string' || typeof value.default_branch !== 'string' ||
    typeof value.private !== 'boolean' || typeof owner?.login !== 'string') throw new Error('FACTORY_GITHUB_RESPONSE_REFUSED')
  return Object.freeze({ id: value.id, fullName: value.full_name, owner: owner.login, defaultBranch: value.default_branch, private: value.private })
}

const REPOSITORY_SLUG = /^[\w.-]+\/[\w.-]+$/

export type GithubApp = ReturnType<typeof createGithubApp>

/**
 * The Hub's own GitHub App client, left only for the installation settings: reading the App, its
 * installations and a recorded repository. Every token it mints is used by the Hub for one call.
 */
export const createGithubApp = ({ appId, privateKey, baseUrl = GITHUB_API_URL }: Readonly<{ appId: string; privateKey: string; baseUrl?: string }>) => {
  const request = octokitRequest.defaults({ baseUrl, headers: { 'x-github-api-version': '2022-11-28' } })
  const auth = createAppAuth({ appId, privateKey, request })
  // An installation token goes under `token`; GitHub refuses the App's own JWT unless it is `bearer`.
  const call = async (route: string, token: string, parameters: Json = {}, scheme: 'token' | 'bearer' = 'token'): Promise<Json> => {
    try {
      const response = await request(route, { ...parameters, headers: { authorization: `${scheme} ${token}` } })
      return (response.data ?? {}) as Json
    } catch (error) {
      throw new GithubRequestError(statusOf(error))
    }
  }
  const appToken = async (): Promise<string> => {
    try {
      return (await auth({ type: 'app' })).token
    } catch (error) {
      throw new GithubRequestError(statusOf(error))
    }
  }
  const installationToken = async (installationId: number, options: Readonly<{ permissions: Record<string, 'read' | 'write'> }>): Promise<string> => {
    try {
      return (await auth({ type: 'installation', installationId, permissions: options.permissions })).token
    } catch (error) {
      throw new GithubRequestError(statusOf(error))
    }
  }
  return Object.freeze({
    readApp: async (): Promise<Readonly<{ clientId: string; slug: string }>> => {
      const app = await call('GET /app', await appToken(), {}, 'bearer')
      if (typeof app.client_id !== 'string' || typeof app.slug !== 'string') throw new Error('FACTORY_GITHUB_RESPONSE_REFUSED')
      return { clientId: app.client_id, slug: app.slug }
    },
    listInstallations: async (): Promise<readonly GithubInstallation[]> => {
      const token = await appToken()
      try {
        const response = await request('GET /app/installations', { per_page: 100, headers: { authorization: `bearer ${token}` } })
        return (response.data as Json[]).map((installation) => {
          const account = installation.account as Json | undefined
          if (typeof installation.id !== 'number' || typeof account?.login !== 'string' || (account.type !== 'Organization' && account.type !== 'User')) {
            throw new Error('FACTORY_GITHUB_RESPONSE_REFUSED')
          }
          return Object.freeze({ id: installation.id, accountLogin: account.login, accountType: account.type })
        })
      } catch (error) {
        if (error instanceof Error && error.message === 'FACTORY_GITHUB_RESPONSE_REFUSED') throw error
        throw new GithubRequestError(statusOf(error))
      }
    },
    readRepository: async (installationId: number, slug: string): Promise<GithubRepository> => {
      if (!REPOSITORY_SLUG.test(slug)) throw new Error('FACTORY_GITHUB_INPUT_REFUSED')
      const [owner, repo] = slug.split('/') as [string, string]
      const token = await installationToken(installationId, { permissions: { metadata: 'read' } })
      return parseRepository(await call('GET /repos/{owner}/{repo}', token, { owner, repo }))
    },
  })
}
