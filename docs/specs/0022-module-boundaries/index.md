# 0022. Explicit module ownership

**Date**: 2026-10-09
**Status**: Technically approved by Firstmate under delegated user authority on 2026-10-09, proposal commit `75d7accffc2bf4197eb4523d44f0346c237cd169`. This records technical acceptance, not a new direct operator utterance or merge permission.
**Lane**: lane:qualification, Q-b module boundaries
**Execution branch**: `feat/conexus-module-boundaries`
**Integration base**: `wave/company-model-accounts-spec`
**Baseline**: `3233c0d19a8106d4f2ba8142a81779c5b6ceac46`
**Study**: Focused reconciliation of the accepted architecture/import and settlement investigations. The planning session holds the private evidence. This spec records only independently checked engineering facts.

## Summary

Owners expose their contracts deliberately, and consumers name those entries instead of moving domain concepts into `platform`. The registry alone constructs sealed application values. Ordinary SQL reaches another owner's records through an owner operation in the existing transaction. Current admission and settlement protections remain in force.

This changes no product behavior. It prepares module contracts for the later Preview/publication pointer work and run-source proof work without implementing those fronts.

## Requirements

- **AC-1**: The architecture guide and import checker enforce the same public-entry and dependency rule. A newly discovered owner, undeclared dependency, internal cross-owner import, or unregistered platform file fails the check.
- **AC-2**: A sealed application is an immutable, registry-owned nominal value. Consumers cannot construct, subclass or copy one by ordinary TypeScript. Runtime retention rejects forged values before writing any artifact.
- **AC-3**: The seven domain files currently in platform are removed from it, with all executable consumers migrated. Technical platform files remain a closed, checked inventory.
- **AC-4**: Ordinary cross-owner SQL disappears from Builder, Connectors, Project and Workspace. Owner operations receive actual scoped admission proofs and run inside their caller's transaction. Registration, deletion, archived-project refusal, card ordering and membership filtering retain current behavior.
- **AC-5**: SQL checks inspect actual tagged templates, not comments or unrelated text. Cross-owner authorization and the two deferred registry reads have exact declarations; undeclared or stale exceptions fail. Registered table ownership uses the existing catalog register.
- **AC-6**: The complete CI and artifact impact map closes. The actual application-check bundle remains executable, old entries have no executable callers, negative fixtures still test their intended defect, and temporary shape files are deleted at closure.

## Product and concurrency invariants

C-015, C-020, C-021, C-028, C-030, C-032, C-033 and C-042 remain in force. No new principals, Permissions, routes, data environments, publication action or connector capability enters.

Human operations use current action-specific admission; system closure never grants fresh human work. Reads remain `REPEATABLE READ READ ONLY`. Commands remain `READ COMMITTED` with existing account, membership, Project and run locks in that order. The Project lock continues to serialize deletion with run creation and closure. No owner port opens a second transaction, changes roles, retries or polls.

Builder settlement still checks the held run, retains the admitted artifact, updates working state and ends the run in one transaction. Registry retains its current run/source/owner check. Served reads still obtain pointer and artifact in one SQL statement. Race, rollback and process-crash fixtures are preserved.

## References copied

| Mechanism | Revision and source | Keep | Adaptation and limits |
| --- | --- | --- | --- |
| Named public interfaces distinct from implementation | Better Auth `0e1a9c8413ff048a617cad81ab67175933ca8c7a`, `packages/better-auth/package.json:43-65`; `packages/better-auth/src/index.ts:1-14` | Explicit public exports and separate named interfaces | Same-folder entries rather than new npm packages. Use selective exports, not the reference's broad star exports. |
| Owner-only construction | Documenso `cd0cc5febcbb76ec7e5ecb75c0b8c65ab8432198`, `packages/lib/jobs/client/local.ts:40-56` | Private constructor, internal factory | Hidden value class, no singleton or job engine. Type-only export and existing WeakMap prevent external construction and runtime forgery. |
| Small declared export set | PostgREST `d42ae9d55d12989cdc2f0fda8d551b07af4e6ab5`, `src/library/PostgREST/Query/SqlFragment.hs:8-47` | Explicit exports keep internals private | TypeScript entries plus existing checker, not Haskell modules. This does not prove business-table isolation. |
| Closed gates, scoped transactions and query composition | Native baseline, `platform/db.ts:82-121,207-243`, `identity-access/admission.ts:72-87,230-258`, `builder/run-lifecycle.ts:247-258` | Existing transaction and admission owners | Extract same-transaction operations only. No new authority mechanism. |
| SQL relation recognition | Installed TypeScript 6.0.2 and existing libpg-query 17.7.4 (`wasm/index.js`, `parseSync`); native SQL normalization and catalog register | TypeScript declaration identity, PostgreSQL relation nodes and fragment contexts | Add relation-position ownership checks to the existing checker. Fragment analysis covers the current literal shapes; it does not prove arbitrary composed SQL semantics. |

