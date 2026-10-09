# 0023. Preview and Published data separation

**Date**: 2026-10-09
**Status**: Proposed. Firstmate technical acceptance is required before product implementation, under the task's delegated technical authority. This is not worker approval or permission to merge.
**Lane**: lane:qualification, Q-a/Q-b data and authority boundaries
**Execution branch**: `feat/conexus-q5-release-publish`
**Integration base**: `wave/company-model-accounts-spec`
**Baseline**: `7a202a3e835de147729b7e18bbf9f2352a045646`
**Study**: Focused `conexus-study` reconciliation of the accepted Release/Publish investigation, completed before these units. The planning session retains its private receipts and rerunnable probes.

## Summary

Builder, candidate tests and view-as use Preview. Published has its own data allocation and cannot be reset by a build. Registry owns Preview selection, and a successful build never selects the employee application. Until the next stage creates an immutable Release through explicit owner publication, the application host reports that no version is ready.

This stage introduces no Publish operation, Release, publication pointer, rollback, retention, external synchronization or connector capability. It preserves the current Product wire contract and the existing admission and settlement guarantees.

## Requirements

- AC-1: Preview and Published allocations for the same Project have distinct schema/runtime/migration identities. Neither runtime can read or write the other schema. No default environment exists at the runner boundary.
- AC-2: Builder preparation, tests and view-as can migrate/invoke only Preview. A Published allocation cannot enter reset or disposal APIs. Builder work leaves Published owned rows and ledger unchanged, including failure, cancellation and replay.
- AC-3: Registry owns the Preview pointer and all access to it. Retaining, moving Preview and ending the held run commit together. Source/owner/run validation and Project-before-run lock order remain. Pointer plus artifact reads remain one statement.
- AC-4: An application-host request cannot serve or invoke Preview, even with a valid employee grant and a ready Preview. It receives the existing `APPLICATION_NOT_READY` 503 after its current authentication/admission checks. Builder Preview remains usable.
- AC-5: One Project binding selects the same read-only Connection for all admitted environments. Scope/current-person admission, disabled/revoked bindings and same-statement archive/deletion refusal remain. No caller-selected environment/Connection is introduced.
- AC-6: Complete consumer/CI closure removes old pointer columns, implicit target selection, obsolete serving paths and shared-binding environment aliases. Microsecond ordering, same-snapshot reads, replay/crash/cancellation, backup and existing negative fixtures retain their intended guarantees.

## References copied

| Mechanism | Pin and source | Keep/adapt | Contrary evidence and limits |
| --- | --- | --- | --- |
| Separate data with no default copying | Supabase `cb52c0f42565032ab3f1cfb9a48fe4c44aad381e`, `apps/docs/content/guides/deployment/branching.mdx:14-19` | Separate environments, data-less by default. Adapt to existing Applications schemas and native roles. | Supabase uses independent instances and credentials, permits opt-in seeding and merges deployment configuration. This stage copies neither deployment nor seed workflows. |
| Owner interfaces and query composition | PostgREST `d42ae9d55d12989cdc2f0fda8d551b07af4e6ab5`, `src/library/PostgREST/Query/SqlFragment.hs:8-47`; native `platform/db.ts:40-54` | Selective interfaces and composed parameterized SQL. Registry owns pointer operations in existing admitted transaction. | Haskell export design does not prove Conexus admission; native negative/race tests do. |
| Atomic application migration batch | Native baseline `app-runner/data-plane.ts:109-123,183-189,220-240`, `migration-sql.ts` | Keep existing checksum prefix and one batch+ledger transaction, matching parser settings. | Historical investigation's per-file transactions do not provide batch atomicity. Cross-cluster atomic publication is not implied. |
| Current scoped authority | Native baseline `identity-access/admission.ts`, `project/transactions.ts`, `registry/retain.ts:19-48`, `connectors/store.ts:211-239` | Keep current closed gates, same-statement predicate and run/source/owner retention. | These are load-bearing invariants, not justification to retain pointer ownership or duplicate binding environment. |
| Backup recovery | Integrated `scripts/conexus-backup.sh:58-102`, `scripts/conexus-restore-check.sh:97-115`; independent exact-head backup review | Whole Applications archive plus globals covers both allocation kinds. Extend synthetic fixture only. | Independent snapshots, quiescent provision/DDL/grants, historical identity/session cutoff and installation prerequisites remain. No cross-cluster recovery claim. |

