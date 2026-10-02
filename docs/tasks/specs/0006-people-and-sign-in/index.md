# 0006. People and sign-in: the people screen, Keycloak behind it, Microsoft sign-in

**Date**: 2026-10-01
**Status**: Proposed
**Amends**: the Hub sign-in (`identity-access/store.ts`, `routes.ts`, `host-sessions.ts`), IAM-03 and
IAM-05, `infra/keycloak`. [0005](../0005-app-access-perfis/index.md) depends on this spec for every
account it maps. The records it reopens are listed under *Follow-up* and need the operator's approval
before this spec is Accepted.
**Depends on**: [0008](../0008-configuration-model/index.md) slice 1 for this spec's realm slice
(slice 1), because 0008's `apply keycloak` replaces `configure-realm.sh`. The direction is one way:
0008's slice 1 does not depend on this spec. The Microsoft and sender work (slice 7, operator steps
1 and 5) lands with 0008's slice 3.

## Summary

The installation administrator creates every person from a new **Pessoas** screen in Conexus: name,
email, and whether the person is from the company (`INTERNAL`) or from outside (`EXTERNAL`). The Hub
creates the matching user in Keycloak through a service account whose Keycloak permissions cover
reading, creating, updating, disabling and inviting users and nothing on roles, groups, clients or the
realm, stores the
Conexus account only after Keycloak returns the user's id, and has Keycloak email an invite that
verifies the address and, when the person needs one, sets a password. Nobody types or sees a password
in Conexus. The same screen disables a person (in Conexus first, then in Keycloak), re-enables them
with the same identity, changes their email and resends the invite. No person is ever deleted. A
sign-in by anyone the screen did not create is refused. When the company uses Microsoft 365, Keycloak
brokers the sign-in to the company's own Entra tenant and links it only to a user Conexus created, so
Microsoft proves who the person is and Conexus still decides what they may do.

## Requirements

**User stories**:
- As the installation administrator, I add a person from the company or from outside on one screen,
  and they get an email to start using Conexus.
- As the installation administrator, I disable someone who left and know they are out of every
  Conexus surface at their next request, and I can bring them back with their history intact.
- As a person from the company, I sign in with my Microsoft 365 account and land in Conexus.
- As a person from outside, I set my own password from the invite link.
- As the Conexus operator, I know exactly what the Hub's Keycloak credential can do in its one realm,
  every use of it is recorded, and any use the Pessoas screen never makes is shown to the administrator.

