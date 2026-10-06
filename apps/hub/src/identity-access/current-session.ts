import type { AccountId, EmailAddress } from '@conexus/contract'
import { digest } from '../platform/db.js'
import type { Digest, RawToken } from '../platform/db.js'

type AccountSummary = Readonly<{ accountId: AccountId; displayName: string; email?: EmailAddress }>
/** The signed in person of a Hub request. */
export type CurrentSession = Readonly<{ account: AccountSummary }>
/** The digest of a Hub session cookie: the only form of the token the Hub keeps. */
export type HubSessionDigest = Digest
export type HubSession = CurrentSession & Readonly<{ digest: HubSessionDigest }>

export const hubSessionDigest = (token: RawToken): HubSessionDigest => digest(token)