Appwrite, Rails, Supabase CLI, pgroll and Kamal references from the inherited investigation were not available in the local reference collection. They are contextual evidence for later stages, not newly inspected proof or a dependency of these units. No new framework or dependency enters; Mastra extension points are unchanged.

## Code shape and evidence

`shape/` compiles using actual RegistryModule, ApplicationRunnerClient, IAM admission and contract identity owners. It derives existing operations and strengthens the domain boundary; it does not declare stand-in owners. TypeScript 6.0.2, Zod 4.6.5, pg 8.23.0 and libpg-query 17.7.4 are installed from the unchanged dependency lock. `node node_modules/typescript/bin/tsc --noEmit -p docs/specs/0023-preview-published-separation/shape` exits 0 at the baseline plus this proposal. Negative call sites refuse Published reset, missing invoke domain, forged scoped proof, raw Project id and partial EMPTY state.

A task-owned executable probe transpiles `shape/types.ts` with installed TypeScript and runs installed Zod. It observes exact distinct names and rejects both opposite allocation domains and a partial EMPTY state. A separate fresh-build probe calls the real current allocation/ledger operations on disposable PostgreSQL 17.10: Preview row 17 exists; Published has no owned table/ledger row; cross-schema reads return SQLSTATE `42501`; second pending-file failure leaves neither first pending file's table nor its ledger row. This proves native implementability of schema/role isolation and batch reuse. It does not prove target TLS, provisioner least privilege, sandbox, publication or race behavior; the build proofs below do.

### Responsibilities and values

| Owner | Fact/operation | Value source and authority |
| --- | --- | --- |
| Registry | `PreviewSubject = EMPTY | READY { sourceRevision, artifactRevisionId, digest }` | Retained sealed artifact and current held run. Identity tuple is one Registry fact; Builder public nullable fields are a projection only. |
| Registry | `retainAsPreview` | Same signature as current `retain`; validates run/source/owner and identity conflict, writes pointer in caller's existing settlement transaction. |
| Registry | `readPreviewSubject`, `readPreviewPresence`, `hasPreviewSource`, `readLaunch` | Actual scoped IAM proof, with Project ids obtained from the caller's authorized Project query in the same read transaction. Presence returns only requested ids; the caller never creates extra Project cards from returned ids. |
| App runner | Allocation `PREVIEW | PUBLISHED` with domain-branded schema/roles | Names derive once from parsed ProjectId and domain. One allocation implementation, separate variants. Internal consumers use parsed values. |
| App runner | `preparePreview`, `invoke`, `disposePreview` | Prepare/dispose have no Published variant. Invoke requires target kind at the private owner socket; external requests/handlers cannot choose it. Hosting selects Preview, test operations select Preview. |
| Connectors | Shared Project binding | One bound Connection/name per Project. No environment column and no duplicate Published binding. Scoped principal authority remains Project/Preview versus application access. |
| Hosting | Employee unavailable state | Existing IAM application session/grant check, then existing not-ready outcome. No Registry Preview reader or runner invocation on this path. |

### Data and transactions

U2 adds `0077_registry_preview.sql`. Create `reg.project_preview` with Project structural FK, one row per Project, non-null source/artifact/digest coordinates and format checks. A pointer must either be absent or complete. Artifact association is by Registry identity; preserve the ability to detect a corrupt pointer as `INTERNAL_UNEXPECTED` instead of quietly treating it as empty. Copy complete existing Preview coordinates inside this forward Hub migration, then drop the three old Builder columns and their constraints/column grants. This copies control-plane identity only, never application rows. Retain applied migrations unchanged. Update catalog census/snapshot and role verification from native owners.

