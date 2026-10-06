export const OIDC_TRANSACTION_SECONDS = 600

export const APPLICATION_SIGN_IN_COOKIE_SECONDS = 720

export const INVITATION_DAYS = 14

export const HUB_IDLE_SECONDS = 1800

/** A Hub request moves the idle limit at most once per this window, so the limit is exact to within it. */
export const HUB_SLIDE_EVERY_SECONDS = 300

export const HUB_ABSOLUTE_SECONDS = 28800

export const APPLICATION_ABSOLUTE_SECONDS = 28800

export const PROVIDER_RECHECK_SECONDS = 300

export const PREVIEW_SECONDS = 900

export const APPLICATION_HANDOFF_SECONDS = 60

export const PREVIEW_HANDOFF_SECONDS = 30

/** How long a sign out waits for Keycloak to end its own session before it logs the logout as unconfirmed. */
export const PROVIDER_LOGOUT_TIMEOUT_MS = 3_000

/** How long an invitation nobody claimed stays listed as expired before the reaper removes it. */
export const EXPIRED_INVITATION_RETENTION_DAYS = 30

/** How often the IAM reaper runs, and the rows one rule takes in one pass; a backlog drains over later passes. */
export const IAM_REAP_EVERY_MS = 5 * 60_000
export const IAM_REAP_LIMIT = 500
