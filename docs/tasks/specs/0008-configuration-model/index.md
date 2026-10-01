# 0008. The configuration model: one home per fact, a settings registry and a reconciler

**Date**: 2026-10-01
**Status**: Proposed
**Changes**: the Proposed specs [0005](../0005-app-access-perfis/index.md),
[0006](../0006-people-and-sign-in/index.md) and 0007 (telemetry, branch `docs/telemetry-spec`), as
listed under *Changes to specs 0005, 0006 and 0007*. It also changes the Hub session SQL of
`0026_single_session.sql`, `identity-access/oidc.ts` and `infra/keycloak/realm-conexus.json`.
**Depends on**: nothing for slice 1. Slice 3 lands with 0006's Microsoft work, slice 4 with 0007's
SigNoz work.

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
  Keycloak, and I decide whether to put ours back.
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
  refuses, and on a setting key that a typed env loader also reads. [`settings-registry`]
- **AC-2**: One migration creates the schema `settings` with `settings.value`, `settings.change` and
  `settings.enforcement` (*Storage*). No role but the owner may `UPDATE` or `DELETE` a
  `settings.change` row, and only the definer function `settings.write` inserts one.
  [`settings-postgres`]
- **AC-3**: `settings.write(key, scope, subject, value, expected_version, actor, channel, reason)`
  updates or inserts the row, adds 1 to its `version` and appends one `settings.change` row with the
  old and new value, actor, channel and reason, in one transaction. A stale `expected_version` is
  refused with `SETTING_VERSION_CONFLICT` and changes nothing. An empty reason is refused with
  `SETTING_REASON_REQUIRED`. A revert is a new write of the old value and is recorded like any
  other. [`settings-postgres`]
- **AC-4**: `resolve(definition)` is the only read path for the Hub, the CLI and the reconcilers. It
  returns `{ value, source: 'set' | 'default', version }`. With no row it returns the registry
  default with `source: 'default'`. A row its schema refuses yields the default and one
  `SETTING_INVALID` log record naming the key, never a thrown request. It reads the row at each call,
  with no cache. [`settings-resolve`]
- **AC-5**: `npm run conexus:settings -- set <key> <value> --reason <text>` parses the value with the
  key's schema and checks every registry invariant before any write. A value out of bounds, an
  unknown key or a broken invariant is refused with the field and the rule named, exit code 1, and no
  row written. [`settings-cli`]
- **AC-6**: A key whose `editor` is `operator` is written only by the CLI, with `channel = 'cli'` and
  `actor = 'operator:<os user>'`. The Hub has no HTTP route that writes such a key (decision 1). A
  route census test fails when one appears. [`settings-cli`, `settings-routes`]
- **AC-7**: No secret enters `settings.value`, `settings.change`, `settings.enforcement`, a CLI output
  or a log line. A secret stays in a file whose path an env variable or the operator secrets directory
  names; a reconciler records only the SHA-256 fingerprint of the file it applied. A test plants a
  secret in each file a reconciler reads and finds it in none of these places. [`settings-secrets`]
- **AC-8**: A repository test fails when code under `apps/hub/src` reads `process.env` outside the
  typed loaders: `platform/config.ts`, the runner's loader in `app-runner/main.ts` and, once spec 0007
  adds it, `telemetry/register.ts`. The reads outside them on `main` today are listed by file and name in the
  test; the list may only shrink. [`hub-config-reads`]
- **AC-9**: Each external enforcer has one reconciler with a pure `desired`, an `observe` that reads
  the real system and an `apply` that writes only the fields it owns (*Reconciler*). Running `apply`
  twice in a row changes nothing the second time and prints `nada a aplicar`. Each run writes
  `settings.enforcement` with the setting version it applied, the observed value and a status of
  `in_sync`, `drifted` or `failed`. [`settings-reconcile-keycloak`]
