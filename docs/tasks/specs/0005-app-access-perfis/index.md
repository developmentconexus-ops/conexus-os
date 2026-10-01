# 0005. Who may do what inside an app: cargos, perfis and a platform row floor

**Date**: 2026-10-01
**Status**: Proposed
**Amends**: [0003](../0003-app-stack-v2/index.md) AC-4 (two more generated files) and AC-7 (two more
`boot` stubs); the `conexus-server` Builder skill. The records it reopens are listed under
*Follow-up* and need the operator's approval before this spec is Accepted.
**Depends on**: [0006](../0006-people-and-sign-in/index.md), which creates every account this spec
maps (internal and external people) and the `iam.access_event` table.

## Summary

The company administrator keeps one list of **cargos** (company roles such as Vendedor or Gerente
comercial), each either internal or external, and says who holds each. Every app declares its own
**perfis** in `manifest.json`: who may call each operation and whose rows each table holds. The app
owner links each perfil to cargos, to single people or to everyone in the company. The platform
enforces both halves: the runner refuses an operation before app code runs, and row policies the
platform writes from the manifest decide which rows a person reads and changes, reading an identity
the platform binds to the database session, so app SQL cannot forge it. Opening the live app
requires a perfil. The browser gets `/__conexus/me`, a people lookup and generated `useMe`,
`useCan` and `<Can>` (convenience only). The Builder tests as person a or b; the developer views
the Preview as any perfil.

## Requirements

**User stories**:
- As the company administrator, I register cargos once and say who holds each, so every app uses
  the same company roles.
- As an app owner, I link each perfil the app declares to cargos or people on the app's Access tab,
  and I see which operations each perfil may call.
- As a person using an app, I see and change only what my perfis allow, whatever the screen shows.
- As the Builder, I declare perfis, operation access and row scope as data, write no policy and no
  ownership filter, and prove the result by running operations as two different people.
- As the Conexus operator, I know that a generated app that forgot a filter still cannot show one
  person's rows to another.

**Out of scope** (named so nobody builds them here): creating, disabling and inviting people, and
Microsoft sign-in ([0006](../0006-people-and-sign-in/index.md)); Entra group to cargo sync (later,
only on a real need); personal versus installation settings; row scoping of `connectors.fetch` (a stated limit,
see *Security model*); an environment axis that separates Preview data from live data.

**Acceptance criteria** (each is checked on its own; the proof is named in brackets: a suite under
`tests/implementation/`, new when absent today, or a live check in the driven browser):

Cargos and assignments
- **AC-1**: `iam.cargo` holds `cargo_id`, `name` (unique among non-archived cargos), `kind`
  (`INTERNAL` or `EXTERNAL`, fixed at creation) and `archived_at`. Only an installation
  administrator lists, creates, renames, archives cargos and sets a cargo's holders. Setting holders
  is an idempotent set, not add and remove. [`identity-access-postgres`]
- **AC-2**: An `APPLICATION_ONLY` account (`iam.account_access_scope`) holds only `EXTERNAL`
  cargos; an `INTERNAL` one is refused with `CARGO_KIND_MISMATCH`. [`identity-access-postgres`]
- **AC-3**: `iam.perfil_assignment` holds one perfil of one Project for exactly one holder: a cargo,
  an account, or `EVERYONE`. There is no email holder. Each row keeps `assigned_by`, `assigned_at`,
  an optional `expires_at`, and `revoked_at`, `revoked_by`; unassigning sets `revoked_at` and never
  deletes. Only the owner of the Project's Workspace (`iam.admit_application_owner`) assigns and
  unassigns, and only to a perfil the served revision declares. The first assignment fixes the
  application's address, as the first grant does today. [`application-perfis-postgres`]
- **AC-4**: `EVERYONE` matches every active account whose `kind` is `INTERNAL` (0006 AC-1), with or
  without a cargo, and never an `EXTERNAL` account. [`application-perfis-postgres`]
- **AC-5**: Every change to a cargo's holders (an administrator's own included) and every assign
  or unassign appends one `iam.access_event` row (the table 0006 creates): actor, time, change.
  [`application-perfis-postgres`]
