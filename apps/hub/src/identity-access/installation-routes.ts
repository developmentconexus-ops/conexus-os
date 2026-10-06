import type { FastifyInstance } from 'fastify'
import { Failure } from '../platform/failure.js'
import { AccountId } from '@conexus/contract'
import type { HubSession } from './current-session.js'
import { isAccountEmailAmbiguous, isAccountNotFound, isLastInstallationAdministrator } from './current-session.js'
import type { InstallationAdministration, InstallationAdministrator } from './installation-administration.js'
import { routes } from '../http/access.js'

const EMAIL = /^.{1,320}$/

const administratorJson = (administrator: InstallationAdministrator) => ({
  accountId: administrator.accountId,
  displayName: administrator.displayName,
  email: administrator.email,
  grantedVia: administrator.grantedVia,
  grantedBy: administrator.grantedBy,
  grantedAt: administrator.grantedAt.toISOString(),
})

export const registerInstallationRoutes = async (app: FastifyInstance, { installationAdministration }: Readonly<{
  installationAdministration: InstallationAdministration
}>): Promise<void> => {
  const route = routes(app)
  const admitAdministrator = async (session: HubSession): Promise<HubSession['account']> => {
    if (!await installationAdministration.isInstallationAdministrator(session.account.accountId)) throw new Failure('INSTALLATION_ADMINISTRATOR_REQUIRED')
    return session.account
  }

  route.session({ method: 'GET', url: '/api/control/installation', handler: async (_request, _reply, session) => (
    { administrator: await installationAdministration.isInstallationAdministrator(session.account.accountId) }
  ) })

  route.session({ method: 'GET', url: '/api/control/installation/administrators', handler: async (_request, _reply, session) => {
    const caller = await admitAdministrator(session)
    const administrators = await installationAdministration.list(caller.accountId)
    return { administrators: administrators.map(administratorJson) }
  } })

  route.session<{ Body: { email?: unknown } }>({ method: 'POST', url: '/api/control/installation/administrators', handler: async (request, reply, session) => {
    const caller = await admitAdministrator(session)
    const { email } = request.body ?? {}
    if (typeof email !== 'string' || !EMAIL.test(email)) throw new Failure('EMAIL_INVALID')
    const accountId = await installationAdministration.grantByEmail({ actor: caller.accountId, email }).catch((error: unknown) => {
      if (isAccountNotFound(error)) throw new Failure('ACCOUNT_NOT_FOUND')
      if (isAccountEmailAmbiguous(error)) throw new Failure('ACCOUNT_EMAIL_AMBIGUOUS')
      throw error
    })
    const administrators = await installationAdministration.list(caller.accountId)
    const administrator = administrators.find((entry) => entry.accountId === accountId)
    if (!administrator) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'INSTALLATION_ADMINISTRATOR_MISSING_AFTER_GRANT' } })
    return reply.code(201).send({ administrator: administratorJson(administrator) })
  } })

  route.session<{ Params: { accountId: string } }>({ method: 'DELETE', url: '/api/control/installation/administrators/:accountId', handler: async (request, reply, session) => {
    const caller = await admitAdministrator(session)
    const account = AccountId.safeParse(request.params.accountId)
    if (!account.success) throw new Failure('ACCOUNT_NOT_FOUND')
    await installationAdministration.revoke({ actor: caller.accountId, account: account.data }).catch((error: unknown) => {
      if (isLastInstallationAdministrator(error)) throw new Failure('LAST_INSTALLATION_ADMINISTRATOR')
      throw error
    })
    return reply.code(204).send()
  } })
}
