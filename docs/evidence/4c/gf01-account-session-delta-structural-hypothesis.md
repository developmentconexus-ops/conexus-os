# GF-01 — Account/session bounded delta structural hypothesis

> **Status:** `P8 LOCKED / OPERATOR APPROVED`
> **Baseline:** GF-01 H1-R2 remains locked
> **P8 HTML:** bounded edit to the canonical GF-01 HTML; exact approved blob `e83a0e8c9e64ee47d28a58d267f5fb1169b41ed3`

## Goal

Make the already-traced Account/session interaction operable without changing the shell hierarchy or creating Account settings.

## Selected delta

```text
topbar Account trigger
→ canonical IAM-01 AccountSummary
→ non-modal Account menu
   displayName
   email? secondary
   accountId progressive technical disclosure
   Sign out of Conexus
```

The menu exists identically in Workspace and Project scope. Opening it closes any breadcrumb menu and does not create a second rail/navigation.

## Exact interaction

```text
open Account menu
→ inspect current Conexus Account
→ Sign out of Conexus
→ IAM-02 DELETE /api/session

204
→ protected shell removed
→ AUTHENTICATION_REQUIRED

401
→ session already expired
→ same authentication-required recovery

dependency/ambiguous failure
→ do not claim logout
→ keep current safe UI + explicit retry
```

Sign out ends only the opaque Conexus session. It does not promise Keycloak global SSO logout.

## Accessibility/responsive

- trigger exposes `aria-expanded`;
- Enter/Space opens; Escape closes and restores trigger focus;
- focus order reaches identity, technical disclosure and Sign out;
- click-away closes with focus recovery where appropriate;
- narrow menu becomes viewport-bounded sheet below topbar, separate from navigation drawer;
- identity and errors are textual/non-color-only.

## Forbidden

```text
Profile
Account settings/editor
Keycloak claims/roles/groups
tenant/workspace role editor
global provider logout claim
second navigation
frontend session authority
```

## Proof

Operate open/close, Escape/focus return, `204`, `401`, dependency failure, IAM-01 session expiry, Workspace/Project scopes and narrow layout. Prove displayName/email derive from IAM-01 AccountSummary and the existing GF-01 shell blob remains structurally unchanged outside the bounded topbar delta.

```text
selected hypothesis = bounded Account menu / OPERATOR APPROVED
blocking finding = 0
P8 delta = LOCKED / OPERATOR APPROVED
P9 = EXACT TRACE CLOSED
P10 = CONSOLIDATED
approved P8 artifact blob = e83a0e8c9e64ee47d28a58d267f5fb1169b41ed3
```