Registry pointer reads join artifact by Project/source/id/digest in one SQL statement. `retainAsPreview` validates retained identity and held source/owner, then upserts `reg.project_preview` in that same transaction. Builder keeps its working-state lock, updates its own current_state and ends the run before commit. Refused run, cancellation, owner mismatch, digest conflict or transaction failure leaves artifact/pointer/run unchanged. Purge deletes Registry pointer before artifacts under the existing Project-purge proof. Remove Registry0005 exception only once compiler, SQL census, corrupt-pointer, settlement/purge and snapshot proofs pass. Keep Registry0006 unchanged.

U3 broadens native allocation role pattern and convergence to exactly `(preview|published)` namespaces. Build preparation only ensures Preview. There is no production `preparePublished`, automatic creation/copy/migration of Published, or Published deletion. Synthetic fixtures may ensure a Published allocation through the internal common data-plane primitive to prove isolation. `resetPreview` accepts only Preview at compile time and validates its domain at the private boundary. Invoke selects runtime role from its explicit parsed allocation. The existing migration chain, limits, relay pin, credential confinement and worker format remain. Keep existing reset authorization window and refuse divergence when an application record exists; new data separation does not authorize a wider reset.

U4 adds `0078_project_connection_binding.sql`. Drop the preview-only environment CHECK and column, replace both open unique indexes with `(project_id, connection_id)` and `(project_id, name)`, retaining their names and `unbound_at IS NULL` predicates so current SQLSTATE/constraint mappings remain valid. No duplicate collapse is needed because the old schema permitted only Preview. Migrate all active insert/select/fakes together. Broker's final SELECTs still compose `openProjectCondition(proof)` and current bindings/disabled state; credential reads never become possession-based authority. Retain expired/revoked/current-account tests.

### Operations and errors

| Operation | Inputs/result | Refusal/error |
| --- | --- | --- |
| `retainAsPreview` | Derived from Registry `retain`, retained artifact id/digest | Existing `BUILDER_RUN_TRANSITION_REFUSED`, `ARTIFACT_IDENTITY_CONFLICT` internal invariant, native SQL fault; same transaction rollback. |
| Preview reads | Scoped proof, branded exact ids; EMPTY/READY or exact existing file result | Empty pointer differs from corrupt pointer. Current pin/digest/path checks retained. |
| `preparePreview` | Derived from current prepare, branded ProjectId, reset policy, files | Existing PrepareAnswer/private Result, divergence/migration refusals and parser transaction-control negatives unchanged. |
| `invoke` | Current InvokeInput plus required `kind`, branded ProjectId | Existing strict socket parse and `RUNNER_REQUEST_REFUSED`; current InvokeAnswer/HTTP200 private Results and public Problems unchanged. Missing/unknown domain refused, never defaulted. |
| `disposePreview` | Branded ProjectId, deletion owner | Existing release refusal/error transport preserved; underlying operation disposes only Preview. Rename methods/body schema/internal `/v1/release` endpoint to `/v1/dispose-preview` together; no legacy alias. |
| Employee file/operation | Existing session/host/origin/manifest route checks as applicable | Sign-in/revocation/404/security behavior remains. An admitted employee receives existing not-ready503 and zero Preview bytes/runner calls. No new Product operation or failure code. |

Private endpoint changes are coordinated Hub/runner changes, with no alias. Public Product operations, source-disclosure logic and microsecond activity wire remain compatible. WorkerJob format need not carry an environment: relay login/schema already encode the supervisor-selected allocation and are checked at the actual worker boundary.

## Deletes and census