- **AC-10**: `set` runs `apply` for the key's enforcers and prints `salvo e aplicado` only when every
  enforcer reports `in_sync` after the write. Otherwise it prints
  `salvo, não aplicado: <enforcer>: <motivo>`, exits with code 2 and leaves the enforcer row
  `failed`. [`settings-cli`]
- **AC-11**: `apply --check` observes every enforcer and writes `settings.enforcement` without
  changing any external system. `infra/pilot/settings-check.sh` runs it every 15 minutes. A
  difference is recorded as `drifted` and logged as `SETTING_DRIFT` with the enforcer and key, and is
  never corrected without the operator running `apply` (decision 4). [`settings-reconcile-keycloak`,
  live check]
- **AC-12**: `npm run conexus:settings -- explain <key>` prints the label, the value and its source,
  the version, the last change (actor, time, reason), the editor, and for each enforcer its status,
  observed value and check time. [`settings-cli`]
- **AC-13**: Keycloak accounts. The `conexus` realm has no human administrator. The `master` realm
  has exactly one human administrator, the operator's break-glass account, whose password lives only
  in the operator secrets directory, and one service account, `conexus-settings`, that the Keycloak
  reconciler uses. The temporary bootstrap admin that `provision.sh` creates is removed once both
  exist. `apply keycloak --check-accounts` lists the `master` users and service accounts and fails
  on any other administrator. [`settings-reconcile-keycloak`, live check]
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
  Sessions open before the migration keep their end time. No literal session length is left in a
  function body. [`identity-access-postgres`]
