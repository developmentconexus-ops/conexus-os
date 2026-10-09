import type { SessionAccount } from '@conexus/contract'
import type { Digest } from '../platform/db.js'

/** The signed in person of a Hub request. */
export type CurrentSession = Readonly<{ account: SessionAccount }>
/** The digest of a Hub session cookie: the only form of the token the Hub keeps. */
export type HubSessionDigest = Digest
export type HubSession = CurrentSession & Readonly<{ digest: HubSessionDigest }>