| Mechanism | Baseline | Target | Proof/check |
| --- | --- | --- | --- |
| Active Registry read of Builder preview | One exact exception | Zero | Existing SQL dependency/stale check; remove only after actual replacement proof. |
| Builder Preview identity owner | Three columns, writer and two reader files | Zero active columns/readers/writers | Native catalog snapshot, whole consumer map and tests. Historical migrations/specs stay. |
| Runtime environment inference | All invocations silently Preview | Zero defaulted calls | Required strict socket schema plus type negative and actual role selection tests. |
| Shared binding environment alias | One always-preview column/constant | Zero | Catalog uniqueness and native broker tests; fixture migration. |
| Application host reads/invokes Preview | Registry reader port plus runner connection | Zero | Literal HTTP503, zero bytes/runner calls with seeded Preview and real IAM. |

No new regex budget or parallel verifier engine. Use existing verifiers and behavior/type tests; the task's discovery census is reusable evidence, not universal authority proof.

## Units

One independent review of the four-unit batch is arranged by Firstmate after unit closure. Each unit has one proved commit. No worker merge, per-unit PR/review or Factory pass. Direct PR targets the explicit foundation branch only after technical acceptance, implementation and independent batch review.

### U1. Pin current invariants

- Baseline: exact intake above, no dependencies on later units.
- Creates: missing literal characterization cases for run/pointer atomicity and environment authority at actual owner boundaries. Current pre-Q5 application serving is evidence of the defect, not a permanent expected contract.
- Satisfies: AC-3/AC-6 preservation baseline.
- Files: existing Registry settlement fixture/tests, run recovery/cancellation tests, broker snapshot races, activity/snapshot fixtures. Add only missing cases; no product edits.
- Copies: current native authority/transaction reference rows; C §4/§7, D §5/§6, T §1/§6, L proof closure.
- Deletes: no runtime API; remove no deliberate negative/history fixture.
- Logic: seed a valid held candidate, establish original pointer, cause retention/settlement failure, assert all literal identities remain. Cancellation and wrong owner/source cannot move it; valid replay converges. Preserve deterministic race barriers rather than sleeps.
- Proof: mapped PostgreSQL Registry/run/broker/activity tests, actual admission negative types; `npm run verify:quick`. Use task-owned disposable fixtures only. No migration to shared environments.
- Stop if: current invariant fails on this exact source and needs an unrelated fix; report cause to Firstmate.

### U2. Make Registry the Preview owner

- Already there: U1 pins, Registry seal/retain/run-source validation, actual IAM proofs, Project and Builder ports.
- Creates: reg.project_preview and the owner operations from shape. Satisfies AC-3/AC-6.
- Files/actions: Registry retain/served/module/public; Builder run-lifecycle/preview-state/application-build/store/project-ports/project-activity-row; Project store/module; Hub composition; migration0077, census/snapshot and generated verifier inputs. Complete consumer rows below.
- Deletes: Builder pointer columns/schema parsers/SQL, Registry0005 SQL exception after proof, old `retain` public entry replaced by `retainAsPreview`. No compatibility export. Registry0006 stays.
- Logic: held Project/run/working lock order unchanged; retain→upsert pointer→Builder state→endRun in same tx. Project cards combine Registry presence with Builder microsecond activity under same admitted read snapshot. Source admission asks Registry for latest Preview source inside same read. Output nullable wire fields derive from EMPTY/READY at one projection.
- Proof: Registry settlement/purge/crash tests; pointer corruption/missing file/pin tests; Builder source inspection/admission/store; Project activity/snapshot/cross-tenant tests; migrate grant tests and exact-role catalog. Run `db:catalog:snapshot` only against disposable fixture, native catalog/callers/baseline checks, quick and boundary/type negatives.
- Stop if: actual source-source authority cannot be preserved without0006 redesign; escalate instead of removing its proof.

### U3. Separate allocation authority and close automatic serving