- **AC-6**: `iam.application_grant`, `iam.application_invitation` and their functions (with
  `iam.claim_application_invitations`) are dropped in the same migration that creates the new tables.
  `iam.purge_project` deletes the Project's assignments. [`application-perfis-postgres`,
  `project-deletion-postgres`]

The door and the principal
- **AC-7**: `iam.application_perfis(account, project)` returns, in one SQL call, the served
  revision and the account's perfis in it: the union over its non-archived cargos, its account
  assignments and `EVERYONE`, less expired or revoked rows, intersected with the perfis that revision
  declares. Assignments to an undeclared perfil are inert. [`application-perfis-postgres`]
- **AC-8**: Door rule: a person opens the live app only when `application_perfis` is non-empty.
  Workspace membership alone no longer opens it. `iam.has_application_access` is that rule, defined
  once, and each of its callers (listed in *Door rule*) uses it. When it turns false, the session
  ends at the next request, as today. [`application-perfis-postgres`, `application-host`]
- **AC-9**: `iam.resolve_application_session` returns the account, the served revision and its
  perfis from that one call. The app host invokes and serves files of that revision, never of a
  second `served` read. [`application-host`]
- **AC-10**: The Hub and the runner carry one `Principal` (`account { id, email, displayName }`,
  `perfis`). `platform/caller.ts` and `callerSchema` are deleted; `invokeBody` requires `principal`
  in place of `caller`. Hub and runner ship in one image. [`app-runner-http`, `application-invoker`]

Manifest v2 and the guard
- **AC-11**: The runner and the build admit only manifest `version: 2` (*Manifest v2*). A v1
  manifest, a missing `perfis`, `tables` or `allow`, an empty or duplicate `allow`, an undeclared
  perfil, or a bad key, label or table shape is refused with the field named. A served revision with
  no `reg.artifact_access` row (built before this spec) is closed: the app host answers
  `403 ACCESS_UNDECLARED`. [`app-access-manifest`, `application-host`]
- **AC-12**: One self-contained normalization function produces both manifest stages; the hand built
  `{ version: 1, ... }` at `application-server-build.ts:94` is deleted. [`application-server-build`]
- **AC-13**: `supervisor.invoke` checks, in order: operation exists (404 `OPERATION_NOT_FOUND`),
  quarantine (503 `ACCESS_QUARANTINED`), `authorizeOperation` (403 `OPERATION_FORBIDDEN`), input
  schema (400). A refused call starts no sandbox and opens no database session. The guard is pure,
  over the manifest admitted from the bytes about to run. [`app-access-guard`, `app-runner-http`]
- **AC-14**: The acting principal is narrowed per operation: its perfis are `principal.perfis ∩
  operation.allow`. The handler's `caller.perfis` and the database binding both carry exactly that
  set. [`app-access-guard`, `application-row-scope-postgres`]

Identity in Postgres
- **AC-15**: Every invoke session is bound before its first query: the relay holds client bytes
  bound upstream until `bind(pid, acting)` returns, drops a session that reaches `ReadyForQuery`
  without `BackendKeyData`, upserts the binding on `backend_pid`, and deletes it when that upstream
  socket closes. A bind failure destroys the client socket. Migration sessions are never bound.
  [`application-row-scope-postgres`, new]
- **AC-16**: `conexus.account_id()`, `conexus.has_any_perfil(text[])` and `conexus.reads_all(text)`
  look up the row for `pg_backend_pid()` whose `role = session_user` and `expires_at >
  clock_timestamp()`. They read no `pg_stat_activity`. An unbound session gets `NULL` or `false`.
  `set_config`, `SET ROLE` attempts or a second session opened by the handler change nothing.
  [`application-row-scope-postgres`]

The row floor
- **AC-17**: On every prepare the platform converges each declared table to exactly the policies
  `policiesFor` generates, with row level security enabled (not forced), inside the same transaction
  as the pending migrations; when no migration is pending it runs before the early return
  (`supervisor.ts:207`) in its own transaction as the migration role. [`application-row-scope-postgres`]
