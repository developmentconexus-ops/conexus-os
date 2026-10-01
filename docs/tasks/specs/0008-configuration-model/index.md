# 0008. The configuration model: one home per fact, a settings registry and a reconciler

**Date**: 2026-10-01
**Status**: Proposed
**Changes**: the Proposed specs [0005](../0005-app-access-perfis/index.md),
[0006](../0006-people-and-sign-in/index.md) and 0007 (telemetry, branch `docs/telemetry-spec`), as
listed under *Changes to specs 0005, 0006 and 0007*. It also changes the Hub session SQL of
`0026_single_session.sql`, `identity-access/oidc.ts` and `infra/keycloak/realm-conexus.json`.
**Depends on**: nothing for slice 1. Slice 1 lands before 0005's rewrite of the session functions,
and 0005 builds on the `p_absolute` parameter of AC-16. 0006's realm slice depends on slice 1 here,
because `apply keycloak` replaces its `configure-realm.sh`. Slice 3 lands with 0006's Microsoft work,
slice 4 with 0007's SigNoz work.

## Summary

Conexus keeps every configuration fact in exactly one place. What the Hub needs to start stays in
environment variables, read once at start. Secrets stay in files. Anything that may change while
Conexus runs, such as how long a login lasts or which email account sends invites, becomes a
**setting**: declared once in code with its type, limits and default, stored as one database row,
changed only through one recorded path, and read at the moment it is used. When Keycloak (the login
engine) or SigNoz (the telemetry store) has to enforce a setting, a small program called a
reconciler copies our value into that system, checks it every 15 minutes, and reports any
difference. Conexus is the only place anyone changes these values; the Keycloak admin console is
closed to customers and to the network, with one emergency account for the Conexus operator.

The first slice proves the whole loop on one fact: a login lasts at most 1 hour, set in one place,
enforced by both the Hub and Keycloak, with a hand change in Keycloak detected.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As the Conexus operator, I change how long a login lasts with one command and a reason, and both
  the Hub and Keycloak follow it, without editing SQL, a realm file or a shell script.
- As the Conexus operator, I ask "what is the session limit and who set it" and get one answer with
  its source, its history and whether Keycloak agrees.
- As the Conexus operator, I learn within 15 minutes when someone changed a value directly in
  Keycloak, and I decide whether to put ours back. Slice 1 records and logs the difference and
  `explain` shows it; the Telegram notice arrives with the alert bot in slice 4.
- As a company administrator, I know that nobody at my company can change how people sign in by
  accident, and that every change Conexus makes is recorded with who and why.
- As an engineer adding a new knob, I sort it with one rule and add it in one place.

**Out of scope** (named so nobody builds them here): an admin screen that edits settings; a
read-only settings page (both *Follow-up*); scopes below the installation (workspace, project,
person) in storage; locks and "tighten only" merges; feature flags; a secrets vault or KMS; a cache
or change notifications; gradual rollout and change sets; a GitOps export; a reconciler inside the
Hub; settings for admission, SCIM, per-kind session length, realm fixed attributes or the code
constants of *Placement*; Mastra RBAC and FGA (decision 5).

**Acceptance criteria** (each is checked on its own; the proof is named in brackets: a suite under
`tests/implementation/` or `tests/repository/`, new when absent today, or a live check):

The standard
- **AC-1**: `apps/hub/src/platform/settings/registry.ts` holds the only list of settings. Each entry
  has `key`, `schema`, `default`, `scope`, `editor`, `enforcedBy`, `takesEffect` and `label`
  (*Registry*). A test fails on two entries with one key, on a default the entry's own schema
  refuses, and on a setting key whose env name (`CONEXUS_` plus the key in capitals, dots as
  underscores: `identity.session.max` gives `CONEXUS_IDENTITY_SESSION_MAX`) is a name that a typed
  loader of AC-8 reads. [`settings-registry`]
- **AC-2**: One migration creates the schema `settings` with `settings.value`, `settings.change` and
  `settings.enforcement`, all owned by the new `NOLOGIN` role `settings_owner` (*Storage*,
  *Database roles*). No role but `settings_owner` may `INSERT`, `UPDATE` or `DELETE` a row of the
  three tables; `settings.change` is written only by the definer function `settings.write` and
  `settings.enforcement` only by the definer `settings.record_enforcement`. A grant test connects as
  `hub_iam_runtime` and as `settings_operator` and finds each direct write refused.
  [`settings-postgres`]
- **AC-3**: `settings.write(key, scope, subject, value, default_value, expected_version, actor,
  reason)` updates or inserts the row, adds 1 to its `version` and appends one `settings.change` row
  with the old and new value, actor, channel and reason, in one transaction. `expected_version` 0
  means "no row yet". On a first write the old value is `default_value`, the registry default the
  caller passes, so a revert to the default is a normal write; `set <key> <default>` creates a row
  whose source is `set`. The channel is not a parameter: the function derives it from the calling
  role (*Database roles*). A stale `expected_version` is refused with `SETTING_VERSION_CONFLICT` and
  changes nothing. An empty reason is refused with `SETTING_REASON_REQUIRED`. A revert is a new write
  of the old value and is recorded like any other. [`settings-postgres`]
- **AC-4**: `resolve(definition, reader)` is the only read path for the Hub, the CLI and the
  reconcilers. `reader` is a `SettingsReader` port: the Hub passes one backed by its
  `hub_iam_runtime` pool, the CLI one backed by its `settings_operator` connection, and the registry
  module imports no pool. It returns `{ source: 'set' | 'default', value, version }`. With no row it
  returns the registry default with `source: 'default'`. A row its schema refuses gives one
  `SETTING_INVALID` log record naming the key, never a thrown request, and then:
  - for a security setting (editor `operator` and enforced by `keycloak`), `{ source: 'invalid' }`.
    The setting fails closed: the Hub refuses a new sign-in with `SETTING_INVALID`, `apply` refuses
    to write that enforcer, and `explain` shows the row as invalid. Open sessions keep the lengths
    they were opened with. The operator recovers with `set`, which needs neither the Hub nor Keycloak.
  - for any other setting, the registry default with `source: 'default'`.
  It reads the row at each call, with no cache. [`settings-resolve`]
- **AC-5**: `npm run conexus:settings -- set <key> <value> --reason <text>` parses the value with the
  key's schema and checks every registry invariant before any write. A value out of bounds, an
  unknown key or a broken invariant is refused with the field and the rule named, exit code 1, and no
  row written. [`settings-cli`]
- **AC-6**: A key whose `editor` is `operator` is written only by the CLI, connected as
  `settings_operator`, so `settings.write` records `channel = 'cli'`; the actor is
  `operator:<os user>`. The Hub has no HTTP route that writes such a key (decision 1). A route census
  test fails when one appears, and `settings.write` itself refuses a write from any other role to a
  key outside `settings.administrator_key` with `SETTING_EDITOR_REFUSED`. [`settings-cli`,
  `settings-routes`, `settings-postgres`]
- **AC-7**: No secret enters `settings.value`, `settings.change`, `settings.enforcement`, a CLI output,
  a CLI error message or stack trace, a log line, or a Keycloak admin event representation. A secret
  stays in a file whose path an env variable or the operator secrets directory names; a reconciler
  records only the SHA-256 fingerprint of the file it applied. A test plants a secret in each file a
  reconciler reads, runs `set`, `apply`, `apply --check` and `explain` with Keycloak reachable and
  with Keycloak refusing, and finds the secret in none of these places. [`settings-secrets`]
- **AC-8**: A repository test fails when code under `apps/hub/src` reads `process.env` outside the
  typed loaders: `platform/config.ts`, the runner's loader in `app-runner/main.ts`, the settings
  CLI's loader in `platform/settings/cli.ts` and, once spec 0007
  adds it, `telemetry/register.ts`. The reads outside them on `main` today are listed by file and name in the
  test; the list may only shrink. [`hub-config-reads`]
- **AC-9**: Each external enforcer has one reconciler with a pure `desired`, an `observe` that reads
  the real system and an `apply` that writes only the fields it owns (*Reconciler*). For Keycloak,
  `apply` reads the realm representation, replaces only the owned fields and sends one
  `PUT /admin/realms/conexus`; a test asserts the body differs from the representation read only in
  those fields. Running `apply` twice in a row changes nothing the second time, prints
  `nada a aplicar` and exits 0. Each run writes `settings.enforcement` with the setting version it
  applied, the observed value and a status of `in_sync`, `drifted` or `failed`. The CLI messages and
  exit codes are the table of *CLI output*. [`settings-reconcile-keycloak`]