**Out of scope** (named so nobody builds them here): cargos, perfis and their assignment
([0005](../0005-app-access-perfis/index.md)); Entra group to cargo sync and SCIM provisioning (later,
only on a real need); self-registration (roadmap step 10); renaming a person; changing a person's kind;
deleting a person; a Conexus-branded email theme (Keycloak's own Portuguese text is used); narrowing the
credential to the users Conexus created (Keycloak permissions per user or group); back-channel logout.

**Acceptance criteria** (each is checked on its own; the proof is named in brackets: a suite under
`tests/implementation/`, new when absent today, or a live check):

People records
- **AC-1**: `iam.account.kind` (`INTERNAL` or `EXTERNAL`, fixed at creation) replaces
  `iam.account.origin`. The migration maps `CONTROL_PLANE` and any account with a Workspace membership
  to `INTERNAL`, and the rest to `EXTERNAL`. `iam.account_access_scope` derives only from `kind`:
  `INTERNAL` is `CONTROL_PLANE`, `EXTERNAL` is `APPLICATION_ONLY`. [`identity-access-postgres`]
- **AC-2**: An email belongs to at most one account: a unique index on `lower(email)`. The migration
  fails and names the accounts when two already share one. [`identity-access-postgres`]
- **AC-3**: Only an installation administrator reads or changes people. Every people route answers
  `403 installation-administrator-required` to anyone else, and the Pessoas section is absent from
  their settings rail. [`installation-people-routes`, `installation-people-browser`]
- **AC-4**: An account is created only by CreatePerson (AC-6) or by IAM-03 for the configured bootstrap
  subject. This is a hard rule, not a setting: admission is `SCREEN`, the only value, until admission
  by group exists (0008 decision 6). `iam.provision_application_account` and
  `iam.email_has_open_invitation` are dropped;
  `createProvisioningContext` and `provisionBootstrap` lose their invitation branch. A verified
  identity with no account that is not the bootstrap subject gets `403` at the Hub callback and
  `NOT_GRANTED` at an application sign-in. [`identity-access-postgres`, `identity-access-http`,
  `application-access-http`]
- **AC-5**: IAM-05 refuses an email that names no active `INTERNAL` account (`404 person-not-found`)
  or names an `EXTERNAL` one (`409 person-external`). Granting installation administration refuses an
  `EXTERNAL` account. [`workspace-membership-http`, `installation-administrator-postgres`]

Create a person
- **AC-6**: CreatePerson takes a client-chosen `intentId` and runs: open `iam.person_intent`, find or
  create the Keycloak user, insert the account, send the invite (*Create*). The account row is written
  only after Keycloak returns the user's id. The same `intentId` with the same body resumes the intent
  or returns its result; with a different body it answers `409 idempotency-conflict`.
  [`people-provisioning`]
- **AC-7**: A Keycloak user with the same email and no Conexus account is adopted: enabled, given the
  typed name, and recorded with `adopted: true`. One already linked to a Conexus account answers
  `409 person-exists` with that person's id and status. [`people-provisioning`]
- **AC-8**: The invite is Keycloak's `execute-actions-email` with `lifespan` from the constant
  `INVITE_LIFETIME` (14 days, 1209600 seconds; 0008 AC-28), `client_id=conexus-hub` and the actions
  of *Invite*, chosen by `kind` and `identity.source.kind`. When it fails, the person still exists, the
  answer is `201` with `invite: { state: 'NOT_SENT', reason }`, and the screen says why and offers
  "Reenviar convite". No route accepts, returns or logs a password. [`people-provisioning`]
- **AC-9**: A stop between any two steps leaves an open intent that the Pessoas screen lists with
  "Tentar de novo". Resending it converges to one Keycloak user and one account. Two concurrent
  creates of one email end in one person and one `409 person-pending` or `409 person-exists`.
  [`people-provisioning`]

Disable, enable, email, invite
- **AC-10**: DisablePerson, in one transaction, sets the account inactive, ends every open host session
  and unredeemed handoff of it, sets `provider_sync = 'DISABLE'` and appends an event; then it sets the
  Keycloak user disabled and signs it out, and clears `provider_sync`. When Keycloak fails, the answer
  is `202` with `providerSync: 'DISABLE'` and Conexus already refuses the person. It refuses the actor
  (`409 cannot-disable-self`), the last active installation administrator (`409
  last-installation-administrator`) and the last owner of a Workspace (`409 last-owner`, naming the
  Workspace). [`people-provisioning`, `identity-access-postgres`]
- **AC-11**: EnablePerson enables the Keycloak user, then sets the account active. The account keeps its
  id, Keycloak subject, memberships and administrator role. [`people-provisioning`]
- **AC-12**: ChangePersonEmail takes a client-chosen `changeId` and records the target address in
  `iam.person_email_change` as `PENDING` before any Keycloak call (*Change email*). Then it writes the
  address to Keycloak with `emailVerified: false`, emails a `VERIFY_EMAIL` action, and settles: the
  account takes the new address and the change becomes `APPLIED`, or `SEND_FAILED` when only the email
  failed. A Keycloak conflict settles it `REFUSED` with the account unchanged and answers `409
  email-taken`. The same `changeId` with the same body resumes the change or returns its result; a
  different body answers `409 idempotency-conflict`; a second change of one person while one is
  `PENDING` answers `409 email-change-pending`. [`people-provisioning`]
- **AC-13**: SendPersonInvite sends the actions of *Invite* (by `kind` and `identity.source.kind`)
  with the `INVITE_LIFETIME` lifespan to an active person and records the outcome as in AC-8.
  [`people-provisioning`]
- **AC-14**: Repeating an action whose Keycloak step failed converges to the target state. The people
  list shows each person's `providerSync`, invite state and open email change. [`people-provisioning`]
- **AC-24**: An email change survives every stop. The test stops the Hub after the `PENDING` row and
  before `updateUser`, after `updateUser` and before `sendActions`, and makes `sendActions` fail; in
  each case the row keeps the target address, the account keeps the old one until the change settles,
  and a repeat of the same `changeId` ends with Keycloak and the account holding the new address and
  the change `APPLIED`. A Keycloak user whose email already equals the target is not written again.
  [`people-provisioning`]

Audit
- **AC-15**: `iam.access_event` is append only: no role may update or delete it, and only the IAM
  definer functions insert. Each create (adopted or not), invite sent or not sent, disable, enable,
  email change and provider failure appends one row with actor, time, person and change, and no
  secret. The `conexus` realm saves admin events. [`identity-access-postgres`, `keycloak-people-probe`]
- **AC-25**: Removed (see 0008 and the leaver path). The five-minute admin-event sweep, its cursor and its
  alerts no longer exist; the number stays so references to AC-26 onward and to the review do not move.
  *Rationale* says why.

The adapter and its credential
- **AC-16**: `identity-access/keycloak-admin.ts` returns an object with exactly `findUser`, `readUser`,
  `createUser`, `updateUser`, `logout` and `sendActions`. Every URL comes from a
  fixed template under the configured issuer's `/admin/realms/<realm>/users`; a user id is parsed as a UUID; `sendActions` takes one of the
  named action sets of *Invite*. Only `identity-access/people.ts` imports it. No delete, credential,
  password, role-mapping, group or impersonation call exists in it. [`keycloak-admin-adapter`]
- **AC-17**: At start the Hub gets a client-credentials token and refuses to start with
  `KEYCLOAK_PROVISIONER_ROLES` unless its `realm-management` roles are exactly `query-users`. Any other role, `manage-users` and `view-users` included, would bypass the
  permissions of *Provisioner authority*. The token stays inside the adapter, is reused until 30
  seconds before it expires, and is never logged. [`keycloak-admin-adapter`]

Realm, bootstrap and Microsoft
- **AC-18**: `conexus-settings apply keycloak` (`npm run conexus:settings -- apply keycloak`,
  [0008](../0008-configuration-model/index.md), which replaces `configure-realm.sh`) converges a
  running `conexus` realm to *Realm* and *Provisioner authority*. Its desired state is
  `realm-conexus.json` plus `identity.session.*`, `identity.source`, `mail.smtp`, `CONEXUS_ORIGIN`
  and the operator secrets directory. A second run changes nothing and says so, and each run writes
  `settings.enforcement`. It refuses to run with `mail.smtp` unset, and fails when any user of the
  realm holds a `realm-management` role other than the service account's two, or when any
  permission or policy of the `admin-permissions` client is not one it created.
  [`keycloak-people-probe`, live]
- **AC-19**: `conexus-settings first-person --email --name --hub-env` creates the first person with no
  password typed anywhere, sends the invite and writes `CONEXUS_BOOTSTRAP_SUBJECT`. It is the last
  step of 0008's *Fresh install order*, after `apply keycloak` and before the Hub's first sign-in,
  and signs in as the provisioner client with `keycloak-provisioner`, not as the bootstrap or
  break-glass account. It refuses when `keycloak-provisioner` is missing or a person already exists.
  `create-first-user.sh` is deleted and `provision.sh` has no `--first-admin-*` flag. [live check]
- **AC-20**: `apply keycloak` creates or updates the identity provider and the flow
  `conexus-first-broker-login` from `identity.source` (0008 AC-24), with the alias from the setting,
  not the literal `microsoft`, and the exact settings of *Microsoft sign-in*. `--entra-file` does not
  exist. [`keycloak-people-probe`]
- **AC-21**: Live Entra sign-in on local Conexus, with the company's app registration: a person created
  on the Pessoas screen signs in with Microsoft and lands in the Hub as the same account and Keycloak
  subject; a tenant account the screen did not create is refused with the Portuguese message and no
  Keycloak user appears; a disabled person is refused. When that person's Hub session ends for any
  reason but sign-out, the next sign-in carries `kc_idp_hint=<alias>` and lands in the Hub with no
  form while the Microsoft session is alive (0008 AC-27). [live check, in the release evidence]

Screen and live proof
- **AC-22**: Settings > Instalação > Pessoas lists people (name, email, Da empresa or De fora, Ativa
  or Desativada, invite state, pending provider step) and open intents, with a filter by name or
  email. It creates a person, and per person it disables (with confirmation), re-enables, changes the
  email and resends the invite, each error code shown as a sentence. When active people from the
  company hold no cargo (0005), the screen shows "N pessoas sem cargo" with a filter for them, and
  blocks nothing. [`installation-people-browser`, live check]
- **AC-23**: `scripts/keycloak-people-probe.mjs` against the local Keycloak 26.7.2 with a local mail
  catcher: create an internal and an external person, adopt a hand-made user, retry an intent, receive
  the invite with its actions and 14-day link, complete it and sign in to the Hub, change the email,
  disable (the refresh is refused with "User disabled" and the Hub session is ended), re-enable (same
  subject). With the provisioner token it then checks both sides of *Provisioner authority*: set a
  password (`PUT .../reset-password`), add a realm role mapping, join a group, impersonate, update
  the realm and create a client are each answered `403`; on a throwaway user the probe made, deleting a
  credential and deleting the user are answered `204`. [`keycloak-people-probe`, live]

## Decision

**Chosen option**: Option 2 of [rationale.md](rationale.md): the Hub holds a Keycloak service account
whose authority over its own realm is set by Keycloak's admin permissions (v2) and excludes roles,
groups, password setting and impersonation, people are created through a recorded intent, Conexus is
switched off first and Keycloak second, and Microsoft sign-in is a Keycloak broker that only links to
users Conexus created.

**Implementation skills**: `conexus-development` (`.agents/skills/conexus-development/`) · `mastra`
(`.agents/skills/mastra/`, to confirm no installed Mastra mechanism applies)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Design

### Data (where each fact lives, who writes it)

| Fact | Store | Writer |
|---|---|---|
| A person: account, kind, email, active | `iam.account` | the people functions; IAM-03 for the bootstrap person |
| A create in flight | `iam.person_intent` | the people functions |
| A Keycloak step still owed | `iam.account.provider_sync`, `provider_sync_since` | the people functions |
| An email change in flight, with its target address | `iam.person_email_change` | the people functions |
| Invite outcome | `iam.account.invite_state`, `invite_sent_at`, `invite_failure` | the people functions |
| Audit of people and access changes | `iam.access_event` (append only; 0005 adds its own changes) | IAM definer functions |
| Proof of identity, password, Microsoft link | the Keycloak user of the `conexus` realm | Keycloak, on the Hub's request or the person's |
| Keycloak's record of admin calls | Keycloak admin events, 90 days | Keycloak |
| What the provisioner may do | the `admin-permissions` client of the `conexus` realm | `apply keycloak` (0008) |

Keycloak holds no Conexus fact. Its user carries a username Conexus chooses (the planned account id, a
UUID), the email, the first and last name, `enabled` and `emailVerified`, and nothing else.

### Create (AC-6 to AC-9)

```ts
// identity-access/people.ts
type PersonKind = 'INTERNAL' | 'EXTERNAL'
type CreatePerson = Readonly<{ intentId: string; displayName: string; email: EmailAddress; kind: PersonKind }>
type InviteState = 'SENT' | 'NOT_SENT'
type InviteFailure = 'EMAIL_NOT_SENT' | 'PROVIDER_UNAVAILABLE'
type CreatedPerson = Readonly<{ person: Person; adopted: boolean; invite: { state: InviteState; reason?: InviteFailure } }>
export type People = Readonly<{
  list(actor: AccountId): Promise<Readonly<{ people: readonly Person[]; intents: readonly OpenIntent[]; emailChanges: readonly OpenEmailChange[] }>>
  create(actor: AccountId, input: CreatePerson): Promise<CreatedPerson>
  disable(actor: AccountId, account: AccountId): Promise<Person>
  enable(actor: AccountId, account: AccountId): Promise<Person>
  changeEmail(actor: AccountId, account: AccountId, change: Readonly<{ changeId: string; email: EmailAddress }>): Promise<Person>
  sendInvite(actor: AccountId, account: AccountId): Promise<Person>
}>
```

1. `iam.open_person_intent(actor, intent_id, kind, email, display_name, request_digest)`: refuses a
   non-administrator, an email held by an account (`person-exists`) or by another open intent
   (`person-pending`, a unique partial index on `lower(email) WHERE state = 'OPEN'`). It returns the
   intent with its planned `account_id`; a repeat with the same id returns the stored row, and a
   different digest raises `IDEMPOTENCY_CONFLICT`. A `DONE` intent returns the person.
2. Keycloak: `findUser({ username: planned account_id })`, then `findUser({ email })`. A user found by
   email is adopted unless an account already has its id as `external_subject`. Otherwise `createUser`
   with `{ username, email, firstName, lastName, enabled: true, emailVerified: false }`; a `409`
   repeats the two lookups. The name splits at the first space, as `create-first-user.sh` did.
3. `iam.complete_person_intent(actor, intent_id, subject, adopted)`: inserts the account (`issuer` =
   `CONEXUS_OIDC_ISSUER`, `external_subject` = the Keycloak id), marks the intent `DONE` and appends
   `PERSON_CREATED`.
4. `sendActions` (*Invite*), then `iam.record_invite(actor, account, outcome, failure)`.

A failed step 2 leaves the intent `OPEN` with `last_failure`; a failed step 4 leaves a person with
`invite_state = 'NOT_SENT'`. The administrator may abandon an open intent
(`iam.abandon_person_intent`); a Keycloak user it created stays unlinked and is adopted by a later
create of that email.

### Invite (AC-8, AC-13)

| Person | `identity.source.kind` | Actions |
|---|---|---|
| `EXTERNAL` | either | `VERIFY_EMAIL`, `UPDATE_PASSWORD` |
| `INTERNAL` | `LOCAL` | `VERIFY_EMAIL`, `UPDATE_PASSWORD` |
| `INTERNAL` | `BROKERED` | `VERIFY_EMAIL` |

An internal person of a brokered installation gets no Keycloak password, so the only way in skips no
company MFA. The call passes `client_id=conexus-hub` and no `redirect_uri`; after the actions Keycloak
shows its "account updated" page with a link to the client's `baseUrl`, the Hub. Keycloak answers
`500 Failed to send execute actions email` when it cannot send: the Hub maps it to `EMAIL_NOT_SENT`,
and any transport failure or other `5xx` to `PROVIDER_UNAVAILABLE`.

### Without email (SMTP)

Keycloak sends every invite; the Hub sends no email. The sender is the one Conexus email account of
every installation in the pilot (0008 decision 3), the setting `mail.smtp` with its password in the
operator secrets directory. `apply keycloak` refuses to run with `mail.smtp` unset, so a configured
realm always has a sender. If sending still fails, the
person exists, the invite reads "Não enviado" and the screen says: "O convite não foi enviado. O envio
de e-mail do login não está funcionando; peça ao responsável técnico para conferir e depois use
Reenviar convite." There is no temporary password fallback: the Hub never sets, shows or emails a
password.

### Disable, enable, email (AC-10 to AC-12, AC-14, AC-24)

Disable is Conexus first, because Conexus is what the person reaches: `iam.disable_person(actor,
account)` sets `active = false`, ends every open `iam.host_session` of the account (Hub, application
and Preview) and its unredeemed `iam.handoff` rows as `revoke_application_grant` does for one Project
(`0026_single_session.sql:460`), sets `provider_sync = 'DISABLE'` and appends `PERSON_DISABLED`. The
Hub then calls `readUser`, `updateUser` with `enabled: false`, and `logout`, and
`iam.settle_provider_sync(actor, account, 'DISABLE')` clears the flag. Keycloak ends the person's other
refreshes within five minutes as today (`USER_DISABLED`).

Enable is Keycloak first (`updateUser` with `enabled: true`), then `iam.enable_person`, so the screen
shows "Ativa" only when both agree. Disabling keeps memberships, the administrator role and, under
0005, cargo holdings and perfil assignments; an inactive account matches none of them.

**Change email.** Conexus records the target before Keycloak hears of it, so no stop loses the address:

1. `iam.request_person_email_change(actor, account, change_id, email, request_digest)` refuses an
   address held by another account, an open create intent or another open change (`email-taken`), and
   a second open change of the account (`email-change-pending`). It inserts the change as `PENDING`
   with the old and new address and appends `PERSON_EMAIL_CHANGE_REQUESTED`. A repeat with the same id
   returns the stored row; a different digest raises `IDEMPOTENCY_CONFLICT`.
2. `readUser`; when the Keycloak email is not already the target, `updateUser` writes `{ email,
   emailVerified: false }`. A `409` goes to step 4 as `REFUSED`.
3. `sendActions('VERIFY_EMAIL')`.
4. `iam.settle_person_email_change(actor, change_id, outcome, failure)`, in one transaction: on
   `APPLIED` or `SEND_FAILED` the account takes the new address and `PERSON_EMAIL_CHANGED` is appended
   with both addresses; on `REFUSED` the account is unchanged.

| State | Keycloak email | Account email | What a repeat of the `changeId` does |
|---|---|---|---|
| `PENDING` | old or new | old | steps 2 to 4 |
| `SEND_FAILED` | new | new | step 3, then settles `APPLIED` |
| `APPLIED` | new | new | returns the person |
| `REFUSED` | old | old | returns `409 email-taken` |

A failed Keycloak write or a stop leaves the change `PENDING` with `last_failure`; the Pessoas screen
shows "Troca de e-mail pendente" with "Tentar de novo", which repeats the same `changeId`. While a
change is `PENDING` the person still signs in: the Hub keys the account by Keycloak subject, never by
email.

`updateUser` reads the user and writes back the whole representation with the changed fields: under
Keycloak 26's user profile, a partial representation can drop attributes.

### The Keycloak adapter (AC-16, AC-17)

```ts
// identity-access/keycloak-admin.ts
type KeycloakUserId = string & { readonly __brand: 'KeycloakUserId' }
type KeycloakUser = Readonly<{ id: KeycloakUserId; username: string; email: string | null; firstName: string; lastName: string; enabled: boolean; emailVerified: boolean }>
type ActionSet = 'INVITE_WITH_PASSWORD' | 'INVITE_VERIFY_ONLY' | 'VERIFY_EMAIL'
type AdminFailure = Readonly<{ kind: 'CONFLICT' } | { kind: 'NOT_FOUND' } | { kind: 'EMAIL_NOT_SENT' } | { kind: 'UNAVAILABLE' } | { kind: 'REFUSED'; status: number }>
type AdminEvent = Readonly<{ time: number; operationType: string; resourceType: string; resourcePath: string; authRealm: string; authClientId: string; authUserId: string }>
export type KeycloakAdmin = Readonly<{
  findUser(by: { username: string } | { email: EmailAddress }): Promise<KeycloakUser | null>
  readUser(id: KeycloakUserId): Promise<KeycloakUser | null>
  createUser(user: Omit<KeycloakUser, 'id' | 'emailVerified'>): Promise<KeycloakUserId | AdminFailure>
  updateUser(id: KeycloakUserId, change: Partial<Pick<KeycloakUser, 'email' | 'enabled' | 'firstName' | 'lastName'>> & { emailVerified?: false }): Promise<'OK' | AdminFailure>
  logout(id: KeycloakUserId): Promise<'OK' | AdminFailure>
  sendActions(id: KeycloakUserId, actions: ActionSet): Promise<'OK' | AdminFailure>
}>
export const createKeycloakAdmin = (input: Readonly<{ issuer: string; clientSecret: string }>): Promise<KeycloakAdmin>
```

The admin base is the issuer's origin plus `/admin/realms/` plus the realm name from the issuer path;
the token endpoint comes from the issuer's discovery document. The client id is the constant
`conexus-hub-provisioner`. The adapter reuses the local issuer transport of `oidc.ts` (the WSL loopback
binding), moved to one shared function. Lookups use `exact=true`. `createUser` reads the id from the
`Location` header.

### Realm (AC-18, AC-19)

`realm-conexus.json` gains the settings the Hub now depends on; the README table gets one row each:

| Setting | Value | Why |
|---|---|---|
| `registrationAllowed` | `false` | Only the Pessoas screen creates people. |
| `duplicateEmailsAllowed` | `false` | One email, one person, as in Conexus; the Microsoft link matches by email. |
| `loginWithEmailAllowed`, `editUsernameAllowed` | `true`, `false` | People type their email; the username is the opaque id Conexus chose. |
| `verifyEmail` | `true` | Every sign-in, with a password or with Microsoft, carries a verified email. |
| `resetPasswordAllowed` | `false` | An internal person of a brokered installation must not create a password; a forgotten password is a resent invite. |
| `eventsEnabled`, `eventsExpiration`, `enabledEventTypes` | `true`, `7776000`, `LOGIN`, `LOGIN_ERROR`, `IDENTITY_PROVIDER_FIRST_LOGIN`, `IDENTITY_PROVIDER_LOGIN_ERROR`, `EXECUTE_ACTIONS`, `VERIFY_EMAIL`, `UPDATE_PASSWORD` | Sign-in and invite evidence for 90 days. |
| `adminEventsEnabled`, `adminEventsDetailsEnabled`, attribute `adminEventsExpiration` | `true`, `false`, `7776000` | Every use of the Hub's admin credential is recorded, without user representations. |
| `ssoSessionMaxLifespan`, `ssoSessionIdleTimeout`, `accessTokenLifespan` | derived from `identity.session` (0008 AC-19); not in the file | The Hub and Keycloak end a session from one setting. |
| client `conexus-hub` `baseUrl` | from `CONEXUS_ORIGIN` (0008 AC-26); not in the file | Where Keycloak's page sends a person after an invite. |
| client `conexus-hub-provisioner` | confidential, service accounts only: no standard flow, no direct grants, no implicit flow | The Hub's admin credential. Its service account holds `realm-management` `query-users` only; *Provisioner authority* gives it the rest. |
| `adminPermissionsEnabled` | `true` | Turns on admin permissions v2 for the realm, which *Provisioner authority* configures. |

`apply keycloak` (0008) applies the same file to a running realm: realm attributes, missing clients
created from the file, the service account's two roles, the permissions of *Provisioner authority*,
the client secret generated once and written to `keycloak-provisioner` in the operator secrets
directory (mode 600) when that file is absent, and replaced by `--init --rotate`. It also sets the per-installation parts no file in the repository holds, from settings:
the session fields from `identity.session.*`, the `conexus-hub` redirect URIs and `baseUrl` from
`CONEXUS_ORIGIN`, SMTP from `mail.smtp` (`host`, `port`, `from`, `fromDisplayName`, `starttls`,
`ssl`, `auth`, `user`) with the password file `smtp-password` of the operator secrets directory, and
*Microsoft sign-in* from `identity.source`. Flows and identity providers are set by `apply keycloak`
only, because a realm import that carries `authenticationFlows` replaces Keycloak's built-in flows.
A fresh install follows 0008's *Fresh install order*. Its last step, `conexus-settings first-person
--email --name --hub-env`, creates the first person through the Keycloak admin API with the
provisioner credential, exactly as CreatePerson does, sends `INVITE_WITH_PASSWORD`, and writes
`CONEXUS_BOOTSTRAP_SUBJECT`. It is a `conexus-settings` subcommand so the operator keeps one tool
after `provision.sh`. It cannot run earlier: SMTP is set before `apply keycloak`, and `--init`
deletes the bootstrap admin.
The `conexus` realm has no human administrator. The `master` realm holds the operator's break-glass
account and the `conexus-settings` service account that `apply keycloak` uses (0008 AC-13); the
bootstrap admin is temporary in Keycloak 26, and `apply keycloak --init` deletes it.

### Provisioner authority (AC-17, AC-18, AC-23)

Keycloak 26.7.2 offers two ways to authorize an admin client, and they do not mix: a
`realm-management` role such as `manage-users` or `view-users` bypasses every admin permission v2 for
what it covers. The `manage-users` role lets its holder view, manage (create, update, delete), map
roles and manage group membership of every user, and view and manage every group; with it the
provisioner could also give `manage-users` to another user. So the service account holds no such role
and is authorized by admin permissions v2, which 26.7.2 enables by default (feature
`admin-fine-grained-authz:v2`, supported since 26.2; the realm switch is `adminPermissionsEnabled`).

`apply keycloak` converges these objects in the `admin-permissions` client
(`/admin/realms/conexus/clients/<its id>/authz/resource-server`), with the service account user
`service-account-conexus-hub-provisioner`:

| Object | Kind | Settings |
|---|---|---|
| `conexus-provisioner` | user policy | `users`: the service account user, `logic` `POSITIVE` |
| `conexus-nobody` | user policy | `users`: none, `logic` `POSITIVE` (denies everyone) |
| `conexus-provisioner-users` | scope permission | `resourceType` `Users`, all users, `scopes` `view`, `manage`, `policies` `conexus-provisioner` |
| `conexus-provisioner-no-password` | scope permission | `resourceType` `Users`, all users, `scopes` `reset-password`, `policies` `conexus-nobody` |

No permission grants `map-roles`, `manage-group-membership` or `impersonate`, and none touches Groups,
Clients, Roles or Organizations, so those calls are refused. The explicit `reset-password` denial is
needed because, with no such permission, Keycloak falls back to `manage` for setting a password. It
denies everyone rather than the service account alone: a `NEGATIVE` policy on the service account would
grant every other user of the realm the `reset-password` scope, making each one a delegated admin.
`query-users` lets the account search. The Hub holds no role to read admin events.

What the credential can do, endpoint by endpoint (26.7.2 checks `manage` for every user write below):

| Can, and the adapter uses | Can, and the adapter never calls | Cannot (`403`) |
|---|---|---|
| search, read, create, update (name, email, `enabled`) a user; `execute-actions-email`; `logout` | delete a user; delete a credential or disable credential types; unlink a Microsoft identity; revoke a consent; read login events | set a password (`reset-password`); map roles; change group membership; impersonate; any realm, client, group or role change |

The middle column is the residual authority, and Keycloak offers no switch that removes it while
`manage` remains: v2 ties delete to `manage`. Its sharpest use is a takeover: whoever holds the secret
can point a person's email at their own mailbox and send `UPDATE_PASSWORD`. *Key invariants and
security model* lists what contains it.

### Microsoft sign-in (AC-20, AC-21)

Identity provider, set by `apply keycloak` from `identity.source` (`{ kind: 'BROKERED', alias, tenantId,
clientId, secretExpiresOn }`, 0008 AC-24) and the `entra-client-secret` file of the operator secrets
directory:

| Setting | Value |
|---|---|
| alias, provider, display name | `identity.source.alias` (for example `microsoft`), `oidc` (OpenID Connect v1.0), `Microsoft` |
| `issuer` | `https://login.microsoftonline.com/<tenantId>/v2.0` |
| `authorizationUrl`, `tokenUrl` | `https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/authorize`, `.../oauth2/v2.0/token` |
| `jwksUrl`, `useJwksUrl`, `validateSignature` | `https://login.microsoftonline.com/<tenantId>/discovery/v2.0/keys`, `true`, `true` |
| `clientId`, `clientSecret`, `clientAuthMethod` | `identity.source.clientId`, the `entra-client-secret` file, `client_secret_post` |
| `defaultScope`, `pkceEnabled`, `pkceMethod` | `openid profile email`, `true`, `S256` |
| `disableUserInfo` | `true` (the ID token carries the claims) |
| `trustEmail` | `false` |
| `syncMode` | `IMPORT` (Microsoft never rewrites the email or name Conexus set) |
| `storeToken`, `linkOnly`, `hideOnLogin` | `false`, `false`, `false` |
| `firstBrokerLoginFlowAlias` | `conexus-first-broker-login` |

Flow `conexus-first-broker-login` (basic flow, top level): `idp-detect-existing-broker-user`
(Detect existing broker user) `REQUIRED`, then `idp-auto-link` (Automatically set existing user)
`REQUIRED`. A Microsoft sign-in whose email matches no user ends in Keycloak's error page and creates
no user; the `conexus` theme's text for that error is "Você ainda não tem acesso ao Conexus. Peça ao
administrador para cadastrar você." (the message key is the one Keycloak 26.7.2 shows in the AC-21
check). The tenant-specific issuer refuses any other tenant. A linked user with an unverified email
still verifies it once (`verifyEmail`). The Hub's handling of the ID token is unchanged: the token it
receives is Keycloak's, with the Keycloak subject, whatever the person used to sign in. The one Hub
change is 0008 AC-27: after a Hub session of an `INTERNAL` account ends, the next sign-in redirect
carries `kc_idp_hint=<alias>`, so the person re-enters through Microsoft with no form.

