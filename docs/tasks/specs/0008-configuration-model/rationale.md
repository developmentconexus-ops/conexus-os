# 0008. Rationale: the configuration model

## Context

On 2026-10-01 Leandro decided that a login lasts at most 1 hour for everyone (the leaver decision Q2
of the user lifecycle study). Applying that one number showed how Conexus keeps configuration
today. The session length lives in three places that nobody keeps in step: Keycloak's realm (10 hour
max, 40 minute idle), the Hub's SQL (8 hours and 30 minutes as literals in the functions and in table
CHECK constraints of `0026_single_session.sql`), and the application session (8 hours, a third
literal). The README states the margin between them in prose. Changing the number means a new
migration, a realm edit and a test change, with no record of who changed it or why.

The inventory of the same day found the pattern repeated. The sign-in mode is an env variable in
spec 0006 (`CONEXUS_INTERNAL_SIGN_IN`) and also an identity provider in the realm, set by a script
flag; either can change without the other. The Hub origin is in env and again as a literal redirect
URI in the realm file, with the branch Hub added by hand. Invitation lifetime is three constants.
Retention is three facts in three systems. The default model is a table that keeps only its last
writer. Two secrets in spec 0007 are direct env values, and two script inputs mix secrets with plain
values in one JSON file. Keycloak never returns the SMTP password or the broker client secret, so a
change there is invisible. Model account sharing with everyone leaves only an `updated_at`.

More such facts are coming: the sign-in source per installation, the email sender, SCIM later,
telemetry retention and alert channels (0007), and the first personal preferences. The forces are
the usual ones for configuration. Configuration changes are a leading cause of outages, so a change
needs review, validation and a way back. Each knob is a permanent cost, so knobs should be few. A
wrong identity setting can lock out the whole company and the person who would fix it. The admins
are not technical, and Keycloak's console speaks realm vocabulary in English. Conexus is run by one
operator, so whatever we build must be small enough to operate alone.

Without a model, each new spec invents its own home for its knobs, and the session limit becomes a
fourth hand-kept number beside 8 hours, 10 hours and 40 minutes.

## Options considered

### Option 1: keep each fact where it is, and document the links

Leave env, SQL literals, realm file values and script flags as they are. Write down which values
must agree, and change them together by hand.

**Pros**:
- No new code, tables or tools.
- Nothing to learn; every value is where an engineer would look first.

**Cons**:
- The 1 hour decision still touches three places, and the next one touches more.
- No record of who changed a value, when or why, and no way to see the value in force.
- A hand change in Keycloak stays invisible.
- Each new spec keeps inventing homes; the inventory's duplicates grow.

### Option 2: the external system is the authority, Conexus reads it

Keycloak owns the identity settings and SigNoz its retention and alerts; they are edited in their
own consoles, and Conexus reads them when it needs them (pattern A below).

**Pros**:
- One place per setting with no reconciler, since Conexus keeps no copy.
- This is how WorkOS, Auth0 and Clerk keep developer settings (the Mastra workshop video shows the
  WorkOS dashboard).

**Cons**:
- The editor must be a technical person in Keycloak's English realm console; Conexus admins are not.
- The Hub's own session length is enforced in the Hub's SQL, not in Keycloak, so a Hub copy is
  needed anyway, which brings back two homes.
- Keycloak keeps admin events, but changes to SigNoz and the realm would have no reason recorded and
  no common view.
- A console open to edits is also an attack surface (Keycloak's own guide says not to expose
  `/admin/`).

### Option 3: one home per fact, a typed registry, one audited write path and a reconciler (chosen)

Boot config stays env, secrets stay files, domain data stays in its tables. Anything that changes
while running is a setting: a registry entry in code, one Postgres row, written only through one
audited function, read at use. Where Keycloak or SigNoz enforces a setting, our row is the authority
and an idempotent reconciler converges the other system and reports drift (pattern B below).

**Pros**:
- Every fact has one home, so the session limit is one value with derived copies.
- Every change records old value, new value, actor and reason; `explain` shows the value in force
  and whether Keycloak agrees.
- Validation, defaults, editor and enforcement are declared once and read by the CLI, the Hub and
  the reconciler.