- **AC-10**: `set` commits the row first, then runs `apply` for the key's enforcers, and prints
  `salvo e aplicado` only when every enforcer reports `in_sync` after the write. Otherwise it prints
  `salvo, não aplicado: <enforcer>: <motivo>`, exits with code 2 and leaves the enforcer row
  `failed`. The row stays saved (no rollback): the Hub enforces the new value at once while the
  enforcer keeps the old one. Exit code 2 is the signal; `apply keycloak` retries; the next
  `apply --check` keeps the row `failed` until an apply succeeds. A test runs `set` with Keycloak
  down and asserts the saved row, exit code 2 and the `failed` row. [`settings-cli`]
- **AC-11**: `apply --check` observes every enforcer and writes `settings.enforcement` without
  changing any external system: it takes a read-only Keycloak client type that has no write method,
  and a type test fails if one is added. `infra/pilot/settings-check.sh` runs it every 15 minutes
  and appends a heartbeat line to its log each run. A difference is recorded as `drifted` and logged
  as `SETTING_DRIFT` with the enforcer and key, and is never corrected without the operator running
  `apply` (decision 4). A row whose `checked_at` is older than 30 minutes counts as not in sync:
  `explain` shows it as `stale`, and the AC-30 gauge counts it, so a dead loop does not look like
  `in_sync`. In slice 1 the proof is the row, the log line and `explain`; the notice to Telegram is
  AC-30 (slice 4). [`settings-reconcile-keycloak`, live check]
- **AC-12**: `npm run conexus:settings -- explain <key>` prints the label, the value and its source,
  the version, the last change (actor, time, reason), the editor, and for each enforcer its status,
  observed value and check time. [`settings-cli`]
- **AC-13**: Keycloak accounts. The `conexus` realm has no human administrator. The `master` realm
  has exactly one human administrator, the operator's break-glass account (realm role `admin`), whose
  password lives only in the operator secrets directory, and one service account, `conexus-settings`,
  that the Keycloak reconciler uses, holding exactly `manage-realm` and `view-realm` of the
  `conexus-realm` client in slice 1. `apply keycloak --init` runs first with the temporary bootstrap
  admin that `provision.sh` creates, creates both accounts, writes their secrets to the operator
  secrets directory, deletes the bootstrap admin and its password file (*Keycloak accounts*).
  `apply keycloak --check-accounts` lists the `master` users and service accounts with their role
  sets, and fails on any other administrator and on a role set of either account that differs from
  the one above. [`settings-reconcile-keycloak`, live check]
- **AC-14**: Keycloak network. On the laptop pilot Keycloak listens on `127.0.0.1` only (as
  `provision.sh` binds it today). On a server installation the reverse proxy in front of Keycloak
  forwards only `/realms/conexus/`, `/resources/` and `/.well-known/` from outside the operator's
  network and refuses `/admin/` and `/realms/master/` (the Keycloak 26 exposed path table, *Keycloak
  admin console*). The Hub and the reconciler reach `/admin/` from the internal side. [live check on
  the pilot: `ss -ltnp` shows Keycloak on loopback only; on the first server installation: a request
  to `/admin/` and to `/realms/master/` from outside answers 403 or 404, and `/realms/conexus/` answers]

Slice 1: session max 1 hour from one source
- **AC-15**: The registry holds `identity.session.max` (duration, 1 minute to 12 hours, default
  1 hour, editor `operator`, enforced by `hub` and `keycloak`, `next-sign-in`) and
  `identity.session.idle` (duration, 1 minute to 12 hours, default 30 minutes, same editor and
  enforcers), with the invariant `idle <= max`. [`settings-registry`]
- **AC-16**: A migration replaces the literal `interval '8 hours'` and `interval '30 minutes'` of the
  Hub and application session functions of `0026_single_session.sql` with parameters `p_absolute`
  and `p_idle`, and replaces the CHECK `absolute_expires_at = started_at + interval '8 hours'` with
  `absolute_expires_at > started_at AND absolute_expires_at <= started_at + interval '12 hours'`.
  It adds `idle_length interval` to `iam.host_session`: set from `p_idle` when a Hub session opens,
  between 1 minute and 12 hours for `HUB` rows and null for the other kinds, and set to 30 minutes on
  Hub rows already open. `resolve_hub_session` slides the idle end by the row's own `idle_length`, so
  an authenticated request reads no setting. Sessions open before the migration keep their end time.
  No literal session length is left in a function body; the 5 minute provider recheck stays a code
  constant in the functions that hand out the refresh token. The migration takes the next free
  number at merge; the pull request that lands second renumbers and runs `npm run db:catalog:snapshot`
  after its rebase. [`identity-access-postgres`]
- **AC-17**: At Hub sign-in the Hub resolves both settings and opens the session with
  absolute = `identity.session.max` and idle = the smaller of `identity.session.idle` and
  `identity.session.max`, so the CHECK `idle_expires_at <= absolute_expires_at` holds even when two
  `set` calls interleave. At application handoff redemption it passes absolute =
  `identity.session.max`. A session already open keeps the end time and the idle length it started
  with. [`identity-access-http`, `application-access-http`]
- **AC-18**: `identity-access/oidc.ts` maps a refresh answered `invalid_grant` with
  `Token is not active` to `SESSION_ENDED`, as it maps `Session not active` today. Keycloak 26.8.0
  answers this text when the SSO session max or idle is reached (*Evidence*). [`identity-access-oidc`]