### Session length

This spec sets no session length. The Hub and application session lengths, and Keycloak's SSO idle
and max, derive from `identity.session.max` and `identity.session.idle`
([0008](../0008-configuration-model/index.md) AC-15 to AC-22): 1 hour at most and 30 minutes idle in
the pilot, for every person. A refresh past Keycloak's max answers `invalid_grant` with
`Token is not active`, which `identity-access/oidc.ts` maps to `SESSION_ENDED` as it maps
`Session not active` (0008 AC-18). Settings changes are recorded in `settings.change`, never in
`iam.access_event` (AC-15).

### Hub routes (AC-3, AC-22)

Beside `installation-routes.ts`, with its CSRF and administrator checks, in a new
`people-routes.ts`:

| Route | Operation |
|---|---|
| `GET /api/control/installation/people` | `IAM-14 ListPeople` |
| `POST /api/control/installation/people` (`intentId` in the body) | `IAM-15 CreatePerson` |
| `POST /api/control/installation/people/:accountId/disable` | `IAM-16 DisablePerson` |
| `POST /api/control/installation/people/:accountId/enable` | `IAM-17 EnablePerson` |
| `PUT /api/control/installation/people/:accountId/email` (`changeId`, `email` in the body) | `IAM-18 ChangePersonEmail` |
| `POST /api/control/installation/people/:accountId/invite` | `IAM-19 SendPersonInvite` |
| `DELETE /api/control/installation/people/intents/:intentId` | abandon an open intent (part of `IAM-15`) |