- **AC-18**: After converge and in the same transaction, `censusRowScopes` reads the catalog. Any
  finding in *Census* rolls the transaction back, returns `ACCESS_CENSUS_FAILED` with the findings,
  and quarantines the Project until a prepare passes. The migration ledger is excluded.
  [`application-row-scope-postgres`]
- **AC-19**: The runtime role gets DML on a new table only from `restoreRuntimePrivileges` after the
  transaction commits; the default privilege on tables (`data-plane.ts:101`) is removed.
  [`application-data-postgres`]
- **AC-20**: Two bound people, a and b, holding the same perfil without `seeAll`: a never reads,
  updates or deletes b's `OWNER` row, cannot insert a row owned by b, and reads b's row only inside
  an operation that declares `reads: { <table>: 'all' }`. An `INHERIT` child follows its parent row.
  [`application-row-scope-postgres`]

Browser, Builder and Preview
- **AC-21**: `GET /__conexus/me` on the app host and the Preview host returns `{ accountId,
  displayName, email, perfis }`: resolved perfis on the app host, the acting perfis in the Preview.
  `GET /__conexus/people?perfil=<key>` returns at most 500 `{ accountId, displayName }` of active
  holders of that perfil (all perfis when omitted), sorted by name. Both answer only past the door.
  [`application-host`, `preview-application-api`]
- **AC-22**: The check generates `app/src/conexus/access.gen.ts` (`Perfil`, `ALLOW`, `useMe`,
  `useCan`, `Can`, `usePeople`) and adds `Perfil`, `Caller<Op>`, `Context<Op>` and `Handler<Op>` to
  `conexus/types.gen.ts`. `useCan` is false while loading and never fetches per operation. A handler
  calling `caller.is('x')` where `x` is not in its `allow` fails `typecheck`. [`builder-application-check`]
- **AC-23**: The check's `boot` stub answers `/__conexus/me` with every declared perfil and
  `/__conexus/people` with an empty list. [`builder-application-check`]
- **AC-24**: Preview view-as: `iam.preview.acting_perfis` defaults to every declared perfil; a
  Workspace member changes it from the Preview bar ("Ver como") to a non-empty subset of the declared
  perfis. Invoke and `/me` in that Preview use it. [`preview-application-api`, live check]
- **AC-25**: The Builder's `run-operation` takes `as: { person?: 'a' | 'b' | 'c', perfis?: string[] }`.
  Person p is the synthetic account `uuidv5(projectId, 'conexus-test-' + p)` named "Pessoa A", "B"
  or "C"; perfis default to every declared perfil and must be a subset of it. [`builder-application-runtime`]
- **AC-26**: After the first `READY` prepare of a new revision, the Hub calls the real runner for
  every (operation, declared perfil) cell with a principal holding only that perfil: a cell outside
  `allow` must answer 403; a cell inside it, sent an input of the wrong JSON type, must answer 400.
  Any other answer refuses the Preview with `ACCESS_MATRIX_FAILED`. [`app-access-matrix`, live check]

Screens and the Builder skill
- **AC-27**: The installation administration has a Cargos screen (list, create with kind, rename,
  archive, holders), and each row of 0006's Pessoas screen gains the person's cargos, set there too. The Project's Access tab replaces the grants list: declared perfis with label
  and description, assignments by cargo, `EVERYONE`, and people shown apart, inert assignments
  marked, and the operation by perfil matrix from `reg.artifact_access`. [`project-settings-access-browser`, live check]
- **AC-28**: `conexus-server` gains the section "Quem pode o quê" (*Builder skill*), its handler
  example uses `Handler<'op'>`, the hand written `Db`, `Caller` and `Connectors` types
  (`SKILL.md:70-72`) and the sentence "In the Preview, `caller` is you" (`SKILL.md:93-94`) are gone.
  [`builder-skill-manifest-vocabulary`]
- **AC-29**: End to end, in the browser on local Conexus: the Builder makes an app with perfis
  vendedor and gestor; the owner maps them; person a (vendedor) sees only their rows; person b
  (gestor) sees all; a direct call by a to a gestor operation answers 403. [live check, in the
  release evidence]

## Decision

**Chosen option**: Option 2 of [rationale.md](rationale.md): access as manifest data, a runner
guard, a principal narrowed per operation, identity bound to the backend pid by the relay, and row
policies the platform generates and checks with a census.

