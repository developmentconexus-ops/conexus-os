import {
  addInstallationAdministrator as addInstallationAdministratorOperation, listInstallationAdministrators,
  removeInstallationAdministrator as removeInstallationAdministratorOperation,
  type AccountId, type EmailAddress, type IdempotencyKey,
} from '@conexus/contract'
import { call, query } from '../../app/http'

const noInput = { params: undefined, query: undefined, headers: undefined, body: undefined } as const

export const administratorsQuery = query(listInstallationAdministrators, noInput)

export const addAdministrator = (email: EmailAddress, idempotencyKey: IdempotencyKey) =>
  call(addInstallationAdministratorOperation, { params: undefined, query: undefined, headers: { 'idempotency-key': idempotencyKey }, body: { email } })

export const removeAdministrator = (accountId: AccountId) =>
  call(removeInstallationAdministratorOperation, { params: { accountId }, query: undefined, headers: undefined, body: undefined })