The screen is `features/settings/components/people-screen.tsx`, one row in `sections.ts`
(`installation-people`, "Pessoas", `/settings/installation/people`). 0005 adds a cargos field to the
same rows.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| admin base URL, realm | issuer origin and realm | `CONEXUS_OIDC_ISSUER` |
| admin token | client credentials | `conexus-hub-provisioner` and `CONEXUS_KEYCLOAK_PROVISIONER_SECRET_FILE` |
| email change target | the typed address | `iam.person_email_change.new_email`, recorded before any Keycloak call |
| Keycloak username | planned account id | `iam.person_intent.account_id` |
| account `external_subject` | Keycloak user id | the `Location` of `createUser`, or the adopted user |
| invite actions | action set | `kind` and `identity.source.kind` (*Invite*) |
| invite lifespan | 14 days | `INVITE_LIFETIME` in `identity-access`, shared with the workspace invitation (0008 AC-28) |
| who may act | installation administrator | `iam.is_installation_administrator` inside each function |
| Microsoft alias, tenant, client; client secret | per installation | `identity.source`; `entra-client-secret` in the operator secrets directory (0008 AC-24) |
| SMTP sender; password | the one Conexus email account (0008 decision 3) | `mail.smtp`; `smtp-password` in the operator secrets directory (0008 AC-25) |
| session lengths, Hub, application and Keycloak | 1 hour max, 30 minutes idle in the pilot | `identity.session.max` and `identity.session.idle` (0008 AC-15 to AC-22) |