- **AC-17**: At Hub sign-in the Hub resolves both settings and opens the session with
  absolute = `identity.session.max` and idle = `identity.session.idle`. At application handoff
  redemption it passes absolute = `identity.session.max`. A session already open keeps the end time
  it started with. [`identity-access-http`, `application-access-http`]
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
  in and keeps using the Hub; 2 minutes after sign-in the next Hub request ends the session and the
  browser lands on Keycloak's sign-in page; `explain identity.session.max` shows `1 h -> 2 min`, the
  operator, the reason and `keycloak: in_sync`; the Keycloak admin API shows
  `ssoSessionMaxLifespan = 120`. [live check, in the slice's pull request]
- **AC-21**: Live, continuing AC-20: the operator changes `ssoSessionMaxLifespan` by hand in
  Keycloak; `apply --check` records `drifted` and logs `SETTING_DRIFT`; `apply` converges it to 120;
  a second `apply` prints `nada a aplicar`. Then `set identity.session.max 1h` and
  `set identity.session.idle 30m`, and `settings.change` holds the old and new value of each of the
  four writes. [live check]
- **AC-22**: Live: with a session open, lowering `identity.session.max` ends that session within one
  provider recheck (5 minutes) after Keycloak's new max passes, through `SESSION_ENDED`. Whether
  Keycloak applies a lowered max to SSO sessions already open is UNVERIFIED; this check records what
  Keycloak does. [live check]

Slice 2: the default model
- **AC-23**: `models.default` (`{ build, memory }`, editor `administrator`, enforced by `hub`,
  `next-use`) replaces `model.installation_default`, which the same migration copies and drops. The
  Models screen writes it through the settings service with `channel = 'ui'` and the administrator
  as actor. A write naming a model that no shared or installation model account offers is refused
  with `MODEL_NOT_AVAILABLE`. [`settings-postgres`, `builder-model-defaults`]

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
  `apply keycloak` refuses to run with `mail.smtp` unset. Replacing the password file shows as
  `drifted` by fingerprint and the next `apply` converges. `--smtp-file` is deleted.
  [`settings-reconcile-keycloak`, live check]
- **AC-26**: The Keycloak client `redirectUris` and `baseUrl` of `conexus-hub` are derived from
  `CONEXUS_ORIGIN` by `apply keycloak`; the pilot literal leaves `realm-conexus.json`. A second Hub
  on one machine is added with `apply keycloak --extra-origin <url>`. [`settings-reconcile-keycloak`]
- **AC-27**: When a Hub session of an `INTERNAL` account ends in an installation whose
  `identity.source.kind` is `BROKERED`, the Hub's next sign-in redirect carries
  `kc_idp_hint=<alias>`, so a person still signed in at the company sign-in service gets a new
  session with no form. The throwaway proof measured this path on Keycloak 26.8.0 in about 1 second;
  in the Hub it is UNVERIFIED until this live check. [live check with the company's Entra app]
- **AC-28**: One constant `INVITE_LIFETIME` (14 days) in `identity-access` feeds the workspace
  invitation and 0006's Keycloak `lifespan`. [`identity-access-postgres`, `people-provisioning`]

Slice 4: telemetry settings (with 0007)
- **AC-29**: `telemetry.retention` (`{ tracesAndLogsDays: 15, metricsDays: 30 }`) and
  `alerts.telegram.chat` (editor `operator`, enforced by `signoz`) are settings; the bot token is a
  file. `apply signoz` replaces `scripts/telemetry-alerts.mjs`, applies the alert rules of
  `infra/telemetry/alerts/` and the retention, and records `settings.enforcement`. Whether SigNoz
  v0.144.0 sets retention through its API is UNVERIFIED; if it does not, the reconciler observes
  retention only and the README names the manual step. [live check on the pilot]
- **AC-30**: The Hub exports the gauge `conexus.settings.drifted`, the number of
  `settings.enforcement` rows not `in_sync`, read from its own database. An alert rule notifies the
  operator's Telegram chat when it is above 0. [`telemetry-metrics`, live check on the pilot]
- **AC-31**: `CONEXUS_TELEMETRY_SALT` becomes `CONEXUS_TELEMETRY_SALT_FILE` and `CONEXUS_SENTRY_DSN`
  becomes `CONEXUS_SENTRY_DSN_FILE`. [`telemetry-register`]

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
```

`identity.source` is a discriminated union, so a brokered source without a tenant cannot be stored.
`DIRECTORY` and SCIM provisioning join the union when the first installation needs them.

### Storage

```sql
settings.value       (key text, scope text, subject uuid NULL, value jsonb, version int, updated_by text,
                      updated_at timestamptz, PRIMARY KEY (key, scope, subject))   -- a row only for an explicit value
settings.change      (change_id uuid, key, scope, subject, old_value jsonb, new_value jsonb, actor text,
                      channel text CHECK (channel IN ('cli','ui')), reason text, at timestamptz)  -- append only
settings.enforcement (enforcer text, key text, desired_version int, observed jsonb,
                      status text CHECK (status IN ('in_sync','drifted','failed')), detail text,
                      checked_at timestamptz, PRIMARY KEY (enforcer, key))
```

`settings.change` follows the grants of 0006's `iam.access_event` (append only, definer inserts) and
is its own table because it holds old and new values. Settings changes never go to
`iam.access_event`. The Hub reads through a definer `settings.read(key, scope, subject)` granted to
the roles that resolve a setting; slice 1 grants it to the role that opens sessions.

### Read and write paths

- **Read**: `resolve(definition)` (AC-4) everywhere. A resolved value reaches an agent run through
  Mastra's `RequestContext`, as the Builder's run keys do today.
- **Write**: `apps/hub/src/platform/settings/cli.ts`, built with the Hub and run as
  `npm run conexus:settings -- get | set | explain | apply [--check]`. It imports the registry,
  checks the schema and every invariant, calls `settings.write` with a required `--reason`, then
  runs `apply` for the key's enforcers (AC-5, AC-10). It connects with the operator's
  `CONEXUS_MIGRATION_DATABASE_URL_FILE`, the credential the operator already holds; it still writes
  only through `settings.write`. The later admin screen calls the same service; an `operator` key
  shows there read-only with its source.

### Reconciler

```ts
type Reconciler<S> = Readonly<{
  enforcer: Enforcer
  desired: (settings: ResolvedSettings, boot: BootConfig) => S   // pure, unit-tested with literal values
  observe: () => Promise<S>                                       // reads the real system
  apply: (diff: Diff<S>) => Promise<void>                         // writes only the fields it owns
}>
```

The reconciler is level triggered (it compares the whole desired state with the whole observed state
each run, rather than replaying events) and idempotent. `apply keycloak` runs in the CLI with the
`master` realm service account `conexus-settings`, never inside the Hub: 0006 AC-17 makes the Hub
refuse to start unless its credential holds exactly `query-users` and `view-events`, and widening it
to write the realm would undo that. The break-glass account is not used for routine applies, so its
use stays visible in Keycloak's admin events as an emergency. `apply keycloak --init` creates the
service account once, run with the break-glass account, and writes its secret to the operator
secrets directory. Which `conexus-realm` client roles in `master` are the smallest set that lets the
service account write the session values (slice 1) and the identity provider, SMTP and clients
(slice 3) is UNVERIFIED; each slice proves its set with a probe like 0006 AC-23 and refuses to run
with more.

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
| `KEYCLOAK_PROVISIONER_SECRET_FILE` | Secret | env path, as 0006 says |
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
directory, `~/.config/conexus/secrets/` on the installation host, one file per secret. No secret is a
setting value, a CLI output or a log field (AC-7); `explain` shows only "definido em <data>" and the
fingerprint's first 8 hex characters.

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
account (AC-13). If the break-glass password is lost, the operator runs Keycloak's `bootstrap-admin`
command on the host. Customers never get a Keycloak account with admin roles, and a delegated
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
  `settings-secrets` (AC-7), and the append-only grant test (AC-2), all in CI.
- Runtime: `apply --check` every 15 minutes and the `conexus.settings.drifted` alert (AC-11, AC-30).
- Review: the platform review page gains one line: a new knob is placed by this sorting rule.

**Rollout**: new code follows the standard at once. Existing knobs move in the four slices of the
*Build plan*. The rest is listed debt that moves when its module is next touched, tracked by the
shrinking list of AC-8: the shared runner names to `installation.env`, `CONEXUS_EVAL_DATABASE_URL`
to a file, and the env reads outside the typed loaders.

**Exceptions**: tests may set env for `TEST_ALLOW_INSECURE_OIDC`, honored only when `NODE_ENV=test`.
Mastra's own configuration stays the `Mastra` constructor in code; Builder span retention stays a
Mastra `RetentionConfig` constant.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Hub sign-in | session absolute, idle | `resolve(identity.session.max)`, `resolve(identity.session.idle)` |
| application handoff redemption | session absolute | `resolve(identity.session.max)` |
| provider recheck refused | `SESSION_ENDED` | Keycloak `error_description` `Token is not active` or `Session not active` |
| `apply keycloak` | `ssoSessionMaxLifespan`, `ssoSessionIdleTimeout`, `accessTokenLifespan` | `desired` from the two settings and the recheck constant (AC-19) |
| `apply keycloak` | admin base URL and realm | `CONEXUS_OIDC_ISSUER` |
| `apply keycloak` | service account secret | `conexus-settings` file in the operator secrets directory |
| `apply keycloak` (slice 3) | identity provider, issuer, alias | `identity.source` |
| `apply keycloak` (slice 3) | redirect URIs, base URL | `CONEXUS_ORIGIN`, plus `--extra-origin` |
| `apply keycloak` (slice 3) | SMTP fields; password | `mail.smtp`; operator secrets directory |
| `settings.write` | actor | `operator:<os user>` in the CLI; the session's account id on the screen (slice 2) |
| `settings.write` | reason | the required `--reason`; on the screen, the administrator's text |
| `settings.enforcement` | fingerprint | SHA-256 of the secret file applied |
| `explain` | last change | the newest `settings.change` row of the key |
| `apply --check` cadence | 15 minutes | decision 4; `infra/pilot/settings-check.sh` |
| `conexus.settings.drifted` | count | `settings.enforcement` rows not `in_sync` |
| `kc_idp_hint` (slice 3) | alias | `identity.source.alias`, for an `INTERNAL` account only |

### Key invariants

- Each fact has exactly one home; no key is both an env variable and a settings row, so no
  precedence table exists.
- Every settings write goes through `settings.write` and leaves one `settings.change` row.
- A value is parsed by its schema on write and on read.
- A derived value is a pure function of settings and boot config, and is never edited by hand.
- A reconciler never corrects drift on its own; only the operator's `apply` writes an external
  system.
- The Hub never holds a credential that writes the Keycloak realm.

### Critical test scenarios

Beyond the AC proofs: a row edited by hand to an out-of-range value (AC-4); two concurrent `set`
calls with the same expected version (AC-3); `set identity.session.max 20m` while idle is 30 minutes
(AC-5, invariant); Keycloak down during `set` (AC-10, `failed`); `apply` twice after a hand change,
and after a replaced SMTP password file (AC-9, AC-25); a session opened at 8 hours before the
migration and read after it (AC-16); a planted secret in each reconciler input (AC-7); a new
`process.env` read in a module (AC-8); a `master` realm user added by hand (AC-13).

## Build plan

Tracer bullet: slice 1 runs one setting through every layer (registry, row, audit, CLI, Hub SQL,
Keycloak, drift check) and proves it live before any other setting moves. Each slice is one pull
request with the `needs:aprovo` label (authentication change), merged and checked on local Conexus
before the next.

1. **Session max 1 hour, one source** (slice 1).
   1. Registry module, `resolve`, the two session entries and the invariant; satisfies **AC-1**,
      **AC-4**, **AC-15**.
   2. Migration: schema `settings`, its three tables, `settings.write`, `settings.read`, the grants;
      session functions with `p_absolute` and `p_idle` and the 12 hour ceiling CHECK; then
      `npm run db:catalog:snapshot`; satisfies **AC-2**, **AC-3**, **AC-16**.
   3. Hub sign-in and handoff redemption resolve and pass both values; `oidc.ts` maps
      `Token is not active`; satisfies **AC-17**, **AC-18**.
   4. CLI `get`, `set`, `explain`, `apply keycloak` (sessions only), `apply --check`,
      `apply keycloak --init` and `--check-accounts`; `infra/pilot/settings-check.sh`; the three
      session values leave `realm-conexus.json` and `infra/keycloak/README.md` says to run `apply`
      after `provision.sh`; satisfies **AC-5**, **AC-6**, **AC-9** to **AC-13**, **AC-19**.
   5. Repository tests `hub-config-reads`, `settings-routes`, `settings-secrets`; the platform review
      line; satisfies **AC-6** to **AC-8**.
   6. Live proof on local Conexus, recorded in the pull request: `ss -ltnp` shows Keycloak on
      loopback; `--init` creates the service account; `--check-accounts` passes after the bootstrap
      admin is removed; then the steps of AC-20, AC-21 and AC-22; the final values are 1 hour and
      30 minutes; satisfies **AC-13**, **AC-14** (pilot half), **AC-20** to **AC-22**.
2. **Default model** (slice 2). Registry entry, data copy and drop of `model.installation_default`
   in one migration, the Models screen through the settings service, the availability check;
   satisfies **AC-23**.
3. **Sign-in source and sender** (slice 3, with 0006 slices 1 and 3). `identity.source`,
   `mail.smtp` and their secrets; `apply keycloak` for the identity provider, flow, SMTP and
   clients; deletion of `CONEXUS_INTERNAL_SIGN_IN`, `--entra-file` and `--smtp-file`; the
   `kc_idp_hint` re-login; `INVITE_LIFETIME`; the service account's wider role set proved and
   checked; live check with the company's Entra app; satisfies **AC-24** to **AC-28**.
4. **Telemetry settings** (slice 4, with 0007 slice 4). `telemetry.retention`,
   `alerts.telegram.chat`, `apply signoz`, the drift gauge and its alert rule, the two `_FILE`
   renames; the SigNoz retention API check; satisfies **AC-29** to **AC-31**, and **AC-11**'s alert.

**AC-14**'s server half is proved on the first server installation (*Follow-up*).

## Changes to specs 0005, 0006 and 0007

Each change is made in that spec's own pull request, before it is Accepted.

**0006 (people and sign-in)**:
- *Configuration required*: delete `CONEXUS_INTERNAL_SIGN_IN`. Keep
  `CONEXUS_KEYCLOAK_PROVISIONER_SECRET_FILE`.
- *Invite* table: the column `CONEXUS_INTERNAL_SIGN_IN` becomes `identity.source.kind` with values
  `LOCAL` and `BROKERED`; `MICROSOFT` leaves the table and any row that records the mode (AC-24 here).
- AC-8, AC-13: the lifespan comes from `INVITE_LIFETIME` (AC-28 here); the action set from `kind`
  and `identity.source.kind`.
- AC-18: `configure-realm.sh` becomes `conexus-settings apply keycloak`. Its desired state is the
  realm file plus `identity.session.*`, `identity.source`, `mail.smtp`, `CONEXUS_ORIGIN` and the
  operator secrets directory. It refuses to run with `mail.smtp` unset instead of without
  `--smtp-file`. A second run still changes nothing and says so, and it writes
  `settings.enforcement`. Its refusals on extra `realm-management` roles and foreign permissions stay.
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
- AC-17: unchanged; the Hub credential keeps exactly `query-users` and `view-events`.
- AC-21: adds the silent re-login of AC-27 here.

**0007 (telemetry)**:
- AC-18: the chat id is `alerts.telegram.chat`; the token is a secret file;
  `scripts/telemetry-alerts.mjs` becomes `apply signoz`, idempotent as specified, and writes
  `settings.enforcement` (AC-29 here). The rule set gains the drift alert of AC-30 here.
- AC-26: retention 15 and 30 days is `telemetry.retention`, applied and observed by `apply signoz`,
  not set by hand in the SigNoz UI (AC-29 here, with its UNVERIFIED API).
- AC-16: the Hub's metrics gain `conexus.settings.drifted` (AC-30 here).
- AC-25 and *Configuration required*: `CONEXUS_TELEMETRY_SALT_FILE` and `CONEXUS_SENTRY_DSN_FILE`
  (AC-31 here). The OpenTelemetry variables stay boot env.
- AC-22: unchanged. Builder span retention stays a Mastra constant.

**0005 (app access)**:
- AC-8, AC-9: the rewrite of `resolve_application_session` and `redeem_handoff` keeps the
  `p_absolute` parameter of AC-16 here; no `interval '8 hours'` comes back.
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
- A hand change in Keycloak is found within 15 minutes instead of never.
- Secrets that sat in env values or mixed JSON files become files with fingerprints.
- The Hub keeps its narrow Keycloak credential.

**Negative / tradeoffs**:
- Outside people with a password type it again every hour (decision 2).
- Three new tables, a CLI and a reconciler per external system are code we own and test.
- Every security setting change needs the Conexus operator; a company cannot change its own
  sign-in source or sender (decision 1).
- The reconciler holds a `master` realm credential on the installation host, outside the Hub.
- The operator's database credential can still edit the `settings` tables directly. The audit binds
  every change made through the tool and the Hub, not a database owner acting by hand.
- Drift is only reported; until the operator runs `apply`, Keycloak may enforce a value we did not
  choose.
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
      `conexus-settings` service account, the operator secrets directory and `settings-check.sh`.

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
