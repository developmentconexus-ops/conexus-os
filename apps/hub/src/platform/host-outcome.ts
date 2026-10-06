/** A request on an application or Preview host: served, sent to sign in, or refused because Keycloak could not be asked. */
export type HostOutcome<T> =
  | Readonly<{ kind: 'SERVED'; value: T }>
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>
