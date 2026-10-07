# 0018. One authorization model for Hub reads and commands

**Date**: 2026-10-07

**Status**: Approved by the operator on 2026-10-07, commit f0cdc5aa54fd32b567ae055639d2dce0513a91a5

**Lane**: lane:qualification (identity authority and database privilege migration)

**Wave branch**: wave/authorization-model

**Issue**: #543

**Deciding proof**: Every current contract operation and allowed foreign route passes literal positive/negative cases against the replayed no-policy catalog, all named admission/filter mutants fail, and the real Hub/browser proves outsider404, member deletion403 and owner deletion recovery in light and dark. The qualification review judges the same wave head; the operator gives ACCEPT, ACCEPT_WITH_BOUNDARY or REWORK.

**Study**: The approved authorization study of 2026-10-07, held by the planning session. Its public findings and decisions are recorded in [rationale.md](rationale.md).

## Summary

A person's Hub read enters the same admission boundary as a command. Membership decides whether the subject is visible; an action's role cell decides what a member may do. The Hub stops using row security and transaction roles as a second authorization model. A Workspace owner deletes a Project through a resumable flow, and every member sees it until that flow finishes.

Approval of this spec opens the build. This pull request contains the spec and compiled shape only.

## Requirements

- **AC-1**: For an authenticated active account, an outsider and an unknown well-formed Workspace or Project id receive the subject's 404: `WORKSPACE_NOT_FOUND` or `PROJECT_NOT_FOUND`. Malformed subject ids use the same codes through the existing contract parser. Secondary ids retain their declared malformed codes; after parent admission, an absent child receives its declared child 404.
- **AC-2**: Every person's data transaction admits the Account before looking up the subject. A missing Account gives `ACCOUNT_NOT_FOUND` (404); an inactive Account gives `ACCOUNT_INACTIVE` (403). HTTP credential resolution and contract parsing still precede this boundary; a rejected session remains 401 and a malformed request can fail before admission.
- **AC-3**: Membership is not administrator tenure. Owner and member can read, create and build; only owner manages members, bindings and application access. Self-leave retains its existing last-active-owner invariant. Role refusals come only from the action catalogue, with the existing 403 codes.
- **AC-4**: Only an installation administrator manages Connections and administrator tenure. `connection.manage` admits the administrator before resolving its named Workspace: a non-administrator receives 403 even for an unknown well-formed Workspace; an administrator receives 404 for an unknown Workspace and can manage any existing Workspace. This administrator existence disclosure is intentional. Administrator tenure grants no Project membership or deletion authority.
- **AC-5**: Only a current Workspace owner starts or resumes Project deletion. Every member sees deleting Projects in detail, lists and summaries until completion. `project.read` and owner `project.delete` remain admitted; other Project actions give `PROJECT_DELETING` (409) after membership and role checks. An outsider still gets 404 and a member's forbidden action still gets its role 403.
- **AC-6**: A failed deletion step retains the Project row, the open deletion record and the owner's retry path. Repository removal precedes the final database purge; purge and completion commit in one transaction. Two requests do not normally drive the flow concurrently; the second owner request gets existing `PROJECT_BUSY` (409). Retry after completion receives Project 404. No worker job is added.
- **AC-7**: With Hub row security disabled, every contracted operation and every admitted foreign data route excludes another Workspace's rows, bytes, thread messages and private model accounts. Positive own-Workspace controls also succeed. A planted missing SQL filter and a planted read without admission must fail the proof.
- **AC-8**: Person callbacks cannot get SQL before admission. Public data helpers consume a nominal proof, and derive actor and subject filters from it. Jobs, authentication, executor-owned runs and served hosts keep their explicitly named boundaries. The session's administrator flag is data, queried separately under Account admission.
- **AC-9**: The Hub database has zero policies, zero RLS/FORCE tables, zero role-switch statements, zero `conexus.account_id` settings and no `hub_reader`, `hub_command`, `iam_rls` or dormant `hub_builder_ingress` role dependencies. The role/grant register and migration invariants describe the resulting runtime privileges, unconditionally.
- **AC-10**: Every browser route mounted from Mastra's allowed route table admits its Project, including sessionless thread reads. Missing or malformed Project resources give `PROJECT_NOT_FOUND`. Foreign threads give `CONVERSATION_NOT_FOUND`; caller-supplied request context remains refused. Refusals propagate through today's Failure mechanism.
- **AC-11**: The web renders a deleting Project without live revision or Builder controls. Only an owner sees “Tentar concluir exclusão”. A revoked membership clears stale Project data and shows the existing unavailable state on 404; a 409 deleting response refreshes to the deleting state.
- **AC-12**: Existing unaffected operation outcomes, authentication, grants, executor checks, command locks and database integrity constraints remain pinned. Every unit ends with a green commit, without a compatibility layer. The final unit makes the census and mutation proofs CI gates and deletes `shape/`.

## References copied

| Mechanism | Reference (`repo/file:line`) | Kept as is | Adapted, and why |
| --- | --- | --- | --- |
| Membership-scoped subject read | Documenso `packages/lib/server-only/team/get-team.ts:38-73`, commit `cd0cc5f`; `packages/lib/server-only/envelope/get-envelope-by-id.ts:128-140` | Resolve subject together with membership, not an unrestricted read followed by a boolean | Hub's branded Workspace/Project ids, SQL and subject-specific 404 |
| Action catalogue | Documenso `packages/lib/constants/teams.ts:31-34`; `packages/lib/utils/teams.ts:140-171` | Named action determines allowed roles | Hub's existing role 403s are separate cells after membership lookup. Documenso sometimes folds role into `where` and gives 404; that behavior is deliberately adapted to the Hub wire contract |
| Account and installation administration | Documenso `packages/trpc/server/trpc.ts:151,304-359`; Better Auth `packages/better-auth/src/plugins/admin/routes.ts` (disabled-user and admin middleware); Hub `identity-access/admission.ts:105-139,216-242` | Reject disabled account, then check the distinct installation role | Existing Hub codes, Account proof and separate session flag; no administrator field on all Account scopes |
| Transaction-bound nominal admission | Hub `apps/hub/src/platform/db.ts:61-124`; `identity-access/admission.ts:63-76,105-242`; Documenso `packages/lib/jobs/definitions/internal/bulk-send-template.handler.ts:1-90` | Gate opens only inside admission; subject query and data use the same transaction | ReadGate opens a PostgreSQL READ ONLY transaction; read proofs retain a ReadTx and commands retain WriteTx |
| Command lock choreography | Hub `identity-access/admission.ts:105-196` and `tests/implementation/admission-races.postgres.test.mjs` | Account, membership, owner set and Project locks; reread after waiting | Read form omits write locks; no single-statement requirement for commands |
| Resumable deletion and serialization | Hub `project/deletion.ts:29-105`, `platform/db.ts:133-142,335-374`, `builder/conexus-git.ts:235-254` | Existing deletion record, idempotent ports and session advisory-lock primitive | Workspace-owner admission; repository removal before atomic purge/completion; one project-keyed session lock. No cross-service deletion orchestration reference found in Documenso or Better Auth; retained local flow is the operator's explicit decision |
| Foreign route admission | Installed `@mastra/server/dist/server/handlers/agent-controller.js:1079-1107`; embedded `docs-server-middleware.md`; Hub `builder/mastra-session-routes.ts:33-69,270-324` | Fastify guard and Mastra's resource/thread check | Project admission before every allowed route; Hub maps foreign/missing thread to its existing code. Fastify hooks, not Hono middleware |
| Exact grants and integrity lock | Hub `contracts/technical/hub-catalog-census.json`, `scripts/generate-hub-role-register.mjs`; migration `0065_split_wall.sql:76-82` | Column-limited mutation grants and narrow table-lock function; full actual catalog audit | Replace split reader/command grants with their exact runtime union. No upstream no-policy grant migration was found in the study; this adapts the existing Hub register, with a real PostgreSQL privilege probe |
| No-policy proof | Study's two-Workspace mutation experiment; Hub `tests/implementation/hub-database.mjs`; PostgreSQL READ ONLY already used in `platform/db.ts` | Exercise real Hub ports against disposable PostgreSQL with tenant canaries | Repository-owned census and adversarial filter fixtures replace reliance on row policies. A reference removing its own RLS in the same fashion was not found in the study's PostgREST, Supabase, Basejump, Better Auth or Documenso comparison; this is an operator-approved tradeoff, not a claimed upstream pattern |

Reference files above are evidence, not prerequisites a builder must locate outside the repository. The rules and proof obligations needed to build them are below.

## Code shape

The target signatures and discriminated states are in [shape/](shape/). `npx tsc --noEmit -p docs/specs/0018-authorization-model/shape` exits 0; the final compiled shape is committed at `6bb7a6f6` and published on the wave branch (first publication: `99588f7f`). The final unit deletes this folder.

