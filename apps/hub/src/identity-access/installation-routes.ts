import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { sendProblem } from '../http/problem.js'
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
    return { accountId: session.account.accountId }
  }
  const requireAdministrator = async (caller: Caller, reply: FastifyReply): Promise<boolean> => {
    if (await installationAdministration.isInstallationAdministrator(caller.accountId)) return true
    await sendProblem(reply, 403, 'installation-administrator-required', 'Installation administrator required')
    return false
  }

  app.get('/api/control/installation', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller) return reply
    return { administrator: await installationAdministration.isInstallationAdministrator(caller.accountId) }
  })

  app.get('/api/control/installation/administrators', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller || !await requireAdministrator(caller, reply)) return reply
    const administrators = await installationAdministration.list(caller.accountId)
    return { administrators: administrators.map(administratorJson) }
  })

  app.post<{ Body: { email?: unknown } }>('/api/control/installation/administrators', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller || !await requireAdministrator(caller, reply)) return reply
    const { email } = request.body ?? {}
    if (typeof email !== 'string' || !EMAIL.test(email)) {
      return sendProblem(reply, 400, 'installation-administrator-email-invalid', 'Email is invalid')
    }
    try {
      const accountId = await installationAdministration.grantByEmail({ actor: caller.accountId, email })
      const administrators = await installationAdministration.list(caller.accountId)
      const administrator = administrators.find((entry) => entry.accountId === accountId)
      if (!administrator) throw new Error('INSTALLATION_ADMINISTRATOR_MISSING_AFTER_GRANT')
      return reply.code(201).send({ administrator: administratorJson(administrator) })
    } catch (error) {
      if (isAccountNotFound(error)) return sendProblem(reply, 404, 'account-not-found', 'Account not found')
      if (isAccountEmailAmbiguous(error)) return sendProblem(reply, 409, 'account-email-ambiguous', 'Account email is ambiguous')
      throw error
    }
  })

  app.delete<{ Params: { accountId: string } }>('/api/control/installation/administrators/:accountId', async (request, reply) => {
    const caller = await admit(request, reply)
    if (!caller || !await requireAdministrator(caller, reply)) return reply
    const { accountId } = request.params
    if (!ACCOUNT_ID.test(accountId)) return sendProblem(reply, 404, 'account-not-found', 'Account not found')
    try {
      await installationAdministration.revoke({ actor: caller.accountId, account: accountId as AccountId })
      return reply.code(204).send()
    } catch (error) {
      if (isLastInstallationAdministrator(error)) {
        return sendProblem(reply, 409, 'last-installation-administrator', 'The last installation administrator cannot be revoked')
      }
      throw error
    }
  })
}
