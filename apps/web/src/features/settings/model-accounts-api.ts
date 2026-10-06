import { listModelAccounts, type OwnModelAccount } from '@conexus/contract'
import { call } from '../../app/http'

export const accountsQueryKey = ['model-accounts'] as const

export const noInput = { params: undefined, query: undefined, headers: undefined, body: undefined } as const

export function readAccounts() {
  return call(listModelAccounts, noInput)
}

export function ownKind(own: OwnModelAccount) {
  return own.state === 'connected' ? own.kind : null
}