- `types.ts`: branded subject ids, closed action unions, role-bearing scopes, nominal gates/proofs, owner rows on owner-set commands, live/deleting Project states.
- `catalog.ts`: total action/role cells, subject 404 mapping and parameter-specific malformed mapping.
- `admission.ts`: read/write admission signatures and today's refusal mechanism.
- `data.ts`: proof-consuming detail/list/card reads and signal-bearing deletion ports.
- `deletion.ts`: admitted lock-key evaluation, session-lock driver, private atomic finalization/purge signatures and the Project session-owner seal/open boundary.
- `usage.ts`: actual thumbnail, Project list and session call patterns.
- `negative.ts`: independent negative examples for each type rule.

The shape describes changed boundaries. Existing Authentication, System, Run and Checked scopes remain in production and keep their callers; Run, System and Bootstrap variants are explicit in the shape; Authentication retains its existing gate API. Production uses the existing gate records and private constructors, not exported proof constructors or casts. Only admission/authentication open the corresponding gates; the existing census gate-opener rule enforces that boundary, with import-law checks for proof ownership. Extend this census instead of adding a parallel AST scanner. U5 removes its `register.split` dependency and obsolete split-table write check. Read proofs carry no write methods. Read actions are exactly workspace.read and project.read/project.build/connections.bind/application.manage; command-only members.manage/members.leave/project.create/project.delete cannot be admitted through ReadGate. Administrator proof results narrow by the named action. Locked owner rows occur only on command owner-set scopes. Checked remains a distinct read view minted by served-host admission: an authenticated application grant or Project membership permits its method-only read view without issuing a person command proof, not a substitute person proof.

## Design

### Admission and refusal order

1. The contract parses credentials and parameters as it does today. For a valid data call, `database.read(accountId, callback)` passes a closed ReadGate and `database.transaction` passes its closed CommandGate.
2. Admission opens the gate privately, resolves the Account, and rejects missing/inactive Accounts. It then resolves a subject joined to `iam.workspace_membership` for that Account. For Projects, the Project's Workspace is the membership parent. No role filter is placed in that query; absent membership and absent subject share the public subject 404.
3. Admission indexes `ACTIONS[action].roles[role]`. A forbidden cell emits its existing 403. For Projects it then checks the open deletion record and `whileDeleting`. A role-denied member does not learn deletion state through a 409.
4. Successful admission returns the nominal scope and transaction. All downstream SQL predicates use `proof.scope.accountId`, `workspaceId` and/or `projectId`, never a second caller-supplied parent id.

The read form can perform ordered Account and membership queries; it is not advertised as one statement. The command form retains account `FOR SHARE`, membership serialization, `FOR UPDATE` owner-set locks, the current Project lock and post-wait rechecks. A deletion begin takes the Project row for update and rechecks the deletion record and open runs under that lock. New commands cannot commit past a tombstone; commands admitted earlier finish before its insertion. Executor `admitRun` still checks the action catalogue after current membership and lease/owner checks. A retained run is not authorization to outlive revocation.

The central refusal helper keeps existing `Failure`, logger details and conversion machinery. Add private reasons `NO_ACCOUNT` and `RUN_NOT_HELD` to existing reasons; use public `ACCOUNT_NOT_FOUND` and `BUILDER_RUN_NOT_ADMITTED`. Public problem bodies contain no private reason, membership evidence or internal exception. Existing catch mechanisms remain for spec 0019; their code sets follow the changed authorization codes as specified below; no `isRefusal`, subclass or new result type is introduced here.

### API surface and value sourcing

`SUBJECT_NOT_FOUND` has one production owner in `packages/contract/src/operation.ts`, exported by the contract package and consumed by admission. Its `Malformed` mapped type pins Workspace/Project parameter cells to those constants; other parameters retain `FailureCode`. U3 changes every affected declaration, including `createWorkspaceConnection.malformed.workspaceId`, which currently uses the obsolete 422 code `CONNECTOR_WORKSPACE_NOT_FOUND`. The temporary shape illustrates that owner without creating a second production constant.

| Surface | Admission / input | Output and refusals |
| --- | --- | --- |
| Workspace list, Project list, summaries, roster | Account or Workspace `workspace.read` proof | Current rows filtered by Account/Workspace; Workspace unknown/outsider 404 |
| Project detail, thumbnail and source | Project `project.read` proof | Current output; Project unknown/outsider 404; admitted absent child/thumbnail/revision retains its own 404 |
| Builder session, run trace and Preview launch | Project `project.build` proof | Current output; unknown/outsider Project404; deleting Project409; admitted child/Preview absence retains its own 404 |
| Member/binding/access commands and owner-only corresponding reads | Named Workspace/Project action | Current output; outsider subject 404; member role cell 403; deleting Project 409 after role check |
| Delete Project | Project `project.delete`, current owner, existing `confirmName` | Existing 204 on completed flow; mismatch/busy/incomplete existing codes; member 403; outsider/unknown 404 |
| Connection operations | Installation administrator, `connection.manage` with WorkspaceId | Existing rows/results, scoped Workspace and child; non-admin 403, admin missing Workspace 404 |
| Administrator operations | Installation administrator, `administrators.manage` | Current rows/results, existing last-active-admin rule |
| Session and personal model operations | Account proof | Workspaces from memberships, separate administrator flag, own private model-account data; existing shared/installation availability remains unchanged |
| Authentication and served hosts | Existing AuthenticationGate, Checked application/preview proof | Existing session/grant/navigation outcomes; no new Workspace membership requirement for an application grant holder |
| Jobs and executor runs | Existing named System or Run admission | Same lease, run owner and subject checks; no anonymous person transaction |

Add `ACCOUNT_NOT_FOUND` and `ACCOUNT_INACTIVE` to the failures of every operation whose data path uses Account admission, including `getSession`. Add subject 404s for the changed outsider paths, and `PROJECT_DELETING` to operations using deleting-refused Project actions. Remove `PROJECT_CREATE_DENIED` and `PROJECT_BUILD_DENIED` from the catalogue, all callers, emitted contracts and failure register once no caller remains: `PROJECT_CREATE_DENIED` in U3, whose sole runtime owner is command admission; `PROJECT_BUILD_DENIED` in U7 after the remaining read and foreign callers move. A member may create/build, so those codes have no remaining role cell. Keep `PROJECT_DELETE_DENIED` as the non-owner cell and update its existing person text/action to point to a Workspace owner. Generate failure code tables, messages, telemetry codes and both OpenAPI artifacts through their owners; do not hand-edit generated files.

| Value | Source |
| --- | --- |
| Actor | Verified session Account id passed into the gate; executor run's persisted author on executor paths |
| Workspace role | `iam.workspace_membership` at admission, not browser state or administrator tenure |
| Owner rows | Current locked active owner set on owner-set commands; retain `OwnerRow.active` |
| Project Workspace/name | Retained `project.project` row, scoped by membership; existing name confirmation compares to deletion record's original name on retry |
| Deleting state | An open `project.project_deletion` record joined to the retained Project; never an empty revision sentinel |
| Live revision/activity | Existing repository/Builder state for live rows only; deleting summaries have identity plus state and no live activity payload |
| Session administrator flag | A separate `readAdministratorFlag(Account read proof)` lookup against tenure |
| Connection child | Named Workspace from administrator proof plus connection id, with both predicates |
| Private model visibility | Account id from proof; preserve existing personal/shared/installation semantics and seed all three as canaries |

Remove the two subject-FK refusal mappings in `platform/db.ts` (`workspace_membership_workspace_id_fkey` and `connection_workspace_id_fkey`) in U4. Admission owns these subject refusals; unexpected violations after correct admission use the existing unexpected-fault mechanism. Keep the handoff/authentication and SQLSTATE busy mappings. Remove Project summary/thumbnail catch-all wrappers in `project/routes.ts` in U4 so admitted 404/403/409 failures propagate unchanged. The admitted detail returns a Project rather than nullable authority evidence; remove its route-level subject404 branch. Remove `preview-state.ts`'s catch that turns `PROJECT_NOT_FOUND` into `false`: source authorization failures propagate the Project404; `false` remains only for a genuinely unavailable revision after admission, which existing `builder/service.ts` maps to `SOURCE_REVISION_NOT_FOUND`. No service API change is needed. A missing thumbnail after Project admission still uses `PROJECT_THUMBNAIL_NOT_FOUND`. Once their callers are gone, normalize these three retired codes in persisted runs through that unit's migration, delete `PROJECT_SUMMARIES_UNAVAILABLE`, `PROJECT_THUMBNAIL_UNAVAILABLE` and `CONNECTOR_WORKSPACE_NOT_FOUND` from JSON and regenerate outputs. This changes these unexpected store faults from their old blanket503 to the existing unexpected500; it does not create a new error type.

### Refusal consumers and stored codes

Keep the current Failure/catch representation; migrate these decisions with their producer:

| Consumer | Unit / target |
| --- | --- |
| `builder/run-lifecycle.ts` ADMISSION_REFUSALS and claim catch | U3 adds `PROJECT_NOT_FOUND` and `PROJECT_DELETING` to the existing set, now typed ReadonlySet<FailureCode>; removes `PROJECT_BUILD_DENIED` in U7. The executor claim still emits `BUILDER_RUN_NOT_ADMITTED` under revocation or tombstone; direct person operation admission emits Project404/409. Pin both results. |
| `builder/model-account/accounts.ts` | U3 consumes the typed run-lifecycle refusal set, including new Project404/409; keeps its existing no-record refusal result. |
| `connectors/store.ts` broker catch | U3 keeps its existing empty/null consumer refusal; adds PROJECT_DELETING to ReadonlySet<FailureCode>. Builder/Preview consume through project.build, not deleting-visible project.read; no credential is returned after tombstone. Application consumers keep Checked application grant/membership and deletion exclusion. |
| `identity-access/{application-session,preview-session,sign-in}.ts` | Keep current credential/bootstrap/session-null catches with their existing codes; these are authentication outcomes, not person subject authority. AuthenticationGate overloads remain, so these callers need no edits. U1/U4 pin them. |
| `builder/run-lifecycle.ts` phase catch | Keep the existing BUILDER_RUN_NOT_ADMITTED-to-null rule; direct person Project404/409 continues to propagate. Claim uses its separately updated typed set. |
| `builder/routes.ts`, `builder/module.ts` read booleans | U4 replaces false-to-build-denied branches with direct admitted reads; propagate subject404/deleting409. |
| `builder/mastra-session-routes.ts` | U7 replaces its boolean branch with admission; absent/malformed Project resource emits Project404. |
| Web `features/builder/construir/construir.tsx` | U7 removes its obsolete build-denied branch and uses subject404/deleting409 rendering. |

Failure vocabulary lives in JSON/generated TypeScript, not a database reference table. Each deleting unit's migration follows migration 0053: normalize persisted `builder.builder_run.failure_code` equal to that unit's retired codes to existing `INTERNAL_UNEXPECTED`, preserving remaining rows. U3 normalizes `PROJECT_CREATE_DENIED`; U4 normalizes its three retired wrapper/FK codes; U7 normalizes `PROJECT_BUILD_DENIED`. Add seeded upgrade tests that parse every resulting run summary. New `PROJECT_DELETING` is declared/generated from JSON, not inserted into a fictitious database table. All four migrations carry **needs:aprovo**.

Use existing action vocabulary, with these exact person texts in U3 (no new action type):

| Code | Text / action |
| --- | --- |
| ACCOUNT_NOT_FOUND | “Esta conta não foi encontrada.” / NONE; valid for missing actor and email-target lookup |
| PROJECT_DELETE_DENIED | “Só quem é owner deste Workspace pode excluir Projetos.” / ASK_CHANGE |
| MEMBERS_MANAGE_REQUIRED | “Só quem é owner deste Workspace pode gerenciar suas pessoas.” / ASK_CHANGE |
| CONNECTOR_BINDING_MANAGE_REQUIRED | “Só quem é owner deste Workspace pode gerenciar as conexões deste Projeto.” / ASK_CHANGE |
| APPLICATION_ACCESS_MANAGE_REQUIRED | “Só quem é owner deste Workspace pode gerenciar o acesso a este aplicativo.” / ASK_CHANGE |

For all four connection operations, every declared `workspaceId` malformed cell becomes `WORKSPACE_NOT_FOUND`/404 in U3; unknown Workspace for an admitted administrator has the same code/status. Non-administrator with a well-formed id still gets `INSTALLATION_ADMINISTRATOR_REQUIRED`/403 first. Malformed child connection/binding ids retain their named child404 cells.

### Deletion data and flow

U2 checks the same condition before changing flow; before U3 changes deletion authority or U4 removes audit fallback, its migration refuses any existing record with `purged_at IS NOT NULL AND completed_at IS NULL`, or an open deletion whose Project row is absent. Such a stranded legacy row cannot be restored from audit: purged component data is gone. Return to the planning session for a bounded one-off cleanup decision before building further; no automatic cleanup, invented Project, accepted loss or compatibility recovery is authorized by this spec. U1 seeds this upgrade stop case.

The existing deletion record stays as audit and retry state. Keep its original Workspace, name, requester and timestamps. The first authorized deletion actor creates it under the existing Project/open-run serialization. After U3 replaces administrator deletion with owner admission, a later current owner may resume it even if the original requester lost membership. Never use `requested_by` as continuing authority.

Use the existing `database.session` advisory-lock mechanism, extending its session name union with `conexus-hub:project-deletion`. Copy `application-access.ts:35`'s existing `hashtextextended(prefix || projectId, 0)` SQL expression, with fixed prefix `conexus-hub:project-deletion:` and canonical Project UUID. Select its signed 64-bit decimal key inside the initial admitted transaction and pass BigInt(key) to the existing session tryAdvisoryLock; do not add a raw SQL session gate; literal-key and distinct-prefix tests pin this one derivation pattern. Hash collision may refuse an unrelated deletion as busy; it cannot authorize it. Admit the authorized deletion actor before claiming the lock; a false `tryAdvisoryLock` gives `PROJECT_BUSY`. Once held, begin/recheck with fresh deletion admission before any effect. Keep the connection open for the whole flow, and release it in `finally` on every exit.

Run `releaseApplicationData`, `killSandboxes`, then `deleteRepository` (the **Conexus Git** repository). Only after all required effects finish, execute one System `project-purge` transaction that locks/rechecks the Project and deletion record, invokes existing component purges, removes the Project and updates `purged_at` and `completed_at` together. Keep purges' dependency order: identity access, bindings, registry, Builder, operation receipt, Project. If finalization reacquires the Project/deletion locks and finds its retained record already completed, it returns success without more purges; this only handles already-admitted internal drivers. A new public request after completion still fails Project404 before entering the flow. The public standalone `purge` export leaves; only the finalization flow can invoke it. A rollback after any purge statement leaves the Project and open record present. A crash after repository removal is resumable because removal is already idempotent. No caller can observe “purged but not complete” from a successful transaction.

Carry the session's `lost` signal through cancellable ports and check it before every subsequent effect and final transaction. Loss stops this driver with `PROJECT_DELETION_INCOMPLETE`. An already started non-cancellable idempotent removal may finish; a new driver can repeat it safely. Do not recreate application data, repositories or sandboxes after a tombstone. A sandbox kill failure must not be silently treated as completion: propagate it, retain the Project and let the owner retry. The existing `conversation-sandboxes.killRecorded` returns the ids successfully removed and logs failed ids. `builder/module.ts.killProjectSandboxes` must compare that returned set with the complete retained input set and refuse completion if any id is missing; it currently discards the return. Keep the best-effort idle-sweep consumer unchanged. Use retained sandbox identifiers to retry already-killed machines harmlessly. Marking a resource already absent is success. No real E2B call belongs to local unit proof without separate operator authorization.

The discriminated Project contract changes in U6: detail, list row and summary are identity intersected with `live` (existing live fields) or `deleting` (no revision/activity/archived live fields). This is a replacement, not an optional state field or a fallback tombstone list. Every member gets the same deleting identity; web role data controls the retry affordance. Existing open Builder runs block deletion begin with `PROJECT_BUSY`. The deletion port closes Project conversation sessions and their streams before finalization; mounted requests after the tombstone receive the admitted action's deleting refusal. No new live run can be admitted after begin.

The session/VM owner holds its Project queue across begin; after begin commits, it seals the Project synchronously before releasing that queue or awaiting teardown. A refused/rolled-back begin leaves a live Project unsealed; an already durable tombstone remains sealed across cleanup failures. Its Project-keyed admission/open critical section orders begin against in-flight session creation: creation either finishes before the seal and is included in teardown, or fails with PROJECT_DELETING. No open, sandbox lookup/creation or bind may publish after sealing; recheck after awaits. On restart the durable deletion record prevents new admission, while a fresh resumed driver seals before cleanup. Keep one owner-held keyed queue/set inside LiveConversations, not a second lifecycle worker; copy its existing retiring-map choreography in builder/conversation.ts. U2 creates this boundary, U7 tests the HTTP guard-to-teardown barrier. No periodic revocation polling is added.

### Database migration and grants

U5 carries the no-policy migration and **needs:aprovo**. Reserve the next migration number at build time; never renumber or rewrite historical migrations. Replay history then this migration in a disposable Hub database. Do not change Applications-cluster policies, Mastra factory privileges, Keycloak or any protected/shared cluster.

The current committed catalog is authoritative: **50 policies on 26 RLS/FORCE tables**, three `rls` functions and `iam.lock_administrators()`. Older policy statement counts are not live counts. The served-reader, application-access and project/repository SQL functions named in the old review were already removed by migrations 0067–0070; do not recreate them. Thumbnail remains the explicit admitted SQL over `reg.application_thumbnail`, served preview revision, availability and digest relationships, with the existing grant/membership semantics for served-host Checked callers.