Medusa, Packwerk, Spring Modulith, Backstage, Effect and Twenty citations in the inherited study were not available in the authorized local reference collection. They are inherited evidence, not newly audited proof, and no new implementation mechanism depends on them. Cal.com at `54343aa685ae8f33159d2f485ec4a57bad5c574a` remains contrary evidence: `packages/lib/errors.ts:3` and `packages/lib/WebAppURL.ts:4` coexist with domain services in a broad shared library; sharing a directory alone establishes no ownership rule.

## Design

### Public entries and dependencies

Each owner declares its existing composition entry and exposes a selective `public.ts` named interface when another owner consumes its shared types, pure policies or transaction operations. No unused entry is created. Internal consumers use local files. Other owners use `public.ts`; runtime module instances are injected by composition. The existing model-account constructor entry remains an explicitly declared dependency for its current Builder consumers.

The single executable inventory lives in `scripts/check-import-law.mjs`. It names known owners, their public entries, dependencies and the technical platform inventory. Unknown source directories fail. Type-only imports are checked too. No per-owner manifest, service container, code generator, new package or separate check framework is added.

Initial dependencies are derived from the census, then narrowed to the actual interfaces introduced by U2-U5: Builder consumes identity-access, app-runner, model-account, registry, hosting and project; Project consumes identity-access and Builder's activity contract; Registry, Connectors and Workspace consume identity-access; Connectors also consume Project; Hosting consumes identity-access. HTTP may consume only the current session contract through the identity-access public entry, alongside its existing technical dependencies. The baseline session entry also exported a one-caller token hash wrapper; U2 deletes it and HTTP uses the existing technical digest directly, with a symbol restriction excluding every other database export. The checker verifies actual import/reexport cycles, including types. Public Project transactions must not reexport Project's constructor or store, preventing a back-edge through the injected Builder activity contract.

`http/access.ts` currently needs session types, not arbitrary IAM runtime exports. Preserve that restriction at the symbol/import-kind level. A public entry must not become an exemption for HTTP to mint admission. Native gate-opening and authority-writing verifiers continue to inspect declarations, not the name of a reexport.

### Ownership moves

| Current file | Destination and responsibility | Public consumers |
| --- | --- | --- |
| `platform/sealed-application.ts` | Hidden class inside `registry/seal.ts`; type exported through `registry/public.ts` | Builder stores and returns the registry's sealed value |
| `platform/application-template-pins.ts` | `registry/application-template-pins.ts`, supported artifact recipe identity | Builder compilation/check and registry validation use the same pin |
| `platform/application-path.ts` | `hosting/application-path.ts`, request-to-file policy | Builder boot check consumes hosting's public pure policy |
| `platform/application-csp.ts` | `hosting/application-csp.ts`, host response policy | Builder boot check consumes the same policy |
| `platform/application-slug.ts` | `identity-access/application-slug.ts`, address allocation/validation | Hosting consumes IAM's public slug schema |
| `platform/host-outcome.ts` | `identity-access/host-outcome.ts`, session-resolution contract | Hosting consumes type-only outcomes and proof scope |
| `platform/git-failure.ts` | `builder/git-failure.ts`, mapping Conexus Git failures | Builder internal consumers; Project's repository adapter in `hub.ts` maps the Project failure at composition |

Move `applicationSlugOfHost` out of `platform/config.ts` to the identity-access address policy. Keep technical domain/port formatting in config. This removes the config dependency on a domain schema. The Project store no longer imports a Git mapper; the composed repository port preserves `PROJECT_REPOSITORY_UNAVAILABLE` for the existing operation. No error table or code meaning changes.

Registry keeps private payload storage in its WeakMap. Its hidden class has a private constructor and nominal member, with `Object.freeze(this)`. Export only its type. `seal` creates the value after its existing validation. `contentsOf` remains internal to Registry. Derive `BuilderRegistry` and `ServedLaunch` from `RegistryModule` through `Pick` and owner type exports; delete their duplicated operation and result declarations.

### SQL operations and decisive logic