**Implementation skills**: `conexus-development` (`.agents/skills/conexus-development/`) · `mastra`
(`.agents/skills/mastra/`, to confirm no installed Mastra mechanism applies)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Design

### Data (where each fact lives, who writes it)

| Fact | Store | Writer |
|---|---|---|
| Cargo and its kind | `iam.cargo` | installation administrator |
| Who holds a cargo | `iam.cargo_holder (cargo_id, account_id, granted_by, granted_at)` | installation administrator |
| Perfis, `allow`, `reads`, `tables` of one revision | `reg.artifact_access` (one immutable row per artifact revision) | the Hub at artifact admission |
| Perfil to holder | `iam.perfil_assignment` | owner of the Project's Workspace |
| Acting perfis in a Preview | `iam.preview.acting_perfis text[]` | the developer (view-as) |
| Who a database session acts for | `conexus.backend_principal` in the app database | the runner's provisioner only |
| Quarantine of a Project | `conexus.project_quarantine (schema, since, findings jsonb)` | the runner's provisioner only |
| Audit of access changes | `iam.access_event` (append only, created by 0006) | the IAM functions above |

The principal carries perfis, never cargos: the app speaks only its own vocabulary, and the owner's
mapping is the only bridge. `reg.artifact_access` is written inside
`reg.retain_application_execution` (called at `application-artifact-store.ts:285`) from a
`p_access` argument the Hub builds with `admitManifest`, so SQL never parses the manifest.

### Manifest v2 (AC-11, AC-12)

```json
{
  "perfis": {
    "vendedor": { "label": "Vendedor", "description": "Registra e acompanha os próprios negócios" },
    "gestor":   { "label": "Gestor",   "description": "Vê todos os negócios e aprova descontos" }
  },
  "tables": {
    "deal":      { "rows": "OWNER", "column": "owner_account_id", "seeAll": ["gestor"], "editAll": ["gestor"] },
    "deal_item": { "rows": "INHERIT", "parent": "deal", "via": "deal_id" },
    "stage":     { "rows": "SHARED", "edit": ["gestor"] }
  },
  "operations": {
    "listDeals":    { "handler": "handlers/deals.ts", "export": "listDeals", "allow": ["vendedor", "gestor"], "input": {}, "output": {} },
    "salesRanking": { "handler": "handlers/deals.ts", "export": "salesRanking", "allow": ["vendedor"], "reads": { "deal": "all" }, "input": {}, "output": {} }
  }
}
```

The server stage adds `version: 2` and `migrations` as today. Admission rules, in
`server-manifest.ts` (still self-contained, since `application-server-build.ts:18` serializes it):
`perfis` 1 to 16 keys matching `^[a-z][a-z0-9_]{0,31}$`, label 1 to 60 characters, description 1
to 200; `allow` required, non-empty, unique, declared perfis only; `seeAll`, `editAll`, `edit`
name declared perfis; `OWNER.column` and `INHERIT.via` are identifiers; an `INHERIT.parent` is an
`OWNER` table of the same manifest; `reads` keys are `OWNER` tables and the only value is `'all'`;
at most 64 tables. At the source stage only, a migration with `CREATE POLICY`, `ROW LEVEL
SECURITY`, `CREATE RULE`, `CREATE TRIGGER` or `MATERIALIZED VIEW` is refused early with a friendly
message; the census is the proof.

### Operation guard (AC-13, AC-14)

```ts
type GuardDecision = Readonly<{ kind: 'ALLOWED'; acting: Principal } | { kind: 'FORBIDDEN' }>
export const authorizeOperation = (operation: ServerOperation, principal: Principal): GuardDecision
```