Grant matrix for each relation/column in `contracts/technical/hub-catalog-census.json`: runtime SELECT is the union of the registered reader SELECT and registered command SELECT, preserving a column limit only when neither registered role has table-wide SELECT; runtime INSERT/UPDATE/DELETE are exactly the registered command verbs and column sets. Include `iam.account.active` in Account admission's required read columns. Preserve the login role's migration-ledger SELECT. Do not grant all tables or all columns by schema. On `connector.connection`, `model.model_account`, `iam.host_session` and `iam.account`, table-wide command SELECT makes this union table-wide: the former reader column barrier is intentionally lost. The target register marks every secret/sealed/token column, including credential_sealed, model_account.secret, host_session.provider_refresh_token and token_digest; exact authentication/consumer symbol allowlists, proof-consuming helper projections, planted forbidden-column SELECT fixtures, and wire ciphertext/session/model canaries replace that barrier; READ ONLY does not stop sensitive SELECT.

- Retain schema USAGE on Hub schemas for `hub_runtime`; no CREATE, ownership, BYPASSRLS, superuser or extra membership. It receives only `EXECUTE` on `iam.lock_administrators()`; keep that narrow integrity-lock function, owner, fixed search path and non-public execute privilege.
- Retain `conexus_owner` object ownership and migration authority. Runtime is not a member of it. Preserve `hub_factory` access confined to `factory`, without any grant on the 26 Hub data tables.
- Enumerate every current schema/table/column/function/default ACL and role membership before changing policies. Revoke dormant `hub_builder_ingress` grants and membership explicitly. No other service/login role receives Hub business-table access. Role removal is cluster-global: run migration proofs on an isolated test cluster, with one Hub replay database alive at a time. The existing postgres verification group already uses --test-concurrency=1; retain it and assert fixture cleanup/cluster dependencies before each replay. A developer/shared cluster with old-role dependencies is intentionally refused for this migration, never administered by the unit. Historical replays in another database cannot run alongside target role assertions. Do not copy 0070's leave-the-role fallback, which conflicts with the operator's no-legacy target; give the planning session the dependency evidence instead. Any additional grantee found by the catalog audit is a stop condition, not permission to widen it.
- Revoke obsolete default privileges and membership edges; transfer required SELECT/command privileges to runtime; drop the 50 policies and clear FORCE/ENABLE on all 26 registered tables; drop the three `rls` helpers and the empty `rls` schema with explicit dependencies; revoke obsolete schema/relation/column/function grants; then drop `iam_rls`, `hub_reader`, `hub_command`, `hub_builder_ingress` once dependency-free. Do not use `DROP OWNED`, broad CASCADE or a cluster-wide sweep.
- PostgreSQL roles are cluster-wide. Preflight `pg_shdepend`/database dependencies and role-management authority before starting. Any dependency in another database, protected cluster or unexpected owned object stops the unit for the planning session. Migration and proof operate in the disposable test cluster only; deployment permissions come through the migration's approval gate.
- Register target relation privileges as the sole source of the grants/census. Update generators and catalog lint to reject policies, row-security flags, old roles/settings/helper functions, extra relation grants and extra executable functions. The migration runner must assert role and catalog invariants unconditionally after replay; remove its `rls.acting_account` existence guard.

`database.read` retains PostgreSQL READ ONLY; commands run as `hub_runtime` without `SET LOCAL ROLE` or actor settings. Authentication remains a separate gate over that login, System and Run retain their typed scopes. Sensitive `credential_sealed` SELECT is confined to the existing admitted connector check/consumer helpers (`connectors/store.ts`), not a fictitious broker query. Static import/use checks name these helpers, and wire tests prove ciphertext never appears in responses.

Checked's `readOnlyView` limits methods, not PostgreSQL functions with side effects. Its transaction uses runtime command grants; this is the accepted served-view tradeoff: authenticated grants/membership authorize method-limited reads inside a write-capable authentication transaction. There are no executable business SQL functions: the sole integrity-lock function is allowlisted. Check `.readOnlyView`/`openGate` imports and every Checked reader; do not claim a database-enforced read-only boundary for Checked. Person ReadGate reads do have the database READ ONLY backstop.

### Foreign routes and web

Keep Mastra's exact BROWSER_ROUTES allowlist, route existence boot assertion and refusal of caller request context. Replace `mayBuild(): boolean` with an admission call that returns void or rejects using today's Failure. Every allowed request resolves a valid `project:<uuid>` resource and admits `project.build` via the read gate before Mastra can open/read/mutate a session. This preserves the current build permission requirement. It does not mint a durable write proof for later Mastra storage; foreign route authorization is a request boundary and Mastra owns its thread storage.

Remove the defensive resource-undefined early return; the current allowlisted non-creation routes already carry a resource path and sessionless routes already call mayBuild. The confirmed live gap is strict thread-to-resource equality, not a claim that their Project check is absent. For sessionless `threads` and `threads/:threadId/messages`, admission is still mandatory. Check the thread belongs exactly to the admitted resource, including a thread whose stored resource is absent, before returning messages; no permissive `thread.resourceId && ...` fallback. Existing session/conversation schema failures retain their codes. Missing or foreign thread is `CONVERSATION_NOT_FOUND`. Test all allowed method/path pairs; registration of an extra route without an inventory/test row must fail CI. Creation validates body resource; other routes validate path resource; neither accepts a query/body context override.

Deletion closes Project-owned live conversation sessions using existing session teardown hooks, which close following streams. Other membership revocation stops subsequent HTTP requests and executor admissions; this wave does not add periodic polling to already-open streams. Seed a revocation-before-next-request test and do not claim instantaneous stream revocation.

Web components switch exhaustively on Project state. Deleting cards keep name and location, open the deleting screen and show no thumbnail/revision/build actions. The screen says “Projeto em exclusão”; only an owner sees “Tentar concluir exclusão”. While a retry request is pending disable that button; busy keeps the screen and explains that deletion is already running. Incomplete leaves retry available. After 204 invalidate detail, Workspace lists and summaries and navigate to the Workspace. Any Project 404 invalidates cached Project/Builder data before rendering the existing unavailable view. A deleting 409 invalidates and reloads the state before rendering it. Do not add a guessed progress/step field to the wire contract.

### Invariants and tests

| Scenario / literal result | AC |
| --- | --- |
| Existing outsider, unknown UUID and malformed Workspace/Project have identical subject 404 at their respective parser/admission boundary | 1 |
| Store call: absent Account → `ACCOUNT_NOT_FOUND`; inactive → `ACCOUNT_INACTIVE`; no subsequent subject read | 2 |
| Member management → `MEMBERS_MANAGE_REQUIRED`; binding → `CONNECTOR_BINDING_MANAGE_REQUIRED`; application management → `APPLICATION_ACCESS_MANAGE_REQUIRED`; deletion → `PROJECT_DELETE_DENIED` | 3, 5 |
| Non-admin existing/unknown Workspace → `INSTALLATION_ADMINISTRATOR_REQUIRED`; admin unknown → `WORKSPACE_NOT_FOUND`; admin nonmember Project → `PROJECT_NOT_FOUND` | 4 |
| Owner deletion blocked by open run → `PROJECT_BUSY`; delete/build lock interleaving never commits a run behind the tombstone; last-owner/admin races retain one active authority | 6, 12 |
| Fail each external port and each final purge statement; after failure owner/member detail+list+summary contain deleting identity; owner retry completes; rollback does not leave completed audit or delete the Project | 5, 6 |
| Hold advisory lock in session A; session B → `PROJECT_BUSY` with zero external calls; owner revoked before fresh begin → subject404; lost lock → incomplete, no later effect | 6 |
| Two Workspaces with different names, Projects, artifacts, members, invitations, bindings, grants, runs, threads and private model accounts; all operation and foreign-route canaries absent from the other response | 7 |
| Missing filter/OR true/UNION/both run predicates removed → failing isolation assertion; missing admission/aliased raw SQL helper → failing census fixture | 7, 8 |
| Unadmitted gate SQL/forged proof/wrong mode/wrong id/owner command without owner rows/deleting revision/missing or extra role/wrong subject404 type → compile error | 8, 12 |
| Catalog: 0 policies, 0 RLS/FORCE, 0 obsolete roles; exact target ACLs and one permitted lock function; read SQL write attempt → PostgreSQL READ ONLY refusal | 9 |
| Each allowed Mastra route: outsider/malformed resource → Project404; foreign or absent-resource thread → Conversation404; injected context → `REQUEST_CONTEXT_REFUSED` | 10 |
| Owner/member deleting screens, retry busy/incomplete/success, direct and stale-cache membership404, deleting409 all use real web/HTTP fixtures | 11 |

The pin captures current behavior; target expectations replace it only in the unit that changes that behavior. No desired-outcome skipped test, swallowed assertion or permanent test-only role switch is permitted.

## Deletes and census