| Owner operation | Actual proof and values | Sequence and refusal |
| --- | --- | --- |
| Project `requireCreatedProject` | `Admitted<WorkspaceScope<'project.create'>>`, `ProjectId` | Check inserted Project belongs to proof Workspace in the same creation transaction; Builder inserts its markers by VALUES only after this check. Missing/foreign Project refuses without markers. |
| Project `lockPresentProject` | `Admitted<SystemScope<'builder-executor'>>`, `ProjectId` | Preserve exact `SELECT ... FOR SHARE` presence check before Builder locks the run. Do not add human admission to closure; do not remove owner/source checks. |
| Project `isOpenProject` / `openProjectCondition` | Existing `connections.bind`/`project.read` admission, or application `Checked` for the composed condition | Human helper uses its lock or repeatable-read snapshot. Broker composes the Project-owned predicate in its final Connector SELECT, preserving statement-time archive/deletion refusal under unlocked Checked/READ COMMITTED. |
| Builder `readProjectActivity` | `Admitted<WorkspaceScope<'workspace.read'>, 'read'>`, Project ids selected by Project owner in that proof's snapshot | Return latest run using current `created_at DESC, builder_run_id DESC` tie break and preview presence from Builder tables. Project merges by branded id, formats timestamps identically, suppresses deleted fields and preserves final activity ordering. No separate database read or per-row network call. |
| Builder `hasOpenProjectRun` | Current `project.delete` admission or `project-purge` system proof, Project id | Query current generated `OPEN_RUN_STATES` in caller transaction after Project lock. Deletion remains refused with `PROJECT_BUSY`; purge lock/order remains unchanged. |
| IAM `readMemberWorkspaceIds` | `Admitted<AccountScope, 'read'>` | Read current account's membership ids only. Workspace reads names from its own tables in the same repeatable-read snapshot; administrator bypass remains unchanged. |
| Platform receipt cleanup | Existing `WriteTx`, operation identity from actual contract and branded resource id | Execute current receipt DELETE in purge transaction; preserve current authority writer check, moving the statement into `platform/receipt.ts`. No new gate opener. |

Functions live in owner transaction files and are exposed through selective public entries. Composition exposes existing `builderProjectPorts` operations to Project. Derive consumer types from exported owner signatures or the actual contract schemas; no `any`, casts, string ids or broad `TxQueries` service port.

Project ids in activity batches come only from Project's already admitted Workspace query. The caller and merge remain internal trusted code; this contract is not a new public authorization boundary. Return no activity for ids not requested and never surface an unknown returned id. Characterize empty batches, equal timestamps, missing working state, archived/deleting Projects and cross-Workspace access. If implementation requires another transaction or a broader proof, stop and reopen the design.

### Guide corrections

U2 changes architecture §5 Layers to: "An owner consumes another owner's declared public interface, while composition wires module instances; private files and undeclared dependencies are forbidden, including type-only imports." U3 states that technical platform files are the closed inventory enforced by the same law. Correct only the now-wrong trap text in `apps/hub/AGENTS.md`, without adding knowledge sections.

U5 adds database §5: "SQL names the caller owner's tables; another owner's records are read through its scoped transaction operation, except exact authorization and temporary dependencies registered by the boundary check." Architecture §11 records the two registry exceptions and their removal fronts. Remove the solved import-exemption and subclassable-seal departures only when their replacements pass.

No migration or grant change is planned. Historical migrations, accepted specs, negative template pins and previous error fixtures remain intact.

## Census and deferred dependencies

Baseline import census: 35 owner-to-owner file edges, all exempted; zero file import cycles; native import law passes. Platform has 28 files, seven named domain files to remove, target 21 existing technical files with no unregistered additions. The platform slug file names `iam.application` in comments only; the inherited text census falsely counted it as SQL.

Focused AST census: 240 schema-qualified relation occurrences in `sql` tagged templates, all in the current catalog register; 32 cross-owner occurrences: 15 in IAM authorization, two deferred Registry reads and 15 ordinary occurrences, including Project receipt cleanup. U4/U5 remove ordinary reads. U6 targets zero undeclared cross-owner occurrences, not zero authorization joins. The catalog maps `iam` to identity-access, `reg` to registry, `model` to model-account and `connector` to connectors, rather than equating folder names with schemas.

- **Finding 0005, Q5 publication wave**: `registry/served.ts#pointerStatement` reads `builder.project_working_state` deliberately until Preview and Published pointers are moved together. Readers include Builder preview state and Project activity cards; writers include settlement. Q5 must migrate all readers, grants and the same settlement transaction, then delete this exact exception. This wave does not move a pointer table merely to make its census zero.
- **Finding 0006, run-source proof/Builder wave**: `registry/retain.ts#retain` reads `builder.builder_run` deliberately. Preserve RUNNING, exact run/Project/owner, candidate/result source agreement and owner-held transaction. Replacing this read requires the later accepted run-source proof design; generation alone is not evidence. This wave does not mint a synthetic Run proof or add lease fencing.
- **Admission**: exact reads in `identity-access/admission.ts`, `application-access.ts` and `authentication.ts` guard current resource access and refresh/creation. These are permanent authorization dependencies, not generic IAM permission to read any owner table. Table/function pairs are enumerated from the executable census; stale or new pairs fail.
- **Applications backup**: no semantic implementation dependency. No backup/restore operation on real data is needed here.
- **0021 connectors**: this wave changes public entries and Project access operations used by `connectors/store.ts`; the connector spec must reconcile those contracts before its build. It remains a separate front.

