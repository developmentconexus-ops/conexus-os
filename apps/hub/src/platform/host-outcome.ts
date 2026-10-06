import type { AccountId, ProjectId } from '@conexus/contract'
import type { Caller } from './caller.js'

/** A request on an application or Preview host: served, sent to sign in, or refused because Keycloak could not be asked. */
export type HostOutcome<T> =
  | Readonly<{ kind: 'SERVED'; value: T }>
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>

/** A host request as its session resolves it: the person as the application sees them, and the access proof whose scope names the account and the Project. */
export type HostRequest<C> = Readonly<{ caller: Caller; checked: C }>

/** What hosting reads of an access proof: the account and the Project it was made for. */
export type ScopedProof = Readonly<{ scope: Readonly<{ accountId: AccountId; projectId: ProjectId }> }>
