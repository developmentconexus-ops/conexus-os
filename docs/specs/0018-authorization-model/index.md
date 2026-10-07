# 0018. One authorization model for Hub reads and commands

**Date**: 2026-10-07

**Status**: Draft awaiting the operator's approval

**Lane**: lane:qualification (Q-b, identity authority and database privilege migration)

**Wave branch**: wave/authorization-model

**Issue**: [#543](https://github.com/developmentconexus-ops/conexus-os/issues/543)

**Study**: Authorization respec study of 2026-10-07, held by the planning session. The operator approved its objective with a simpler proof scope; [rationale.md](rationale.md) records that answer and the current evidence. This is not approval to build the spec.

## Summary

Every person's Hub read and command uses the existing admission owner. Membership makes the subject visible; a named action decides what that member may do. Hub row policies and obsolete role switches leave. A Workspace owner can resume Project deletion, members see its real deleting state, and a revoked run refuses new work while its owner can still close it.

The wave uses existing database, run and native session owners. Existing suites stay green, with a few representative cases for each changed behavior. It adds no permission framework, deletion job, exhaustive operation matrix, filter mutation suite or general authorization analyzer.

## Requirements

- **AC-1**: An active authenticated Account reads its Workspace/Project through admission. An outsider and an unknown well-formed Workspace/Project id receive the same subject404. The parser keeps the corresponding malformed subject404; after parent admission, business child absence keeps its own code. Account admission precedes subject lookup; missing/inactive Accounts give `ACCOUNT_NOT_FOUND`/`ACCOUNT_INACTIVE`. Credential resolution still precedes admission and may return 401.
- **AC-2**: Owner/member can read, create and build. Only owners manage the roster, bindings, application access and Project deletion. Existing last-owner/admin protections and command lock ordering remain. Administrator tenure is separate from membership: it grants Connection/administrator management, no Project content or deletion permission. A non-admin receives `INSTALLATION_ADMINISTRATOR_REQUIRED`; an admitted admin can resolve an existing Workspace without membership and receives `WORKSPACE_NOT_FOUND` for an unknown one.
- **AC-3**: `database.read` supplies a closed nominal ReadGate. Only admission opens it; public person data helpers take scoped proofs rather than raw transactions. SQL derives actor and parent filters from the proof. Read proofs cannot write, and PostgreSQL reads remain REPEATABLE READ READ ONLY. Authentication, named System jobs, held Run ownership and served Checked views retain their distinct purposes and existing public admission types.
- **AC-4**: A current Workspace owner starts/resumes deletion; every member sees a deleting identity until completion. `project.read` and owner `project.delete` remain allowed; other Project actions return `PROJECT_DELETING` after membership/role checks. A non-owner cannot delete. No progress or empty-revision sentinel is invented.
- **AC-5**: Required native session/VM/app-data/repository cleanup must succeed before finalization. A failed step keeps the Project/open deletion record and the retry path. Native sessions close before deleting their persisted thread identifiers. The Conexus Git repository is removed before the database purge; purge and completion commit together. Concurrent deletion drivers use the existing per-Project session advisory lock, with `PROJECT_BUSY` on contention. No background deletion job is added.
- **AC-6**: A revoked/inactive run author cannot admit new data, credential or source work, including through the executor path. The exact held executor can still fail/interrupt its open run once through an owner-internal System transition. That path does not provide a Run credential proof or authorize new source effects. Already admitted source/candidate reconciliation keeps its existing recovery semantics.
- **AC-7**: The Hub catalog has zero policies/RLS/FORCE flags and no obsolete reader/command/helper-role dependencies; current runtime code has no role switch or caller/job GUCs. Exact registered grants, native integrity constraints, owner separation and factory confinement remain. The existing catalog checker enforces the target in place. The lost row/reader-column backstop is recorded in A §11 and the decision register with a reopen trigger.
- **AC-8**: Native Mastra requests use rejecting Project admission instead of an authorizing boolean; thread reads require exact Project resource ownership, including when a stored thread resource is absent. Existing context refusal and nine-route allowlist remain. The web handles live/deleting Project variants and clears stale Project data after a refusal; only an owner sees the deletion retry action.
- **AC-9**: The pin comes first, existing relevant suites stay green and representative tests cover changed outcomes, including an admitted model-account read and held-run credential refusal/terminal closure through a real local consumer. Existing census/checkers are reused, with only small extensions for the changed boundary. Every unit ends green; the last deletes temporary `shape/`.

## References copied

Versions are pinned here. A builder needs the rules below, not a private reference checkout.

| Mechanism | Reference, version and `file:line` | Kept as is | Adapted, and why |
| --- | --- | --- | --- |
| Membership-scoped lookup | Documenso `cd0cc5febcbb76ec7e5ecb75c0b8c65ab8432198`, `packages/lib/server-only/team/get-team.ts:38-73`, `packages/lib/utils/teams.ts:135-171` | Membership participates in subject lookup | Hub SQL, branded ids and subject404; role refusal is a separate 403 cell, unlike upstream role-in-query absence |
| Named role/action data | Better Auth `0e1a9c8413ff048a617cad81ab67175933ca8c7a`, `packages/better-auth/src/plugins/organization/access/statement.ts:3-40`, `.../routes/crud-org.ts:440-463`; Documenso `packages/lib/constants/teams.ts:31-34` at the version above | Membership, then named action permission | One small Hub catalog, no dynamic access-control plugin |
| Active person and distinct administrator | Documenso `packages/trpc/server/trpc.ts:304-321`; Supabase Auth `ce9a8eee0cc042be8c7a42981a7ddae631e41d91`, `internal/api/middleware.go:187-228` | Current human checks precede distinct administrator authority | Conexus Account/tenure/session, never IdP role claims |
| Native guarded session routes | Installed `@mastra/server` 1.71.0, `dist/docs/references/docs-server-middleware.md:134-163`, `dist/server/handlers/agent-controller.js:1095-1107`; Factory fork `ce7e9c30c1fb22ca37936121d88336ccee1f955c`, `mastracode/factory/src/auth.ts:847-877` | Server supplies trusted scope before native adapters | Hub Project admission and exact child-resource equality, no patch of Mastra internals |
| Native session cleanup | Installed `@mastra/core` 1.71.0, `dist/agent-controller/agent-controller.d.ts:145-156` | `deleteSession` removes runtime state, leaves persisted threads, absent session is success | Required deletion errors propagate before thread/repository removal; idle best effort stays at its own consumer |
| Atomic database deletion | Documenso `packages/lib/server-only/team/delete-team.ts:78-96` at the pinned version | One database transaction owns its purge | Required external effects precede final purge/completion; the upstream email job is not needed |
| Closed read gate and nominal proof | Not found in the inspected Documenso team, Better Auth organization or cal.com membership code | Existing Hub gate/proof and gate-opener owner | Extend the same boundary to reads because C §4/S §2 require it; a proof does not prove arbitrary SQL filters |
| Revocation versus cleanup | Supabase Auth middleware above separates human/session and service authority; exact held-run algorithm not found there or in Factory auth/config | Existing System principal and run owner/locked transitions | New work rechecks the person; terminal owner cleanup stays possible without becoming credential permission |
| External deletion serialization and no-policy migration | Not found in inspected Documenso team deletion, Better Auth organization, Basejump account migration, PostgREST role setup or Factory auth/config | PostgreSQL transactions/advisory locks, existing Hub grants and checkers | Compose only the measured requirements; do not add a scheduler, lease, Project session queue or SQL-security analyzer |

## Code shape

[shape/](shape/) is the compiled target contract. Run `npx tsc --noEmit -p docs/specs/0018-authorization-model/shape`; it must exit 0 on this spec head before review. U7 deletes the folder when production becomes the owner.

- `types.ts` holds branded ids, action/state unions, mode-specific nominal scopes/proofs and gates. RunOwner, RunScope, SystemScope, BootstrapScope and Checked preserve the downstream boundary.
- `catalog.ts` holds total action/role cells and subject-code mapping.
- `admission.ts` holds read/write/authentication overloads and current Failure-based refusal signatures.
- `data.ts` holds proof-consuming reads and existing deletion ports.
- `deletion.ts` holds the existing deletion module's operation, private atomic finalization and close-before-thread-delete contract.
- `run.ts` describes private terminal endings and the existing fail/interrupt operations, not a second run engine or exported cleanup proof.
- `usage.ts` includes thumbnail/list/session calls, model standing, a held credential and terminal closure.
- `negative.ts` rejects forged gates/proofs, swapped ids, wrong modes/actions, invalid Project states and System-to-credential authority.

Existing AuthenticationGate remains bound by authentication. Only admission/authentication open their corresponding gates, using the existing gate records and private constructors. Keep the gate-opener check. No compatibility overload from raw ReadTx survives U4. `Checked` is a separate method-limited served view inside a write-capable authentication transaction; it is not database READ ONLY and no command accepts it.

## Design

### Admission, scopes and refusal consumers

For valid person data calls, admission resolves the active Account first, then the exact Workspace/Project together with its membership. A missing subject or membership emits the subject404. It evaluates `ACTIONS[action].roles[role]` next, then the open deletion record and action's `whileDeleting` cell. A role-denied member receives its role403 before a deleting409. The read form uses ordered lock-free queries; it need not be one statement. Commands retain the current owner-set, Account, membership and Project lock choreography and post-wait rereads. Do not rearrange the last-owner/admin algorithm merely to make reads and writes look alike.

`connection.manage` is different: active Account, administrator tenure, then the named Workspace's existence, then its exact child. Thus a non-admin cannot distinguish an unknown Workspace, while an admin may manage an existing nonmember Workspace. U4 changes native visibility and the new read contract together. U3's command variant can already do that under the command policies.

Replace `ROLE_ALLOWS`/`ACTION_REFUSALS` with the total catalog in shape. The `SUBJECT_NOT_FOUND` constant lives once in the contract's `operation.ts`, exported by its package; admission and malformed Workspace/Project parameter cells derive from it. Other child parameter codes stay as declared. Locked owner rows occur only on owner-set command scopes; Project scopes carry the actual role. Read actions are workspace.read and project.read/project.build/connections.bind/application.manage. Command-only owner-set/create/delete actions cannot be admitted by ReadGate.

Public helper SQL uses the proof's Account/Workspace/Project predicates. Child ids still require exact parent predicates. Personal model standing preserves today's own/everyone visibility; 0017/0020 own future installation model-account behavior. Credential readers remain internal and joined to the held run/account standing; no response returns sealed credentials. Session's administrator flag is data queried under Account read admission, not a field granting administrator scope.

| Value | Owner/source |
| --- | --- |
| Actor | Authenticated gate Account, or persisted run author on executor admission |
| Role | Current Workspace membership, never browser role or administrator tenure |
| Deleting identity | Retained Project row plus open project_deletion record |
| Retry confirmation | Original deletion name; original requester is audit, not current authority |
| Live revision/activity | Existing Git/run/Preview owners, only for live variants |
| Connection parent | Workspace from administrator proof |
| Credential standing | Existing model Account/run records and own/everyone predicates |

Keep the present Failure and catch representation, owned separately by 0019. Admission produces the subject/role/state refusal; no new refusal class, predicate or error-result engine enters. Authentication/bootstrap/session-null catches remain authentication outcomes. An admitted absent thumbnail/revision remains business child absence.

| Changed producer/consumer | Required move |
| --- | --- |
| Run `ADMISSION_REFUSALS`, claim, phase and model reread | Keep current result semantics and `BUILDER_RUN_NOT_ADMITTED` for an executor that cannot admit new work. Direct person paths propagate Account or subject/deleting refusals. Type the existing code set as FailureCode; add Project404/deleting409 and remove retired codes with their final caller. |
| Connector consumer catch | Keep existing null/empty refusal result, include deleting refusal; app consumers keep Checked grant/membership and deletion exclusion. |
| Project route detail/summary/thumbnail | Remove authority-null branch and catch-all wrappers; admitted refusals propagate. Thumbnail-null retains `PROJECT_THUMBNAIL_NOT_FOUND`. |
| Source/Preview read and Builder route/module booleans | Remove subject refusal-to-false and false-to-build-denied conversions; genuinely absent admitted source still maps to `SOURCE_REVISION_NOT_FOUND`. |
| Native mount | Replace `mayBuild` by a rejecting admission call; missing/malformed Project resource is Project404, missing/foreign thread is `CONVERSATION_NOT_FOUND`. |
| Contract/client/failure register | Add Account and relevant subject/deleting failures to the changed operations, including getSession; every removed code loses all consumers and generated output together. |

Retire `PROJECT_CREATE_DENIED` in U3. U4 retires `PROJECT_SUMMARIES_UNAVAILABLE`, `PROJECT_THUMBNAIL_UNAVAILABLE` and `CONNECTOR_WORKSPACE_NOT_FOUND`, including the connection/workspace FK authority aliases and wrapper callers. U6 retires `PROJECT_BUILD_DENIED` after the last native/web branch moves. Failure vocabulary is JSON/generated code, not a database reference table. Follow migration 0053: in each retiring unit normalize persisted builder_run.failure_code equal to its retired codes to `INTERNAL_UNEXPECTED`, leaving other rows unchanged, and prove the stored run summary still parses. Reserve migration numbers at build time; never rewrite applied SQL. Generate artifacts from their owners.

`PROJECT_DELETE_DENIED` stays a non-owner403, with person text pointing to the Workspace owner. Use existing action vocabulary, with `ASK_CHANGE` rather than installation-admin advice for owner-only actions. Keep `ACCOUNT_NOT_FOUND`'s generic missing Account meaning, including email-target lookup. Declare/generate `PROJECT_DELETING` as a 409 through failures.json before its first producer is built.

### Held-run execution and terminal closure

`admitRun(gate, builderRunId, owner)` and its returned RunScope stay unchanged as public signatures. Both person and executor paths admit new work only after current active Account, Workspace build permission and exact held open run/owner checks. Use the established Project-before-run lock order and reread after waits. Executor refusals normalize to `BUILDER_RUN_NOT_ADMITTED`; a held run is not ongoing human permission.

The run lifecycle's failBuilderRun/interruptBuilderRun stop calling that execution admission. Inside the existing builder-executor System transaction they derive the Project from the persisted run, take the same Project/run locks, recheck owner/open state, and apply only a terminal failure/interruption. Another owner is refused and an already terminal run cannot be transitioned again. No new Run proof, credential read, candidate/source admission, arbitrary state update or public cleanup operation is available from this path. Keep interruption code restrictions. U3 classifies every withRun call: phase, sandbox bind, conversation persistence and candidate preparation are new work; terminal fail/interrupt are cleanup.

Keep recovery/settlement of a previously admitted source candidate in the existing owner-internal System path, with current candidate/working-state checks and once-only ending. The same principle applies to a conversation end marker required to close that admitted work: it may record closure, never new source/credential content. Revocation does not retroactively roll back an already admitted source effect. U3 must distinguish this from a new phase/candidate/credential effect; it does not use a generic "executor can do anything" exception. Existing restart/candidate settlement tests pin this boundary. The current registry.retain requires a Run proof (registry/retain.ts:22); move its sole settlement caller and signature together in U3 to the existing builder-executor System proof plus exact held run/Project/owner and sealed candidate input. It checks held open ownership and the already-admitted source identity before writing. This System operation cannot prepare a candidate or read a credential. Local lockWorking/settlement helpers take the same explicit held identity; no synthetic Run proof is minted. Response-only settlement without a candidate remains new-work admission; refusal uses terminal fail/interrupt.

### Deletion and native cleanup

Repair order before changing administrator deletion to owner deletion. Keep Project/deletion identity until required effects succeed. The existing per-Project `database.session` advisory lock serializes drivers without a job/lease. Derive its signed key inline in the initial admitted transaction using the existing `hashtextextended(prefix || projectId, 0)` pattern from application-access.ts:35, with fixed `conexus-hub:project-deletion:` prefix. No new lock-key wrapper or raw session SQL API is needed. Admit before lock acquisition; re-admit/begin while holding it, reject contention as PROJECT_BUSY, release in finally. Existing open Builder runs block deletion begin under the Project lock. Thread/session APIs remain native.

Run application-data release and required sandbox removal, then native conversation/thread cleanup and Conexus Git repository removal. Existing killRecorded returns successfully removed ids; compare them with the retained required input ids instead of discarding the result. Keep provider ids in existing conversation_session rows until final purge so a failed removal can be retried. Already absent resources count as success; required errors give PROJECT_DELETION_INCOMPLETE. Idle-sweep best effort remains a different consumer; no real E2B proof is authorized by a local card.

`conversations.deleteAll` first lists the Project's native threads, calls its required beforeDelete callback with the parsed conversation ids, and only after that callback succeeds removes the threads. The Builder passes liveConversations.drop as that callback, then removes the repository. `drop` must propagate required sandbox/native session errors; native deleteSession false means already absent and succeeds. Best-effort idle/shutdown consumers catch/log at their own boundary, not inside the shared required deletion helper. This reordering keeps retry identifiers when session teardown fails, including a later conversation failing after an earlier one closed. A partial thread removal occurs only after all required sessions closed; retry uses the remaining native threads. No retry-id table or parallel session owner is needed.

Finally, one private project-purge System transaction locks/rechecks the Project/deletion record, performs the existing purges in dependency order (identity access, bindings, registry, Builder, receipts, Project), removes the Project and sets purged_at/completed_at together. Delete public standalone purge and separate complete. Rollback preserves the row/open record. An already-admitted internal finalizer may observe completion and return; a new public request after completion receives subject404. A later current owner may retry even if the original requester lost membership.

Keep the existing session-loss signal/check before later effects/finalization. An already started non-cancellable idempotent effect may finish; no later effect starts after known loss. No Project-keyed session queue/seal framework, stream polling or session open/seal race barrier is added. New native requests after deletion admission see the durable tombstone and are refused. Native session-deleted hooks keep closing their following streams; this spec makes no new instantaneous in-flight revocation guarantee.

Before building the lifecycle change, query for open deletion records whose Project is already absent. A seeded fixture must stop the upgrade rather than invent a Project or silently complete an unknown external state; actual deployment recovery is a planning-session decision only if such rows exist.

### Database and guides

U4 is one coherent cut: closed read gate, read/helper callers, no-policy migration and exact runtime privileges. It must not promise administrator nonmember Workspace admission under the old reader policy. A temporary definer, bypass policy or write-capable administrator read is unnecessary.

The replayed baseline has 50 policies on 26 FORCE/RLS tables, three rls helpers and `iam.lock_administrators()`. Earlier business/served-reader SQL functions have already left; do not recreate them. The target migration grants runtime the exact union of registered reader/command SELECT, preserving column limits only where neither held table-wide SELECT; mutations remain exactly the registered command verbs/columns. Include Account.active. Keep migration-ledger SELECT, Hub schema USAGE, conexus_owner ownership, native integrity, and hub_factory confined to factory. No schema-wide GRANT ALL, DDL/ownership/superuser/BYPASSRLS or owner membership goes to runtime.

This union loses former reader-column denial on tables where command SELECT is table-wide, including credentials/session tokens. READ ONLY does not restrict SELECT of secret columns. Application admission and explicit projections remain the boundary; do not claim types or checks restore that database backstop. Record the accepted loss in one A §11 row and a decision-register entry with a reopen trigger, as S §10 requires.

Keep `iam.lock_administrators()` only as the narrow integrity lock, with the existing fixed body/owner/search_path and EXECUTE confined to runtime/owner. It is not business authorization. A target PostgreSQL privilege probe must show that direct runtime SHARE ROW EXCLUSIVE lock is refused with 42501 while this definer succeeds under exact mutation grants. If direct locking becomes possible without widening grants, return to the planning session before retaining an unnecessary definer.

Drop exact policies, clear FORCE/ENABLE on the registered tables, explicitly drop the three rls helper signatures/empty schema, revoke old ACL/default-ACL/membership dependencies and drop iam_rls/hub_reader/hub_command/hub_builder_ingress only when dependency-free. PostgreSQL roles are cluster-global: preflight other-database/unexpected ownership dependencies and stop instead of administering shared clusters. No CASCADE/DROP OWNED or leave-the-role compatibility fallback. Tests use an isolated cluster; applied migration history stays immutable.

Update existing role/table registers, generators, provisioning and hub-catalog-lint in place. The final register describes runtime relation/column grants and the integrity-function allowance, without split/reader/command/transaction-role semantics. Migration runner assertions become unconditional, replacing its rls-helper-exists guard. Remove runtime SET ROLE and actor/job GUC plumbing; typed gate actor/job values stay. Delete the obsolete actor-setting lint plugin and registration, remove split-table rules only where obsolete, and retain useful SQL-write/gate/table-ownership checks. No catalog-checker rename or new security scanner.

Guide edits ship with the behavior they govern, not at the end of the wave. The replacement sentences below replace contradictory text/examples; unrelated rules stay.

| Owner/unit | Target rule |
| --- | --- |
| S §2, U3/U4 | Every person data read or command admits the active Account and exact subject; membership discloses the subject, the named role/action grants permission, and an owner-internal transition may close previously admitted work without granting new human work. |
| D §6-7, U4 | Hub transactions run as hub_runtime with exactly registered privileges and no caller settings/role switches; membership-scoped admitted SQL owns Hub visibility, with no Hub row policies. |
| D §8, U4 | PostgreSQL owns integrity constraints and narrow locks; TypeScript admission owns membership/actions over current rows and command locks. Keep structural/containment foreign-key meaning. |
| A §11 and decisions, U4 | Removing Hub RLS and reader-column restrictions leaves SQL filters and projections as the data boundary; reopen on an observed disclosure or a consumer requiring database-enforced row/column isolation. |
| A §11, U4 | Replace the obsolete session role-switch departure and update the Checked served-read row to its runtime transaction; retain its method-only limitation. |
| H §4/5/8, U3/U5 | Workspace/Project malformed/outsider absence shares subject404, children retain their own codes, and deleting Project replies carry identity/state without live fields; contract/Hub/web move together. |

No new testing-guide policy or exhaustive testing framework is required by this wave. Normal T/L checks and usable-screen approval apply.

### Native routes and web

Keep the exact BROWSER_ROUTES allowlist and boot existence assertion. Replace mayBuild with Project `project.build` read admission that rejects through current Failure. Body creation resources and other path resources must be valid project UUIDs; remove the undefined-resource early return. Sessionless routes already have a Project boolean guard today; do not describe them as wholly unguarded. Before returning messages, compare the thread resource exactly to the admitted Project resource, including absent-resource threads. Preserve refusal of supplied requestContext and current session/schema outcomes. Do not change native endpoints or patch Mastra.

Project detail/list/card wire forms become identity intersected with live/deleting. Live keeps today's valid fields; deleting has no revision, activity, archived field, thumbnail or Builder controls. Remove audit fallback lists and empty revision. Deleting cards retain name/location and open the deleting screen. Only an owner sees "Tentar concluir exclusão". Pending retry disables that action; busy/incomplete state uses the existing failure text and keeps the Project; after 204 invalidate detail/list/summary and return to Workspace. On Project404 clear cached Project/Builder data before unavailable; on deleting409 refresh the Project state. Use the existing page/client patterns, no new endpoint/progress store. Normal usable-screen approval under L applies; there is no extra bespoke browser qualification matrix.

### Representative proof

Keep existing suites, update expectations only when that behavior changes. Extend their fixtures rather than build a parallel harness.

| Changed behavior | A few concrete cases | AC |
| --- | --- | --- |
| Person read and scope | member reads its Project; outsider and unknown Project receive literal PROJECT_NOT_FOUND; inactive Account is refused; representative wrong-parent child is refused | 1, 3 |
| Role/admin separation | non-owner delete is PROJECT_DELETE_DENIED; current owner can retry; admin manages an existing nonmember Workspace; admin unknown Workspace is WORKSPACE_NOT_FOUND | 2, 4 |
| Lifecycle completion | force native deleteSession failure before threads go; Project/open record remain, retry succeeds; repository failure precedes purge; final transaction rollback preserves Project | 5 |
| Revoked run | revoke held author's membership: next new work/credential admission fails, held owner closes terminally once, another owner cannot close it; existing admitted-candidate recovery stays green | 6 |
| Catalog/proof boundary | exact replayed grants and zero policies/flags/old roles; target lock privilege probe; READ ONLY refuses mutation; compile negatives are used | 3, 7 |
| Native/web/model consumer | representative foreign/absent-resource thread refusal; deleting owner/member UI and normal approval; real local model helper preserves personal/shared standing and refuses credential reread after revoke | 8, 9 |

No all-operation/all-route positive-negative matrix, foreign-byte sweep, admission/filter mutants, session open/seal/stream-close race barrier or additional light/dark/keyboard approval matrix is a completion gate. Existing tests retain their normal coverage; this scope does not discard guide T's applicable checks.

## Deletes and census

Baseline at `0987494f`, production identical to current main `5efbc090`:

| Mechanism | Today | Target/check |
| --- | --- | --- |
| Person reads without direct admission | 15 of 19; four directly admitted | zero raw person data reads; ReadGate/compiler, cheap existing census extension |
| Database entries / raw helper bodies | 70 / 33 | bounded caller inventory for migration; person helpers consume proofs, native authentication/system/platform internals retain their own named boundary |
| Product operation ids / native allowed routes | 47 / nine | existing declarations/allowlist remain owners; no second exhaustive coverage register |
| Hub policies/RLS/FORCE | 50/26/26 | zero, existing actual catalog checker |
| Live functions | three rls helpers and one integrity lock | three helpers leave; narrow administrator lock conditionally retained |
| Runtime role/settings model | reader/command switches, actor/job GUCs, four obsolete roles | zero live switches/settings/dependencies, existing catalog/source checks |
| Required cleanup | purge before repository; native session errors swallowed | repository/session completion before atomic purge+complete, representative failure/retry tests |
| Project state | live fields plus deleting booleans/empty revision fallback | live/deleting contract union, compiler and normal UI proof |

The study's rerunnable census uses TypeScript AST and reports counts plus file:line; its direct-callback heuristic is inventory, not a security analyzer. The builder extends existing census-boundaries only where cheap: closed read gate opener ownership, obsolete runtime symbols/settings and raw person helper signatures. Keep its current useful checks/record. Do not build a general call graph, per-operation registry or fail-closed arbitrary SQL classifier. Existing current numbers are a baseline, not an artificial target for unrelated authentication internals.

Delete old authorization catalogs, per-action outsider code, administrator project.delete, raw ReadTx read-admission overloads, deciding admin/Builder booleans, subject-FK authorization aliases, catch-all Project wrappers, source-refusal-to-false branch, tombstone/fake-revision fallback, public purge/separate complete, RLS helpers/policies/flags/obsolete roles/settings, obsolete split-register semantics and actor lint. Every live caller moves in its deleting unit; no old export remains for a test. Keep meaningful names such as hub-catalog-lint, ReadTx, WriteTx, Admitted and Checked.

### Bounded file inventory

Seven units, **70 product/check/configuration paths**, plus seven owning/generated Markdown documents, behavioral tests and temporary shape. Migrations and generated output count toward the product cap. The old checker rename is removed; conversations.ts is now included; the former separate read-grant migration is folded into the no-policy cut. The union below, not the sum of repeated unit edits, is the budget. Reserve each migration's next number from the builder's head. Adding product path 71 or unit 9 requires reshaping the wave.

```text
apps/hub/src/hub.ts
apps/hub/src/identity-access/admission.ts
apps/hub/src/identity-access/administrators.ts
apps/hub/src/identity-access/hub-session.ts
apps/hub/src/identity-access/roster.ts
apps/hub/src/identity-access/application-access.ts
apps/hub/src/identity-access/module.ts
apps/hub/src/connectors/store.ts
apps/hub/src/connectors/module.ts
apps/hub/src/workspace/store.ts
apps/hub/src/project/store.ts
apps/hub/src/project/routes.ts
apps/hub/src/project/deletion.ts
apps/hub/src/project/module.ts
apps/hub/src/registry/module.ts
apps/hub/src/registry/retain.ts
apps/hub/src/registry/served.ts
apps/hub/src/builder/conversation-store.ts
apps/hub/src/builder/conversation.ts
apps/hub/src/builder/conversations.ts
apps/hub/src/builder/run-reads.ts
apps/hub/src/builder/preview-state.ts
apps/hub/src/builder/model-account/accounts.ts
apps/hub/src/builder/run-lifecycle.ts
apps/hub/src/builder/module.ts
apps/hub/src/builder/routes.ts
apps/hub/src/builder/mastra-session-routes.ts
apps/hub/src/platform/db.ts
apps/hub/src/platform/hub-roles.generated.ts
apps/hub/src/platform/failures.generated.ts
apps/hub/src/platform/failure-text.generated.ts
apps/hub/src/telemetry/log-codes.generated.ts
packages/contract/src/project.ts
packages/contract/src/operation.ts
packages/contract/src/index.ts
packages/contract/src/workspace.ts
packages/contract/src/identity-access.ts
packages/contract/src/builder.ts
packages/contract/src/connectors.ts
packages/contract/src/model-account.ts
packages/contract/src/failures.generated.ts
contracts/technical/failures.json
contracts/technical/hub-database-roles.json
contracts/technical/hub-catalog-census.json
contracts/technical/hub-catalog-snapshot.json
contracts/api/product/openapi.json
contracts/api/technical/openapi.yaml
scripts/census-boundaries.mjs
scripts/run-hub-migrations.mjs
scripts/generate-hub-role-register.mjs
scripts/hub-catalog.mjs
scripts/generate-hub-catalog-snapshot.mjs
biome.json
biome/plugins/no-session-setting-in-sql.grit
scripts/hub-catalog-lint.mjs
scripts/provision-hub-roles.mjs
scripts/conexus-verify.mjs
scripts/check-import-law.mjs
contracts/technical/census-boundaries.json
apps/web/src/routes/workspace-projects.tsx
apps/web/src/routes/project-settings.tsx
apps/web/src/routes/construir.tsx
apps/web/src/features/project/components/project-grid.tsx
apps/web/src/features/project/api.ts
apps/web/src/app/failure-state.tsx
apps/web/src/app/shell.tsx
apps/web/src/features/builder/construir/construir.tsx
docs/reference/database.md
docs/reference/security-and-authority.md
docs/reference/architecture.md
docs/product/wire-contract.md
docs/development/testing.md
docs/reference/function-callers.md (generated; U5 regenerates)
docs/decisions/index.md
apps/hub/migrations/<next>_authorization_catalog.sql
apps/hub/migrations/<next>_hub_authority.sql
apps/hub/migrations/<next>_retired_build_failure.sql
```

## Units

Builders read their card, its cited Design sections, the census/inventory and shape. Identity/foreign-mount and migration units carry needs:aprovo under areas.json/delivery. Nothing builds before the operator approves the corrected spec. Every unit runs the pinned preflight, verify:quick and its relevant existing/scoped tests. A new failure/migration regenerates its artifacts from their owners. No unit uses real E2B/provider/company data or a shared cluster without separate authority.

### U1. Pin current behavior with existing fixtures

- **Already there**: Current main `5efbc090` and its unchanged product code on this branch; existing admission/db types, OPERATIONS, PostgreSQL fixtures and native session route tests. Read Representative proof, census and the study results in rationale.
- **Creates**: Only missing characterization cases in existing suites, green against current main before structure changes. Pin the touched read/command/refusal, deletion ordering, executor exception, session-cleanup error behavior and native/web state contracts. Reuse coverage already present instead of a new all-operation harness.
- **Satisfies**: AC-9 and baseline evidence for AC-1-8.
- **Files**: Existing tests/implementation suites and fixture helpers: admission-races, admission-refusal-log, connections-bind-admission, project-deletion, builder-admit-run, builder-run-lease/recovery, model-account, iam-roster/sessions, project/summary, registry, builder-session-lifecycle/routes/tripwire and existing relevant web tests. No product, contract, migration or new checker file.
- **Copies**: Existing test fixtures and literal outcomes; T §1/4/6. The private census is evidence to compare, not code to import.
- **Guide sections**: C §4/7, D §3/5, T §1-7; the current authority is pinned, not silently changed.
- **Deletes**: No retained behavior. Avoid duplicate tests for already covered cases; unsafe current behavior is named characterization, replaced in its owning unit.
- **Proof**: Current deletion/admission suites are 21 passing tests from the study; retain them. Add the native drop failure that currently resolves despite one failed deleteSession, administrator nonmember Workspace reader absence, and missed current helper outcomes only if uncovered. Literal results, no skipped desired-target test. Record 70 entries/19 reads/4 direct admits/33 raw helper bodies/47 operations and 50 policies/26 tables with the rerunnable study census; existing census-boundaries stays green.
- **Out of scope**: New failures, target implementation, exhaustive matrix/mutants or extra browser gate.
- **Stop if**: A deciding case cannot be isolated without a real provider or the baseline differs materially; bring that evidence to the planning session.

### U2. Make required deletion cleanup and finalization truthful

- **Already there**: U1 pins; current administrator deletion admission, project_deletion row, database.session advisory-lock/loss primitive, native conversation/session owners and purge ports. Read Deletion and native cleanup; shape/deletion.ts and data.ts. Initial admission uses the existing administrator until U3 replaces it; no ReadGate or no-policy catalog prerequisite.
- **Creates**: Existing driver reordered to required cleanup/repository first, private atomic purge/completion last; per-Project advisory-lock composition in the same deletion module. conversations.deleteAll calls required beforeDelete before removing native threads. Deletion-facing drop propagates teardown failure; required VM ids are checked. Idle best effort is kept at its existing consumers.
- **Satisfies**: AC-5 and AC-9. Owner authority/member-visible wire state wait for U3/U4/U5.
- **Files**: apps/hub/src/project/{deletion,module}.ts; builder/{module,conversation,conversations}.ts; hub.ts wiring and platform/db.ts session name union; existing deletion/session/conversation tests. No schema/job/lease/session queue or new failure representation.
- **Copies**: Native deleteSession contract; Documenso atomic DB cut; native session advisory lock and existing hash expression composed inline. Cross-resource protocol not found upstream, as References copied states.
- **Guide sections**: C §6/7/10, D §8, A native/session owner, P §6, T §4. No owning guide rule changes in this lifecycle repair.
- **Deletes**: Public purge/separate complete, purge-before-repository order, deletion-facing swallow-and-success, discarded VM result. All deletion callers move, no old export for tests.
- **Proof**: Update the affected pin: forced native session failure leaves threads/Project/open record and skips repository/final purge; retry closes and completes. Representative repository failure and final transaction rollback preserve the Project. Existing open-run/concurrent-delete/lock tests remain green with current authority. A seeded open deletion with missing Project refuses upgrade; do not query/change a pilot here.
- **Out of scope**: Owner-role change, union wire/UI, real E2B, new Project seal or stream race proof.
- **Stop if**: Actual stranded rows are discovered during authorized deployment, native required cleanup cannot be propagated using public APIs, or a required resource lacks idempotent absence handling.

### U3. Replace command authority and separate run closure from new work

- **Already there**: U1/U2; existing command policies pass business rows; current Account/membership/Project and owner locks, Run/System/Bootstrap/Authentication/Checked signatures. Read Admission, scopes and refusal consumers; Held-run execution and terminal closure; shape/types/catalog/admission/run.
- **Creates**: Total ACTIONS in the existing admission owner, contract-owned subject404 mapping, role-bearing Project/owner-set scopes, owner Project deletion admission with deleting allowance, current-person checks on executor admitRun. Existing run owner uses System admission and exact held-run locks for terminal fail/interrupt and previously admitted recovery; no new cleanup proof. Declare/generate PROJECT_DELETING and normalize retired PROJECT_CREATE_DENIED in the next authorization_catalog migration. Edit S §2 for command/terminal authority and H's subject404 rule alongside the change; read requirement lands with U4.
- **Satisfies**: AC-1/2 command paths, AC-4 owner authority, AC-6, AC-9. Target nonmember administrator reads wait for U4's native permissions.
- **Files**: identity-access/admission.ts and affected administrator/roster/application-access/module consumers; project/{deletion,store,module}.ts; workspace/store.ts; connectors/{store,module}.ts; builder/{run-lifecycle,conversation-store,model-account/accounts}.ts; registry/retain.ts and its module export; contract operation/index and affected declarations; failure JSON/generated artifacts; next authorization_catalog migration; S/H documents; relevant tests.
- **Copies**: Membership/action/active person reference rows; existing locks satisfy native integrity, and S System principal permits terminal owner transitions.
- **Guide sections**: C §4-7/10, S §2/6, D §5/8, H §5, T §6/7.
- **Deletes**: ROLE_ALLOWS/ACTION_REFUSALS/outsider column, installation-admin project.delete, old command scope forms, PROJECT_CREATE_DENIED and its live callers. Replace executor exemption for new work; do not remove once-only owner closure. The old normal-read API itself remains until U4; no temporary overload is added here.
- **Proof**: Non-owner delete403, outsider Project404, current owner retry, active member build; last-owner/admin/build-delete races remain green. Revoked held author is refused on next new admission/credential effect, exact owner closes once, wrong owner refused; restart/admitted-candidate recovery tests stay green. Stored retired-code run parses after migration. Existing command/client tests and compile negatives for scopes/actions stay green.
- **Out of scope**: No-policy/read cut, new error engine, model-account product shape or public Run/System API change.
- **Stop if**: A consumer needs a changed RunOwner/RunScope/System/Authentication/Checked public contract, or terminal/candidate closure cannot be separated in the existing lifecycle; return exact evidence to the planning session.

### U4. Close normal reads with their native privilege transition

- **Already there**: U1-U3; finalized command catalog/proofs and truthful deletion; existing read/query/isolation owner, role/table registers, catalog/generators and immutable migration history. Read Admission, Database and guides; shape/admission/data/types. All target inputs exist before this unit.
- **Creates**: Closed ReadGate and read admission overloads; all nineteen person read callbacks/helpers moved to scoped proofs. One hub_authority migration grants exact runtime privileges, removes policies/old roles/settings and normalizes U4 retired codes. Reuse catalog lint/generators/registers in place, with unconditional runner assertions and only cheap census extensions. D §6-8 and S §2 change with this cut; A §11/decision register record the one lost-backstop risk and update the exact session-lock/Checked rows. Account active and administrator nonmember Workspace lookup are possible under target native grants in this same commit.
- **Satisfies**: AC-1/2 read paths, AC-3, AC-7, AC-9. Existing Project wire forms still reflect real retained-row fields; the union/client replacement lands together in U5. No fabricated purged revision/audit fallback remains.
- **Files**: platform/db.ts; identity-access/{admission,administrators,hub-session,roster,application-access}.ts; workspace/store.ts; project/{store,routes}.ts; connectors/store.ts; registry/{module,served}.ts; builder/{conversation-store,run-reads,preview-state,model-account/accounts,routes,module}.ts; applicable contract declarations/generated failures/OpenAPI; role/catalog registers and generated role module; next hub_authority migration; existing catalog/generation/provisioning/migration/census scripts and record, biome plugin/config; D/S/A/decision/register-generated function callers; relevant read/catalog/postgres tests.
- **Copies**: Scoped reads, active/admin ordering and explicit native privileges; nominal read gate/no-policy migration have the stated limited not-found reference verdict.
- **Guide sections**: C §4-7/10-11, D §1-8, S §2/6/10, A §11, H §5/8, T §1/4/6/7.
- **Deletes**: Raw read transaction callback/admission API, person helper raw tx parameters, deciding administrator booleans, Project authority-null/catch-all/source-refusal-to-false branches, fake revision/audit fallback, three rls helpers/schema/50 policies/flags/four old roles/runtime GUCs/switches, obsolete register/lint fields and actor plugin, U4 retired wrapper/FK codes and callers. Current native mayBuild is migrated in U6, with no new read compatibility path.
- **Proof**: Member Project read and outsider/unknown404; missing/inactive Account refusal; admin nonmember Workspace positive and unknown Workspace negative; representative Project child parent filter. Existing read/model/host suites green with own/everyone standing and no sealed values in public standing output. Actual catalog equals target snapshot; direct-lock42501/definer-success under target grants, integrity and factory confinement retained, READ ONLY mutation refused. Gate/action/mode/brand negatives compile as expected. A real local createModelAccounts consumer rereads under current authority and reaches terminal lifecycle after revoke using controlled provider/envelope ports, no model/E2B call. Existing census remains green, with raw person reads zero and no obsolete runtime setting/role symbols. Seeded retired-code summaries parse.
- **Out of scope**: Separate temporary read roles/definers, checker rename, new per-operation inventory or mutation sweep, application-cluster security redesign, wire/UI union, model-account installation feature.
- **Stop if**: Catalog includes unexpected grants/other-database role dependencies, the narrow lock premise falls, a target read needs a temporary bypass, or this coherent migration/caller cut cannot finish in one fresh session. Reshape before adding machinery or crossing the wave cap.

### U5. Replace Project state across the contract, Hub and web

- **Already there**: U1-U4, retained deletion row, owner authority and native read visibility. Read Native routes and web, value sourcing; shape/types/data. Every type/native privilege required here already exists.
- **Creates**: Live/deleting detail/list/card union and row parser, all generated contract/client consumers moved, owner retry and member deleting view using existing page/client patterns. H §4/8 changes with the payload replacement. No progress field.
- **Satisfies**: AC-4 and AC-8 web/state, AC-9.
- **Files**: packages/contract/src/{project,workspace}.ts and emitted Product OpenAPI; project/store.ts and relevant routes; apps/web routes/{workspace-projects,project-settings,construir}.tsx, features/project/api.ts and features/project/components/project-grid.tsx, app/{shell,failure-state}.tsx, features/builder/construir/construir.tsx; H document and current UI/route fixtures. No new endpoint or migration.
- **Copies**: Contract/state owner and scoped identity from Design; C discriminated state, current web page/client components.
- **Guide sections**: C §4/5, H §4/8, P §6, V interaction/voice, T §7/8, L usable-screen approval.
- **Deletes**: Old deleting booleans/fake-revision API shapes and live-only rendering, administrator-only retry controls, stale-cache refusal rendering. Move Hub/wire/web together, no compatibility field or fallback.
- **Proof**: Literal live and deleting contract replies; deleting has only identity/state; owner retry and member lacking that action; incomplete/busy remain deleting, success leaves Workspace list, subject404 clears stale cache. Follow ordinary verify/T/L usable-screen proof and operator approval, with no additional exhaustive browser matrix. Existing Project/summary/web checks remain green.
- **Out of scope**: Project archival lifecycle 0016, general web redesign, guessed progress or extra action route.
- **Stop if**: A new interaction cannot be reviewed as something usable or needs new accepted product meaning; return to the planning session.

### U6. Use admission at the native Mastra boundary

- **Already there**: U1-U5, read gate/current Project build rule, native controller/route adapter and context refusal. Read Native routes and web; shape/admission. The boundary needs no new session owner/queue.
- **Creates**: Rejecting admitBuilder callback through existing Project read admission, exact thread-resource check before native messages, removal of obsolete build-denied consumers. Reserve next retired_build_failure migration; normalize persisted PROJECT_BUILD_DENIED and regenerate codes/contracts. Preserve every current allowlisted native method/path and existing boot assertion.
- **Satisfies**: AC-8 native routes and AC-9, final refusal cleanup for AC-1/6.
- **Files**: builder/{mastra-session-routes,module,routes,run-lifecycle}.ts, contract/builder.ts and failure/generated technical/product artifacts, affected web Builder refusal branch, next retired_build_failure migration and current native route/recovery tests.
- **Copies**: Installed native trusted resource policy and Factory pre-adapter guard; explicit Hub equality adapts the upstream truthy comparison without a patch.
- **Guide sections**: S §2/5, A native first, H §5, C §6, T §7.
- **Deletes**: mayBuild authorizing boolean, undefined-resource bypass, obsolete manual PROJECT_BUILD_DENIED branches/code. Existing native session/stream ownership stays.
- **Proof**: Representative outsider Project request gets Project404; admitted Project with foreign or absent-resource thread gets Conversation404; supplied requestContext remains refused. Existing session route/tripwire tests, allowlist boot assertion and code-free run-summary parse stay green. No nine-route adversarial matrix or stream race barrier added.
- **Out of scope**: Native endpoint changes, Mastra internals/factory tables, conversation privacy, stream polling or instantaneous in-flight revocation guarantee.
- **Stop if**: Installed public adapter cannot carry the current admission/refusal, or a non-allowlisted route would be needed; return evidence to the planning session.

### U7. Close the measured checks and remove the temporary shape

- **Already there**: U1-U6; all target behaviors and guide edits landed; current types/consumers are the owner. Read Requirements, Deletes/census, bounded inventory and Representative proof.
- **Creates**: Only final adjustments to existing boundary/catalog checks and CI wiring needed for the changed target, and the qualification evidence on the same wave head. Record census targets and representative results; no second checker/framework.
- **Satisfies**: AC-9 and confirms AC-1-8 complete on this head.
- **Files**: Existing scripts/{census-boundaries,check-import-law,conexus-verify}.mjs and existing record/config/tests where needed; deletes docs/specs/0018-authorization-model/shape/. Documents already changed by owning units need only fact corrections identified by the final check.
- **Copies**: Existing verification graph, actual catalog and compiler checks, T/L qualification flow.
- **Guide sections**: C §10/11, T proof, L waves/same-head gates; no new guide policy.
- **Deletes**: shape/, remaining obsolete imports/test assertions only after their real consumers are moved. Keep historical migrations/hash records; no history rewrite.
- **Proof**: Existing quick checks and relevant suites pass; no raw person read data access, obsolete runtime roles/settings/policies, fake deleting revision or obsolete refusal symbols. Catalog/integrity/read-only test passes. One real local credential consumer, normal usable-screen approval and representative changed behavior tests are recorded. Qualification review/proof judge the same built wave head, then operator verdict. Do not claim exhaustive isolation or performance evidence.
- **Out of scope**: New compliance framework, exhaustive route/filter mutants, baseline reset, other wave content or automatic merge.
- **Stop if**: A measured defect disproves the small design, the unit/file cap is exceeded or a guide/consumer boundary is still contradictory.

## Non-goals

- Building a unit or changing product code in this spec PR.
- New authorization/error frameworks, keyed SQL language, permission plugins, background deletion jobs, persistent progress/leases, Project session queues or stream polls.
- Company model-account product types/commands, failure representation, conversation privacy, Project archival or general web/Hub composition refactors.
- Exhaustive cross-operation isolation/mutation/race proof, extra browser gate, performance claim, real model/E2B/company service/pilot action or baseline reset.

## What breaks the premise

- The read gate requires a second query executor, a temporary bypass or a changed downstream nominal proof contract.
- Exact target grants remove required native integrity or permit factory/application authority to cross owners.
- Held-run closure cannot be separated from new work in the existing state owner, or required native teardown cannot report incomplete cleanup.
- A card cannot end green using only prior/created contracts, or a coherent cut exceeds one fresh session.

## Stop rule

Return to the planning session when a load-bearing decision/public admission boundary must change, a premise is disproved, or the plan exceeds eight units or 70 product files. A missing current fact is observed, not asked as a product question. The corrected draft still needs the operator's spec approval; the previous unsupported approval line has been removed.