## Code shape and current proof

The temporary shape, deleted at U6 closure, was compiled before implementation. `shape/owners.ts` derived Registry operations and proof types from actual baseline owners and built the proposed open-project statement with actual `platform.sql`. `shape/sealed.ts` demonstrated the private construction contract by calling the native seal. `shape/negative.ts` tested construction, inheritance, field-copy forgery, read-to-command misuse and id-kind substitution. `node node_modules/typescript/bin/tsc --noEmit -p docs/specs/0022-module-boundaries/shape` passed with TypeScript 6.0.2 and the unchanged lockfile.

A temporary compiler-host overlay changed only the native seal's class and affected type imports, then compiled real consumers and bundled/executed the real seal through installed Rolldown. It preserved digest `adae19f83e89cb00bc91fcc22fb07faf5ad7ad23a987dc8a423e4a5fd8b9434d`, refused a copied value through actual `contentsOf`, refused a mismatched run and froze the returned value. All four construction/copy negatives compiled only with their expected errors. The compiled public shape also executed the native seal and parsed its actual bound Project query with libpg-query 17.7.4.

These probes do not prove admission, database races or the final public-entry graph. At the pinned baseline, 39 focused Small tests passed with zero skips, covering native seal behavior, path classification and import-law controls. A disposable PostgreSQL run passed 25 tests with zero skips across registry, registry-settlement and workspace-reads, including concurrent cancellation/purge, retention replay and rollback. These existing real PostgreSQL tests provide part of the baseline pin; U4/U5 must reprove changed transactions. Scratch code and receipts stay outside the public repository. Shape is temporary and deleted by U6.

## Units and batches

Batch A is U1-U3, accepted by Firstmate after one independent review at `3f6a56b462fb8464eccf71394ebee6a68575ce11`. Batch B is U4-U6. Both batches remain on the same cumulative authorized branch, with one proved commit per unit and one independent closing B review. After B acceptance, publish one final ready PR to `wave/company-model-accounts-spec`. No intermediate publication, assumed landed base or worker merge is authorized. This cadence was coordinated by Firstmate on 2026-10-09.

### U1. Pin behavior and the real consumers

Baseline is the spec's pinned head, not older main. Creates only missing characterization coverage and the executable consumer inventory; reuse existing behavioral tests below. Satisfies AC-2, AC-4, AC-6. No product movement occurs in this unit.

| Path and symbol | Source/consumers | Action and target | Proof |
| --- | --- | --- | --- |
| `tests/implementation/builder-application-registry.test.mjs` | Native `seal`, contents and canonical bytes | Keep canonical/refusal/thumbnail cases; add visible-field mutation characterization before moving the class | Small seal tests; explicitly distinguish existing mutable behavior from final immutability |
| `tests/implementation/registry.postgres.test.mjs`, `registry-settlement.postgres.test.mjs`, `registry-crash-child.mjs` | Retention/settlement/purge/cancel/replay | Reuse actual run/source, single revision, rollback, cancel/purge/crash proofs | PostgreSQL suites on disposable cluster |
| `tests/implementation/project.postgres.test.mjs`, `project-deletion.postgres.test.mjs`, `workspace-reads.postgres.test.mjs`, `connections-bind-admission.postgres.test.mjs`, `connector.postgres.test.mjs` | Project cards, busy/delete, membership, archived binding/credential | Add only uncovered empty/tied card and deletion-versus-closure cases; keep negative access cases | Relevant PostgreSQL suites |
| `tests/repository/import-law.test.mjs`; native import/SQL census | Existing graph and relation discovery | Pin current allow/refuse behavior; derive migration callers from AST imports/reexports and named runtime loader strings | Current graph PASS and exact census counts |

Guide C §4,7 and T §1,4,6 apply. The pin does not bless today's wrong placement. Stop if a required current invariant lacks an observable test or the base differs materially.

### U2. Public contracts and registry-owned sealed values

Requires U1. Satisfies AC-1, AC-2, AC-6. Copies named entries and private construction. All affected owner imports/reexports move together; no admission alias is kept solely for a consumer.