### Data model

`0044_people.sql` (after PR 382's `0043`; 0005's migrations follow as `0045` and `0046`):
- `iam.account`: add `kind` (backfilled per AC-1) and drop `origin`; add `provider_sync text NULL CHECK
  (provider_sync IN ('DISABLE','ENABLE'))`, `provider_sync_since`, `invite_state text NULL
  CHECK (invite_state IN ('SENT','NOT_SENT'))`, `invite_sent_at`, `invite_failure`; unique index on
  `lower(email)` where `email IS NOT NULL`. A null `invite_state` is a person from before this spec.
- `iam.person_intent (intent_id uuid PRIMARY KEY, actor uuid, kind, email, display_name, account_id
  uuid UNIQUE, request_digest bytea, state text CHECK (state IN ('OPEN','DONE','ABANDONED')),
  last_failure text, created_at, updated_at)`.
- `iam.person_email_change (change_id uuid PRIMARY KEY, account_id uuid NOT NULL, actor uuid, old_email,
  new_email text NOT NULL, request_digest bytea, state text CHECK (state IN
  ('PENDING','SEND_FAILED','APPLIED','REFUSED')), last_failure text, created_at, updated_at)`, with
  unique partial indexes on `account_id` and on `lower(new_email)` where `state = 'PENDING'`.
  `open_person_intent` also refuses an email of a `PENDING` change (`person-pending`).