| What | Today at main `83188b3a` | Target | Check that holds it |
| --- | --- | --- | --- |
| `database.read` without person admission | 15 of 19 sites; four admitted | 0; all read callbacks receive closed gates | Type check plus repository authorization census |
| Contract operation coverage | 47 operations in the study census | Every current operation mapped and exercised; new/removed operation fails until inventory updated | Enumerate contract OPERATIONS and compare exact ids with proof/pin fixture keys |
| Person decisions from boolean facts | Four authorization-throw sites; one session boolean data field | 0 deciding sites; one separately admitted data field | AST/symbol fixtures and branch-site classifier |
| Raw transaction helper parameters | 33 total; 18 outside platform/receipt/admission | 0 person data helpers outside declared boundary; authentication/system-private helpers explicitly classified | Symbol-aware helper inventory, fail unknown |
| Absence interpreted as authorization | 27 study candidates, manually classified; not all are authorization | 0 unadmitted subject/role decisions; preserve business child absence and existing error-wave catches | Classified exact call sites with reason, fixtures, review of additions |
| RLS / FORCE / policies | 26 / 26 / 50 | 0 / 0 / 0 in Hub database | Actual replayed catalog lint, not counting migration source statements |
| Obsolete actor setting / transaction roles | `conexus.account_id`, reader/command roles and three helpers | 0 current runtime/dependency references; historical migrations retained | Source/import check plus catalog ACL/dependency check |
| Deletion driver order | Purge before repository; purge and complete split | Repository before one final purge+complete; no public standalone purge | Fault and transaction rollback proof |
| Foreign route gaps | Defensive undefined-resource early return; sessionless paths already check mayBuild but Hub does not compare thread resource | 0 allowed foreign data routes without Project admission and strict thread ownership | Boot route inventory and per-route adversarial proof |

The 70 transaction sites, 19 reads, 47 operations and 33 helper counts were rerun against main; the study's AST reachability uses heuristics and is not a sound security proof. U1 extends the existing symbol-resolved `scripts/census-boundaries.mjs` from the rules here, with symbol resolution and loud failure on ambiguous/unclassified callbacks, aliases and routes. Do not copy the external study script into the public repository. Census exemptions name authentication (12 transaction sites), served Checked reads, executor Run, named System jobs and platform/receipt implementation internals. Each exemption has a reason and a fixture; broad directory exemptions are forbidden. The target is no unexplained site, not an artificial “27 becomes zero” ratchet.

Delete `ROLE_ALLOWS`, `ACTION_REFUSALS`, installation-admin `project.delete`, read admission from raw ReadTx, request-authorizing boolean queries and `mayBuild`. Delete tombstone fallback lists and fake live-revision values, the public deletion `purge`, role-switch/actor-setting runtime code, three RLS helpers/policies and old role register entries. Move every live caller in the deleting unit. Historical migrations are immutable replay history; never use them as target-state allowances. Remove old authorization assertions while retaining equivalent integrity, lease and business absence tests. No old export survives for a test.

### Bounded file inventory