| Path and symbol | Current callers | Action and target | Proof |
| --- | --- | --- | --- |
| `registry/seal.ts#SealedBuild`, `registry/retain.ts#contentsOf` | Builder and registry | Hide private constructor, freeze metadata, keep WeakMap; delete platform sealed file | Seal small tests; registry PostgreSQL forgery/foreign/replay tests; new negative type fixture |
| `registry/public.ts`, `identity-access/public.ts`, `app-runner/public.ts` | 35 cross-owner imports | Create selective named interfaces; public IAM export list matches actual admission/session consumers; app-runner exports existing manifest contract | All real consumers compile; undeclared/deep/type-only negative import fixtures |
| `builder/application-build.ts#BuilderRegistry,#ServedLaunch`, `builder/run-lifecycle.ts` | Module, service, run/admit, lifecycle and their fakes | Derive operations/results from RegistryModule and migrate sealed imports | Candidate/registry tests, registry settlement, Builder composition |
| `scripts/check-import-law.mjs` | Boundaries command and repository fixture roots | Replace SESSION/ADMISSION/APPLICATION_SERVER and named-file model-account carve-outs with known-owner/public-entry/dependency inventory; preserve unrelated rules | Import-law suite, unknown owner and dependency RED controls |
| `scripts/check-boundaries.mjs#GATE_OPENER`, `biome.json` gate-import rules, `tests/repository/gate-import-rule.test.mjs`, `tests/repository/hub-call-sites.mjs` | Native declaration census and proof negative compilation | Register public reexports without permitting foreign gate construction/opening; update actual declaration resolution only where changed | Existing forbidden gate opener and receipt/admission tests |
| `tests/fixtures/admission-negative.ts`, `tests/implementation/registry.postgres.test.mjs` forged subclass case | Old platform constructor | Migrate to type-only compile negatives and runtime forged field-copy/prototype attempts; retain no-write assertions | Type compiler and real retention refusal |
| `docs/reference/architecture.md` §5,11; `apps/hub/AGENTS.md` trap | Existing contradictory boundary statements | Apply proposed rule, remove only solved debt, correct only wrong trap text | Repository checks and diff read |

The registry operation guard executes before any write. Full run/source checks and the current transaction remain unchanged. The public reexport must not create an import cycle or let a Builder caller reach registry internals.

### U3. Domain policies leave platform

Requires U2. Satisfies AC-3, AC-6. Moves six remaining domain files according to the ownership table, adds Hosting/Builder pure public entries, and installs the closed platform inventory in the existing import law.

| Path and symbol | Current callers | Action and target | Proof |
| --- | --- | --- | --- |
| Platform pin and registry seal/served, Builder `application-check.ts`, `application-artifact-runtime.ts` | `builder-template-pins.test.mjs`, `tests/live/hub-entry.mjs`, template recipe scripts | Move pin to Registry; migrate all runtime/source loaders; preserve exact pin literals and recipe input set | `builder:template:check`, template pin tests, built app-check executable tests |
| Platform path/CSP and `hosting/{module,preview-routes,application-host-routes,server-tree}.ts`, `builder/check/steps/boot-server.ts` | Classifier, application-host, Preview form/browser/starter tests | Move to Hosting pure interface; delete old files; preserve CSP/path behavior | Classifier/host tests, boot check, form-policy/browser consumers |
| Platform slug/outcome and IAM session/application-address files; `platform/config.ts#applicationSlugOfHost` | Hosting module/routes, IAM sessions, application-host tests | Move slug/outcomes/host selector to IAM; remove config domain imports; move all type/value consumers | Slug and IAM hosting PostgreSQL; application-host tests |
| Platform Git mapper; Builder module/service/source; `project/store.ts` and `hub.ts` repository adapter | Git tests and Project creation fake/real repository ports | Move mapper to Builder; map repository failure in composition; remove Project store catch | Git mapper tests, Project source-unavailable HTTP/storage cases |
| `apps/hub/compiler-template/README.md` incorrect pin location; `scripts/check-import-law.mjs`; all named old-path import fixtures | Manual instructions/check law | Correct factual location; close technical inventory; retain historical/refusal input pins | Census zero old production/loader paths; unknown platform file control |

Run actual bundled check, not only Hub tsc. No template inputs, package versions, prompt, app policy or model behavior changes. Close Batch A with one independent review.

### U4. Project operations own Project SQL

Requires U3. Satisfies AC-4, AC-6. Creates `project/transactions.ts` and a selective `project/public.ts` that exports only transaction operations and their owner-derived types, not the Project module constructor/store.

| Path and symbol | Current callers | Action and target | Proof |
| --- | --- | --- | --- |
| `builder/project-ports.ts#register` | Project store creation; Builder fixture/hub entry | Call Project `requireCreatedProject`; replace two cross-owner INSERT SELECTs with Builder-only VALUES inserts in same transaction | Project create replay/foreign/rollback tests; marker count |
| `builder/run-lifecycle.ts#heldRun`, `builder/conversation-store.ts#recordConversationSession` | Run steps/recovery/session fake and real stores | Pass existing executor proof to Project `lockPresentProject`; remove direct Project SELECT; maintain Project-before-run locking | Admission races, run recovery and conversation store PostgreSQL |
| `connectors/store.ts#requireOpenProject,#listBindings,#readConnectionCredential` | Connector store, definition/executor, binding tools and handler ports | Use Project `isOpenProject` for protected human binding calls and `openProjectCondition` in final broker statements; delete all six foreign relation occurrences; preserve proof branches, filtering and statement snapshots | Connector/bind-admission/cross-tenant SQL suites; archived/deleting/foreign credential cases |
| `scripts/check-import-law.mjs` Project interface and dependencies; `scripts/check-boundaries.mjs` existing authority writers | Native checker | Register consumer entries now; do not defer verifier changes to U6 | Static checks and negative gate/write fixtures |
| Tests/fakes constructing any mapped owner | Actual constructor parameters are retained | Static same-transaction functions avoid optional port additions and broad fake API changes; migrate changed signatures directly | Runtime and compile consumers |