- The Hub keeps its narrow Keycloak credential; the reconciler runs outside it.
- It is the pattern every mature product in the study follows for its runtime tier (GitLab
  application settings, Sentry's options store with per-option flags, Mattermost's database mode).

**Cons**:
- We build and own a registry, three tables, a CLI and one reconciler per external system.
- Drift in Keycloak is possible and must be watched, because the console still exists.
- A reconciler needs a `master` realm credential on the installation host.

### Option 4: configuration as code in Git, applied by a pipeline

Keep per-installation values in files in a private repository and apply them with
keycloak-config-cli or Terraform on each change, as GitOps teams do.

**Pros**:
- Review and rollback by diff come for free; Git is the audit.
- keycloak-config-cli already tracks what it owns and reverts console edits to managed fields.

**Cons**:
- The Hub's own settings (session length in SQL, the default model) still need a database home and
  a read path, so this covers only the external half.
- It adds a Java tool or a Terraform state file per installation, and a pipeline, for one operator.
- A future admin page cannot write to it.
- Keycloak's `KeycloakRealmImport` creates a realm once and never updates it, so the built-in import
  is not this option; it takes a separate tool.

### Where the admin clicks: patterns A to D

The study of where products put identity admin found four patterns:

- **A. The identity console is the admin place, the app reads.** WorkOS, Auth0 and Clerk for
  developer settings; Camunda 8.8 with an external OIDC provider. Cheapest, no drift, one place.
  The admin must use the vendor's console. This is Option 2.