New file `app-runner/access.ts`, called between the lookup (`supervisor.ts:261`) and the input
check (`supervisor.ts:263`). Default deny is structural: `allow` is required and there is no
"anyone" keyword (everyone in the company is an owner's `EVERYONE` assignment). The Hub resolves
the principal and makes no operation check of its own.

### Identity in Postgres (AC-15, AC-16)

Installed by one idempotent `ensureBindingSchema`, the first statement of `ensurePreviewAllocation`
(`data-plane.ts:69`), owned by `app_provisioner`:

```sql
CREATE TABLE conexus.backend_principal (backend_pid int PRIMARY KEY, role name NOT NULL,
  invocation_id uuid NOT NULL, account_id uuid NOT NULL, perfis text[] NOT NULL,
  reads_all text[] NOT NULL, expires_at timestamptz NOT NULL);
-- account_id(), has_any_perfil(text[]), reads_all(text): LANGUAGE sql STABLE SECURITY DEFINER
-- PARALLEL RESTRICTED, search_path pg_catalog, pg_temp, WHERE backend_pid = pg_backend_pid()
-- AND role = session_user AND expires_at > clock_timestamp().
-- system_owner(): IMMUTABLE, returns the fixed uuid 00000000-0000-0000-0000-00000000c0e0.
```

No Project role has any privilege on the table. `EXECUTE` on the four functions goes to the
Project's runtime and migration roles and is revoked from `PUBLIC`.
`scripts/provision-application-database.mjs` (after line 101) grants `USAGE ON LANGUAGE sql` to
`app_provisioner` only; `checkProvisioner` (`supervisor.ts:291-298`) still refuses a language usable
by `PUBLIC` or a Project role.

Relay changes in `pg-relay.ts`: today the client side is resumed right after AuthenticationOk
(`pg-relay.ts:218-221`). It now stays paused until the per-run `onBackend(pid)` hook resolves; a
session whose `Z` arrives with no 8 byte `K` (`pg-relay.ts:211-213`) is dropped; the binding row
is deleted when the upstream socket closes (`pg-relay.ts:173`). Bind and delete use a separate
provisioner pool of `limits.concurrency` connections, not the migration pool
(`supervisor.ts:119`). `expires_at` is the invoke timeout plus 10 seconds; expired rows are swept
on every prepare.

### Row policies (AC-17, AC-20)

`policiesFor(table, scope, tables)` is pure, in new `app-runner/row-scope.ts`. Let
`me = (SELECT conexus.account_id())`, `any(S) = (SELECT conexus.has_any_perfil(S))`; an empty set
drops its term. Policies are `TO` the runtime role, named `conexus_<command>`.

| Scope | SELECT `USING` | INSERT, UPDATE, DELETE (`USING` and `WITH CHECK`) |
|---|---|---|
| `OWNER` (column c, seeAll S, editAll E) | `c = me OR any(S ∪ E) OR (SELECT conexus.reads_all('<t>'))` | `c = me OR any(E)` |
| `INHERIT` (parent p, via v) | `EXISTS (SELECT 1 FROM p WHERE p.id = <t>.v)` (the parent's policy applies inside) | `EXISTS (SELECT 1 FROM p WHERE p.id = <t>.v AND (p.c = me OR any(E_p)))` |
| `SHARED` (edit W) | `me IS NOT NULL` | `me IS NOT NULL AND any(W)`, or `me IS NOT NULL` without `edit` |

The binding's `reads_all` is the list of tables in the operation's `reads`. Row level security is
enabled, not forced: the migration role owns the tables and its backfills must see every row; the
runtime role is not the owner, so the policies bind it. Converge drops every policy on a declared
table and creates the generated ones, in the migration transaction (`applyPendingMigrations`,
`data-plane.ts:217-230`, with the policy SQL passed as platform text in the job) or, with nothing
pending, as the migration role through `SET ROLE` before `supervisor.ts:207`.

Owner column convention: `uuid NOT NULL DEFAULT conexus.account_id()`. Migration sessions are
unbound, so seeds go only into `SHARED` tables, and a backfill names `conexus.system_owner()`
explicitly. Rows owned by the system owner are visible only to `seeAll`, `editAll` or `reads`.

### Census (AC-18)

`censusRowScopes` reads the catalog (`pg_class`, `pg_policy`, `pg_attribute`, `pg_attrdef`,
`pg_constraint`, `pg_rewrite`, `pg_trigger`, `pg_proc`, `pg_inherits`) for the Project schema,
ledger excluded. Findings: `TABLE_UNDECLARED`, `TABLE_MISSING`; `RLS_DISABLED`, `POLICY_FOREIGN`,
`POLICY_DRIFT` (policies differ from `policiesFor`); `OWNER_COLUMN_INVALID` (not `uuid NOT NULL`),
`OWNER_DEFAULT_NOT_PLATFORM` (default not exactly `conexus.account_id()`); `INHERIT_KEY_INVALID`
(no foreign key from `via` to the parent's `id`); `VIEW_DEFINER` (no `security_invoker`),
`MATERIALIZED_VIEW`, `RELATION_KIND` (a foreign or other relation); `RULE_PRESENT`,
`TRIGGER_PRESENT`, `ROUTINE_PRESENT`; `INHERITANCE_OR_PARTITION`; `CASCADE_INTO_OWNER` (an
`ON DELETE` or `ON UPDATE` action other than `NO ACTION` or `RESTRICT` whose referencing table is
`OWNER`, or `INHERIT` on a column other than `via`, since cascades skip row security);
`RUNTIME_ROLE_UNSAFE` (the runtime role owns an object, bypasses row security or can create).

A finding returns `PrepareResult` `{ state: 'ACCESS_CENSUS_FAILED', findings }`, rolls back, and
writes `conexus.project_quarantine`; `invoke` reads it before any sandbox and a passing prepare
clears it.

### Door rule (AC-7 to AC-9)

`iam.application_perfis` reads the served revision through `builder.served_preview_revision`
(`0023_application_session.sql:341`) and the declared perfis through a definer
`reg.declared_perfis(revision)`; `iam_owner` is granted both. `iam.has_application_access`
(`0023_application_session.sql:31`) becomes `cardinality(perfis) > 0`. Its callers, each reviewed in
the migration: `mint_application_handoff` (`0026_single_session.sql:270`), `redeem_handoff`
(`0026:331`), `resolve_application_session` (`0026:376`, which also returns revision and perfis, so
its `RETURNS TABLE` is dropped and recreated with its grants), `reg.read_served_application_file`
(`0024_application_access_review.sql:265`), and `reg.get_served_application`
(`0023:365`). `revoke_application_grant` (`0026:460`) is dropped; its session ending
moves into `iam.unassign_perfil`. The app host route stops its second read at
`application-host-routes.ts:149` for invoke and uses the revision the session resolved.

### Browser side (AC-21 to AC-23)

```ts
// app/src/conexus/access.gen.ts (generated)
export type Perfil = 'vendedor' | 'gestor'
export const ALLOW = { listDeals: ['vendedor', 'gestor'], salesRanking: ['vendedor'] } as const
export function useMe(): { me: Me | null; loading: boolean }   // query key ['__conexus', 'me']
export function useCan(operation: OperationId): boolean        // ALLOW[op] ∩ me.perfis, false while loading
export function Can(props: { operation: OperationId; children: ReactNode; fallback?: ReactNode }): ReactNode
export function usePeople(perfil?: Perfil): { people: readonly Person[]; loading: boolean }

// conexus/types.gen.ts (added)
export type Caller<Op extends OperationId> = Readonly<{ accountId: string; email: string | null;
  displayName: string; perfis: readonly Allowed<Op>[]; is(perfil: Allowed<Op>): boolean }>
export type Context<Op extends OperationId> = Readonly<{ db: Db; caller: Caller<Op>; connectors: Connectors }>
export type Handler<Op extends OperationId> = (input: Input<Op>, context: Context<Op>) => Promise<Output<Op>>
```

Both are emitted by `generateClient` in `compiler-template/generate-client.mjs:106` and written by
the check beside the files at `application-check.ts:300-301`, so the compiler template is rebuilt
and its pin moves as in `0042_compiler_template_enum.sql`. The check's boot stub
(`application-check.ts:400`) gains the two routes of AC-23. `api.gen.ts` already turns a 403 into
`ConexusError { code: 'OPERATION_FORBIDDEN' }`; the skill tells the screen to say "Você não tem
permissão para isso" and not retry. The worker builds `caller` from the acting principal
(`worker.ts:164`), adding `perfis` and `is`.

### Builder skill: "Quem pode o quê" (AC-28)

The `conexus-server` skill teaches the method, not a rule list:

1. Name the people in the request and make them perfis, from their work, with Portuguese labels.
2. For each operation, ask who must do it and fill `allow`; a perfil that changes what an operation
   does belongs in its `allow`.
3. For each table, ask "whose row is this?": `OWNER` with `seeAll` or `editAll` for supervisors,
   `INHERIT` for a row that belongs to another row, `SHARED` with `edit` for reference data. A
   ranking or conflict check that reads other people's rows declares `reads` on that operation.
4. Never filter ownership in SQL. Take an owner id from input only in an operation whose `allow` has
   an `editAll` perfil (the policy checks it anyway); pick people and show names with `usePeople`.
5. Seed only `SHARED` tables; backfills name `conexus.system_owner()`. Never rename a live perfil key.
6. Prove it with `run-operation` as person a and person b, with each perfil, and with "Ver como".

### Value sourcing

| Action | Value | Source |
|---|---|---|
| guard | `allow` | the manifest admitted from the invoke's own files |
| guard | principal perfis | `iam.resolve_application_session` or `iam.preview.acting_perfis` |
| bind | backend pid | the relay's `BackendKeyData` |
| bind | acting perfis, `reads_all` | `authorizeOperation` result and the operation's `reads` |
| converge | policy SQL | `policiesFor` over the manifest `tables` |
| census | expected policies | the same `policiesFor` output |
| door, `/me`, `/people` | declared perfis | `reg.artifact_access` of the served revision |
| Access tab matrix | operation by perfil | `reg.artifact_access.allow` |
| `access.gen.ts`, `types.gen.ts` | perfis, allow | `conexus/manifest.json` in the checkout |
| Builder test people | account ids | `uuidv5(projectId, 'conexus-test-' + person)` |
| system owner | uuid | the constant in `conexus.system_owner()` |
| template pin | `TEMPLATE_REF`, `RECIPE_SHA256` | the rebuilt compiler template, new migration as 0042 |

### Data model

- `0045_cargos_and_perfis.sql` (after 0006's `0044_people.sql`): the tables of *Data* except
  `iam.access_event` (`perfil_assignment` with `CHECK (num_nonnulls(cargo_id, account_id) +
  everyone::int = 1)`), the door, its callers, the screen functions and the drops of AC-6; no copy of
  grants into a placeholder perfil. `0046`: the template pin, as `0042`. Then `npm run db:catalog:snapshot`. The `conexus` app schema is the runner's.

### Key invariants and security model

- Generated code never decides who may call an operation and never writes a policy. The guard, the
  handler's types and the row policies see the same narrowed perfis. The door is one SQL function.
- A table with no declared scope, or any object that runs with the owner's rights, never reaches
  the runtime role: the census rolls it back and quarantines the Project.
- The binding needs no secret: the relay and the provisioner know the pid, and nothing enters the
  sandbox. No SQL the runtime role may run inserts a binding, changes its pid or its `session_user`.
- Stated limits: `connectors.fetch` uses the company's credential and is guarded only by `allow`,
  never by the row floor. An administrator who joins a cargo reaches every app mapped to it; this is
  recorded in `iam.access_event`. Builder runs and view-as write into Preview data, which is the live
  data until an environment axis exists. Catalog row counts and unique or foreign key errors still
  reveal that rows exist, as today.
- No Mastra RBAC or FGA: the guarded surface is the runner socket, not a Mastra route, and those
  features need an Enterprise license.

### Configuration required

None. No new environment variables. The provisioning script gains one grant, run once per
application cluster by the operator.

### Critical test scenarios

Beyond the AC proofs, these cases must exist by name: a handler that calls `set_config` and opens
its second relay session (AC-16); a query pipelined before `ReadyForQuery` (AC-15); a stale row on a
reused pid (AC-15); a migration adding `CREATE RULE ... DO ALSO INSERT` into a `SHARED` table, which
must end in `RULE_PRESENT`, a rollback and a 503 (AC-18); a cascade into an `OWNER` table (finding)
and into an `INHERIT` child by `via` (no finding) (AC-18); a gestor calling a vendedor only operation
(AC-14); a gestor adding an item to a vendedor's deal (AC-20); a Workspace member with no perfil,
refused on the app host and admitted to the Preview (AC-8); a broken guard test double failing the
matrix (AC-26).

## Build plan

0006 lands before slice 3. Slices 1 and 2 land first. Slices 3 to 6 are one release: they merge as one pull request and deploy
as one Hub and runner image (the door needs declared perfis and an Access tab to map them).

1. Binding, inert: the provisioning grant, `ensureBindingSchema`, the four functions, the relay gate
   and hook, the binder pool, and `application-row-scope-postgres` with the binding cases. Measure
   the per statement cost of the lookup on a 10,000 row select and record it. Satisfies **AC-15**,
   **AC-16**.
2. Principal: `platform/principal.ts` replaces `caller.ts`; `invokeBody`, `WorkerJob`, the invoker,
   `run-operation` and the session resolvers carry `Principal` with empty perfis. Hub and runner in
   one image. Satisfies **AC-10**.
3. IAM: migration `0045`, the IAM functions and `identity-access` module code, the operation ledger
   and wire contract rows replacing `IAM-11` to `IAM-13`, the catalog snapshot, and the updated
   tests and proof scripts that named the dropped tables. Satisfies **AC-1** to **AC-9**.
4. Manifest v2 and generation: `admitManifest` v2, the one normalization, `reg.artifact_access` at
   admission, `generate-client.mjs`, the template rebuild and migration `0046`, the boot stubs, the
   starter manifest. Satisfies **AC-11**, **AC-12**, **AC-22**, **AC-23**.
5. Runner enforcement: `authorizeOperation`, narrowing, binding of acting perfis, `policiesFor`,
   converge and census in the migration transaction, quarantine, the default privilege removal, the
   matrix at prepare. Satisfies **AC-13**, **AC-14**, **AC-17** to **AC-20**, **AC-26**.
6. Surfaces: `/__conexus/me`, `/__conexus/people`, view-as, `run-operation as`, the Cargos screen and
   the Access tab. Satisfies **AC-21**, **AC-24**, **AC-25**, **AC-27**.
7. Knowledge: the `conexus-server` section and handler example. Satisfies **AC-28**.
8. Proof: AC-29 in the driven browser, then the Builder eval cases that touch data. Satisfies
   **AC-29**.

## Migration plan

**Strategy**: hard cutover. Pilot data is reset for Q4; apps are regenerated by the Builder on
manifest v2 and remapped by their owners. Between the release and that remap, live apps are closed.
**Rollback**: revert the release pull request and its two migrations together on a database
restored from the pre-release backup; migrations are forward only, so there is no down migration.
**Risks**: the per statement lookup cost (measured in slice 1); a provisioner pool stall (separate
binder pool); a census refusing an existing schema at first prepare (quarantine, then regenerate).

## Consequences

**Positive**:
- A generated app that forgets a filter cannot cross the row floor.
- One source for "who opens the app" and one for "who may call this".
- The Builder writes data, not policies, and gets exact types for `caller`.

**Negative / tradeoffs**:
- Workspace members lose automatic access to the live app; they use the Preview with "Ver como".
- The row vocabulary is coarse (`OWNER`, `INHERIT`, `SHARED`); teams or regions are handler filters.
- Migrations cannot use rules, triggers, cascades into owner tables or definer views.
- One extra provisioner round trip per database session.

## Follow-up

Records to amend, each needing the operator's approval before this spec is Accepted:
- [ ] New decision C-034: cargos (with kind) in Conexus IAM, perfis in the app manifest, the
      owner's mapping, the door rule, and the platform row floor.
- [ ] Amend C-026: a carve-out by which the installation administrator manages cargos and their
      holders; cargos grant nothing until an owner maps a perfil to them.
- [ ] Reopen the Q3 non-goal "no groups, roles or per-row data policy inside an application"
      (`stage2-q3-application-identity-qualification.md` section 9).
- [ ] Permission contract: section 4 (new actions with their call sites) and section 5 (audience
      now enforced by the door rule).

Later work:
- [ ] An environment axis, so Builder test runs and view-as stop writing into live data.