No new gate/proof is minted. The Project helper accepts the same system proof already held at closure, and takes the same `FOR SHARE` lock. A human Connector call stays admitted as its current action; app calls retain `Checked<ApplicationScope>`. Stop if the extraction changes lock lifetime/order or app/human disclosure.

### U5. Activity, busy state and membership come from their owners

Requires U4. Satisfies AC-4, AC-5, AC-6. Creates Builder transaction reads and IAM membership read. Derives results from generated run vocabulary, branded ids and current wire schemas; Project combines them inside its existing read transaction.

| Path and symbol | Current callers | Action and target | Proof |
| --- | --- | --- | --- |
| `builder/project-ports.ts`, `builder/public.ts#readProjectActivity,#hasOpenProjectRun` | Project's BuilderProjectPorts and deletion ports | Add scoped owner reads; SQL names Builder tables only; use generated OPEN_RUN_STATES and schema-derived latest-run variants | Cards, busy deletion, foreign ids, run/cancel race |
| `project/store.ts#listProjectSummariesWithActivity`, `project/rows.ts#CardRow`, `project/module.ts` | Project routes; cards wire client; fixtures | Replace mixed-owner query with own rows plus bulk Builder activity in same snapshot; remove obsolete CardRow SQL projection when replaced | Literal Project cards ordering, timestamp, deleting fields, no-preview tests; compile web contracts unchanged |
| `project/deletion.ts#busy`, `hub.ts` purge composition; Project deletion fixtures | Start/finalize deletion, BuilderProjectPorts | Inject actual owner busy operation through current ports; delete direct Builder read | Active-run refusal, tombstone retry and purge/settlement races |
| `identity-access/membership-reads.ts`, `identity-access/public.ts`; `workspace/store.ts#list` | IAM proof/admission; Workspace API/fakes | Read membership ids under actual account proof; query only Workspace tables; retain administrator behavior | Workspace read, inactive/outsider/admin cases |
| `platform/receipt.ts` cleanup; `project/deletion.ts` receipt DELETE; `scripts/check-boundaries.mjs#AUTHORITY_TABLE_WRITERS` | Purge cleanup and reserved create receipts | Move receipt statement to its current owner; scoped operation/resource parameters; remove obsolete Project writer entry | Deletion replay/purge receipt behavior, unauthorized receipt writer control |
| `docs/reference/database.md` §5; architecture §11 | Owner SQL rule and deferred reads | Add proposed scoped SQL rule; name exact Registry/admission dependencies with removal fronts | Executable relation census, guide review |
| `tests/implementation/project-fixture.mjs`, `builder-fixture.mjs`, `tests/live/hub-entry.mjs` and affected Project/Workspace fake ports | Existing owner construction and card/deletion scenarios | Migrate required activity/busy operations, no optional fallback or compatibility API | Tests consuming real owner operations and local smoke |

Project remains the orchestrator of its card reply and deletion. Public Builder activity is a read contract, not a new lifecycle owner. Retain entire deletion transaction order and cleanup sequence. No migration, data reset or broader authorization is allowed.

### U6. Enforce the final census and close artifacts

Requires U5. Satisfies AC-1, AC-3, AC-5, AC-6. Extend `scripts/check-boundaries.mjs`, using catalog table registrations, actual TypeScript SQL AST and native normalization. Add negative fixtures/tests for comment/string false positives, quoted names, nested reads, foreign writes, unknown owners/tables and dynamic relation-position interpolations. Enumerate exact admission and two Registry dependencies by file, owning function and table. Each exception needs an actual matching occurrence; stale ones fail.