- `iam.access_event (event_id bigint GENERATED ALWAYS AS IDENTITY, at timestamptz DEFAULT
  clock_timestamp(), actor uuid NOT NULL, account_id uuid, change text NOT NULL, detail jsonb NOT NULL
  DEFAULT '{}')`, owned by `iam_owner`, no `UPDATE` or `DELETE` granted.
- Functions, `SECURITY DEFINER` with the pinned `search_path`, granted to `hub_iam_runtime`:
  `list_people`, `open_person_intent`, `complete_person_intent`, `abandon_person_intent`,
  `record_invite`, `disable_person`, `enable_person`, `request_person_email_change`,
  `settle_person_email_change`, `settle_provider_sync`, `record_provider_failure`.
- Rewritten: `account_access_scope` (AC-1), `invite_workspace_member` (AC-5),
  `grant_installation_administrator` and `grant_installation_administrator_by_email` (AC-5).
  Dropped: `provision_application_account`, `email_has_open_invitation`.
- Then `npm run db:catalog:snapshot`.

### Key invariants and security model

- An account exists only after Keycloak has a user for it, and a Keycloak user is linked to at most one
  account. No path creates an account from a sign-in, except the one bootstrap subject.
- Conexus decides; Keycloak proves. A disabled account is refused by Conexus before Keycloak is told.
  Nothing in Keycloak (roles, groups, the Microsoft link) grants anything in Conexus (C-015).