- Already there: U2 Registry-owned Preview, existing runner/relay/migration engine and IAM host sessions.
- Creates: discriminated allocation domain, strict explicit invocation target, Preview-only prepare/disposal; employee host not-ready outcome. Satisfies AC-1/AC-2/AC-4/AC-6.
- Files/actions: data-plane/supervisor/requests/module/http/public, Hosting invoker/routes/module, Hub runner/deletion composition, Builder application-build/module/run-operation callers; inspect artifact-runtime/check bundle without unrelated edits; hba confinement script and all client/sandbox/host/backup harness consumers below.
- Deletes: `PreviewAllocation` untagged contract and Preview-only role-name assumption, generic prepare/release methods and release endpoint aliases, ApplicationHostReader and Registry readServedManifest/readServedFile operations/types/helper branches that selected Preview. Keep exact-revision Preview readers, launch and thumbnail reads. Rename technical disposal test to application-preview-disposal.test.mjs.
- Logic: private parse requires domain, caller never supplies role/schema; derive identities once. Builder prepare/test/Preview routes choose PREVIEW from authority, not request input. Employee routes preserve authentication/handoff/Origin/revocation, then not-ready; they have no preview reader or invocation port. Existing not-ready HTTP outcome is sufficient; no dummy publication row or permanently empty Registry API. No Publish action.
- Proof: same Project two allocations with distinct literal data; both runtime/migration cross-environment denials; Published ledger/row survives Preview failed build/reset/test; missing/forged domain request refuses before runner; direct real TLS/hba/relay escape tests with other layers off; migration second-file rollback; native runner concurrency/cancel/limits tests. Real IAM plus seeded Preview employee-host GET/POST returns503 and zero runner calls; Preview operation returns expected literal value. Preserve existing unauthenticated/revoked/foreign-Origin cases. Run affected network/PostgreSQL/browser/backup tests and quick.
- Stop if: deleting Preview data could dispose Published or current host admission cannot be retained without new product choice.

### U4. Own shared binding once and qualify stage 1

- Already there: U3 domain isolation and fail-closed application path; existing broker/current-account admission.
- Creates: Project-wide shared binding schema and all migrated SQL/fixtures; final reusable evidence and consumer closure. Satisfies AC-5/AC-6 and whole-stage deciding proof.
- Files/actions: migration0078, connector store/scope/module and fixtures; catalog snapshot/census; necessary native checker discovery config and docs corrections. Delete temporary shape at final proved commit after permanent native type negatives have migrated to tests/repository fixtures.
- Deletes: `ENVIRONMENT='preview'`, project_binding.environment and environment-specific unique axis, comments claiming application uses Preview data, superseded test expectations that successful build is employee publication. Retain payload-smuggling negative tests; changing legitimate internal authority is not permission to accept handler-controlled environment.
- Logic: one shared binding, Project membership or application grant authority selected by minted scope; per-call current-person admission and final same-statement archive/deletion/disabled/binding predicates. No duplicated binding, copied credential or new Connector definition. Driver proof uses only local scripted dependencies.
- Proof: native broker/handler fetch/port and four deterministic archive/deletion races; connection bind/revoke and cross-tenant tests, duplicate name/Connection PostgreSQL constraints; final selected static/network/PostgreSQL/browser/smoke/extended/backup graph and exact-head Factory after publication. Reuse unaffected receipts, rerun changes/intersections. No external calls/real Builder run authorized by this stage.
- Stop if: same Connection requires environment-owned writable authority; the accepted reopen trigger belongs above this stage.

## Consumer and proof closure

The rows below name exact source paths and actions. Tests prove their runtime owner's area, regardless of folder. Every unit audits package.json and the full workflow graph before commit. Imported client/supervisor and generic fakes need the same coordinated target changes even when a textual pointer census does not match them.

