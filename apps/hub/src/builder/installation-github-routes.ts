import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { AccountId, ResolveCurrentSession } from '../identity-access/current-session.js'
import type { GithubApp, GithubRepository } from './factory-github.js'
import { GithubRequestError } from './factory-github.js'
import { connectFactoryInstallation } from './factory-provisioning.js'
import type { FactoryRecords } from './factory-provisioning.js'
import { isExactOrigin } from '../platform/origin.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

type Caller = Readonly<{ accountId: AccountId }>

type RepositoryStatus = 'reachable' | 'missing' | 'identity-changed' | 'unknown'
type GithubStatusState = 'not-connected' | 'connected' | 'gone' | 'unreachable'

type GithubStatus = Readonly<{
  state: GithubStatusState
  organization: Readonly<{ login: string; type: 'Organization' | 'User' }> | null
  installUrl: string
  manageUrl: string | null
  repositories: readonly Readonly<{ slug: string; state: RepositoryStatus }>[]
}>

const BATCH = 4
// Runs `read` over `items` with at most BATCH in flight at once.
const readInBatches = async <T, R>(items: readonly T[], read: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = []
  for (let start = 0; start < items.length; start += BATCH) {
    results.push(...await Promise.all(items.slice(start, start + BATCH).map(read)))
  }
  return results
}

const manageUrlOf = (accountName: string | null): string | null =>
  accountName ? `https://github.com/organizations/${accountName}/settings/installations` : null

const organizationOf = (installation: Readonly<{ accountName: string | null; accountType: string | null }>) =>
  installation.accountName ? { login: installation.accountName, type: (installation.accountType === 'User' ? 'User' : 'Organization') as 'Organization' | 'User' } : null

const repositoryState = async (github: GithubApp, installationExternalId: number, row: Readonly<{ slug: string; externalId: string }>): Promise<RepositoryStatus> => {
  let repository: GithubRepository
  try {
    repository = await github.readRepository(installationExternalId, row.slug)
  } catch (error) {
    if (error instanceof GithubRequestError && error.status === 404) return 'missing'
    return 'unknown'
  }
  return String(repository.id) === row.externalId ? 'reachable' : 'identity-changed'
}

const readGithubStatus = async ({ github, records, orgId, appSlug }: Readonly<{
  github: GithubApp
  records: FactoryRecords
  orgId: string
  appSlug: string
}>): Promise<GithubStatus> => {
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`
  const [installation] = await records.sourceControl.installations.list({ orgId })
  if (!installation) return { state: 'not-connected', organization: null, installUrl, manageUrl: null, repositories: [] }
  const organization = organizationOf(installation)
  const manageUrl = manageUrlOf(installation.accountName)
  const rows = await records.sourceControl.repositories.list({ orgId, installationId: installation.id })

  let live: readonly Awaited<ReturnType<GithubApp['listInstallations']>>[number][]
  try {
    live = await github.listInstallations()
  } catch (error) {
    if (!(error instanceof GithubRequestError)) throw error
    return {
      state: 'unreachable', organization, installUrl, manageUrl,
      repositories: rows.map((row) => ({ slug: row.slug, state: 'unknown' as const })),
    }
  }
  const state: GithubStatusState = live.some((candidate) => String(candidate.id) === installation.externalId) ? 'connected' : 'gone'
  const installationExternalId = Number(installation.externalId)
  const repositories = state === 'connected'
    ? await readInBatches(rows, async (row) => ({ slug: row.slug, state: await repositoryState(github, installationExternalId, row) }))
    : rows.map((row) => ({ slug: row.slug, state: 'unknown' as const }))
  return { state, organization, installUrl, manageUrl, repositories }
}

const CONNECT_PROBLEMS: Readonly<Record<string, string>> = {
  FACTORY_INSTALLATION_MISSING: 'github-installation-missing',
  FACTORY_INSTALLATION_AMBIGUOUS: 'github-installation-ambiguous',
  FACTORY_INSTALLATION_ORGANIZATION_REQUIRED: 'github-organization-required',
  FACTORY_INSTALLATION_ACCOUNT_CHANGED: 'github-installation-account-changed',
}

export const registerInstallationGithubRoutes = async (app: FastifyInstance, { origin, resolveCurrentSession, isInstallationAdministrator, github, records, orgId, appSlug }: Readonly<{
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  isInstallationAdministrator(account: AccountId): Promise<boolean>
  github: GithubApp
  records: FactoryRecords
  orgId: string
  appSlug: string
}>): Promise<void> => {
  const admit = async (request: FastifyRequest, reply: FastifyReply): Promise<Caller | null> => {
    if (request.method !== 'GET') {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (!isExactOrigin(request.headers.origin, origin) || !csrf || csrf !== request.cookies[CSRF_COOKIE]) {
        await sendProblem(reply, 403, 'request-authenticity-denied', 'Request authenticity denied')
        return null
      }
    }
    const session = await resolveCurrentSession(request, request.method !== 'GET')
    if (!session) {
      await sendProblem(reply, 401, 'authentication-required', 'Authentication required')
      return null
    }
    const caller = { accountId: session.account.accountId }
    if (!await isInstallationAdministrator(caller.accountId)) {
      await sendProblem(reply, 403, 'installation-administrator-required', 'Installation administrator required')
      return null
    }
    return caller
  }

  app.get('/api/control/installation/github', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    return readGithubStatus({ github, records, orgId, appSlug })
  })

  app.post('/api/control/installation/github/connect', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    try {
      await connectFactoryInstallation({ github, records, orgId, write: () => undefined })
    } catch (error) {
      if (error instanceof GithubRequestError) return sendProblem(reply, 502, 'github-unreachable', 'GitHub is unreachable')
      if (error instanceof Error) {
        const [code, ...rest] = error.message.split(': ')
        const type = code ? CONNECT_PROBLEMS[code] : undefined
        if (type) return sendProblem(reply, 409, type, 'GitHub connection refused', rest.join(': ') || undefined)
      }
      throw error
    }
    return readGithubStatus({ github, records, orgId, appSlug })
  })
}