| Path and symbol | Current consumers | Action and target | Proof |
| --- | --- | --- | --- |
| `scripts/check-boundaries.mjs#findings,#census`; current native boundary tests | `boundaries:check`, `checks:static`, CI checks | Add owner relation diagnostics; reuse catalog/AST infrastructure, no new verifier pipeline | All RED controls and actual graph/SQL PASS |
| `scripts/check-import-law.mjs`; `tests/repository/import-law.test.mjs` | Every app/package import, including old-path fixtures | Finish selective entry symbol restrictions and inventory/unknown-owner checks; delete superseded allowlists | Full native import-law tests and zero obsolete loader paths |
| `scripts/ci-change-scope.mjs`, `.github/workflows/verify.yml`, package test scripts | All CI groups | Inspect discovery; existing script/test path classifiers already require complete qualification, so do not edit unless a concrete missed consumer appears | Full affected group map and exact head receipts |
| `scripts/build-app-check.mjs`, `scripts/builder-e2b-template.mjs`, `apps/hub/compiler-template`, `tests/implementation/server-build-fixture.mjs` | Compiled/bundled app check and immutable recipe | Verify owner moves cannot pull Hub database/provider code into sandbox bundle; keep template hash unchanged | Build app check and executable check tests, recipe check |
| `docs/specs/0022-module-boundaries/shape/` | This temporary design probe | Delete entire folder; implementation becomes the only type owner | Real owner negative fixture compile and all affected runtime tests |

Implementation census: 256 native tagged templates parse using the existing PostgreSQL parser and four explicit fragment contexts. Quoted case, declaration-order nonrecursive CTEs, explicit recursive visibility, nested/statement-local scopes, direct DML and SELECT INTO targets, and locking SELECT aliases are distinguished. Only the installed parser's Select/Insert/Update/Delete/Merge statement forms are recognized; unsupported statement forms are refused and cannot consume read dependencies. The native checker registers 16 exact file/function/table dependencies covering 15 IAM authorization occurrences and two Registry reads; undeclared and stale dependencies fail. The existing database-edge migration bookkeeping uses a fixed `pg` query rather than a tagged template and remains under its native database-edge rule. Temporary shapes are deleted; actual owner type negatives remain in the native tests.

Close Batch B with one independent review and focused corrections before direct publication. Stop if relation recognition cannot distinguish a concrete allowed expression from a violation; report the limitation rather than creating a broad exemption.

## CI impact and proof map

Every unit runs `npm run verify:quick` plus its mapped proofs. Complete discovery comes from `package.json`, `scripts/test-with-ledger.sh`, `scripts/ci-change-scope.mjs` and `.github/workflows/verify.yml` at the baseline. Native import law, gate declaration checks, authority write checks, SQL filter lint, generated error/model-account censuses, Biome and Knip must keep operating on the new public declarations.

| Group/artifact | Why affected or unchanged | Closure |
| --- | --- | --- |
| checks:static, generated:check, wire:verify | Public entries and check predicates change. Contract schemas/failure table do not change. | Native static checks each unit; generate and require clean generated diff. No manual generated edit. |
| test:unit / test:repository | Import/SQL checks, seal, host policies, constructor consumers and fakes | Run mapped tests on their unit; complete unit/repository groups at final head. Ledger required. |
| test:postgres | Scoped owner reads, cards, archived connector access, registration/purge/locks | Run mapped changed suites U4/U5 plus registry/admission race pin; all selected against disposable PostgreSQL 17.10 image from the task contract. No shared cluster. |
| test:network | Actual app-check/runner loads and request scopes can intersect changed entries | Execute affected network suites; final CI group discovers `*.network.test.mjs`. No external provider. |
| test:browser, four shards | CSP/classifier and compiled Hub host entry change | Form-policy and starter/app-check browser consumers locally; complete browser CI against final head. No screen redesign or visual acceptance. |
| test:smoke, test:live:extended | Hub composition and fake scripted Builder/Project deletion consume owner ports | Migrate `tests/live/hub-entry.mjs`; four smoke files plus seven extended files run through native harness. No real E2B. |
| test:backup | Tooling/test paths require backup qualification by current classifier | Native isolated backup test after final review/CI; Applications backup implementation remains separate. No real backup. |
| builder:template:check and built app-check | Pin destination and check policy imports move, immutable recipe consumes selected files | Execute pinned recipe check, template tests and actual boot/check bundle tests. Template package/lock/images remain unchanged. Live template test remains intentionally opt-in. |
| web:style:check, build:web | No UI/wire changes | Existing CI classification requires these. Reuse valid same-base proofs only with receipt/head identified; do not claim unknown prior receipts. |
| db:catalog/check, baseline/check, callers/check and role generation | No migrations, grants, role register or DB functions change | Existing PostgreSQL group checks these. Keep generated catalog and historical migrations unchanged. |
| tests/manual and configuration | Manual Builder/provider tools load compiled owners through native harness; pins and host selectors intersect | Migrate executable module path consumers and retain old rejected pin fixtures. Do not execute real provider/E2B without task authority. |

Consumer census additionally covers literal module-loader strings, reexports, compiler recipe inputs, manual tools and codemods. `scripts/codemods/error-code-to-failure.mjs` is a historical transformation tool: inspect whether the moved mapper invalidates its output; update an executable template only if still consumed. Historical specs and migrations are history, not compatibility paths to delete.