Eight units; **70 planned product/check/configuration files** plus six owning documents and one generated reference, behavioral tests and temporary spec shape. Generated outputs, scripts, the deleted lint plugin and configuration count toward the product cap; the lint rename counts both source and target paths (69 entries, 70 distinct paths); only Markdown documents and behavioral tests are outside that count. Revisit this inventory if compilation requires another product path; stop before 71. Units may edit the same file sequentially; this is one union, not a sum of unit diffs.


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
apps/hub/src/registry/served.ts
apps/hub/src/builder/conversation-store.ts
apps/hub/src/builder/conversation.ts
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
scripts/hub-catalog-lint.mjs → scripts/hub-authority-catalog-lint.mjs
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
apps/hub/migrations/<next>_read_admission.sql
apps/hub/migrations/<next>_hub_authority.sql
apps/hub/migrations/<next>_retired_build_failure.sql
```

### Every live database function

The committed catalog has exactly these four functions and no triggers. U5 replaces the old catalog lint with the no-policy authority lint; the surviving function is not a grandfathered business function.

| Function / verdict | Reason, guide and copied reference | Target census |
| --- | --- | --- |
| `rls.acting_account()` — DELETE | Actor comes from the closed gate, not a PostgreSQL setting; D §6–7 new rule, Hub `platform/db.ts:61-124` | 0 functions, callers and actor settings |
| `rls.acting_installation_administrator()` — DELETE | Explicit admitted tenure read replaces its authorization boolean; S §2, Documenso `trpc.ts:304-359` | 0 functions and deciding boolean callers |
| `rls.acting_workspaces()` — DELETE | Explicit membership-scoped SQL replaces the policy helper; D §7 new rule, Documenso `get-team.ts:38-73` | 0 functions and policies |
| `iam.lock_administrators()` — KEEP | It only locks `iam.installation_administrator` in SHARE ROW EXCLUSIVE mode; it never decides authority or returns business data. D §8 requires serialization of bootstrap/tenure edits and revocation. Copy Hub migration `0065_split_wall.sql:76-82`, with present owner `conexus_owner` | Exactly 1 allowlisted integrity function, fixed body/owner/search path; EXECUTE only runtime and owner, never PUBLIC |

The lock survives role removal because runtime has column-limited UPDATE and no broad table-level UPDATE/DELETE privilege on administrator tenure. The owner performs the stronger table lock behind a narrow SECURITY DEFINER function, rather than granting runtime wider mutation authority just to obtain a lock. A spec-stage PostgreSQL 17.10 experiment with the exact registered SELECT/INSERT/column-UPDATE grants confirmed direct runtime LOCK is denied with SQLSTATE 42501 while this definer succeeds. U5's disposable PostgreSQL test repeats this against the replayed full target catalog and proves direct runtime `LOCK TABLE ... SHARE ROW EXCLUSIVE` is denied with the exact target ACLs, the function succeeds, and two first-sign-in/revoke sessions serialize. If the actual PostgreSQL privilege rules or target grants make direct locking possible without broadening privileges, that falsifies this reason: return to the planning session before keeping an unnecessary definer. This function is an integrity primitive, explicitly permitted by D §8; no role-setting or caller setting remains in it.

### Deletion and rename ledger

| Piece | Unit / all callers | Target census |
| --- | --- | --- |
| `ROLE_ALLOWS`, `ACTION_REFUSALS`, per-action `outsider` column | U3 → `ACTIONS` and `SUBJECT_NOT_FOUND`; all command/run callers | 0 old symbols; total action×role cells |
| Installation-administrator `project.delete` | U3 → Project action using Workspace owner; safe U2 deletion begin caller moves | 0 admin deletion actions |
| `isInstallationAdministrator(ReadTx)` deciding boolean | U4 → `admitInstallationAdministrator`; session alone uses `readAdministratorFlag(Account proof)` | 0 deciding boolean branches; 1 admitted flag data read |
| `subjectOf(CommandGate \| ReadTx)` and raw read admission | U4 → nominal ReadGate/CommandGate opening only in admission | 0 raw read admission signatures/callers |
| Project scope without role; nullable `owners` for unrelated actions | U3 → role-bearing Project scope, owner rows only on owner-set action union | Negative compile checks; no old proof form |
| Person helper `ReadTx`/`WriteTx` parameters | U4 → corresponding scoped proof; private authentication/platform internals classified, not given compatibility overloads | 0 unclassified helper parameters |
| Mastra `mayBuild` and undefined-resource bypass | U7 → `admitBuilder` rejecting call at every route; all module/mount callers | 0 authorization booleans and bypasses |
| Project tombstone fallback lists / fake live revision | U4 deletes audit fallback queries and their administrator fact/fake revision; U6 replaces all live-only wire shapes with the live/deleting union | 0 fallback branch or empty revision sentinel |
| Public `purge`; separate `complete` transaction | U2 → private `finalizeDeletion` owning purge and completion | 1 atomic finalization; no standalone purge caller |
| Three `rls.*` helpers, schema, policies and FORCE/ENABLE | U5 deletes exactly the live catalog objects | 0 / 0 / 0 / 0 |
| `hub_reader`, `hub_command`, `iam_rls`, dormant `hub_builder_ingress` | U5 deletes entries, memberships, ACLs and dependency-free roles | 0 current roles/dependencies |
| `SET LOCAL ROLE`, `entrySettings`, actor/job GUC plumbing used only by removed SQL layer | U5 deletes runtime switch/settings helper and every caller; typed gate actor/job survives | 0 current switches or `conexus.account_id` / `conexus.job` settings |
| Actor-setting lint plugin | U5 deletes `biome/plugins/no-session-setting-in-sql.grit`, its biome.json registration and obsolete fixture; the authorization source census now rejects the removed settings altogether | 0 plugin/registration/fixture, and 0 runtime actor settings |
| Catalog register `split`, `reader`, `command`, `policyRoles`, `transactionRoles`, old split-wall counters | U5 → explicit `relations` runtime privileges and integrity-function allowlist; update generator, provisioning, snapshot and tests | One target grant register, no old-model fields |
| `scripts/hub-catalog-lint.mjs` split-wall checker and all imports | U5 replaces/renames to `scripts/hub-authority-catalog-lint.mjs`, retaining actual integrity lint under target semantics | 0 old checker imports; policy/ACL mutations fail new checker |
| Source-revision authorization converted to false | U4 removes `preview-state.ts` Project404 catch; service retains only admitted revision absence mapping | 0 subject refusal converted to child absence |
| Subject-FK refusal mappings and Project catch-all wrappers | U4 deletes both named FK mappings, detail subject-null branch and summary/thumbnail wrappers with their three unused failure codes; retains authenticated handoff/busy mappings and admitted child absence | 0 obsolete mappings, wrappers or codes |
| Defunct create/build denial codes | U3 deletes unused `PROJECT_CREATE_DENIED`; U4 moves remaining build reads; U7 removes final foreign build callers and deletes `PROJECT_BUILD_DENIED`, regenerating outputs in each deleting unit | 0 remaining codes or manual refusals |
| Guides describing row security and role switches | U8 edits D/S/H/T/A preserving unrelated rules | Document assertions match target catalog/admission |

`CommandGate`, `ReadTx`, `WriteTx`, `Admitted` and `Checked` still name their target meanings; they are not renamed merely because they existed before. `ReadGate` distinguishes the newly closed boundary. Historical migration names and hashes remain history, not a live API or compatibility path.

### Guide rules changed by this wave

These target sentences govern the corresponding approved unit; U8 edits the owning guides and removes contradictory paragraphs/examples, rather than appending a second model.

| Owner | Replacement rule sentence |
| --- | --- |
| D §6 | The Hub runs read-only and command transactions as `hub_runtime`, grants exactly the registered relation/column privileges, and authorizes each data use through its named admission proof without role switching or caller settings. |
| D §7 | Hub subject visibility is enforced by membership-scoped admitted SQL and adversarial isolation tests, with no Hub row-security policies; cross-owner foreign keys protect only structural identity or containment. |
| D §8 | PostgreSQL owns integrity constraints and narrow integrity locks, while admission and role decisions live in TypeScript over the current rows and command locks. |
| S §2, §10 | Every person data read or command admits the active Account and its subject, gives outsiders the subject 404 and members the action's role refusal, and accepts the tested risk of SQL filters without a row-security backstop. |
| H | Workspace/Project malformed parameters and admitted outsider lookups share the subject 404, secondary parameters keep their own declared malformed codes, and a deleting Project is a distinct wire state with only identity fields. |
| T | Every contracted operation and allowed foreign data route has positive and cross-Workspace cases against the target no-policy catalog, with mutation fixtures that prove missing admission and missing filters fail. |
| A §11, §12 | Hub authorization has one admission owner for reads, commands, runs and jobs; explicit scoped SQL replaces row security, while Checked served reads retain their documented method-only view and exact SQL-function allowlist; the glossary distinguishes authorization admission from source admission. |

## Units

Identity-access changes and the Mastra guard are gated areas: U3/U4/U7 carry needs:aprovo independent of their migrations. U2 lifecycle changes are lane:qualification; nothing builds before approval.

Each card is a complete fresh-session contract when read with its cited Design subsections, Deletes and census, guide-rule table and `shape/`. There is no build before the approval line. Use the pinned environment and project checks. Migrations in U3, U4, U5 and U7 are **needs:aprovo**; migration numbering is reserved from that unit's current head. All units run `npm run verify:quick` and the applicable scoped implementation tests, and update their pin expectations only for behavior they actually change. None calls E2B or administers shared infrastructure.

### U1. Pin all entry surfaces and publish the census

- **Already there**: main `83188b3a`; current OPERATIONS in `packages/contract/src/index.ts`; current Database/proofs in `platform/db.ts` and `identity-access/admission.ts`; `tests/implementation/hub-database.mjs` and existing PostgreSQL fixtures. Read Design admission/order, invariants/tests and Deletes/census. No target type is implemented here.
- **Creates**: Extensions to `scripts/census-boundaries.mjs`, repository census fixtures and an operation-keyed authorization pin harness green on main. Enumerate every operation, allowed Mastra route, served-host boundary, authentication gate, named job and executor/pipeline entry; fail missing/extra/unclassified keys. Record present caller action, refusal birth and intentionally defective deletion ordering as observed behavior, not desired behavior.
- **Satisfies**: AC-12; establishes evidence for AC-1–10.
- **Files**: Existing census script and its `contracts/technical/census-boundaries.json` record (retain current verification command), `tests/repository/authorization-census.test.mjs`, `tests/fixtures/authorization-census/`, `tests/implementation/authorization-pin.postgres.test.mjs`, existing fixture helpers only. No product authorization changes, migration, contract or web edit.
- **Copies**: Entry inventory and no-policy-proof reference; construct the script from this spec's rules, do not import the private study script.
- **Guide sections**: C §4–6, T proof/fixtures, D §3/5; current authority still applies.
- **Deletes**: None. Existing pins retained: `admission-races`, `admission-refusal-log`, `connections-bind-admission`, `project-deletion`, `builder-admit-run`, `iam-roster`, `model-account`, `registry`, `workspace`, `project`, `application-data` PostgreSQL tests. Add only missing operation/route cases; compare their operation keys against the full 47-operation census, including all eleven model-account operations and sign-out.
- **Proof**: Fixture names `raw-read-is-reported`, `alias-is-resolved`, `missing-callback-is-fatal`, `new-operation-is-fatal`, `foreign-route-is-fatal`, `business-child-absence-is-not-authority`. Today's read baseline is 19/4/15, policies 50/26; all 47 pin keys have an executed literal expected result, not a registration-only assertion. No real provider turn: ports are controllable fixtures. Existing two-session command races stay green.
- **Out of scope**: New refusals, target expected outcomes, synthetic skipped isolation tests.
- **Stop if**: A port cannot be reached without a real sandbox/provider/credential, an entry is ambiguous, or observed behavior differs from the study. Resolve the inventory rather than relaxing the detector.

### U2. Make deletion resumable before replacing its authority

- **Already there**: U1 deletion characterization, current administrator begin admission, existing deletion record, ports, purges and database.session. Read Design deletion data/flow, every-live-function and Refusal consumers. Use the final shape driver/finalizer/ports signatures, with today's administrator proof for initial key evaluation and begin until U3 replaces that actor. No owner admission, ReadGate or no-policy catalog is needed yet.
- **Creates**: One project-keyed session-lock driver using the existing PostgreSQL hashtextextended pattern, lost signal and idempotent effects; release application data, require every sandbox removed, remove repository, then private atomic finalizeDeletion with purge/completion. Declare PROJECT_DELETING in failure JSON/generated artifacts for sealed session opens; U3 consumes it in the action catalog. LiveConversations seals and serializes Project opens against teardown. Retain today's administrator gate only until U3 replaces it; no compatibility gate/export is added.
- **Satisfies**: AC-6 lifecycle/order/serialization and the no-recreation premise. AC-5 owner/member visibility waits for U3/U5/U6.
- **Files**: project/{deletion,module}.ts, builder/{module,conversation}.ts, hub.ts port wiring, platform/db.ts session-name union; failure JSON and generated code/text/OpenAPI artifacts; deletion/conversation/race fixtures. No schema migration or new persistent job. Historical stranded records stop before code changes and return to the planning session.
- **Copies**: Existing deletion/session advisory lock, application-access.ts:35 lock-key expression, Conexus Git idempotent removal, conversation.ts retiring-map choreography; target algorithm in Design replaces only unsafe lifecycle order.
- **Guide sections**: C §4–7/10, D §8, S §10, A native ownership; guide target sentences apply to changed behavior.
- **Deletes**: Public standalone purge, separate completion transaction, early Project removal, ignored sandbox-kill results and reopening after Project seal. Move every lifecycle caller; no test-only export remains.
- **Proof**: Repository failure retains row/open record and current administrator can retry at this intermediate head; U3 updates actor to owner without changing the lifecycle assertion. Fault every port and purge statement, prove atomic rollback, already-completed internal finalization success, concurrent driver busy with no effects, lock-loss stops next effect and guard-before-seal/open-after-seal barrier. All fixtures use controllable ports, no real E2B.
- **Out of scope**: Owner authority, deleting wire state/UI, RLS/roles removal, new progress columns/job.
- **Stop if**: Existing stranded audit lacks Project, any non-idempotent effect is required, an open can publish after seal, any failed kill permits finalization, or a later unit is needed to keep the retry pin green.

### U3. Make command authority a catalogue and deletion an owner action

- **Already there**: U1 pin/census and today's command proofs/locks. Read Design admission/order, API/value sourcing and deletion begin rules; target `catalog.ts`, `types.ts` Project role and owner-set unions. Reads still use today's raw ReadTx and policies.
- **Creates**: The total `ACTIONS` in admission and `SUBJECT_NOT_FOUND` in the contract operation owner; role-bearing scopes and action-discriminated owner rows; owner `project.delete` admission and central command subject404. Delete `PROJECT_CREATE_DENIED` after its command callers move; consume U2's `PROJECT_DELETING` in operation contracts; an approved next migration (**needs:aprovo**) normalizes retired persisted create codes and checks stranded deletion records. WorkspaceAction drops Project-only actions; update all callers and negative fixtures.
- **Satisfies**: AC-1/2/3/4 for commands, AC-5 authority portion, AC-12 locks/type rules.
- **Files**: `identity-access/admission.ts`, owner-set consumers in `roster.ts`/`administrators.ts`, `connectors/store.ts`, `application-access.ts`, `project/deletion.ts` begin only, `builder/run-lifecycle.ts`, contract `operation.ts`/`index.ts` and operation modules/failure source and generated outputs, next stored-code normalization migration and regenerated catalog snapshot, admission/contract/race tests. No Database read rewrite, policy removal or web state yet; the safe flow already exists in U2.
- **Copies**: Catalogue, membership lookup and command choreography reference rows; preserve SQL row-lock order and post-wait rechecks. Update administrator connection admission to name/verify Workspace, and every connection command passes its proof-derived Workspace filter.
- **Guide sections**: C §4–6, D §5/8, S §2, H failures; approved replacement sentences above govern changed authority.
- **Deletes**: `ROLE_ALLOWS`, `ACTION_REFUSALS` and outsider columns; administrator `project.delete`; Project scopes lacking role; unrelated nullable owners. Every command/run caller moves in this commit. The U2 safe effect order remains pinned; this card makes no claim that deleting reads are fixed while policies live.
- **Proof**: `command-outsider-is-subject-404`, `member-role-cell-is-403`, `administrator-is-not-project-owner`, `connection-admin-check-precedes-workspace`, `delete-begin-rechecks-run-after-lock`, `last-owner-race`, `last-admin-race`. Owner can begin, member gets `PROJECT_DELETE_DENIED`, admin nonmember gets `PROJECT_NOT_FOUND`. Catalog compile fixtures reject missing/extra roles, 404 role cell, missing owner rows and wrong branded ids. U2's safe-order/retry pin remains green after changing the actor to owner; no compatibility path is introduced to hide it.
- **Out of scope**: Result/failure type replacement, single-statement command rewrite, data-role changes.
- **Stop if**: A stranded historical deletion is found by the migration preflight, a lock disappears, a current action has no cell or a new permission is needed. Do not infer permission from administrator tenure.

### U4. Close every person read gate and scope every data helper

- **Already there**: U3 catalogue/proofs, U1 operation-keyed pins, current PostgreSQL read-only entry and reader role. Read Design admission/order, API/value sourcing, sensitive reads and census; shape ReadGate/read overloads and usage.
- **Creates**: Closed nominal ReadGate in Database, privately opened by admission; read overloads for Account/Workspace/Project/administrator, separate admitted administrator flag; all 19 read callers and person data helpers move to scoped proofs. Preserve Run/System/Bootstrap/Checked proof variants in the single owner. Next read-admission migration (**needs:aprovo**) also normalizes persisted runs carrying the three retired codes described under API surface before deleting those JSON codes, and grants `hub_reader` SELECT on `iam.account.active`; existing tenure SELECT already exists at main 0070, so do not add a redundant tenure privilege shim.
- **Satisfies**: AC-1/2/3/4/8 for person reads; AC-12 type/boundary pin. AC-7 is completed with no-policy mutations in U5; deleting visibility is not promised here.
- **Files**: `platform/db.ts`; admission; `identity-access/{administrators,hub-session,roster,application-access}.ts`; `connectors/store.ts`; `workspace/store.ts`; `project/{store,routes}.ts`; `registry/{module,served}.ts`; contract/project.ts and web/project-settings.tsx dead purged-variant removal; `builder/{conversation-store,run-reads,preview-state}.ts`; `builder/model-account/accounts.ts`; remaining boolean refusal callers in Builder routes/module; operation failure declarations/generated artifacts; next read migration and regenerated catalog snapshot; proof/census/import-law and affected PostgreSQL fixtures.
- **Copies**: Closed-gate, membership, separate administrator data and no-policy-proof references. Preserve explicit existing thumbnail joins, grant-only served access, model availability semantics and child absence codes; add two-Workspace filter canaries in their owning tests.
- **Guide sections**: C §4–6, D §5/8, S §2/6/9, H failures, A native/storage boundaries; approved target rule table.
- **Deletes**: Raw ReadTx admission overloads, `subjectOf` raw-read branch, deciding `isInstallationAdministrator`, manual subject-absence authorization responses, the Project detail/summary audit fallback branches, ProjectPurged contract variant and web project-settings empty-revision branch in the same commit, and their fake revision, and raw person helper parameters, the two named subject-FK refusal mappings and Project summary/thumbnail catch-all wrappers with their unused codes, and the source-revision Project404-to-false catch. Remove the detail route's nullable subject authorization branch. Keep the one admitted flag returned by session. Existing catch mechanisms remain under Non-goals; update their code sets per Refusal consumers; do not add isRefusal.
- **Proof**: All person read callbacks start with applicable admission and no preceding data SQL; target 0 unadmitted reads. Negative type tests cover forged gates/proofs, read→write and Checked→write. `inactive-account-read-is-403`, `session-flag-is-data`, `thumbnail-outsider-is-project-404`, `summary-and-thumbnail-admission-refusal-propagates`, `unexpected-project-store-fault-is-500`, `source-outsider-is-project-404-and-member-unknown-revision-is-source-404`, `builder-child-parent-precedes-child`, `models-private-shared-installation-canaries`. Positive own rows and grant-only application reads succeed. RLS still hides deleting Projects at this intermediate head; do not change policies or fabricate tombstone lists to make AC-5 pass early.
- **Out of scope**: Policy/role removal, owner deletion reorder, changing company model-account visibility, moving authentication to person admission.
- **Stop if**: Any required read column is not granted, a callback still needs raw SQL before admission, or a fixture only passes because it never executes the query. Name a new required grant explicitly; no blanket SELECT.

### U5. Remove the whole row-security model and prove the replacement

- **Already there**: U4 closed reads and all scoped helpers; U3 command catalogue; U1 executable inventory; main catalog 0070 register and history. Read Design Database migration/grants, every-live-function and rename ledgers; no future U6 Project state is required. Repeat deleting-summary mutants after U6 and strict foreign-route mutants after U7; U5 proves only the admitted boundaries already delivered.
- **Creates**: Next approved no-policy migration (**needs:aprovo**), exact runtime relation/column/function register, unconditional replay invariants, `hub-authority-catalog-lint.mjs`, no-policy isolation/mutation proofs and target role provisioning and regenerated function-callers/snapshot artifacts. Reads remain PostgreSQL READ ONLY. Runtime settings/timeouts and integrity keys/indexes remain.
- **Satisfies**: AC-7/9 and AC-12 migration integrity. Remove A §11's resolved RLS debt row in this same unit; remove the dead ProjectPurged debt row in U4. Deleting detail's contract is completed in U6; do not claim U5 alone delivers its UI.
- **Files**: `platform/db.ts`, `scripts/census-boundaries.mjs` split-field removal, next Hub migration, all three Hub catalog/role technical registers and role generated output; regenerate catalog snapshot and docs/reference/function-callers.md through their owners in this unit; migration runner, role generator/provisioner, `scripts/hub-catalog.mjs` role assertions and `scripts/generate-hub-catalog-snapshot.mjs` lint import, renamed catalog lint, `biome.json` registration and deleted actor-setting plugin, check imports, verification wiring; `tests/implementation/hub-database.mjs` and every affected PostgreSQL test plus catalog/call-site repository tests. No application-cluster policy, external account model or new pool.
- **Copies**: Explicit grant and integrity-lock references; apply the exact four function verdicts, audit every current ACL and cluster dependency before changing anything.
- **Guide sections**: D §2–8, S §2/10, C §3–6, T database proof, A §11; the new-model sentences above replace role/policy authority in this approved unit.
- **Deletes**: All live RLS helpers/schema/policies/FORCE/ENABLE, four obsolete roles/dependencies, role-switch and actor/job-setting runtime code, old split register names and old catalog lint with all imports, plus the obsolete actor-setting lint plugin/registration/fixture. No old/new lint or grant registers coexist. Historical migration files and checksum invariants remain untouched.
- **Proof**: Fresh replay and upgrade replay produce 0 policies/0 RLS/0 FORCE, no old roles or settings, runtime exact ACLs, factory confined and one permitted lock function. Retain/adapt tests for Builder store/admit-run, connector, refusal log, Hub baseline/role-register, IAM owner migration/roster, model-account, Project/registry, S1-data/application-data, SQL-text-refusal and Workspace; preserve their behavioral assertions, replace obsolete policy assertions. Execute all contract operation keys and current foreign read boundaries using target catalog; record the existing thread-equality defect as a U7 obligation rather than claiming it fixed here. Mutations remove Workspace predicates from lists, summaries, roster/invitations, bindings/access and session; Project predicates from detail/thumbnail/runs; Account standing predicate from private models. Tests must kill each mutant with an own-data positive control. Fixtures also plant extra grant, RLS policy, function, obsolete role or callback bypass and expect CI refusal.
- **Out of scope**: Broad DROP OWNED/CASCADE, live/shared cluster migration, new security-definer business APIs, benchmark promises.
- **Stop if**: ACL inventory contains an unexplained grantee, another database depends on an obsolete role, the migration actor lacks role-management authority, a mutation survives, or the read/write pin unexpectedly changes. Report it; do not preserve the obsolete role or weaken a check.

### U6. Keep deleting Projects visible until atomic finalization

- **Already there**: U5 no-policy target, U3 owner deletion action/409 and Project locks, U2 safe deletion driver/ports/session lock. Read Design deletion, wire/value sourcing and web state. Use shape ProjectState and beginDeletion; no new table, job or migration is needed unless evidence disproves the existing audit schema, which is a stop.
- **Creates**: Discriminated Project detail/list/summary contract and all consumers. All members see retained deleting identity; only owner retries. Killing Project sessions/streams uses existing deletion lifecycle hooks.
- **Satisfies**: AC-5/6/11 and AC-12 no fake state/compatibility.
- **Files**: `project/store.ts`; `packages/contract/src/project.ts` and generated OpenAPI outputs; web `routes/{workspace-projects,project-settings,construir}.tsx`, `app/shell.tsx` keeps every deleting row and applies archived filtering only to live rows, Project grid/API and existing failure state; deletion/race/disclosure/Project-settings browser fixtures. No new persistent progress columns or scheduler.
- **Copies**: U2's pinned deletion driver and existing web fixtures. Contract state replaces all old live-only assumptions in the same commit.
- **Guide sections**: C §4–6, D §5/8, S §2/10, H state contract, P Project meaning, V existing visual conventions, T fault proof; approved new rules above.
- **Deletes**: Live-only Project wire types and administrator-only deletion controls. U4 already removed audit fallback queries and fake revision while removing their deciding administrator fact. All callers move; there is no fallback or optional state property.
- **Proof**: `deletion-keeps-row-until-repository-removal`, `deletion-finalization-rollback-keeps-project`, `each-port-failure-owner-retries`, `concurrent-delete-is-busy-with-zero-effects`, `lock-loss-stops-next-effect`, `member-sees-deleting-detail-list-summary`, `new-owner-can-resume`, `admin-nonmember-cannot-delete`, `deleted-project-is-404`, `session-stream-closes-before-finalization`. Use deterministic barriers for repository wait and two-session begin/build race. Browser: owner retry, member no retry, busy pending control, incomplete then successful retry and list disappearance. No real sandbox calls in these fixtures.
- **Out of scope**: Repeated completed deletion as 204, retaining Project forever as tombstone-only identity, per-step progress UI, installing a worker job.
- **Stop if**: Any stranded historical deletion escaped the U3 preflight, any failed required effect allows finalization, any Project disappears before repository removal/final commit, or name/owner authority is inferred from the deletion's original requester.

### U7. Admit every Mastra route and clear stale web data

- **Already there**: U4 read gate and proof owner, U5 no-policy catalog, U6 state/teardown and web invalidation. Read Design foreign routes/web and refusal order. Use installed Mastra SERVER_ROUTES/types; verify embedded docs rather than changing native APIs from memory.
- **Creates**: `admitBuilder` read-gate call replacing boolean mayBuild, strict mandatory Project resource and resource/thread equality before sessionless message reads; operation/foreign boundary coverage; stale-cache 404 and deleting409 render transitions. Leave Mastra route handlers/schema/storage native apart from the scoped guard/error adapter.
- **Satisfies**: AC-7/10/11/12.
- **Files**: `builder/{mastra-session-routes,module,run-lifecycle,routes}.ts` guard ports/catch callers only; web `routes/construir.tsx` and `features/builder/construir/construir.tsx`, Project API/failure state as needed; failure source/generated artifacts and next retired-build-code migration (**needs:aprovo**) for final build code deletion; mount, route isolation, refusal-log and Builder browser tests. No Mastra dependency upgrade or new generic guard abstraction.
- **Copies**: Installed resource/thread ownership and Fastify-hook references. Current route allowlist remains exact and no-resource requests fail Project404.
- **Guide sections**: A native boundary and §11, C §4–6, S §2/5/9, T real-HTTP/web proofs, H problem codes, V existing unavailable rendering.
- **Deletes**: `mayBuild`, false→403 branches, undefined-resource early return and any remaining `PROJECT_BUILD_DENIED`/`PROJECT_CREATE_DENIED` codes once grep/census shows no live caller. Revoke no upstream route compatibility allowance; an unregistered route is not served.
- **Proof**: Iterate exact method/path allowlist with owner/member/outsider/inactive Accounts, unknown/malformed/missing resource, wrong/missing thread resource, creation body and injected request context. Literal outputs: Project404, Conversation404, request-context refusal, admitted member own-thread bytes. Verify installed upstream canary cannot bypass strict thread comparison. Browser: revoke membership between requests with cached Builder data and assert no stale content remains; deleting409 refreshes the deleting screen. Existing session stream teardown from U2 remains green; add the read-guard-before-seal/native-open-after-seal barrier and assert zero published session/sandbox.
- **Out of scope**: Periodic stream revocation polling, provider/OAuth behavior, Failure/result types, new foreign endpoints.
- **Stop if**: Installed routes no longer match the inventory, a native thread path requires an unscoped resource, or a new route cannot be given a positive/foreign fixture.

### U8. Make the target permanent and delete the temporary shape

- **Already there**: U1–U7 green target code, census, no-policy replay/mutation proof, unchanged authentication/executor/host boundaries. Read this spec's entire Deletes/census and guide replacement tables; current implementation now owns the types.
- **Creates**: Final CI gates for exact operation/route coverage, no unadmitted reads/raw helpers/deciding facts, target ACLs and planted missing-filter/admission detection. Edit D §6/7/8, S, H, T, A §11 to the new model, and record the accepted no-policy filter risk and its mutation-survival/new-entry reopen trigger in `docs/decisions/index.md` per S §10, replacing contradictory text/examples. The spec's final public evidence records measured counters and tested outcomes, without external paths or company data.
- **Satisfies**: AC-1–12 final closure.
- **Files**: Census/verification/import-law scripts and committed boundary record, owner guides in bounded inventory, fixture assertions and `docs/specs/0018-authorization-model/shape/` removal; spec status/evidence only when authorized by the planning session. No extra product behavior.
- **Copies**: Actual target code and replayed catalog; references above justify guide rule changes. Earlier historical specs 0015/0016 are superseded only for role/policy authorization; retain their integrity/authentication/host guarantees.
- **Guide sections**: C all, D all changed sections, S §2/10, H refusal/state contract, T proof, A §11; guide owners each receive their single target rule.
- **Deletes**: Whole shape folder, baseline allowance rows no longer needed, all live legacy names/forms listed in the ledger. No import from the spec exists in production/tests after removal. Historical migration replay remains tested, not deleted.
- **Proof**: `npm run verify:quick`, full applicable PostgreSQL suite and boundary/browser proofs, repository census plus its negative fixtures, replay catalog and all filter mutants. Search current source/registers/guides (exclude immutable migration history) for every deleted symbol/old rule; each expected absence is asserted. Every AC links an executed fixture and literal expected outcome, every operation/allowed route is counted. Confirm ≤70 product files and no new compatibility flag/export.
- **Out of scope**: Changing C's Failure/result rule or implementing spec 0019, company model accounts, retroactive historical migration edits, approving this spec or merging the wave.
- **Stop if**: Any final counter is unexplained, a guide still owns conflicting authority, any mutant survives or product file count exceeds 70. Return to the planning session rather than reporting the wave proved.

## Non-goals

- Failure/result representation belongs to the error model wave, spec 0019. This wave decides the refusal code and the boundary that originates it, using today's Failure throw/log/adapter mechanism and existing code-branch catches. It introduces no refusal class, `isRefusal`, Result union or parallel type owner. This bounded sequencing is explicitly required by the planning session; C §6's target result rule is implemented by 0019, not designed twice here.
- Company model-account sharing/standing changes belong to spec 0017. This wave changes only admission/filter sourcing and preserves personal/shared/installation semantics, RunScope/SystemScope consumers and credential reread authority.
- Applications-cluster row policies, factory storage model, Keycloak administration, new installation roles, new Project roles and background deletion jobs.
- Compatibility endpoints, test-only legacy exports, old grant registers or optional old/new Project states.
- A new timing SLA or a claimed latency improvement. Record read latency after U5 using identical admitted inputs if useful; approval does not rest on the uncompleted timing experiment.

## What breaks the premise

- A two-Workspace mutant survives target no-policy tests: scoped SQL/proof coverage is insufficient; stop before shipping the migration.
- A served-host or factory consumer still needs an RLS helper, actor setting or wider runtime grant: the dependency audit disproves this cut; do not leave a compatibility helper.
- A required deletion effect is not idempotent, a killed sandbox can be recreated after tombstone, or live Project identity must be purged before repository removal: resumability and visibility are false; reopen the smallest decision with the planning session.
- PostgreSQL can take the required administrator table lock under the exact target column grants without a definer: replace the unnecessary integrity function in the approved plan rather than retaining it by habit.
- Unit boundaries cannot end green using only earlier types/fixtures or the union exceeds 70 product files: propose a split before continuing.

## Stop rule

Stop and return to the operator through the planning session when a unit cannot end green without changing an accepted decision, a premise is disproved, a new load-bearing permission/value has no source, migration touches protected/shared infrastructure, or the union grows beyond 70 product files. No build begins without the operator's approval line. Open product questions: **none**; deleting visibility was answered as every Workspace member, with owner-only completion.