- **AC-19**: The Keycloak reconciler's `desired` gives `ssoSessionMaxLifespan` = max in seconds,
  `ssoSessionIdleTimeout` = the smaller of idle plus 10 minutes and max, and `accessTokenLifespan` =
  300 (the Hub's provider recheck constant). For 1 hour and 30 minutes it returns 3600, 2400 and 300;
  for 2 minutes and 1 minute it returns 120, 120 and 300. `realm-conexus.json` no longer carries
  these three values. [`settings-reconcile-keycloak`]
- **AC-20**: Live on local Conexus, in this order: `set identity.session.idle 1m`, then
  `set identity.session.max 2m`, each with a reason, each printing `salvo e aplicado`; a person signs
  in and keeps using the Hub; a request up to 115 seconds after the Hub session started still works,
  and the first Hub request 120 seconds or more after it started ends the session and the browser
  lands on Keycloak's sign-in page. The Hub's own end time ends it: Keycloak counts its 120 seconds
  from its SSO session start, a few seconds earlier, and the provider recheck (5 minutes) is not yet
  due; `explain identity.session.max` shows `1 h -> 2 min`, the
  operator, the reason and `keycloak: in_sync`; the Keycloak admin API shows
  `ssoSessionMaxLifespan = 120`. [live check, in the slice's pull request]
- **AC-21**: Live, continuing AC-20: the operator changes `ssoSessionMaxLifespan` by hand in
  Keycloak; `apply --check` records `drifted` and logs `SETTING_DRIFT`; `apply` converges it to 120;
  a second `apply` prints `nada a aplicar`. Then `set identity.session.max 1h` and
  `set identity.session.idle 30m`, and `settings.change` holds the old and new value of each of the
  four writes. [live check]
- **AC-22**: Live: with a session open, the operator lowers `identity.session.max`. The check records
  whether Keycloak applies the lowered max to the SSO session already open and when the Hub session
  ends, and `infra/keycloak/README.md` states the observed behaviour. The expected path, from the
  throwaway proof, is that the first provider recheck after Keycloak's new max passes ends the Hub
  session through `SESSION_ENDED`. [live check]

Slice 2: the default model
- **AC-23**: `models.default` (`{ build, memory }`, editor `administrator`, enforced by `hub`,
  `next-use`) replaces `model.installation_default`, which the same migration copies and drops. The
  Models screen writes it through the settings service with `channel = 'ui'` and the administrator
  as actor. The same migration adds `models.default` to `settings.administrator_key` and grants
  `EXECUTE` on `settings.write` to the Hub role behind the Models screen, so `settings.write` records
  `channel = 'ui'` and refuses that role any other key; a repository test fails when
  `settings.administrator_key` differs from the registry entries whose editor is `administrator`. A
  write naming a model that no shared or installation model account offers is refused with
  `MODEL_NOT_AVAILABLE`. [`settings-postgres`, `builder-model-defaults`]

Slice 3: sign-in source and email sender (with 0006)
- **AC-24**: `identity.source` is `{ kind: 'LOCAL' } | { kind: 'BROKERED', alias, tenantId, clientId,
  secretExpiresOn }` (editor `operator`, enforced by `hub` and `keycloak`, `after-apply`). The Hub
  reads `identity.source.kind` where 0006 reads `CONEXUS_INTERNAL_SIGN_IN`, which is deleted.
  `apply keycloak` creates or updates the identity provider and the flow
  `conexus-first-broker-login` from the setting, with the alias from the setting, and the client
  secret from the operator secrets directory. `--entra-file` is deleted. [`settings-reconcile-keycloak`,
  `keycloak-people-probe`]
- **AC-25**: `mail.smtp` (`{ host, port, from, fromDisplayName, starttls, ssl, auth, user }`, editor
  `operator`, enforced by `keycloak`) holds the sender; its password is a file in the operator
  secrets directory. In the pilot every installation uses one Conexus email account (decision 3).
  `apply keycloak` refuses to run with `mail.smtp` unset from slice 3 on. Replacing the password file shows as
  `drifted` by fingerprint and the next `apply` converges. `--smtp-file` is deleted.
  [`settings-reconcile-keycloak`, live check]
- **AC-26**: The Keycloak client `redirectUris` and `baseUrl` of `conexus-hub` are derived from
  `CONEXUS_ORIGIN` by `apply keycloak`; the pilot literal leaves `realm-conexus.json`. A second Hub
  on one machine is added with `apply keycloak --extra-origin <url>`. [`settings-reconcile-keycloak`]
- **AC-27**: When a Hub session of an `INTERNAL` account ends in an installation whose
  `identity.source.kind` is `BROKERED`, the Hub's next sign-in redirect carries
  `kc_idp_hint=<alias>`, so a person still signed in at the company sign-in service gets a new
  session with no form. The Hub learns the account kind before sign-in from a short-lived, non-secret
  cookie `conexus_last_kind=INTERNAL` (`Max-Age` 600, `HttpOnly`, `Secure`, `SameSite=Lax`, no
  account id) that it sets on the response that ends such a session for any reason but sign-out; a
  redirect with no such cookie carries no hint. The throwaway proof measured this path on Keycloak 26.8.0 in about 1 second;
  in the Hub it is UNVERIFIED until this live check. [live check with the company's Entra app]
- **AC-28**: One constant `INVITE_LIFETIME` (14 days) in `identity-access` feeds the workspace
  invitation and 0006's Keycloak `lifespan`. [`identity-access-postgres`, `people-provisioning`]

Slice 4: telemetry settings (with 0007)
- **AC-29**: `telemetry.retention` (`{ tracesAndLogsDays: 15, metricsDays: 30 }`) and
  `alerts.telegram.chat` (editor `operator`, enforced by `signoz`) are settings; the bot token is a
  file. This spec's slice 4 owns `apply signoz`; 0007 references it. `apply signoz` replaces
  `scripts/telemetry-alerts.mjs`, applies the alert rules of
  `infra/telemetry/alerts/` and the retention, and records `settings.enforcement`. Whether SigNoz
  v0.144.0 sets retention through its API is UNVERIFIED; if it does not, the reconciler observes
  retention only and the README names the manual step. [live check on the pilot]
- **AC-30**: The Hub exports the gauge `conexus.settings.drifted`, the number of
  `settings.enforcement` rows not `in_sync` or checked more than 30 minutes ago (AC-11), read through
  a definer `settings.drift_count(p_now)` that the slice 4 migration grants to `hub_iam_runtime`. An
  alert rule notifies the operator's Telegram chat when it is above 0. [`telemetry-metrics`,
  `settings-postgres`, live check on the pilot]
- **AC-31**: `CONEXUS_TELEMETRY_SALT` becomes `CONEXUS_TELEMETRY_SALT_FILE` and `CONEXUS_SENTRY_DSN`
  becomes `CONEXUS_SENTRY_DSN_FILE`. [`telemetry-register`]

Fresh install (slice 1)
- **AC-32**: On an empty Keycloak volume and a new database, the steps of *Fresh install order* run
  in that order give a working Hub sign-in with session max 1 hour, `--check-accounts` passing and
  every `settings.enforcement` row `in_sync`. With 0006 and from slice 3 on, steps 4 and 6 are part
  of the run and the first person's invite is sent. Running `apply keycloak --init` and `apply keycloak` a
  second time changes nothing and says so. `infra/keycloak/README.md` and `infra/pilot/README.md`
  list the order. [live check, in the slice's pull request]

## Decision

**Chosen option**: Option 3 of [rationale.md](rationale.md): one home per fact, with a typed
settings registry, one Postgres row per explicit value, one audited write path, and a reconciler per
external enforcer, enforced going forward and proved first on the session limit.

Leandro decided on 2026-10-01, and this spec records:
1. Security settings (sign-in source, session lifetime, email sender, anything that can lock the
   company out) are changed only by the Conexus operator, through the operator tool, with a required
   reason. The company administrator will see them read-only on a later page.
2. Session max is 1 hour for everyone in the pilot, outside people with a local password included.
   They type the password again each hour; company people re-enter silently through the company
   sign-in service. A longer limit for outside people is a later Keycloak test, only if they complain.
3. One Conexus email account sends invites and notices for every installation in the pilot, not each
   company's own. Switching later is one setting change.
4. Conexus is the only admin place. Keycloak is a hidden engine: its admin console is closed to
   customers and to the network outside the operator, with one break-glass operator account. A change
   made directly in Keycloak is detected every 15 minutes, recorded and alerted; the operator runs
   apply. No automatic correction.
5. Mastra RBAC and FGA are not used now. Conexus keeps its own roles (cargos to perfis to operation
   `allow`, spec 0005) and its own row rules (OWNER, SHARED, INHERIT, enforced by Postgres row level
   security). A "manager of" row rule is added only when a real app needs it.
6. Company people: the pilot keeps "Jeito 1". The administrator registers people on Pessoas, and the
   company's IT restricts the sign-in app to a group. Admission by group comes later.

**Implementation skills**: `conexus-development` (`.agents/skills/conexus-development/`) · `mastra`
(`.agents/skills/mastra/`, for `RequestContext` and `RetentionConfig`, which this model reuses)

## Standard definition

### The classes and the sorting rule

| Class | What it is | Lives in | Who edits | Takes effect |
|---|---|---|---|---|
| Boot | what the Hub needs to start, reach its database and authenticate: origin, ports, issuer, database, sockets, OpenTelemetry endpoint | env, parsed once by a typed loader that fails closed | operator at deploy | restart |
| Secret | credentials and keys | a file, mode 600; env holds only its path (`*_FILE`) or the file sits in the operator secrets directory | operator | restart, or next apply for a file a reconciler reads |
| Installation setting | a choice that varies per installation and may change while running | registry entry in code plus one row in `settings.value` | the entry's `editor`: `operator` (CLI only) or `administrator` (Hub screen) | the entry's `takesEffect`; an external part after apply |
| Domain data | facts with their own lifecycle or list screen: accounts, cargos, memberships, model accounts, apps | domain tables | their owners, through their own audited functions | live |
| App manifest | what an app declares: operations, perfis, `allow`, row scope | `manifest.json` in the app's Git; `reg.artifact_access` is a copy made at prepare | owner or Builder, by commit | at publish |
| Derived | a value computed from settings or boot config and held by another system: Keycloak sessions, identity provider, SMTP, redirect URIs; SigNoz retention and alert rules | the other system | nobody by hand; the reconciler | when the reconciler applies |
| Code constant | security internals and limits with no shown variance | one named constant per fact | engineer, by pull request | release |
| Person preference | none exists today | `settings.value` with scope `person`, when the first one exists | the person; may never loosen an installation setting | next use |

Sorting a new knob, in this order. The first question answered "yes" decides:
1. Does a wrong value stop the Hub, or lock out the person who would fix it? **Boot.**
2. Is it a credential or a key? **Secret.**
3. Does it have its own lifecycle, relations or list screen? **Domain data.**
4. Does an app declare it? **App manifest.**
5. Has it never needed a second value? **Code constant.**
6. Otherwise, **installation setting**, with one registry entry.

Identity is not its own store. Identity policy is installation settings with `enforcedBy` naming
Keycloak (session, sign-in source, sender) plus boot (issuer, provisioner secret).

### Registry

```ts
// apps/hub/src/platform/settings/registry.ts
type SettingKey = string & { readonly __brand: 'SettingKey' }      // 'identity.session.max', never reused
type Editor = 'operator' | 'administrator'                          // 'person' joins with the first preference
type Enforcer = 'hub' | 'keycloak' | 'signoz'
type SettingDefinition<T> = Readonly<{
  key: SettingKey
  schema: z.ZodType<T>        // type and bounds; parsed on write and on read
  default: T
  scope: 'installation'       // one variant until a setting needs another
  editor: Editor
  enforcedBy: readonly Enforcer[]
  takesEffect: 'next-use' | 'next-sign-in' | 'after-apply'
  label: string               // pt-BR, shown by explain and the later page
}>
type Invariant = Readonly<{ name: string; holds: (get: <T>(d: SettingDefinition<T>) => T) => boolean }>

// apps/hub/src/platform/settings/resolve.ts
type SettingRow = Readonly<{ value: unknown; version: number }>
type SettingsReader = Readonly<{ read: (key: SettingKey) => Promise<SettingRow | null> }>
type Resolved<T> =
  | Readonly<{ source: 'set' | 'default'; value: T; version: number }>
  | Readonly<{ source: 'invalid'; version: number }>   // security settings only (AC-4)
declare function resolve<T>(definition: SettingDefinition<T>, reader: SettingsReader): Promise<Resolved<T>>
```

A security setting is one whose editor is `operator` and whose `enforcedBy` names `keycloak`. The
rule is derived from those two fields, not a third flag, so a new identity setting fails closed
without anyone remembering to say so.

`identity.source` is a discriminated union, so a brokered source without a tenant cannot be stored.
`DIRECTORY` and SCIM provisioning join the union when the first installation needs them.

### Storage

```sql
settings.value       (key text, scope text, subject uuid NULL, value jsonb, version int CHECK (version > 0),
                      updated_by text, updated_at timestamptz,
                      UNIQUE NULLS NOT DISTINCT (key, scope, subject))   -- a row only for an explicit value
settings.change      (change_id uuid, key, scope, subject, old_value jsonb, new_value jsonb, actor text,
                      channel text CHECK (channel IN ('cli','ui')), reason text, at timestamptz)  -- append only
settings.enforcement (enforcer text, key text, desired_version int, observed jsonb,
                      status text CHECK (status IN ('in_sync','drifted','failed')), detail text,
                      checked_at timestamptz, PRIMARY KEY (enforcer, key))
settings.administrator_key (key text PRIMARY KEY)   -- keys the Hub may write with channel 'ui'
```

`subject` is null for an installation row, and a primary key cannot hold a null, so the key is a
`UNIQUE NULLS NOT DISTINCT` constraint (PostgreSQL 15 and later; the pilot runs 17): two
installation rows for one key are refused. `settings.change` follows the grants of 0006's
`iam.access_event` (append only, definer inserts) and is its own table because it holds old and new
values. Settings changes never go to `iam.access_event`.

### Database roles

| Role | Kind | May |
|---|---|---|
| `settings_owner` | `NOLOGIN`, new | owns the schema, the four tables and the definer functions |
| `settings_operator` | `LOGIN`, new; password file `CONEXUS_DB_SETTINGS_OPERATOR_PASSWORD_FILE`, registered in `contracts/technical/hub-database-roles.json` like the Hub's roles | `EXECUTE` on `settings.read`, `settings.write`, `settings.record_enforcement`, `settings.history`; nothing on the tables |
| `hub_iam_runtime` | existing | `EXECUTE` on `settings.read` (slice 1) and `settings.drift_count` (slice 4) |
| the Hub role behind the Models screen | existing | `EXECUTE` on `settings.write`, limited by `settings.administrator_key` (slice 2) |

`settings.write` derives the channel from `session_user`: `settings_operator` writes `cli` and may
write any key; any other role writes `ui` and only a key in `settings.administrator_key`, otherwise
`SETTING_EDITOR_REFUSED` (AC-6). `settings.history(key)` returns the key's `settings.change` rows
for `explain`. The CLI connects as `settings_operator`, not with the migration credential.

### Read and write paths

- **Read**: `resolve(definition, reader)` (AC-4) everywhere. A resolved value reaches an agent run
  through Mastra's `RequestContext`, as the Builder's run keys do today.
- **Write**: `apps/hub/src/platform/settings/cli.ts`, built with the Hub and run as
  `npm run conexus:settings -- get | set | explain | apply [--check]`. It imports the registry,
  checks the schema and every invariant, calls `settings.write` with a required `--reason`, then
  runs `apply` for the key's enforcers (AC-5, AC-10). It connects as `settings_operator` (*Database
  roles*), so it can write only through `settings.write`. The later admin screen calls the same
  service; an `operator` key shows there read-only with its source.
- **Recovery**: the CLI needs only the database, never the Hub or Keycloak. A session max of
  1 minute can sign everyone out, the operator included. `set` is the way back from that, and from a
  security setting that fails closed (AC-4).

### Reconciler

Slice 1 has one reconciler, Keycloak sessions, written as three plain functions in
`apps/hub/src/platform/settings/keycloak.ts`:

```ts
type KeycloakSessionFields = Readonly<{ ssoSessionMaxLifespan: number; ssoSessionIdleTimeout: number; accessTokenLifespan: number }>
declare function desiredKeycloakSessions(max: Duration, idle: Duration): KeycloakSessionFields  // pure (AC-19)
declare function observeKeycloakSessions(client: KeycloakReadClient): Promise<KeycloakSessionFields>
declare function applyKeycloakSessions(client: KeycloakWriteClient, fields: KeycloakSessionFields): Promise<void>
```

There is no generic `Reconciler<S>` or `Diff<S>` type yet. The shape is extracted when the second
reconciler (`apply signoz`, slice 4) exists and the two can be compared.

The reconciler is level triggered (it compares the whole desired state with the whole observed state
each run, rather than replaying events) and idempotent. `apply` reads the realm representation,
replaces only the fields it owns and sends one `PUT` (AC-9). `apply --check` receives only a
`KeycloakReadClient` (AC-11). `apply keycloak` runs in the CLI with the `master` realm service
account `conexus-settings`, never inside the Hub: 0006 AC-17 makes the Hub refuse to start unless its
credential holds exactly `query-users` and `view-events`, and widening it to write the realm would
undo that. The break-glass account is not used for routine applies, so its use stays visible in
Keycloak's admin events as an emergency.

`conexus-settings` holds `manage-realm` and `view-realm` of the `conexus-realm` client in `master`
for slice 1. Writing a realm's session attributes needs `manage-realm`, and `manage-realm` is realm
wide: it can also change SMTP, flows and identity providers of `conexus`. Least privilege is not
reachable here, and the spec does not claim it. Three guards stand in its place: Keycloak's admin
events record every write with the client that made it; `apply --check` sees any change to an owned
field; and `--check-accounts` fails when either `master` account holds a role set other than the
one named in AC-13. A probe in the slice proves that `view-realm` alone cannot write the session
fields. Slice 3 proves whether the same two roles cover the identity provider, SMTP and clients,
and adds a role to the checked set only if a probe shows it is needed.

### Keycloak accounts

1. `provision.sh` creates the container with a generated bootstrap admin, as today, and also writes
   that password to `keycloak-bootstrap-password` in the operator secrets directory.
2. `apply keycloak --init` signs in with that file, creates the break-glass account and the
   `conexus-settings` service account, writes their secrets, then deletes the bootstrap admin and the
   file. The bootstrap password stays in the container's definition but signs in to nothing. Run
   again, `--init` finds both accounts and prints `nada a aplicar`.
3. `apply keycloak --init --rotate`, signed in as the break-glass account, sets a new break-glass
   password, a new service account secret and, once 0006 is in, a new provisioner client secret, and
   replaces the three files. The Hub reads the provisioner file at start, so it restarts after a
   rotation.
4. If the break-glass password is lost, the operator runs Keycloak's `bootstrap-admin` command on
   the host, then `--init --rotate`.

### Fresh install order

1. `infra/keycloak/provision.sh`.
2. Hub migrations and database role provisioning (`settings_operator` included).
3. `npm run conexus:settings -- apply keycloak --init`.
4. From slice 3 on: write `smtp-password` to the operator secrets directory and run
   `conexus-settings set mail.smtp`; for a brokered installation also `set identity.source`. Both
   come before step 5 because `apply keycloak` refuses without `mail.smtp` from slice 3 on.
5. `npm run conexus:settings -- apply keycloak`. With 0006, this also creates the provisioner client
   secret the Hub needs and writes it to `keycloak-provisioner`, so the Hub cannot start before it.
6. With 0006: `conexus-settings first-person --email <email> --name <name> --hub-env <path>`. It
   signs in as the provisioner client with `keycloak-provisioner` (the narrowest account that can
   create a person and send the invite), not as the bootstrap or break-glass account, creates the
   first person, sends the invite and writes `CONEXUS_BOOTSTRAP_SUBJECT` to the Hub env file. It
   cannot run earlier: SMTP is configured in step 4 and `--init` deletes the bootstrap admin in
   step 3. It is a `conexus-settings` subcommand, not a `provision.sh` flag, so the operator has one
   tool after `provision.sh`.
7. Start `infra/pilot/hub.sh`, `infra/pilot/runner.sh` and `infra/pilot/settings-check.sh`, then the
   first person signs in to the Hub.

### CLI output

| Command and outcome | Prints | Exit code |
|---|---|---|
| `set`, every enforcer `in_sync` | `salvo e aplicado` | 0 |
| `set`, an enforcer failed | `salvo, não aplicado: <enforcer>: <motivo>` | 2 |
| `set`, `apply`, input refused (schema, unknown key, invariant, empty reason, stale version) | `recusado: <campo>: <regra>` | 1 |
| `apply`, nothing to change | `nada a aplicar` | 0 |
| `apply`, fields changed | `aplicado: <enforcer> <campo> <antes> -> <depois>`, one line per field | 0 |
| `apply`, an enforcer failed or a security setting is invalid | `não aplicado: <enforcer>: <motivo>` | 2 |
| `apply --check`, every enforcer observed (in sync or drifted) | `em dia: <enforcer>` or `diferença: <enforcer> <campo> <nosso> / <observado>` | 0 |
| `apply --check`, an enforcer could not be observed | `não verificado: <enforcer>: <motivo>` | 2 |
| `--check-accounts`, accounts as AC-13 | `contas em ordem` | 0 |
| `--check-accounts`, any other account or role set | `conta fora do esperado: <conta>: <motivo>` | 2 |
| `apply keycloak`, first apply writes `keycloak-provisioner` (0006) | `aplicado: keycloak segredo do provisionador criado` | 0 |
| `first-person`, person created and invite sent (0006) | `primeira pessoa criada: <email>` | 0 |
| `first-person`, the provisioner secret is missing or a person already exists | `recusado: <motivo>` | 1 |

Drift exits 0 because the row and the `SETTING_DRIFT` log are the signal; `settings-check.sh` logs
any non-zero code and keeps looping.

### `settings-check.sh`

The operator starts it beside `hub.sh` and `runner.sh`, in a terminal tab or detached with
`setsid nohup`, after every reboot, as the pilot README says for the other two. It sources
`installation.env` and a `settings.env` that names `CONEXUS_DB_SETTINGS_OPERATOR_PASSWORD_FILE`,
`CONEXUS_KEYCLOAK_ADMIN_URL` and `CONEXUS_OPERATOR_SECRETS_DIR`. It appends to
`settings-check.log` in the pilot log directory, with a `settings-check heartbeat <time>` line each
run. When it is not running, rows go stale after 30 minutes and show as `stale` (AC-11).

Keycloak never returns some secrets (the SMTP password, the broker client secret). The reconciler
compares the fingerprint of the file it last applied with the file now present, so a replaced file
shows as `drifted` and the next `apply` converges. The fixed realm attributes (registration,
duplicate emails, verify email, reset password, theme, locale, events) stay code constants in
`realm-conexus.json`, applied by `apply keycloak`.

### One source per duplicated fact

| Fact | Single authority | Derived copies (a pure function, reconciled) |
|---|---|---|
| Session lifetime | `identity.session.max` (1 h) and `identity.session.idle` (30 min) | Hub session absolute and idle; application session absolute; Keycloak `ssoSessionMaxLifespan` = max, `ssoSessionIdleTimeout` = smaller of idle + 10 min and max, `accessTokenLifespan` = the 5 minute provider recheck constant |
| Sign-in source and tenant | `identity.source` | Hub invite actions and email editability; Keycloak identity provider alias, issuer `https://login.microsoftonline.com/<tenantId>/v2.0`, flow `conexus-first-broker-login` |
| Hub origin | boot `CONEXUS_ORIGIN` | Keycloak client `redirectUris` and `baseUrl`; the Preview host rule |
| Retention | three facts, not one: Builder spans 30 days (Mastra `RetentionConfig` constant, holds prompts); Keycloak events 90 days (realm constant, audit evidence); telemetry 15 and 30 days (`telemetry.retention`) | SigNoz retention from the setting |
| Runner socket, connector directory | one shared `installation.env` sourced by both launch scripts | none; `hub.env` and `runner.env` keep process-only names |
| Invitation lifetime | constant `INVITE_LIFETIME` = 14 days | workspace invitation; 0006 Keycloak `lifespan` (0005 deletes the app invitation) |
| Default model | `models.default` `{ build, memory }` | none |

### Placement of every knob

| Knob | Class | Home |
|---|---|---|
| `CONEXUS_ORIGIN`, `PORT`, `BOOTSTRAP_SUBJECT`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `DB_HOST/PORT/NAME/USER`, `GIT_ROOT`, `BUILDER_E2B_TEMPLATE_ID`, `PREVIEW_PORT`, `PREVIEW_CERT_FILE`, `APPLICATION_PORT/DOMAIN`, `APP_RUNNER_SOCKET`, `CONNECTOR_SOCKET_DIR`, `SANKHYA_GATEWAY_ORIGIN`, `CLIPROXY_BIN/SHA256`, `BUILDER_STREAM_RECORD_DIR`, `NODE_EXTRA_CA_CERTS`, `XDG_STATE_HOME`, the retired names | Boot | env through `config.ts`, as today |
| `TEST_ALLOW_INSECURE_OIDC` (tests only); runner `APP_RELAY_TLS_DIR`, `APP_DB_HOST/PORT/NAME`, `APP_RUNNER_STATE_DIR`; `MASTRA_TELEMETRY_DISABLED`, `COMPILE_ROOT`, `CONEXUS_STATE`, `PROTECTED_DATABASES`, `PROVISION_USER` | Boot | env of the process that reads it, through its typed loader (AC-8); shared runner names move to `installation.env` |
| `OIDC_CLIENT_SECRET_FILE`, `DB_PASSWORD_FILE` and the eight role files, `FACTORY_SECRET_KEY_FILE(S)`, `BUILDER_E2B_API_KEY_FILE`, `BUILDER_CONTEXT7_API_KEY_FILE`, `PREVIEW_KEY_FILE`, the runner provisioner file, `MIGRATION_DATABASE_URL_FILE` | Secret | file, path in env, as today |
| `CONEXUS_EVAL_DATABASE_URL` | Secret | becomes `CONEXUS_EVAL_DATABASE_URL_FILE` |
| `CONEXUS_KEYCLOAK_ADMIN_URL`, `CONEXUS_OPERATOR_SECRETS_DIR` | Boot | env of the settings CLI and `settings-check.sh`, through the CLI's typed loader (slice 1) |
| `CONEXUS_DB_SETTINGS_OPERATOR_PASSWORD_FILE` | Secret | file, path in env, a Hub role file (slice 1) |
| Default model for build and memory | Installation setting, `administrator` | `models.default` (slice 2) |
| Model account, credential, sharing | Domain data plus a sealed secret | `model.model_account`, as today; sharing gets an audit row (issue #390) |
| Installation administrators, workspace and project names, memberships, invitations, app slug, app grants, accounts | Domain data | as today; grants become 0005 assignments |
| Project instructions, memory, Builder skills | Project Git content; skills are code | as today |
| Hub session 8 h and 30 min, application session 8 h | Derived from `identity.session.*` | SQL parameters with a 12 hour ceiling CHECK (slice 1) |
| Provider recheck 5 min; Preview 15 min; handoff 30 and 60 s; OIDC transaction and bootstrap 10 min; app sign-in window 600 s; Builder span retention 30 d; sandbox idle; model step limits; Context7 timeouts and URL; turn silence; artifact and runner limits; app database pool | Code constant | as today; Keycloak `accessTokenLifespan` derives from the recheck |
| Invitation 14 d in two constants and 0006's 1209600 s | Code constant | one `INVITE_LIFETIME` (slice 3) |
| Realm fixed attributes: registration, duplicate emails, login with email, verify email, reset password, theme, locale, events 90 d, admin events | Code constant enforced by Keycloak | `realm-conexus.json`, applied by `apply keycloak` |
| Realm session idle, max, token; client redirect URIs and base URL | Derived | from `identity.session.*`; from `CONEXUS_ORIGIN` |
| Hub and provisioner client secrets | Secret | generated once into files, as today |
| SMTP host, port, from, display name, TLS, user; SMTP password | Setting, `operator`; secret | `mail.smtp`; password in the operator secrets directory |
| Provisioner roles and permissions | Code constant enforced by Keycloak | `apply keycloak`, with 0006's refusals |
| `CONEXUS_KEYCLOAK_PROVISIONER_SECRET_FILE` | Secret | env path to `keycloak-provisioner` in the operator secrets directory, written by `apply keycloak` |
| `INTERNAL_SIGN_IN`, Entra tenant and client id; Entra client secret | Setting, `operator`; secret | `identity.source`; secret in the operator secrets directory, its expiry in `identity.source.secretExpiresOn` |
| Admission | Hard rule, `SCREEN` only (decision 6) | 0006 AC-4; a setting when a second value exists |
| SCIM | Not yet | joins `identity.source` when an installation needs it |
| Cargos, holders, perfil assignments; provider event cursor, person intent, access events | Domain and system data | 0005 and 0006 tables |
| Perfis and the operation allow list | App manifest; `reg.artifact_access` derived | app Git; prepare |
| Telegram chat id; bot token | Setting, `operator`; secret | `alerts.telegram.chat`; operator secrets directory |
| Alert rules | Code | `infra/telemetry/alerts/`, applied by `apply signoz` |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_RESOURCE_ATTRIBUTES`, `LOG_LEVEL`, `CONEXUS_DIAGNOSTIC_DIR`, `CONEXUS_SERVICE_VERSION` | Boot | env, parsed by `telemetry/register.ts` before app code |
| `CONEXUS_TELEMETRY_SALT`, `CONEXUS_SENTRY_DSN` | Secret | become `_FILE` (slice 4) |
| SigNoz retention 15 and 30 days | Installation setting, `operator`, enforced by SigNoz | `telemetry.retention` |
| SigNoz volume cap 20 GB | Boot (infrastructure) | the compose volume; its 80% alarm is an alert rule |
| Personal preferences | Person preference | none until the first one |

### Secrets

A secret is a file of mode 600, outside the repository. A Hub-read secret is named by a `*_FILE`
env variable. A secret only a reconciler reads (SMTP password, broker client secret, Telegram bot
token, the `conexus-settings` client secret, the break-glass password) lives in the operator secrets
directory, one file per secret. The directory is `CONEXUS_OPERATOR_SECRETS_DIR`, by default
`~/.config/conexus/secrets/` on the installation host; tests point it at a temporary directory. The
CLI refuses a file that is not mode 600 or not owned by the user running it, and a directory that
is not mode 700. No secret is a setting value, a CLI output or a log field (AC-7); `explain` shows
only "definido em <data>" and the fingerprint's first 8 hex characters.

| File in the operator secrets directory | Holds | Created by | Slice |
|---|---|---|---|
| `keycloak-bootstrap-password` | the temporary bootstrap admin password | `provision.sh`; deleted by `--init` | 1 |
| `keycloak-break-glass-password` | the break-glass account password | `apply keycloak --init` | 1 |
| `keycloak-settings-client-secret` | the `conexus-settings` client secret | `apply keycloak --init` | 1 |
| `keycloak-provisioner` | the `conexus-hub-provisioner` client secret; the Hub's `CONEXUS_KEYCLOAK_PROVISIONER_SECRET_FILE` points at it | `apply keycloak`, on first apply (mode 600); replaced by `--init --rotate` | 1 (with 0006) |
| `smtp-password` | the Conexus email account password | the operator | 3 |
| `entra-client-secret` | the company's Entra app secret | the operator | 3 |
| `telegram-bot-token` | the alert bot token | the operator | 4 |

The CLI's own database password is a Hub role file, `CONEXUS_DB_SETTINGS_OPERATOR_PASSWORD_FILE`,
created with the other role files by the role provisioning step. The CLI reaches Keycloak at the
boot value `CONEXUS_KEYCLOAK_ADMIN_URL`: it takes a token from `/realms/master/` and calls
`/admin/realms/conexus`, both on the internal side (AC-14).

### Keycloak admin console

The Keycloak documentation (read through Context7 on 2026-10-01, *References*) says three things this
spec relies on:
- The exposed path table of the reverse proxy guide lists `/admin/` as "Only internally" ("Exposed
  admin paths lead to an unnecessary attack vector"), `/realms/master/` as "Only internally", and
  `/realms/`, `/resources/` and `/.well-known/` as exposed.
- The production guide calls it best practice to expose the admin REST API and console "on a
  different hostname or context-path", and warns that "Access to REST APIs needs to be blocked on the
  reverse proxy level". The `--hostname-admin <URL>` option exists since Keycloak 25 (hostname v2)
  but only names the admin address; it closes nothing by itself.
- Bootstrap admin accounts are temporary, and lost admin access is recovered with the dedicated
  `bootstrap-admin` command.

So the console is closed at the network: loopback on the laptop pilot (AC-14), and the proxy path
rule above on a server installation. There is no proxy in the repository today, so the server rule
is proved on the first server installation (*Follow-up*). The `conexus` realm has no human
administrator; the `master` realm keeps one break-glass account and the `conexus-settings` service
account (AC-13, *Keycloak accounts*). If the break-glass password is lost, the operator runs
Keycloak's `bootstrap-admin` command on the host. Customers never get a Keycloak account with admin roles, and a delegated
Keycloak console (fine-grained admin permissions) is not offered.

**Replaces**:
- A session length written as a literal in SQL, in the realm file and in a README margin rule.
- A per-installation fact passed as a script flag (`--smtp-file`, `--entra-file`) or as an env
  variable the Hub reads beside a realm value (`CONEXUS_INTERNAL_SIGN_IN`).
- A hand edit in the Keycloak or SigNoz console, or a `kcadm` command kept in a note.
- A table per setting (`model.installation_default`) with only its last writer.
- A secret as a direct env value (`CONEXUS_TELEMETRY_SALT`, `CONEXUS_SENTRY_DSN`,
  `CONEXUS_EVAL_DATABASE_URL`) or mixed with plain values in one JSON file.
- A bare `process.env` read inside a module.

**Enforcement**:
- Types: `SettingDefinition` and the `identity.source` union make an entry without bounds, editor or
  enforcer, and a brokered source without a tenant, fail to compile.
- Tests: `settings-registry` (AC-1), `hub-config-reads` (AC-8), `settings-routes` (AC-6),
  `settings-secrets` (AC-7), the grant test (AC-2) and the `settings.administrator_key` test
  (AC-23), all in CI.
- SQL: `settings.write` refuses a `ui` write to a key outside `settings.administrator_key` (AC-6).
- Runtime: `apply --check` every 15 minutes, the stale rule, and from slice 4 the
  `conexus.settings.drifted` alert (AC-11, AC-30).
- Review: the platform review page gains one line: a new knob is placed by this sorting rule.

**Rollout**: new code follows the standard at once. Existing knobs move in the four slices of the
*Build plan*. Release note for slice 1: the first `apply keycloak` lowers Keycloak's max from 10 hours
to 1 hour, and Keycloak applies it at the next refresh, so everyone signed in has to sign in again
within about an hour. Hub rows open before the migration keep their 8 hour end time (AC-16); the
provider recheck ends them. The rest is listed debt that moves when its module is next touched, tracked by the
shrinking list of AC-8: the shared runner names to `installation.env`, `CONEXUS_EVAL_DATABASE_URL`
to a file, and the env reads outside the typed loaders.

**Exceptions**: tests may set env for `TEST_ALLOW_INSECURE_OIDC`, honored only when `NODE_ENV=test`.
Mastra's own configuration stays the `Mastra` constructor in code; Builder span retention stays a
Mastra `RetentionConfig` constant.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Hub sign-in | session absolute, idle | `resolve(identity.session.max, reader)`; the smaller of `resolve(identity.session.idle, reader)` and max (AC-17) |
| Hub request | idle slide | the session row's `idle_length`, set at open; no setting read (AC-16) |
| application handoff redemption | session absolute | `resolve(identity.session.max, reader)` |
| provider recheck refused | `SESSION_ENDED` | Keycloak `error_description` `Token is not active` or `Session not active` |
| `apply keycloak` | `ssoSessionMaxLifespan`, `ssoSessionIdleTimeout`, `accessTokenLifespan` | `desired` from the two settings and the recheck constant (AC-19) |
| `apply keycloak` | admin base URL | boot `CONEXUS_KEYCLOAK_ADMIN_URL`; token from `/realms/master/`, writes to `/admin/realms/conexus` |
| `apply keycloak` | service account secret | `keycloak-settings-client-secret` in `CONEXUS_OPERATOR_SECRETS_DIR` |
| `apply keycloak --init` | bootstrap admin password | `keycloak-bootstrap-password`, written by `provision.sh` |
| CLI database connection | role and password | `settings_operator`, `CONEXUS_DB_SETTINGS_OPERATOR_PASSWORD_FILE` |
| `apply keycloak` (slice 3) | identity provider, issuer, alias | `identity.source` |
| `apply keycloak` (slice 3) | redirect URIs, base URL | `CONEXUS_ORIGIN`, plus `--extra-origin` |
| `apply keycloak` (slice 3) | SMTP fields; password | `mail.smtp`; operator secrets directory |
| `settings.write` | actor | `operator:<os user>` in the CLI; the session's account id on the screen (slice 2) |
| `settings.write` | channel | the calling role: `settings_operator` is `cli`, any other is `ui` |
| `settings.write` | old value of a first write | `default_value`, the registry default the caller passes |
| `settings.write` | reason | the required `--reason`; on the screen, the administrator's text |
| `settings.enforcement` | fingerprint | SHA-256 of the secret file applied |
| `explain` | last change | the newest `settings.change` row of the key |
| `apply --check` cadence | 15 minutes | decision 4; `infra/pilot/settings-check.sh` |
| `conexus.settings.drifted` | count | `settings.drift_count(p_now)`: rows not `in_sync` or checked more than 30 minutes ago |
| `kc_idp_hint` (slice 3) | alias | `identity.source.alias`, sent only when the `conexus_last_kind=INTERNAL` cookie is present |
| `conexus_last_kind` cookie (slice 3) | `INTERNAL` | the account kind of the Hub session the Hub just ended, for any reason but sign-out |

### Key invariants

- Each fact has exactly one home; no key is both an env variable and a settings row, so no
  precedence table exists.
- Every settings write goes through `settings.write` and leaves one `settings.change` row.
- A value is parsed by its schema on write and on read.
- A derived value is a pure function of settings and boot config, and is never edited by hand.
- A reconciler never corrects drift on its own; only the operator's `apply` writes an external
  system, and `apply --check` holds no write client.
- The Hub never holds a credential that writes the Keycloak realm.
- A security setting with an invalid row fails closed; it never falls back to its default.
- An open Hub session keeps the absolute end and idle length it was opened with.
- The Hub and Keycloak run on separate clocks. A session ends by the Hub's own end time; Keycloak's
  copy may end a few seconds earlier or later, and the provider recheck (5 minutes) bounds the gap.

### Critical test scenarios

Beyond the AC proofs: a row edited by hand to an out-of-range value (AC-4); two concurrent `set`
calls with the same expected version (AC-3); `set identity.session.max 20m` while idle is 30 minutes
(AC-5, invariant); Keycloak down during `set` (AC-10, `failed`); `set identity.session.max` raised
while Keycloak is down: the row is saved, exit code 2, and a Hub session opened after it outlives
Keycloak's old max, so the first provider recheck after that max answers `Token is not active` and
ends it early through `SESSION_ENDED`, the safe direction (AC-10, AC-18); lowered while Keycloak is
down: the Hub ends new sessions at the new max on its own (AC-10, AC-17); `max` lowered and `idle`
raised by two interleaved `set` calls: the Hub opens with idle clamped to max (AC-17); an invalid
`identity.session.max` row: sign-in refused, `apply` refused, `set` recovers (AC-4); `apply` twice
after a hand change, and after a replaced SMTP password file (AC-9, AC-25); a session opened at
8 hours before the migration and read after it (AC-16); a planted secret in each reconciler input
(AC-7); a new `process.env` read in a module (AC-8); a `master` realm user added by hand, and a role
added by hand to `conexus-settings` (AC-13); the check loop stopped for 30 minutes (AC-11, stale).

## Build plan

Tracer bullet: slice 1 runs one setting through every layer (registry, row, audit, CLI, Hub SQL,
Keycloak, drift check) and proves it live before any other setting moves. The tracer bullet does not
build a reconciler framework: slice 1 writes the Keycloak session functions plainly, and the shared
shape waits for the second reconciler (*Reconciler*). Each slice is one pull request with the
`needs:aprovo` label (authentication change), merged and checked on local Conexus before the next.
Slice 1 merges before 0005's rewrite of the session functions; a migration takes the next free
number at merge, and the pull request that lands second renumbers and reruns
`npm run db:catalog:snapshot` after its rebase.

1. **Session max 1 hour, one source** (slice 1). It delivers detection, logging and `explain`; the
   Telegram notice waits for the alert bot of slice 4, with no stopgap.
   1. Registry module, `resolve` with its `SettingsReader` port, the two session entries and the
      invariant; satisfies **AC-1**, **AC-4**, **AC-15**.
   2. Migration: schema `settings`, its four tables, `settings_owner` and `settings_operator`,
      `settings.write`, `settings.read`, `settings.record_enforcement`, `settings.history`, the
      grants; `settings_operator` in `contracts/technical/hub-database-roles.json`; session functions
      with `p_absolute` and `p_idle`, the `idle_length` column and the 12 hour ceiling CHECK; then
      `npm run db:catalog:snapshot`; satisfies **AC-2**, **AC-3**, **AC-16**.
   3. Hub sign-in and handoff redemption resolve and pass both values, with idle clamped to max;
      `oidc.ts` maps `Token is not active`; satisfies **AC-17**, **AC-18**.
   4. CLI `get`, `set`, `explain`, `apply keycloak` (sessions only), `apply --check` with a read-only
      client, `apply keycloak --init [--rotate]` and `--check-accounts`; `provision.sh` writes the
      bootstrap password file; `infra/pilot/settings-check.sh` with its heartbeat; the three session
      values leave `realm-conexus.json`; `infra/keycloak/README.md` and `infra/pilot/README.md` give
      the *Fresh install order*, the accounts, the secrets directory, the check loop and the release
      note of *Rollout*; satisfies **AC-5**, **AC-6**, **AC-9** to **AC-13**, **AC-19**.
   5. Repository tests `hub-config-reads`, `settings-routes`, `settings-secrets`; the platform review
      line; satisfies **AC-6** to **AC-8**.
   6. Live proof on local Conexus, recorded in the pull request: the fresh install of AC-32;
      `ss -ltnp` shows Keycloak on loopback; `--check-accounts` passes after `--init` removed the
      bootstrap admin; then the steps of AC-20, AC-21 and AC-22; the final values are 1 hour and
      30 minutes; satisfies **AC-13**, **AC-14** (pilot half), **AC-20** to **AC-22**, **AC-32**.
2. **Default model** (slice 2). Registry entry, data copy and drop of `model.installation_default`
   in one migration, the Models screen through the settings service, the availability check;
   satisfies **AC-23**.
3. **Sign-in source and sender** (slice 3, with 0006 slices 1 and 3). `identity.source`,
   `mail.smtp` and their secrets; `apply keycloak` for the identity provider, flow, SMTP and
   clients; deletion of `CONEXUS_INTERNAL_SIGN_IN`, `--entra-file` and `--smtp-file`; the
   `kc_idp_hint` re-login with the `conexus_last_kind` cookie; `INVITE_LIFETIME`; a probe of whether
   the service account's two roles cover these writes, and the checked role set of AC-13 widened
   only if the probe shows it is needed; live check with the company's Entra app; satisfies
   **AC-24** to **AC-28**.
4. **Telemetry settings** (slice 4, with 0007 slice 4). This slice owns `apply signoz`.
   `telemetry.retention`, `alerts.telegram.chat`, `apply signoz`, the drift gauge with
   `settings.drift_count` and its alert rule, the two `_FILE` renames; the SigNoz retention API
   check; the shared reconciler shape if the two reconcilers show one; satisfies **AC-29** to
   **AC-31**, and the notice for **AC-11**.

**AC-14**'s server half is proved on the first server installation (*Follow-up*).

## Changes to specs 0005, 0006 and 0007

Each change is made in that spec's own pull request, before it is Accepted.

**0006 (people and sign-in)**:
- *Configuration required*: delete `CONEXUS_INTERNAL_SIGN_IN`. Keep
  `CONEXUS_KEYCLOAK_PROVISIONER_SECRET_FILE`, pointing at `keycloak-provisioner`.
- *Invite* table: the column `CONEXUS_INTERNAL_SIGN_IN` becomes `identity.source.kind` with values
  `LOCAL` and `BROKERED`; `MICROSOFT` leaves the table and any row that records the mode (AC-24 here).
- AC-8, AC-13: the lifespan comes from `INVITE_LIFETIME` (AC-28 here); the action set from `kind`
  and `identity.source.kind`.
- AC-18: `configure-realm.sh` becomes `conexus-settings apply keycloak`. Its desired state is the
  realm file plus `identity.session.*`, `identity.source`, `mail.smtp`, `CONEXUS_ORIGIN` and the
  operator secrets directory. It refuses to run with `mail.smtp` unset instead of without
  `--smtp-file`. A second run still changes nothing and says so, and it writes
  `settings.enforcement`. Its refusals on extra `realm-management` roles and foreign permissions stay.
- *Depends on*: 0006's realm slice (its slice 1) depends on this spec's slice 1, which delivers
  `apply keycloak`. The direction is one way: this spec's slice 1 does not depend on 0006.
- *Operator steps*: a fresh install follows *Fresh install order* here. The provisioner secret of
  AC-17 is created by `apply keycloak` into `keycloak-provisioner`, so the Hub starts after it, not
  after `configure-realm.sh`. There is no `--provisioner-secret-file` flag: the path is fixed by the
  operator secrets directory, and tests point `CONEXUS_OPERATOR_SECRETS_DIR` at a temporary one.
- AC-19: `provision.sh --first-admin-*` and `create-first-user.sh` go. The first person is created by
  `conexus-settings first-person` (step 6 of *Fresh install order*), signed in as the provisioner
  client.
- AC-20: drop `--entra-file`. `apply keycloak` creates the identity provider from `identity.source`
  with the alias from the setting, not the literal `microsoft`.
- *Realm* table: the `ssoSession*` rows say "derived from `identity.session`" (this spec, AC-19)
  instead of values; the client `baseUrl` row says "from `CONEXUS_ORIGIN`".
- *Realm* prose: "operators use the `master` realm's bootstrap admin" becomes the break-glass
  account and the `conexus-settings` service account of AC-13 here; the bootstrap admin is temporary
  in Keycloak 26.
- *Value sourcing*: the rows for invite actions, the Microsoft tenant, client and secret, and SMTP
  point to `identity.source`, `mail.smtp` and the operator secrets directory.
- *Operator steps* 1: the sender is the one Conexus email account (decision 3), set with
  `conexus-settings set mail.smtp` and a password file. Step 5: `set identity.source` and
  `apply keycloak` instead of `--entra-file`, an env change and a Hub restart.
- *Open questions* 1 is closed by decision 3.
- Session policy: the Hub and application session lengths come from `identity.session.*` (AC-15 to
  AC-22 here); 0006 cites them.
- AC-4: stays a hard rule. Its wording names admission `SCREEN` as the only value until admission by
  group exists (decision 6).
- AC-15: unchanged; settings changes go to `settings.change`, not `iam.access_event`.
- AC-17: unchanged; the Hub credential keeps exactly `query-users` and `view-events`. The wider
  `master` role of `conexus-settings` is held outside the Hub and checked by AC-13 here.
- AC-21: adds the silent re-login of AC-27 here.

**0007 (telemetry)**:
- AC-18: the chat id is `alerts.telegram.chat`; the token is a secret file;
  `scripts/telemetry-alerts.mjs` becomes `apply signoz`, idempotent as specified, and writes
  `settings.enforcement` (AC-29 here). `apply signoz` is built and owned by this spec's slice 4;
  0007 references it and does not specify it again. The rule set gains the drift alert of AC-30
  here.
- AC-26: retention 15 and 30 days is `telemetry.retention`, applied and observed by `apply signoz`,
  not set by hand in the SigNoz UI (AC-29 here, with its UNVERIFIED API).
- AC-16: the Hub's metrics gain `conexus.settings.drifted` (AC-30 here), read through
  `settings.drift_count`, granted to `hub_iam_runtime`.
- AC-25 and *Configuration required*: `CONEXUS_TELEMETRY_SALT_FILE` and `CONEXUS_SENTRY_DSN_FILE`
  (AC-31 here). The OpenTelemetry variables stay boot env.
- AC-22: unchanged. Builder span retention stays a Mastra constant.

**0005 (app access)**:
- AC-8, AC-9: this spec's slice 1 lands first. 0005's rewrite of `resolve_application_session` and
  `redeem_handoff` starts from the functions it leaves, keeps the `p_absolute` parameter of AC-16
  here, and lets no `interval '8 hours'` come back. Its migration takes the next free number at merge
  and reruns `npm run db:catalog:snapshot` after the rebase.
- *Depends on*: adds this spec's slice 1.
- *Key invariants*: add that `reg.artifact_access` is derived from the manifest at prepare and has
  no human write path.
- *Out of scope*: "personal versus installation settings" becomes a pointer to this spec.
- *Configuration required*: "None" holds. Cargos and assignments are domain data; the manifest is
  app code. Decision 5 confirms the existing line "No Mastra RBAC or FGA".

## Consequences

**Positive**:
- The session limit, and every later setting, has one answer to "what is it, who set it, when, why,
  and does Keycloak agree".
- Changing the session limit is one command, not a migration, a realm edit and a README margin.
- A hand change in Keycloak is recorded within 15 minutes instead of never, and from slice 4 it
  reaches the operator's Telegram.
- Secrets that sat in env values or mixed JSON files become files with fingerprints.
- The Hub keeps its narrow Keycloak credential.

**Negative / tradeoffs**:
- Outside people with a password type it again every hour (decision 2).
- Three new tables, a CLI and a reconciler per external system are code we own and test.
- Every security setting change needs the Conexus operator; a company cannot change its own
  sign-in source or sender (decision 1).
- The reconciler holds a `master` realm credential on the installation host, outside the Hub, and
  its `manage-realm` role is realm wide. Audit, the drift check and `--check-accounts` guard it; least
  privilege does not.
- The migration credential, as the database owner, can still edit the `settings` tables directly.
  The CLI and the Hub cannot: their roles only call the definer functions. The audit binds every
  change made through them, not a database owner acting by hand.
- Drift is only reported; until the operator runs `apply`, Keycloak may enforce a value we did not
  choose. In slice 1 nobody is notified; the operator sees drift in `explain` and the log until the
  alert bot of slice 4.
- A failed `apply` after `set` leaves the Hub and Keycloak on different values until the retry.
- The first apply makes everyone sign in again within about an hour (*Rollout*).
- An invalid row of a security setting stops new sign-ins until the operator fixes it.
- The server half of the closed console waits for a reverse proxy that does not exist yet.

**Neutral**:
- One migration per slice that touches schema, each forward only, each with a catalog snapshot.
- Slices 3 and 4 land inside 0006 and 0007 work rather than on their own.

## Follow-up

Records to amend, each needing the operator's approval before this spec is Accepted:
- [ ] New decision (next free number after the ones 0005 to 0007 propose): the configuration model
      of this spec, with decisions 1 to 6.
- [ ] Amend specs 0005, 0006 and 0007 as listed above.
- [ ] `docs/development/review/platform.md`: the sorting rule line (slice 1).
- [ ] `infra/keycloak/README.md` and `infra/pilot/README.md`: the break-glass account, the
      `conexus-settings` service account and its realm-wide role, the operator secrets directory,
      `settings-check.sh`, the *Fresh install order* and the slice 1 release note (slice 1).

Later work:
- [ ] Keycloak test of a session length per kind of person (outside people with a password longer
      than company people), only if outside people complain (decision 2). Whether Keycloak can hold
      a different max per client or flow is UNVERIFIED.
- [ ] A read-only settings page for the company administrator (decision 1), reading `explain`'s data.
- [ ] An admin screen that edits `administrator` settings, later, through the same service.
- [ ] A "manager of" row rule beside OWNER, SHARED and INHERIT, when a real app needs it (decision 5).
- [ ] Issue #390: record who shares a model account with everyone.
- [ ] Prove the closed console on the first server installation: the proxy path rule of AC-14.
- [ ] A warning before `identity.source.secretExpiresOn`, once an Entra secret is in use.
- [ ] Admission by group and SCIM as `identity.source` variants, when an installation needs them
      (decision 6).
