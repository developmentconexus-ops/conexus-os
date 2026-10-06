import { MDL02, type OwnModelAccount } from '../../../../../packages/contract/dist/index.js'
import { call } from '../../app/http'

export const accountsQueryKey = ['model-accounts'] as const

export const noInput = { params: undefined, query: undefined, headers: undefined, body: undefined } as const

export const readAccounts = () => call(MDL02, noInput)

export const ownKind = (own: OwnModelAccount) => own.state === 'connected' ? own.kind : null