- **B. The app is the admin place, the identity server is a hidden engine driven by API or config
  as code.** Camunda 8.7 Management Identity over its packaged Keycloak (roles and groups in the
  product; users stayed in Keycloak or the company's provider, so a partial B). We build every screen
  and must treat any console edit as drift. This is Option 3.
- **C. A vendor-hosted self-service portal for the customer's IT.** WorkOS Admin Portal, Auth0
  Self-Service SSO. Keycloak has no such portal, so for us it would be B for that one task.
- **D. A delegated native console.** Keycloak fine-grained admin permissions v2 (group scoped) and
  per-organization admin permissions (announced for 26.7). The customer sees raw Keycloak vocabulary,
  and no product was found that exposes it.

Decision 4 picks B for settings, with the console closed. People who may enter stay on Pessoas for
the pilot (decision 6). C-style guided setup for connecting the company's Entra tenant is a later
screen; D is not offered.

### Mastra RBAC and FGA

Mastra offers role-based access (`server.rbac`) and fine-grained authorization (`server.fga`) with
an `IRBACProvider` and `IFGAProvider` that could be backed by our Postgres. Both live under Mastra's
Enterprise licence: the installed `@mastra/server` 1.71.0 throws at start when either is configured
without a valid licence outside development (`validateEELicense`,
`node_modules/@mastra/server/dist/server/server-adapter/index.js:923-942`). Both guard Mastra's own
resources (agents, workflows, tools, threads, Studio routes). Conexus's guarded surfaces are the
runner socket, the app host and the app database, where Mastra's server never runs. So Conexus keeps
its own roles (spec 0005) and its own row rules enforced by Postgres row level security, which is
the same relationship-based model (a person's relation to a row decides access). The free parts
remain available: the principal in `RequestContext`, and a custom `MastraAuthProvider` if the Builder
mount ever needs one (decision 5). Whether Mastra would treat a self-written provider as exempt from
the licence is a legal question and UNVERIFIED.

### Enforcement and rollout

- **Document and enforce going forward (chosen).** Types, CI tests and the drift alarm enforce the
  standard for new code; existing knobs move in four slices and the rest is listed debt that may
  only shrink (AC-8). Strong enforcement, small blast radius per pull request.
- **One migration pull request for every knob.** Moves all of section *Placement* at once. It would
  cross the Hub, 0006 and 0007 while two of those are unbuilt specs, and one failure would block
  everything.
- **Document only.** Relies on review. The inventory shows where that leads.

## Rationale

Option 3, enforced going forward, slice 1 first. The forces that decide it are the session decision
and the identity risk. The 1 hour limit has to hold in the Hub and in Keycloak; Option 2 cannot give
the Hub's SQL a single source, and Option 1 makes it a fourth copy. A wrong identity setting can lock
the company out, so the change path must validate, record a reason and show its result, which only
Option 3 gives without a new tool chain. Option 4's strengths (diff review, rollback) cover only the
external half and cost a Java tool or a state file per installation for one operator.

The principles that shaped the choices:
- **Redesign from First Principles.** The 1 hour session is treated as if one session setting had
  existed from day one: one value with derived copies, not a fourth hand-kept number.
- **Subtract Before You Add.** The plan removes `CONEXUS_INTERNAL_SIGN_IN`, `--smtp-file`,
  `--entra-file`, the SQL literals, the redirect literal, two invitation constants and
  `model.installation_default` in the same slices that add the three tables.
- **Laziness Protocol.** One `scope` value, two editors, no cache, no locks, no cascading scopes, no
  feature flag system: each waits for a real second case. The CLI uses the database credential the
  operator already holds.
- **Model the Domain.** A registry of definitions replaces rules spread over `config.ts`, SQL and
  shell; `identity.source` is a union, so a brokered source without a tenant cannot be stored.
- **Boundary Discipline.** Values are parsed at the boundary, on write and on read; derived Keycloak
  and SigNoz values are pure functions tested with literal values.
- **Make Operations Idempotent.** The reconciler compares whole states and converges; a rerun
  changes nothing; a replaced secret is seen by fingerprint.
- **Encode Lessons in Structure.** The env-read rule, the registry rules and the append-only audit are
  tests and types, not review prose; drift is an alarm, not a habit.
- **Prove It Works.** Slice 1 is accepted on a real session ending in a real browser, a real
  Keycloak value and a real hand change detected, not on a stored row.

Choices settled while writing, each with the runner-up:
- The Keycloak reconciler uses its own `master` service account, not the break-glass account (the
  synthesis's choice). The break-glass account stays an emergency key whose every use stands out in
  Keycloak's admin events. Runner-up: reuse the operator's admin, one credential less.
- The drift alarm reaches Telegram through a Hub gauge read from `settings.enforcement`, so the
  check needs no telemetry of its own and the Hub needs no Keycloak read role. Runner-up: the CLI
  posts to Telegram directly, a second alert path beside 0007.
- `infra/pilot/settings-check.sh` is a loop beside `hub.sh` and `runner.sh`, the way the pilot
  already runs processes. Runner-up: a systemd timer, which the WSL pilot may not run.
- Keycloak's idle is the smaller of Hub idle plus 10 minutes and max, keeping today's 10 minute margin
  (40 against 30) and never above max. Runner-up: Keycloak idle equal to max.
- The CLI lives in the Hub source so it imports the registry and ships with the Hub build.
  Runner-up: a script under `scripts/`, which cannot import the TypeScript registry.
- The silent re-login for company people (decision 2) needs the Hub to send `kc_idp_hint`; 0006
  shows the Keycloak sign-in page, so without the hint the re-login is one click, not silent. Slice 3
  adds the hint for `INTERNAL` accounts of a brokered installation. Runner-up: Keycloak's identity
  provider redirector for the whole realm, which would also send outside people to the company's
  provider.

## References

**Project sources**:
- HQ study `~/conexus-study/2026-10-01/config-model/`: `decisions.md` (decisions 1 to 6),
  `synthesis.md`, `methodology.md`, `products.md`, `conexus-today.md`, `idp-admin-place.md`.
- HQ study `~/conexus-study/2026-10-01/mastra-auth/`: `mastra-surface.md`, `conexus-surfaces.md`.
- HQ study `~/conexus-study/2026-10-01/user-lifecycle/`: `synthesis.md` (Q1, Q2) and
  `proof/README.md` (Keycloak 26.8.0 throwaway proof).
- HQ `docs/scope/scope.md` item 23.
- Specs [0005](../0005-app-access-perfis/index.md), [0006](../0006-people-and-sign-in/index.md),
  0007 (branch `docs/telemetry-spec`).
- `apps/hub/src/platform/config.ts`, `apps/hub/migrations/0026_single_session.sql`,
  `apps/hub/src/identity-access/oidc.ts`, `infra/keycloak/realm-conexus.json`,
  `infra/keycloak/provision.sh`.
- Installed `@mastra/server` 1.71.0 `validateEELicense`; Mastra `ee/LICENSE` as quoted in
  `mastra-surface.md`.

**Practices & standards**:
- Configuration design and minimal knobs (Google SRE Workbook, chapters 14 and 15).
- Twelve-Factor "Config" for the boot tier only.
- Controller pattern: desired state, observed state, level-triggered reconcile (Kubernetes).
- OWASP Secrets Management Cheat Sheet: centralize, least privilege, audit, rotate.
- Append-only audit of administrative actions (OWASP Logging Cheat Sheet).
- Cascading settings with locks (GitLab), noted and not adopted.
- pstack principles named in *Rationale*.

**Links** (verified in the input studies, or read through Context7 while writing this spec):
- SRE Workbook, Configuration Design: https://sre.google/workbook/configuration-design/
- SRE Workbook, Configuration Specifics: https://sre.google/workbook/configuration-specifics/
- The Twelve-Factor App, Config: https://12factor.net/config
- Kubernetes controllers: https://kubernetes.io/docs/concepts/architecture/controller/
- OpenFeature specification: https://openfeature.dev/specification/
- GitLab cascading settings: https://docs.gitlab.com/ee/development/cascading_settings.html
- Cloudflare post-incident report, 18 November 2025: https://blog.cloudflare.com/18-november-2025-outage/
- NIST SP 800-53 Rev. 5: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
- Keycloak Operator realm import: https://www.keycloak.org/operator/realm-import
- keycloak-config-cli: https://github.com/adorsys/keycloak-config-cli
- Keycloak fine-grained admin permissions v2: https://www.keycloak.org/2025/05/fgap-kc-26-2
- Keycloak admin permissions for organizations: https://www.keycloak.org/2026/05/org-fgap
- Keycloak organization admin discussion: https://github.com/keycloak/keycloak/discussions/34005
- Keycloak Server Administration Guide: https://www.keycloak.org/docs/latest/server_admin/index.html
- Keycloak features: https://www.keycloak.org/server/features
- Keycloak reverse proxy guide, exposed path recommendations (Context7):
  https://github.com/keycloak/keycloak/blob/main/docs/guides/server/reverseproxy.adoc
- Keycloak production guide, admin on a different hostname (Context7):
  https://github.com/keycloak/keycloak/blob/main/docs/guides/server/configuration-production.adoc
- Keycloak bootstrap and recovery of admin accounts (Context7):
  https://github.com/keycloak/keycloak/blob/main/docs/guides/server/bootstrap-admin-recovery.adoc
- Keycloak 25 upgrade notes, hostname v2 and `hostname-admin` (Context7):
  https://github.com/keycloak/keycloak/blob/main/docs/documentation/upgrading/topics/changes/changes-25_0_0.adoc
- Camunda Management Identity: https://docs.camunda.io/docs/self-managed/identity/what-is-identity/
- WorkOS sessions: https://workos.com/docs/user-management/sessions
- WorkOS Admin Portal: https://workos.com/docs/admin-portal.md
- Auth0 organization connections: https://auth0.com/docs/manage-users/organizations/configure-organizations/enable-connections
- Auth0 Self-Service SSO: https://auth0.com/docs/authenticate/enterprise-connections/self-service-SSO
- Clerk organizations: https://clerk.com/docs/guides/organizations/overview

## Evidence

### What exists today (inventory of 2026-10-01)

- Boot config: about 30 Hub variables through one typed loader that fails closed, plus env reads
  outside it (`connectors`, `mar`, the runner's `main.ts`, scripts). The runner socket and connector
  directory names are in both `hub.env` and `runner.env`.
- Database settings: only the default model (`model.installation_default`, last writer only). No
  per-project settings table.
- Constants that behave like settings: sessions (8 hours, 30 minutes, 5 minute recheck), Preview
  15 minutes, handoffs, invitations 14 days, Builder span retention 30 days, and more.
- Keycloak realm: `ssoSessionIdleTimeout` 2400, `ssoSessionMaxLifespan` 36000,
  `accessTokenLifespan` 300 on `main`; client redirect URI is the pilot literal; SMTP and the broker
  come from script files.
- Settings screens: Minha conta, Minhas contas de modelo, Administradores, and the default model in
  the Models screen. No screen for sessions, SMTP, identity provider, retention or alerts.

### How mature products split configuration

GitLab, Grafana, Mattermost, Keycloak, Sentry, Backstage, Retool and Mastra were read on 2026-10-01.
Five patterns recur: a boot tier apart from a runtime tier (anything needed to reach the database
cannot live in it); one visible rule per field for who wins (GitLab `lock_` columns, Sentry's
per-option flags such as "prioritize disk" and "credential"); secrets kept out of the settings store
or masked; a declarative path beside the UI that tracks what it owns (Grafana provisioning,
keycloak-config-cli); and scoped inheritance with locks, with identity at the top scope. Mastra
itself has no settings domain: its storage domains are runtime data and its configuration is the
`Mastra` constructor in code.

### Design rules carried from the methodology

Every setting is in exactly one class; anything that can lock out its fixer is boot; one registry
declares key, type, default, bounds, editor and apply mode; values are parsed on write and on load;
one resolve function; one authority per setting with `desired / observed / in sync` and idempotent
reconcile; one write path that records actor, old and new value and reason; a revert is an audited
write; secrets are write-only; enforcement is proved end to end by watching the behaviour, not the
stored row. The methodology's sources were checked on 2026-10-01: 9 verified, 5 corrected, 2
unverified, and no rule rests on the unverified ones.

### The Keycloak 26.8.0 proof (throwaway, 2026-10-01)

- With SSO session max 120 seconds, a refresh past the max is refused with `invalid_grant`
  `Token is not active`, not `Session not active`; `oidc.ts` classifies it as `REFUSED` today
  (AC-18).
- A new sign-in in the same browser with `kc_idp_hint` and a live session at the upstream provider
  issued a code with zero forms in 1011 milliseconds.
- After a user is disabled at the upstream provider, the Hub's refresh keeps working until the SSO
  max counted from the last sign-in, then fails; the re-login is refused upstream.
- Setting idle above max was accepted (204) on 26.8.0, with no validation error.
- SCIM `active=false` blocks the next refresh with `User disabled` in the same second.

### Keycloak documentation checked for this spec (Context7, `/keycloak/keycloak`, 2026-10-01)

- Reverse proxy exposed path table: `/admin/` "Only internally"; `/realms/master/` "Only
  internally"; `/realms/`, `/resources/`, `/.well-known/` exposed; `/metrics` and `/health` not
  exposed. The HAProxy and Traefik examples allow only those three public prefixes and deny the rest
  unless the source is internal.
- Production guide: expose the admin REST API and console on a different hostname or context path;
  "Access to REST APIs needs to be blocked on the reverse proxy level".
- `--hostname-admin <URL>`: "Address for accessing the administration console", hostname v2,
  default since Keycloak 25.
- Bootstrap admin users and service accounts are temporary and created only when the `master` realm
  does not exist yet; a dedicated command recovers lost admin access.

These are documents on Keycloak's `main` branch. Slice 1 confirms the behaviour on the pinned 26
image (AC-13, AC-14).

### Claims carried from the inputs that remain UNVERIFIED

- SigNoz v0.144.0 sets retention through its API (slice 4 checks).
- The smallest `conexus-realm` client role set in `master` that lets the reconciler write sessions,
  then identity providers, SMTP and clients (slices 1 and 3 probe).
- Keycloak applies a lowered SSO max to sessions already open (AC-22 records it).
- Keycloak can hold a different session max per client or flow (follow-up test).
- Silent re-login through the Hub with `kc_idp_hint` against the real Entra tenant (AC-27).
- Camunda 8.7 keeps users in Keycloak or the company provider (search snippet only).
- Clerk's session lifetime page, Terraform's drift behaviour, keycloak-config-cli's exact overwrite
  wording, GitLab's `application_setting_updated` contents, Mattermost writing env values back to
  `config.json`, and Retool losing resources on an `ENCRYPTION_KEY` change. None of these carries a
  rule of this spec.
- Whether Mastra treats a self-written RBAC or FGA provider as exempt from the Enterprise licence.
