import type { FastifyInstance, FastifyRequest } from 'fastify'
import { Failure } from '../platform/failure.js'
import type { AccountId, ResolveCurrentSession } from './current-session.js'
import { isAccountEmailAmbiguous, isAccountNotFound, isLastInstallationAdministrator } from './current-session.js'
import type { InstallationAdministration, InstallationAdministrator } from './installation-administration.js'
import { isExactOrigin } from '../platform/origin.js'

const CSRF_COOKIE = '__Host-conexus_csrf'
const EMAIL = /^.{1,320}$/
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const header = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

type Caller = Readonly<{ accountId: AccountId }>

const administratorJson = (administrator: InstallationAdministrator) => ({
  accountId: administrator.accountId,
  displayName: administrator.displayName,
  email: administrator.email,
  grantedVia: administrator.grantedVia,
  grantedBy: administrator.grantedBy,
  grantedAt: administrator.grantedAt.toISOString(),
})

export const registerInstallationRoutes = async (app: FastifyInstance, { origin, resolveCurrentSession, installationAdministration }: Readonly<{
  origin: string
  resolveCurrentSession: ResolveCurrentSession
  installationAdministration: InstallationAdministration
}>): Promise<void> => {
  const admit = async (request: FastifyRequest): Promise<Caller> => {
    if (request.method !== 'GET') {
      const csrf = header(request.headers['x-conexus-csrf'])
      if (!isExactOrigin(request.headers.origin, origin) || !csrf || csrf !== request.cookies[CSRF_COOKIE]) throw new Failure('REQUEST_AUTHENTICITY_DENIED')
    }
    const session = await resolveCurrentSession(request, request.method !== 'GET')
    if (!session) throw new Failure('AUTHENTICATION_REQUIRED')
    return { accountId: session.account.accountId }
  }
  const admitAdministrator = async (request: FastifyRequest): Promise<Caller> => {
    const caller = await admit(request)
    if (!await installationAdministration.isInstallationAdministrator(caller.accountId)) throw new Failure('INSTALLATION_ADMINISTRATOR_REQUIRED')
    return caller
  }

  app.get('/api/control/installation', async (request) => {
    const caller = await admit(request)
    return { administrator: await installationAdministration.isInstallationAdministrator(caller.accountId) }
  })

  app.get('/api/control/installation/administrators', async (request) => {
    const caller = await admitAdministrator(request)
    const administrators = await installationAdministration.list(caller.accountId)
    return { administrators: administrators.map(administratorJson) }
  })

  app.post<{ Body: { email?: unknown } }>('/api/control/installation/administrators', async (request, reply) => {
    const caller = await admitAdministrator(request)
    const { email } = request.body ?? {}
    if (typeof email !== 'string' || !EMAIL.test(email)) throw new Failure('INSTALLATION_ADMINISTRATOR_EMAIL_INVALID')
    const accountId = await installationAdministration.grantByEmail({ actor: caller.accountId, email }).catch((error: unknown) => {
      if (isAccountNotFound(error)) throw new Failure('ACCOUNT_NOT_FOUND')
      if (isAccountEmailAmbiguous(error)) throw new Failure('ACCOUNT_EMAIL_AMBIGUOUS')
      throw error
    })
    const administrators = await installationAdministration.list(caller.accountId)
    const administrator = administrators.find((entry) => entry.accountId === accountId)
    if (!administrator) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'INSTALLATION_ADMINISTRATOR_MISSING_AFTER_GRANT' } })
    return reply.code(201).send({ administrator: administratorJson(administrator) })
  })

  app.delete<{ Params: { accountId: string } }>('/api/control/installation/administrators/:accountId', async (request, reply) => {
    const caller = await admitAdministrator(request)
    const { accountId } = request.params
    if (!ACCOUNT_ID.test(accountId)) throw new Failure('ACCOUNT_NOT_FOUND')
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: debt: owning wave
    await installationAdministration.revoke({ actor: caller.accountId, account: accountId as AccountId }).catch((error: unknown) => {
      if (isLastInstallationAdministrator(error)) throw new Failure('LAST_INSTALLATION_ADMINISTRATOR')
      throw error
    })
    return reply.code(204).send()
  })
}