- The Hub's admin credential is a second privileged adapter (*Follow-up*): one client, one realm,
  role `query-users`, and the permissions of *Provisioner authority*. Keycloak
  refuses it passwords, roles, groups, impersonation and every realm or client change. Its residual
  authority, which Keycloak 26.7.2 cannot remove while it may update users, is to delete any user of the
  `conexus` realm, delete or disable their credentials, unlink their Microsoft identity, and redirect
  their email and send a password action to it. What contains it, and is ours: the adapter has no call
  for any of these (AC-16); the Hub refuses to start with any other role (AC-17) and
  `apply keycloak` fails on any foreign permission or admin role (AC-18); the realm has no human
  administrator; Keycloak records every call in its admin events for 90 days, which the operator reads in its console; the Hub does not read them (AC-25 removed). Not contained: an email redirect made with a stolen secret looks like the Hub's own
  change in the admin events, so only the person's lost access and the event record reveal it. The
  secret file is mode 600 and read only by the Hub.
- No password crosses Conexus. Keycloak sets and checks every password through its own pages.
- Microsoft sign-in links only to a user Conexus created, in the configured tenant, and never creates
  one. Stated limits: a tenant administrator who sets another user's mail attribute to a person's
  email can sign in as that person once the person has verified it (the company's own IT is trusted
  here); disabling someone in Entra stops new Microsoft sign-ins but not a Keycloak session already
  open (up to the lengths of *Session length*, 1 hour at most in the pilot), so the administrator
  disables in Conexus.

### Configuration required

| Variable | Value | Required |
|---|---|---|
| `CONEXUS_KEYCLOAK_PROVISIONER_SECRET_FILE` | absolute path of the secret file `apply keycloak` writes | yes; the Hub refuses to start without it |

### Operator steps (done by the operator when the build asks)

1. **Email sender.** The sender is the one Conexus email account (0008 decision 3). Write its
   password to `smtp-password` in the operator secrets directory, mode 600, then
   `conexus-settings set mail.smtp '{ "host", "port", "from", "fromDisplayName": "Conexus",
   "starttls": true, "ssl": false, "auth": true, "user" }' --reason <text>`. For the local live check,
   a mail catcher on the Keycloak container's network (`host` its container name, `port` 1025,
   `auth` `false`).
2. **Realm.** Follow 0008's *Fresh install order*, with `apply keycloak`, which writes
   `keycloak-provisioner`, against the running `conexus-keycloak` (26.7.2, where admin permissions v2 is on by
   default; do not start it with `--features=admin-fine-grained-authz:v1`). Check in the Keycloak
   console (signed in with the break-glass account): Realm settings > General has Admin Permissions
   on; Clients > `conexus-hub-provisioner` > Service account roles shows only `query-users`; Permissions lists exactly `conexus-provisioner-users` (Users, all users, view and
   manage) and `conexus-provisioner-no-password` (Users, all users, reset-password, policy
   `conexus-nobody`); Realm settings > Email shows the sender; Realm settings > Events has admin events on. Never give the service account
   `manage-users`, `view-users` or any other admin role: a role switches the permissions off.
3. **First person and Hub.** After `apply keycloak`, run `conexus-settings first-person --email
   <email> --name <name> --hub-env <path>`. Add `CONEXUS_KEYCLOAK_PROVISIONER_SECRET_FILE=<path to
   keycloak-provisioner>` to `hub.env` and start the Hub, which refuses to start without it.
4. **Microsoft (company IT).** Send the company's Microsoft 365 administrator the Entra guide with this
   installation's redirect URI, `https://<Keycloak host>/realms/conexus/broker/<alias>/endpoint`,
   single tenant, a client secret valid 6 months, delegated `openid`, `profile`, `email`, `User.Read`
   with admin consent, and under Token configuration the optional ID token claim `email`. Receive the
   tenant id, client id and secret over a private channel. On a brokered installation, set
   `identity.source` (step 5) before `apply keycloak` of step 2 on a fresh install.
5. **Microsoft (Keycloak).** Write the client secret to `entra-client-secret` in the operator secrets
   directory, mode 600, then `conexus-settings set identity.source '{ "kind": "BROKERED", "alias",
   "tenantId", "clientId", "secretExpiresOn" }' --reason <text>`, which runs `apply keycloak`. No env
   change and no Hub restart: the Hub reads `identity.source.kind` at use. Repeat this step with a new
   secret before `secretExpiresOn`.