| Paths | Action/unit | Proof |
| --- | --- | --- |
| `apps/hub/src/registry/{retain,served,module,public}.ts` | U2 owns pointer/reads; U3 deletes employee Preview-serving readers | Registry/settlement/PostgreSQL and type negatives, single-statement corrupt-pointer cases |
| `apps/hub/src/builder/{run-lifecycle,preview-state,application-build,store,project-ports,project-activity-row}.ts` | U2 same-tx Registry operations; remove local pointer/triple ownership and activity presence | Builder source/store/recovery/admit tests; exact microsecond ordering |
| `apps/hub/src/project/{store,module}.ts`, `apps/hub/src/hub.ts` | U2 inject Registry presence alongside Builder activity; U3 inject Preview-only deletion/invoke | Project cards/snapshot/deletion/creation fixture, full composition smoke |
| `apps/hub/migrations/0077_registry_preview.sql`, `0078_project_connection_binding.sql` | U2/U4 new forward migrations, no edits to applied history | Disposable native runner; catalog/callers/baseline checks |
| `contracts/technical/hub-catalog-{census,snapshot}.json`, `apps/hub/src/platform/hub-roles.generated.ts` | U2/U4 register/grant actual new columns/tables; generate only from owners | Exact privilege tests and generated clean diff |
| `scripts/check-boundaries.mjs`, `scripts/check-import-law.mjs` | U2 retire0005 only after replacement; register actual public contracts/dependency if needed; keep0006 | Native checker positives/negatives, no stale exception |
| `apps/hub/src/app-runner/{data-plane,supervisor,requests,module,http,public}.ts` | U3 domain allocation/types/socket operation changes; one implementation and no old aliases | Strict HTTP native result, negative types, role/relay/sandbox/atomic ledger tests |
| `apps/hub/src/hosting/{application-invoker,application-host-routes,module,preview-routes}.ts` | U3 choose Preview from host authority; remove employee preview reader/runner path | HTTP503/no runner + Preview literal operations, origin/session/host cases |
| `apps/hub/src/builder/{application-build,module,run-operation}.ts`, `apps/hub/src/project/deletion.ts` | U3 all current runner consumers derive new typed client operations | Cancellation/reset-window/recovery/Project deletion replay |
| `apps/hub/src/connectors/{store,scope,module}.ts` | U4 one Project binding, same minted access scope, remove obsolete environment description | Broker native admission/race/cross-tenant/constraint tests |
| `scripts/confine-application-cluster.mjs` | U3 exact two-domain role regex. Match current allocation owner, never grant wildcard | TLS/password/local/other-database negatives against real pg_hba |
| `scripts/provision-application-database.mjs`, `run-application-cluster.sh`, `mount-application-cluster-storage.sh` | Inspect U3, retain native cluster separation/storage and provisioner contracts | Cluster/provisioning protected-database tests; same image pin |
| `scripts/conexus-{backup,backup-run,restore-check}.sh`, `infra/backup/*`, `docs/reference/backup.md` | U3 inspect; dumps already cover whole Applications. Keep independent cutoff/quiescent-DDL limits; extend synthetic fixture | Native test:backup covering both domains and restored ACL/ledger |
| `tests/implementation/{app-runner-module,app-runner-http,app-runner-http-boundary,application-invoker,application-host}.test.mjs` | U3 typed/private operation fixture changes; remove employee Preview success assumptions while retaining admission negatives | Actual owner/client/HTTP outcomes, exact codes |
| `tests/implementation/{application-data,application-runner-sandbox,application-cluster-installation,application-host-registry,iam-hosting,operation-cross-tenant}.postgres.test.mjs` | U2/U3 pointer seed migration, role/domain/host proof | Native PostgreSQL+TLS/sandbox/HTTP; no skipped required cases |
| `tests/implementation/{registry,registry-settlement,builder-store,builder-source-inspection,project-summary-activity,project-deletion}.postgres.test.mjs`, `registry-fixture.mjs` | U1 pins; U2 all pointer seeds/readers; U3 disposal calls | Literal source/owner/pointer/card/snapshot/replay checks |
| `tests/implementation/{connector,connections-bind-admission}.postgres.test.mjs`, `connector-fixture.mjs`, `connector-{broker,fetch,handler-fetch,handler-port,builder-brief}.test.mjs` | U4 binding inserts/expectations and spoofing controls | Same binding and scope admission, exact four broker refusal races |
| `tests/implementation/conexus-backup.test.mjs`, `application-release.test.mjs`, `error-model-http-fixture.mjs` | U3 dual-domain restore fixture, disposal rename, error fixture coherent new host behavior | Native backup and private errors; preserve unaffected error outcomes |
| `tests/implementation/{builder-run-operation,builder-application-registry,telemetry-logs}.test.mjs` and `tests/implementation/error-model-http.network.test.mjs`, runner fakes in Builder/Hub harnesses | U2/U3 owner port/client/log callers migrate together | Real exports compile; negative history remains; public failure protocol unchanged |
| `tests/live/harness.mjs`, `tests/live/*.test.mjs`, `.agents/skills/verify` referenced fixture scripts | U3 audit setup/invocation and fixture publications; synthetic Preview remains, employee can no longer treat build as published | Four smoke + seven extended flows; classify any changed behavior explicitly |
| `tests/manual/builder-gate-e2b-live.test.mjs`, remaining `tests/manual/*`, `tests/implementation/builder-production-composed-live-runner.mjs`, `scripts/builder-eval/*`, `builder-skills/*`, compiler template/recipe/client pins | U3 inspect dependent runner/Preview semantics; update only actual affected callers; retain historical proof and opt-in real-provider fixtures | Native recipe/template check; external execution remains unauthorized |
| `package.json`, `.github/workflows/verify.yml`, `scripts/{ci-change-scope,check-ci-results,test-with-ledger,check-hub-build,build-hub-local}.mjs` or existing `.sh` owner | Every unit audits all selected groups/discovery/artifact edges; register new negative tests in native discovery | No docs-only/quick shortcut; same-run build, all four browser shards, integration and backup selected |
| `docs/reference/{architecture,database}.md`, `docs/product/contract.md` | U2 retire only pointer debt with actual proof; U3 describe domains and no automatic serving as delivered boundary, explicit Publish remains destination | Guides agree with implemented stage; no unrelated roadmap closure or product rewrite |