The planning session holds exact outside-repository proof receipts. At acceptance the worker supplies the full caller file map. No baseline evidence is claimed reused without a named successful command/head. CI/Factory run after the authorized ready PR; merge remains outside this worker.

## Non-goals and stop rule

No Preview pointer migration, publication/data-environment feature, lease/generation/run redesign, Connector 0021 build, Applications backup change, product decision, live database/provider call or shared infrastructure change.

Stop for a changed product invariant, missing owner contract, changed transaction/lock premise, forbidden proof widening, or growth beyond 70 product files/eight units. Routine observed caller drift inside the accepted map is recorded and migrated in its unit. Technical acceptance and batch reviews belong to the planning session; this proposal is not self-approved.

## Executable consumer action inventory

This inventory supplements the unit action tables. A file may move more than one contract in different units. Tests that deliberately probe internals may keep a valid internal entry; every deleted entry must move. History and rejected recipe identities remain intact.

| Existing path | Unit | Required action |
| --- | --- | --- |
| `apps/hub/compiler-template/README.md` | U3 | Correct stale pin-location statement without changing immutable recipe inputs. |
| `apps/hub/src/builder/application-artifact-runtime.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/application-build.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/application-check.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/check/steps/boot-server.ts` | U2, U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/check/steps/generate.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/check/steps/network-globals.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/check/steps/server-bundle.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/conversation-store.ts` | U2, U4 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/harness/request-context.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/model-routing.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/module.ts` | U2, U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/preview-state.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/project-ports.ts` | U2, U4, U5 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/routes.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/run-lease.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/run-lifecycle.ts` | U2, U4 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/run-operation.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/run-reads.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/service.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/builder/source.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/connectors/store.ts` | U2, U4 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/hosting/application-host-routes.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/hosting/module.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/hosting/preview-routes.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/hosting/server-tree.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/hub.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/identity-access/application-access.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/identity-access/application-session.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/identity-access/authentication.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/identity-access/preview-session.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/identity-access/session-core.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/identity-access/sign-in.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/model-account/module.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/model-account/store.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/platform/config.ts` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/project/deletion.ts` | U2, U5 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/project/module.ts` | U5 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/project/rows.ts` | U5 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/project/store.ts` | U2, U3, U5 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/registry/module.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/registry/retain.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/registry/seal.ts` | U2, U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/registry/served.ts` | U2, U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `apps/hub/src/workspace/store.ts` | U2, U5 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `biome.json` | U2 | Audit actual symbol/declaration origin; preserve forbidden gate/admission/receipt cases. |
| `scripts/check-boundaries.mjs` | U2 | Register relocated declarations immediately; extend SQL owner census in U6. |
| `scripts/check-import-law.mjs` | U2 | Replace owner exceptions with explicit entry/dependency inventory; add platform closure in U3. |
| `tests/fixtures/admission-negative.ts` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/app-path-classifier.test.mjs` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/application-host.test.mjs` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/builder-app-starter-v2.browser.test.mjs` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/builder-conexus-git.test.mjs` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/builder-fixture.mjs` | U5 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/builder-template-pins.test.mjs` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/iam-rules.test.mjs` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/iam-slug.postgres.test.mjs` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/preview-form-policy.browser.test.mjs` | U3 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/project-fixture.mjs` | U5 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/implementation/registry.postgres.test.mjs` | U2 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/live/hub-entry.mjs` | U3, U5 | Migrate actual imports/reexports or literal runtime loader paths; remove references to deleted entries. |
| `tests/repository/gate-import-rule.test.mjs` | U2 | Audit actual symbol/declaration origin; preserve forbidden gate/admission/receipt cases. |
| `tests/repository/hub-call-sites.mjs` | U2 | Audit actual symbol/declaration origin; preserve forbidden gate/admission/receipt cases. |
| `tests/repository/import-law.test.mjs` | U2, U3 | Migrate valid entry fixtures; preserve deliberate violation fixtures and their named refusal checks. |

U4 technical correction accepted by Firstmate on 2026-10-09: a paired real-store race passes at Batch A and fails when broker Project eligibility is read in a preceding Boolean query. Application checks hold no Project lock under READ COMMITTED. The owner predicate must remain in the final binding/credential statement; no isolation, authority or lock change is authorized. Permanent archive/deletion races cover both readers.

U5 precision correction: owner activity carries exact epoch microseconds as `bigint` separately from the Date used for millisecond wire formatting. Project preserves `coalesce(latest.created_at, stored.created_at)`, descending run/id selection and ascending Project-id ties inside its existing repeatable-read snapshot. Row-boundary latest-run variant negatives move to Builder with the query; no invalid history fixture is weakened.
