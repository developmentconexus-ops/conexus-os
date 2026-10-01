# 0006. Rationale: people and sign-in

## Context

Today a person reaches Conexus only after someone created them in Keycloak by hand, with the exact
email a Workspace or application invitation names, marked verified. The first sign-in then creates the
Conexus account from that verified email (`provision_application_account`,
`0025_application_access_verification.sql:22`, and the invited branch of `createProvisioningContext`,
`identity-access/store.ts`). The Q3 single session task listed "no Keycloak admin credential in the
Hub" as a non-goal, and the decisions index says an invited person "must already exist in the
identity provider".

That does not fit a company running Conexus without its IT: the administrator would need the Keycloak
console for every hire, and an account born from an email claim is the takeover path a brokered
provider opens (finding A6 of the 0005 interrogation).

Facts from today's code and setup shape the answer:

- The Hub keys an account by Keycloak issuer and subject and never by email (`iam.account`,
  C-015), so Keycloak can broker another provider without touching Conexus sessions.
- Keycloak refuses a disabled user's refresh with "User disabled" and the Hub ends that session within
  five minutes (`oidc.ts`, `host-sessions.ts`), which the single session qualification proved on
  26.7.2.
- The realm has no SMTP, no identity provider (the login page lists none) and one client.
- `create-first-user.sh` asks for a temporary password at a prompt; that is the only person creation
  the repository has.

The operator decided on 2026-10-01 (records D3 and D5 of the study, and item 5 of the synthesis):
people are created, disabled and administered only from the Conexus screen by the installation
administrator; Conexus talks to Keycloak to do it; Keycloak only proves identity; build the Keycloak
part properly now, with no invitation bridge; the company uses Microsoft 365, so sign-in through Entra
is part of this work, configured per installation; Entra group sync is later.

## Options considered

### Option 1: Keep people in Keycloak, managed by hand, and claim by email

**Pros**:
- No new credential in the Hub.

**Cons**:
- The administrator works in two consoles, and disabling someone is two acts that can disagree.
- Accounts keep being born from an email claim, which a broker can assert.
- The operator rejected it ("no bridge").

### Option 2: A Hub service account with user management only, recorded intents, Conexus first (chosen)

The Hub holds a confidential client of the `conexus` realm whose service account has `manage-users`
and `view-users`. A create is an intent in Conexus, the Keycloak user, then the account; the invite is
Keycloak's own action email; disable is Conexus first. Microsoft sign-in is a Keycloak broker with a
tenant-specific issuer and a first-login flow that only links to existing users.

**Pros**:
- One screen; Conexus is the source of who exists.
- No password ever crosses Conexus.
- Retries converge: the intent and the Keycloak lookups make each step safe to repeat.
- Microsoft proves identity with the company's MFA, and still nobody gets in whom Conexus did not
  create.

**Cons**:
- `manage-users` can also reset passwords and delete users of the realm; only the adapter's surface,
  the realm having no human administrator, and admin events contain it.
- Invites need SMTP.

### Option 3: Option 2 with Keycloak fine-grained admin permissions v2

**Pros**:
- The credential could be limited to users Conexus created.

**Cons**:
- A second permission model to configure and test on 26.7.2; realm-management roles bypass it, so the
  two cannot be mixed. Worth it later, not as the first step.

Also rejected: SCIM or Entra provisioning into Keycloak (needs 26.8, and makes Entra the source of
people, against D3); Keycloak's default first broker login (it creates a user on any first Microsoft
sign-in, an open sign-up for the whole tenant); `trustEmail` on (Keycloak would take Microsoft's email
as verified with no check); Keycloak's built-in Microsoft provider on the `common` endpoint (any
tenant); passwords stored by Conexus (against C-015); a temporary password shown to the administrator
(a credential that travels by chat).

## Rationale

Option 2 gives the administrator one place and keeps Conexus as the authority, with the smallest
credential that can create users. Its order of steps follows from what each side is for: the account
is written only after Keycloak has the user, so there is never an account nobody can sign in as; the
disable reaches Conexus first, so a Keycloak outage never leaves a person inside Conexus; enable goes
the other way, so "Ativa" is never shown before Keycloak agrees.

The invite actions follow from where the password lives. An external person has no company account, so
they set a Keycloak password from the invite. An internal person of a Microsoft installation must not
get one: a Keycloak password would be a second door that skips the company's MFA, which is also why
"forgot password" is off and a resent invite replaces it.

For Microsoft, the tenant-specific issuer keeps every other tenant out, "Detect existing user" with
automatic linking keeps everyone the screen did not create out, `syncMode IMPORT` keeps Microsoft from
rewriting the email Conexus set, and `verifyEmail` means a link to a person who never confirmed their
mailbox still asks them to. The remaining trust is in the company's own Entra administrators, who can
set any user's mail attribute; the spec states it as a limit.

Email by Keycloak, not by the Hub: Keycloak's action token is what lets a person set a password
without Conexus ever holding it, and one sender means one SMTP setting.

## Evidence

- Platform identity study, 2026-10-01, in the operator's study notes: the Keycloak administration study
  (service account roles, create, adopt, disable order, email change, failure handling, bootstrap), the
  map of what exists, and decisions D3 and D5.
- The design arena synthesis, item 5 (the operator's decision to build this now) and R9 (no email
  holder; the account comes first).
- Interrogation finding A6: an email holder plus a broker that trusts email is a claim-by-email hole.
- The Entra app registration guide for the company's IT, in the same study notes.

## References

**Project sources**:
- `docs/decisions/index.md`: C-015, C-024, C-026, and the line "Multi-account lands at the minimum
  that is correct".
- `docs/tasks/single-session-qualification.md` sections 9 and 10 (the non-goal and its STOP law).
- `docs/reference/security-and-authority.md` sections 3 and 4.
- `infra/keycloak/{provision.sh,create-first-user.sh,realm-conexus.json,README.md,AGENTS.md}`.
- `apps/hub/src/identity-access/{oidc,store,routes,host-sessions,installation-administration,installation-routes}.ts`,
  `apps/hub/src/platform/config.ts`, migrations 0017, 0020 to 0026, 0030.
- `apps/keycloak-theme/src/login/pages/Login.tsx` (renders identity providers).

**Practices & standards**:
- Least privilege for service accounts; no shared human admin in an application realm.
- Idempotent multi-step operations with a recorded intent; fail closed on the authority side first.
- Account linking only to pre-provisioned users; never trust an external provider's email by default.

**Links**:
- Keycloak Server Administration, identity brokering and first login flows: https://www.keycloak.org/docs/latest/server_admin/#_identity_broker_first_login
- Keycloak Admin REST API: https://www.keycloak.org/docs-api/latest/rest-api/index.html
- Microsoft identity platform, OpenID Connect and tenant-specific endpoints: https://learn.microsoft.com/entra/identity-platform/v2-protocols-oidc