The private discovery census includes historical migrations and generated catalog rows. Historical migrations, old closed specs and deliberate refusal fixtures remain. The compiler template, recipe SHA, image digest, generated manifest client, failure table and Product OpenAPI have no intended change; verify their owners and clean generation rather than hand editing them.

CI runs checks/static/generation, same-run Hub/web builds, unit/network/PostgreSQL, four browser shards, four smoke flows, seven extended flows and backup qualification. This change intersects hosting, Builder, migrations and tooling, so full integration/backup selection is required. Exact selected CI and Factory belong to the final published head. An independent review receipt or quick pass is not their replacement. At closure map any additional path discovered by imports/fakes to the affected unit and proof; source drift is observed and recorded, not silently excluded.


### Exact discovered test and fixture paths

These are the current consumers found by the rerunnable symbol census at the baseline. The broader import/socket/harness audit above adds consumers not carrying those symbols. Historical SQL is intentionally excluded from this migration list.

| Path | Unit | Action | Proof |
| --- | --- | --- | --- |
| `tests/implementation/application-data.postgres.test.mjs` | U3 | Migrate allocation/private invocation/disposal owner calls; preserve native negative behavior and unchanged wire outcomes | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/application-host-registry.postgres.test.mjs` | U2/U3 | Move pointer seeds/readers to Registry; employee serving expectations become explicit not-ready while scoped access negatives stay | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/application-host.test.mjs` | U3 | Migrate allocation/private invocation/disposal owner calls; preserve native negative behavior and unchanged wire outcomes | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/application-release.test.mjs` | U3 | Migrate allocation/private invocation/disposal owner calls; preserve native negative behavior and unchanged wire outcomes | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/application-runner-sandbox.postgres.test.mjs` | U3 | Migrate allocation/private invocation/disposal owner calls; preserve native negative behavior and unchanged wire outcomes | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/builder-source-inspection.postgres.test.mjs` | U2/U3 | Move pointer seeds/readers to Registry; employee serving expectations become explicit not-ready while scoped access negatives stay | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/builder-store.postgres.test.mjs` | U2/U3 | Move pointer seeds/readers to Registry; employee serving expectations become explicit not-ready while scoped access negatives stay | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/conexus-backup.test.mjs` | U3 | Migrate allocation/private invocation/disposal owner calls; preserve native negative behavior and unchanged wire outcomes | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/connector-broker.test.mjs` | U4 | Migrate shared binding fixtures/internal authority calls; preserve spoofing/current-person negatives | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/connector-builder-brief.test.mjs` | U4 | Migrate shared binding fixtures/internal authority calls; preserve spoofing/current-person negatives | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/connector-fetch.test.mjs` | U4 | Migrate shared binding fixtures/internal authority calls; preserve spoofing/current-person negatives | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/connector-fixture.mjs` | U4 | Migrate shared binding fixtures/internal authority calls; preserve spoofing/current-person negatives | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/connector-handler-fetch.test.mjs` | U4 | Migrate shared binding fixtures/internal authority calls; preserve spoofing/current-person negatives | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/connector-handler-port.test.mjs` | U4 | Migrate shared binding fixtures/internal authority calls; preserve spoofing/current-person negatives | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/connector.postgres.test.mjs` | U4 | Migrate shared binding fixtures/internal authority calls; preserve spoofing/current-person negatives | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/error-model-http-fixture.mjs` | U3 | Migrate allocation/private invocation/disposal owner calls; preserve native negative behavior and unchanged wire outcomes | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/iam-hosting.postgres.test.mjs` | U2/U3 | Move pointer seeds/readers to Registry; employee serving expectations become explicit not-ready while scoped access negatives stay | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/operation-cross-tenant.postgres.test.mjs` | U2/U3 | Move pointer seeds/readers to Registry; employee serving expectations become explicit not-ready while scoped access negatives stay | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/project-summary-activity.postgres.test.mjs` | U2/U3 | Move pointer seeds/readers to Registry; employee serving expectations become explicit not-ready while scoped access negatives stay | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/registry-fixture.mjs` | U2/U3 | Move pointer seeds/readers to Registry; employee serving expectations become explicit not-ready while scoped access negatives stay | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/registry.postgres.test.mjs` | U2/U3 | Move pointer seeds/readers to Registry; employee serving expectations become explicit not-ready while scoped access negatives stay | Native discovery by current suffix; behavior-specific proofs above |
| `tests/implementation/telemetry-logs.test.mjs` | U3 | Migrate allocation/private invocation/disposal owner calls; preserve native negative behavior and unchanged wire outcomes | Native discovery by current suffix; behavior-specific proofs above |

## Later stages and limits

Stage 2 adds immutable Release and one explicit `application.manage` owner publication command. It uses Registry-owned Preview coordinates without rebuilding, creates Published schema through the same native allocation owner and never copies Preview rows. It adds a Registry publication pointer whose readers select Release/artifact in one statement, employee hosting consumes it, and Project deletion refuses while published. Stage 1 has no publication, so this predicate has no state to inspect yet; do not invent a boolean or temporary artifact-based publication pointer.

Stage 3 reuses atomic batches/ledger and independently snapshotted Applications backup; it must prove compatibility, dry-run/drift, cross-cluster crash/retry and recovery limits before real usage. Existing Applications schema commit and Hub pointer commit cannot be one transaction. No production restore/data migration, destructive authorization or rollback promise enters this stage.

## Non-goals and stop rule

No connector0021, Stripe/Sankhya expansion, writable connector, Builder redesign, Registry0006 redesign, migration-engine replacement, blanket mechanical sweep, real provider/E2B/gateway operation, shared infrastructure edit, production data operation or worker merge. Stop for unexplained base divergence, a broken existing invariant, a need for product meaning outside settled choices, a unit that needs later-stage authority, or more than70 product files. Technical acceptance is the immediate checkpoint; it is not completion of Q5.