### Critical test scenarios

Beyond the AC proofs, these cases must exist by name: a stop after Keycloak created the user and before
the account insert, then a retry (AC-9); `createUser` answering `409` for a user made by the abandoned
intent (AC-7); an email held by a disabled person (`person-exists`, status disabled) (AC-7); Keycloak
down during disable, then a repeat (AC-10, AC-14); disabling the last owner of a Workspace (AC-10); a
Workspace invite to an external person (AC-5); an application sign-in by a Keycloak user with no
account (AC-4); a token carrying `realm-admin` or `manage-users` at start (AC-17); `updateUser`
keeping an attribute the change did not name (AC-12); an email change stopped before and after
`updateUser` and one whose `sendActions` fails, each repeated (AC-24); an email change to an address
held by another person's open change (AC-12); a Microsoft sign-in for an
email the screen never created (AC-21).

## Build plan

Slices 3 to 5 are one release: the migration removes the only other way an account was created, so the
Pessoas screen must ship with it.

1. Realm, after 0008's slice 1 delivers `apply keycloak`: `realm-conexus.json`, *Provisioner
   authority* in `apply keycloak`, `conexus-settings first-person`, the deletion of
   `create-first-user.sh`, the README and `AGENTS.md`. Operator steps 1 and 2. Satisfies **AC-18**,
   **AC-19**.
2. Adapter: `keycloak-admin.ts`, the shared local issuer transport, the
   configuration, the start-up role check, and `keycloak-admin-adapter` against a fake Keycloak
   server. Satisfies **AC-16**, **AC-17**.
3. IAM: migration `0044`, the store and route changes of AC-4 and AC-5, the catalog snapshot, and the
   tests that named `origin`, `provision_application_account` or an invited sign-up. Satisfies
   **AC-1** to **AC-5**, **AC-15** (database part).
4. People: `people.ts`, `people-routes.ts`, operation ledger rows `IAM-14` to `IAM-19`, the product
   API paths, and `people-provisioning` against the fake Keycloak. Satisfies **AC-6**
   to **AC-14**, **AC-24**.
5. Screen: the Pessoas screen and its section row. Satisfies **AC-3** (rail), **AC-22**.
6. Local proof: operator step 3, `keycloak-people-probe` with the mail catcher, the screen in the driven
   browser. Satisfies **AC-15** (Keycloak part), **AC-23**.
7. Microsoft, with 0008's slice 3 (`identity.source`, `mail.smtp`, the `kc_idp_hint` re-login):
   operator steps 4 and 5, the theme message, the live sign-in. Satisfies **AC-20**, **AC-21**.

## Migration plan

**Strategy**: forward. Pilot accounts keep their ids and Keycloak subjects and get a `kind`; their
Keycloak users (username = email) stay as they are. The running pilot Keycloak is configured in place
by `apply keycloak` (0008), not recreated.
**Rollback**: revert the release pull request and restore the database from the pre-release backup;
the Keycloak additions stay and are inert (disable the `conexus-hub-provisioner` client).
**Risks**: duplicate emails in pilot data (the migration names them); a person created during a
Keycloak outage (open intent, retried); SMTP rejected by the provider (invite "Não enviado", resend).

## Consequences

**Positive**:
- One place to add, disable and bring back a person; Keycloak is infrastructure nobody touches day to
  day.
- No sign-up by email claim remains, so a provider that asserts an email cannot create a Conexus
  account.
- People of the company use their Microsoft 365 account and its MFA.

**Negative / tradeoffs**:
- The Hub now holds a Keycloak admin credential (scoped and recorded by Keycloak, but real: it can delete
  users and redirect their email).
- Invites depend on a working SMTP account; without one, nobody new gets in.
- A forgotten password needs the administrator to resend the invite.
- Keycloak's own email text is generic until a Conexus email theme exists.

## Open questions for the operator

1. Closed by 0008 decision 3: one Conexus email account sends invites and notices for every
   installation in the pilot, not each company's own. Switching later is one `mail.smtp` change.
2. Without working SMTP, refuse and show the reason (this spec) or allow a one-time temporary password
   shown to the administrator for the pilot? Recommendation: refuse; a shown password is a credential
   in a chat message.

## Follow-up

Records to amend, each needing the operator's approval before this spec is Accepted:
- [ ] New decision C-035: people are created, disabled and administered only from the Conexus Pessoas
      screen by an installation administrator; the Hub holds a Keycloak service account limited to user
      management of its realm; person kind `INTERNAL` or `EXTERNAL`; Microsoft sign-in through Keycloak
      brokering that links only to users Conexus created.
- [ ] Amend C-015: Keycloak may broker the company's Entra tenant; accounts stay keyed by Keycloak
      issuer and subject; the Hub's admin credential manages Keycloak users and decides nothing.
- [ ] Amend C-026: managing people is an installation-wide action of the installation administrator.
- [ ] Replace the decisions line "Multi-account lands at the minimum that is correct" (an invited person
      must already exist in the identity provider): people are created from the Pessoas screen.
- [ ] Reopen the non-goal "no Keycloak admin credential in the Hub"
      ([single session qualification](../../single-session-qualification.md) section 9), which its STOP
      law sends back to the planner: approved by the operator on 2026-10-01.
- [ ] Security reference: section 3 lists the second privileged adapter (I&A Keycloak admin adapter →
      the configured issuer's realm admin API, client `conexus-hub-provisioner`, with its residual
      authority as in *Key invariants and security model*) and the browser path
      Keycloak → the configured Microsoft tenant; section 4 states `verifyEmail` and the brokered path.
- [ ] Permission contract section 1.1 and the operation ledger: `IAM-14` to `IAM-19`; `IAM-03` is
      bootstrap only; `IAM-05` refuses people who do not exist or are external.
- [ ] The Entra guide gains the optional `email` claim step and a redirect URI per installation.

Later work:
- [ ] A Conexus email theme for the invite.
- [ ] Entra group to cargo sync, only on a real need.
- [ ] Narrow `conexus-provisioner-users` from all users to the users Conexus created (a group they
      join at creation), once a real need appears.
