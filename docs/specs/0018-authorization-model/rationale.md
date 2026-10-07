# 0018. Rationale: one authorization model for Hub reads and commands

## Context

The real question is who owns visibility and permission, and whether that boundary lets the existing lifecycle owners finish their work. Changing an outsider refusal to 404 would leave fifteen normal reads able to query without direct admission. Removing that permission after a run starts would also strand its terminal transition; treating required session teardown as best effort would falsely complete deletion. The root cause is an optional read boundary and lifecycle consumers that confuse permission for new work with responsibility to finish previously admitted work.

The target comes from the product/architecture/security guides and the current roadmap's S1 direction. Today's code measures the migration; it does not justify the target. This wave extends the existing admission owner, preserves native transaction/integrity/session owners, and removes obsolete mechanisms. It introduces no access-control framework or background deletion worker.

The fresh study inspected base `0987494fb358b9c8491fae4476cbc16f05099393` and current main `5efbc090c43176ca4e666688769d2a4ee09e1745`. Their product code in Hub, contract, scripts and technical contracts is identical. Main's roadmap directs 0018 to close S1 by removing Hub row security and requiring typed admission. The branch's older roadmap and the old spec approval are historical inputs; neither opens a build of this corrected draft.

## Options considered

### Keep the split application/policy model

PostgREST `Query/PreQuery.hs:41-56`, Supabase's RLS guide `row-level-security.mdx:24-60`, and Basejump's account migration `20240414161947_basejump-accounts.sql:122-168` show how database policies and trusted actor roles can provide an independent row barrier. Keeping this model preserves that barrier and the reader's narrower column grants. Its cost is two coordinating permission owners, transaction settings/roles, helper functions and catalogs. Adding read admission without removing that model would retain the split rather than reach the roadmap's target.

### Make the database the only authorization owner

The same database references support moving membership/action rules into policies and dropping TypeScript deciding rules. This preserves row isolation, but needs database-owned action/refusal semantics and integration with existing run, deletion and native session owners. It is a larger redesign than extending the already-owned gate, and contradicts the accepted application-owned direction. A SQL boundary is a valid alternative, not a failed application design disguised as a reference.

### Use application admission with separate read/command grants

Documenso's membership-scoped lookup (`get-team.ts:38-73`) and Supabase's distinction between grants and policies (`row-level-security.mdx:52-60`) permit application-owned visibility while retaining distinct native privilege sets. This keeps the reader's credential-column denial and removes policy duplication. Its cost is retaining role switching/register semantics and coordinating the closed gate with those grants. A temporary reader bypass or administrator definer would add machinery solely for an intermediate unit. The operator chose the simpler single-runtime transition; it is coherent with all read callers in U4.

### Extend admission and remove obsolete roles/policies

Documenso's scoped lookup and Better Auth's membership-then-permission route (`crud-org.ts:440-463`) supply the application pattern. The existing Hub gate supplies the nominal boundary; no equivalent nominal SQL gate or exact no-policy privilege migration was found in those reference paths. Membership discloses the subject, then an action/role cell permits the operation. Active Account checks precede subject lookup; administrator tenure is separate.

This is the recommendation and accepted direction. It removes roles/settings/policies/helpers without a new framework. The cost is explicit: the union runtime SELECT grants lose the database row backstop and former reader-column denial where command SELECT was table-wide. A typed proof does not prove a SQL predicate or projection. Exact grants, READ ONLY, scoped queries and representative tests remain useful but do not replace that barrier. A §11 and the decision register record the loss and a reopen trigger.

### Delete authorization

Removing both policies and admission would have the lowest mechanism count but allow outsiders and revoked actors to access data. It violates P §6 and S §2. Removal is applicable to duplicated mechanisms, not to the product's permission boundary.

### Deletion: preserve the row, hide it, derive it from audit, or remove the feature

Keeping the Project until required effects succeed, then atomically purging/completing, makes current-owner retry reachable and gives members one deleting identity. Better Auth's owner delete statements (`statement.ts:26-34`) support owner authority; Documenso's team deletion (`delete-team.ts:78-96`) supports one database transaction, not a copied external-resource coordinator.

Owner-only or hidden deleting visibility simplifies rendering but hides a resource members already know and removes the ordinary retry path. Audit-derived identity keeps early purge but invents a second live source. Removing deletion avoids teardown costs but drops an existing product capability. A background job/progress lease adds scheduling and state ownership without an established need. The recommendation retains the existing audit record and owner-triggered flow, with no job, progress store or replacement identity.

### Teardown: swallow, propagate, or create a second service

Installed Mastra core's `deleteSession` contract (`agent-controller.d.ts:145-156`) separates runtime teardown from persisted threads and treats an absent session as success. Swallowing a thrown deletion error makes completion false; deleting threads first loses the retry ids. Propagating every idle/shutdown error would change unrelated lifecycle semantics. A second cleanup service/table duplicates the native owner; removing cleanup can leave active sessions.

The smallest repair makes the deletion-facing close required before thread removal and retains intentional best effort at idle/shutdown consumers. It also checks required VM removal results and moves repository removal before final purge. Cross-resource coordination is composed here; no matching implementation was found in the inspected team deletion, Factory auth/config or native session API.

### Revocation: exempt all executor work, refuse all work, or separate closure

The current broad executor exemption permits new effects after revocation. Blanket current-membership admission prevents fail/interrupt, leaving an open run that blocks deletion. Removing execution or terminal cleanup drops existing behavior. A new cleanup engine/proof hierarchy adds an owner the product does not need.

The recommendation rechecks current Account/membership for new executor work and uses the existing System owner, exact held-run locks and terminal transitions for closure. Supabase Auth's middleware (`middleware.go:187-228`) provides the human/service distinction; no exact held-run cleanup algorithm was found there or in Factory auth/config. Fail/interrupt can finish once after revocation without minting a credential Run proof. Existing recovery of already admitted source effects keeps its responsibility; new phases, source and credential work do not receive a cleanup bypass.

### Checks: retain useful owners, extend cheaply, or build an analyzer

An inventory cannot prove arbitrary SQL isolation. A new general call graph/SQL analyzer also cannot soundly infer dynamic SQL and would become a separate product. Deleting checks loses regression evidence. The selected approach reuses census-boundaries, catalog checks, the compiler and existing suites, adding a few representative cases and cheap boundary extensions. The operator explicitly removed an exhaustive operation/route matrix, foreign-byte sweep, admission/filter mutants and extra session/stream race barriers as completion gates.

## Decision and why

On 2026-10-07 firstmate relayed the operator's study-gate answer: typed admission owns every person read/command; remove Hub RLS/helpers/obsolete role switches; record the lost database backstop in A §11; let current owners resume deletion and members see deleting state; refuse new revoked-run work while permitting one terminal closure. Existing suites plus a few representative cases per changed behavior are the end line. Normal delivery usable-screen approval remains. Reuse existing census/checkers with only cheap extensions.

That answer approves the objective and authorizes drafting; it does not approve this spec or any build unit. The status is draft awaiting the operator's approval. The old unsupported approval and review-success assertions are removed.

Seven units preserve green boundaries: pin; required deletion completion; command authority/run closure; one coherent read/native-privilege cut; Project wire/Hub/web state; native Mastra guard/refusal cleanup; final checks and shape removal. F2 requires U4 to include native visibility and the closed reader, instead of promising administrator nonmember reads under the old reader policy. Guide edits accompany their changes: S/H in U3, D/S/A/decision register in U4, H state semantics in U5. U7 is not a delayed architecture-change unit.

The inventory is 70 product/check/configuration paths plus seven owning/generated Markdown paths, behavioral tests and temporary shape. Generated artifacts and three migrations count toward the product cap. There is no checker rename or separate read-grant migration; `builder/conversations.ts`, previously omitted, is included. Registry retain also consumes a Run proof today (`registry/retain.ts:22-25`); U3 moves that settlement signature/caller to System plus exact held identity, preserving already-admitted recovery without minting an execution proof. Independent review found its actual BuilderRegistry port in builder/application-build.ts:17-21 also needs migration. Firstmate approved exchanging the unnecessary snapshot-generator driver edit path for that port, retaining 70. The generic driver at scripts/generate-hub-catalog-snapshot.mjs:44-90 stays unchanged with the same owner APIs; regenerate its output, and stop if the premise fails. The bounded union and each card are in index.md. If the coherent U4 cut cannot fit a fresh session, reshape the wave before introducing compatibility or exceeding the cap.

The public boundary consumed by parallel 0017/0020 stays stable: RunOwner, RunScope including `via`, generic SystemScope, BootstrapScope, Admitted mode/default, bound AuthenticationGate, Account overloads, action inference and Checked distinction. Model-account installation product semantics stay with those waves. The shape exercises an admitted Account standing read, held Run credential read and revoked terminal closure. A proposed boundary change returns to firstmate individually with evidence.

The existing Failure/catch representation stays; 0019 owns its replacement. Retired authorization/wrapper codes leave with their last caller, and each owning migration normalizes persisted run failure codes before generated parsers stop accepting them. There is no new refusal predicate/class or result engine. Native Mastra endpoints/allowlist and application-host grant behavior stay with their owners.

### Mechanism verdicts: three proofs each

Paths in the current-code column are under `apps/hub/src` unless specified. Reference versions are pinned in References below. A not-found verdict is a bounded search result, not an assertion that no implementation exists anywhere.

| Mechanism/verdict | Current code/evidence | Guide/target proof | Reference proof and adaptation |
| --- | --- | --- | --- |
| REPLACE optional normal reads with closed gate | `platform/db.ts:327-335`; census 19 reads, four direct admits | C §4/6, S §2: authority at the data boundary | Documenso get-team:38-73 supplies scoped lookup; nominal read gate not found in inspected team/organization/membership paths, extend existing Hub gate |
| REPLACE role/refusal catalogs with total named actions | `identity-access/admission.ts:24-45, 163-225` contains roles/outsider refusal | C §4/5, H §5, S §2: member visibility then action | Better Auth statement:3-40/crud-org:440-463; Hub keeps role403 instead of upstream role-in-query404 |
| REPLACE deciding administrator facts, KEEP session flag as data | `identity-access/admission.ts:227-242`; session read in census | S §2: current human and separate installation authority | Documenso trpc:304-321, Supabase Auth middleware:187-228; query flag only after Account admission |
| KEEP distinct Authentication/System/Bootstrap/Run/Checked proofs | `identity-access/admission.ts:48-94, 243-355` | S §2, D §5, A §11: different principal purposes; Checked is method-limited, not READ ONLY | Supabase Auth separates service/person; Factory auth:847-877 provides trusted scope; exact nominal variants not found, retain existing proof owner |
| REPLACE executor new-work exception; KEEP owner terminal/recovery responsibility | admission:319-341; run-lifecycle:16-19, 220-258; current tests deliberately retain exemption | C §7, S §2: terminal responsibility survives revoked new-work permission | Supabase Auth middleware:187-228 supports distinct service authority; exact held-run algorithm not found; use existing lifecycle/locks, no new engine |
| KEEP command lock order and native integrity | admission:134-225, 307-315; existing last-owner/admin/build-delete suites | D §3/5/8: integrity and post-wait reread | Database-oriented references use native integrity; Documenso delete-team:78-96 uses a native transaction; Hub lock choreography is retained, not copied from a lock-free read |
| REPLACE early purge/separate complete with effects-first atomic finalization | project/deletion:65-105 removes Project before repository | C §7, P §6: completion/retry have real meaning | Documenso delete-team:78-96 supplies atomic database cut; external sequence not found, compose existing ports |
| REPLACE admin deletion/audit fallback with current owner and retained Project | deletion:45-62; project/store census entries | S §2, P §6, H §4/8: membership/owner and discriminated state | Better Auth owner actions:26-34; scoped Documenso delete-team:22-64; no separate live identity/progress source |
| REPLACE swallowed required close/thread-first order | builder/conversation:54-58, 126-133; module:319-321; conversations:24-36 | C §7, A native owner: required effect cannot report false success | Installed core declaration:145-156; strict beforeDelete callback retains native ids; best effort belongs to idle/shutdown consumers |
| KEEP native session owner/route allowlist, REPLACE boolean and absent-resource bypass | builder/mastra-session-routes current adapter; module:281-290 | A native first, S §2/5: host supplies trusted exact scope | Installed server middleware:134-163/controller:1095-1107, Factory auth:847-877; stricter child equality is a disclosed Hub adaptation |
| DELETE RLS/helpers/old roles/settings, KEEP exact grants/owner/factory confinement | replayed catalog 50 policies, 26 flags, three helpers; platform/db:258-264 | Roadmap S1 target, D §6-8/S §2 change; A §11 records loss | PostgREST/Basejump/Supabase demonstrate retained DB alternative; exact removal migration not found; application pattern from Documenso/Better Auth plus native ACLs |
| KEEP narrow administrator integrity lock conditionally | admission:233, 349; sole fourth live function | D §8: lock integrity without widening mutation rights | Exact target privilege result not verified here; U4 must show direct-lock42501/definer-success or reopen its retention, not invent an authorization function |
| KEEP READ ONLY and scoped explicit SQL/projections | db read isolation; current proof-filtered store helpers | D §3/5, S §6: data boundary and minimal response | Supabase distinguishes grants/policies; application references use scoped lookup; neither nominal typing nor READ ONLY proves SELECT isolation |
| KEEP existing checkers/register owners; DELETE actor plugin/obsolete split semantics | `scripts/census-boundaries.mjs`, hub-catalog-lint and generated catalog; census baseline green | C §10/11, T §6: measured rules become focused checks | Exact analyzer not found/needed; retain repository's existing native checks; accepted scope excludes a new exhaustive harness |
| KEEP Failure representation; DELETE obsolete codes/catch-all/refusal-to-false branches | project/routes:45, 52; builder/module:287; db:151-152; contract declarations | C §6, H §5: each boundary owns its refusal; 0019 owns representation | Scoped reference lookups refuse at their boundary; no new reference error framework is copied |
| REPLACE live-only web/contract with live/deleting union | current Project detail/list/card and web consumers inventoried | C §4/5, H §4/8, P §6, V/L: usable real state | Scoped membership/identity pattern retained; deleting UI is Conexus product meaning, no matching upstream multi-resource state found |

## Evidence

The study and its rerunnable scripts/logs are retained privately by the planning session. This public rationale exposes code-relative evidence and limitations, not machine paths or old approval artifacts.

| Fresh observation | Result and limit |
| --- | --- |
| Tracked Hub AST census at `0987494f` | 70 database entries, 19 reads, four direct admit callbacks, 12 authentication entries, 33 raw-transaction helper bodies, 47 Product operations. The receiver/direct-callback heuristic is an inventory, not alias/call-graph or SQL-security proof. |
| PostgreSQL 17.10 disposable replay | Actual catalog equals the checked-in snapshot:50 policies, 26 RLS, 26 FORCE, four functions, zero noninternal triggers. This is current catalog evidence, not a tested target migration. The study container was stopped. |
| F2 real reader transaction | Synthetic active installation admin without Workspace membership:administrator fact true, Workspace lookup zero rows under hub_reader. Transaction rolled back. This falsifies the old U4 promise. |
| F3 existing real suites/source | Admission/builder run/deletion suites:21 tests pass, zero fail, zero skip. Executor admission tests preserve the existing exemption; run-lifecycle fail/interrupt use the same admitRun path. A blanket recheck would strand closure. This is current behavior evidence, not a target revocation proof. |
| F4 compiled Hub/session probe | Native deleteSession throws; one call is attempted, BUILDER_SESSION_DELETE_FAILED is logged, and liveConversations.drop resolves. Module removes native threads first. This demonstrates false required completion and lost retry identifiers. |
| Corrected spec checks | verify:quick and verify:docs pass; docs scope runs 221 tests with zero fail/skip. These checks validate the spec checkout, not the planned implementation. |
| Existing boundary census | Current census-boundaries passes. Useful native checks stay; it does not certify data isolation. |
| Compiled target shape | Strict TypeScript passes on the corrected shape. Removing all 21 expected-error annotations in memory yields exactly 21 diagnostics on 21 distinct expected lines, zero elsewhere. Negative cases cover gates/proofs/brands/action/mode, Project variants and cleanup-to-credential authority; usages cover local standing/held credential/terminal operation contracts. Compilation is evidence about types only, never unbuilt product behavior. |

Earlier studies, review dispositions, mutation survivors, latency claims and shape hashes were inputs to correct; they are not renewed proofs here. No performance improvement is claimed. No target database cut, real provider/model/E2B run, pilot cleanup, browser interaction or instantaneous in-flight revocation has been proved by this spec-writing task. Already admitted effects can finish; the next admission checks current authority. Normal delivery will judge the built wave head with its scoped tests and usable-screen approval.

### Independent audit disposition

Every finding in the independent audit of legacy 0018 is addressed below. These are required outcomes of the corrected plan, not product fixes already built.

| Finding | Evidence and disposition |
| --- | --- |
| F1: unsupported approval/evidence | Accepted. Fresh census/probes replace old claimed proof; index status is draft awaiting approval. This rationale removes unsupported earlier approval/review-success assertions. Study-gate approval is explicitly narrower than spec/build approval. |
| F2: administrator read impossible in old U4 | Accepted/blocking. Reader probe returns zero rows for a real admin/nonmember Workspace. U4 now changes all read callers/gate and native grants/removes policies in one green cut. Include administrator positive/nonexistent negative and Account.active grants. No intermediate bypass/definer/write read. |
| F3: executor revocation prevents terminal cleanup | Accepted/blocking. admitRun executor bypass and fail/interrupt consumers are distinct purposes currently sharing one proof. U3 rechecks new executor effects while existing System lifecycle locks exact Project/run/owner/open state for fail/interrupt; never grants new source/credential work. Preserve already-admitted candidate reconciliation and test revoked next admission, once-only/wrong-owner close. Public Run/System types remain stable. |
| F4: teardown failure resolves, native ids removed first | Accepted/blocking. Fresh compiled probe reproduces swallowed failure; module:319-320 confirms ordering. U2 requires successful native close before conversations.deleteAll deletes persisted ids, then repository before atomic purge/complete. Failure leaves reachable Project/open deletion record; retry and repository/transaction failure cases exercise it. No new seal/stream barrier is required by the simplified gate. |
| F5: incomplete options/lost reader backstop | Accepted. Options above include DB-only, split/native-grant application, single-runtime application and deleting authorization. The selected union loses row and reader-column denial; A §11/decision register record it. READ ONLY/types are not a replacement claim. |
| F6: no per-mechanism three proofs | Accepted. Verdict table links current code, guide/target and pinned reference for each touched mechanism, with explicit bounded not-found and unverified privilege results. |
| F7: unnecessary checker rename/framework/delayed guides | Accepted. Keep hub-catalog-lint/census/register owners in place, remove obsolete actor/split semantics only, extend cheaply. Guide changes ship in U3/U4/U5. Exhaustive operation/filter/route and race proof gates are removed by the operator's simplified answer. |
| F8: public consumer foundation/parallel contracts | Accepted. Preserve nominal Run/System/Authentication/Checked and Account inference; compiled usages exercise standing and held credential contracts. U4 requires an actual local createModelAccounts consumer with controlled ports, no provider call, and U3 terminal closure after revoke. Other specs' product types/content are untouched. |

The separate earlier review's real defects are also retained where fresh source supports them: purge-before-repository, stranded missing-Project deletion rows, command lock order, concurrent deletion, reader Account.active, child404 distinction, role403 adaptation, Checked's method-only limit, native exact-resource containment, stored retired failure-code parsing and complete file budget. Unsupported old exhaustive-proof/review-result claims are removed rather than copied forward.

### Remaining proof and review gate

The builder owes the representative proof table in index.md and existing suites, not the superseded exhaustive study draft. Target grant/dependency/lock behavior remains a build obligation. Open historical deletion rows with missing Projects must stop upgrade; no actual installation was inspected. A changed public admission boundary or a failed native lock/cleanup premise is a new individually analyzed decision.

Firstmate arranged independent read-only reviews of a1afc07c6473185c69fa96492bf12c4d62e42b4f by gpt-6-astra and gpt-6-sol. Both requested the missing BuilderRegistry retain port; Astra also found the Preview command call and unnecessary served Project type divergence. No product decision was raised. Their reports are retained privately; these are the corrections:

| Review finding | Resolution and evidence |
| --- | --- |
| Astra R1 / Sol retain port | U3 now names application-build.ts:17-21 and moves BuilderRegistry.retain with registry/retain and its sole settlement caller. shape/run.ts derives unaffected members from the actual BuilderRegistry and replaces the retain/readLaunch proof members; usage.ts exercises the real Pick<BuilderRegistry, 'retain'> consumer shape with the target nominal owner. Firstmate approved the explicit generic-generator driver/port edit-budget swap, keeping 70 paths; U4 states and checks the unchanged-driver premise. |
| Astra R2 Preview consumers | U3 includes preview-state.ts:79-82's command callback; U4 owns its normal reads. checkProject keeps Checked<ProjectScope<'project.read'>>, returning the membership role from its current lookup. ServedProjectScope is deleted. Preview-session/registry callers retain their contract; compiled served usage assigns that exact target Checked type and previewCommand exercises the target two-argument call. No compatibility overload or extra consumer edit is added. |

The correction preserves the simplified gate. Strict shape/negative verification and quick/docs checks are rerun after these changes before submission. Study approval still does not approve this spec or implementation.

## References

All source paths below are relative to the named repository/version. Code was read locally read-only; reference implementations were not run.

- Documenso `cd0cc5febcbb76ec7e5ecb75c0b8c65ab8432198`: `packages/lib/server-only/team/get-team.ts:38-73`, `packages/lib/utils/teams.ts:135-171`, `packages/lib/constants/teams.ts:31-34`, `packages/trpc/server/trpc.ts:304-321`, `packages/lib/server-only/team/delete-team.ts:22-101`.
- Better Auth `0e1a9c8413ff048a617cad81ab67175933ca8c7a`: `packages/better-auth/src/plugins/organization/access/statement.ts:3-40`, `packages/better-auth/src/plugins/organization/routes/crud-org.ts:440-463`.
- cal.com `54343aa685ae8f33159d2f485ec4a57bad5c574a`: `packages/features/membership/repositories/MembershipRepository.ts:332-340`, `packages/features/membership/services/membershipService.ts:17-37`. Shows boolean role facts can be legitimate data; Conexus replaces deciding facts at its own boundary.
- PostgREST `d42ae9d55d12989cdc2f0fda8d551b07af4e6ab5`: `src/library/PostgREST/Query/PreQuery.hs:41-56`.
- Supabase `cb52c0f42565032ab3f1cfb9a48fe4c44aad381e`: `apps/docs/content/guides/database/postgres/row-level-security.mdx:24-60, 750-758`. Grants/policies and trusted server authority, not a copied no-policy migration.
- Basejump `7a1f95ccef74eb2e638d5e4233b66b6cbbe175e6`: `supabase/migrations/20240414161947_basejump-accounts.sql:30-39, 122-168`.
- Supabase Auth `ce9a8eee0cc042be8c7a42981a7ddae631e41d91`: `internal/api/middleware.go:187-228`.
- Mastra Factory fork `ce7e9c30c1fb22ca37936121d88336ccee1f955c`: `mastracode/factory/src/auth.ts:331-343, 847-877`, `mastracode/factory/src/routes/config.ts:766-778`.
- Installed `@mastra/core`/`server` 1.71.0, fastify 1.5.15, pg 1.27.1, code-sdk 1.8.3, memory 1.32.1: server `dist/docs/references/docs-server-middleware.md:134-163`, `dist/server/handlers/agent-controller.js:1095-1107`; core `dist/agent-controller/agent-controller.d.ts:145-156`.
- Current Hub/contract/checkers at `0987494fb358b9c8491fae4476cbc16f05099393`, production identical to main `5efbc090c43176ca4e666688769d2a4ee09e1745`: admission/database/deletion/run/session files and catalog/role registers cited above; immutable migration history and current snapshot decide actual catalog facts.
- Guides C, D, S, A, H, T, L, P, V selected through `docs/development/review/areas.json`, `docs/roadmap.md`, `docs/development/delivery.md` Waves, decision register and product contract. Owning guide replacement sentences and units are in index.md; this spec task edits no product/guide content.
- Parallel spec consumer snapshots inspected by the study:0017 `9e66d5bc304438d94ed014affd8f072d8ccf3718`;0020 `674f534896c720d2364175323c02bcb88c5bb019`, `shape/dependencies.ts:1-45`. Their public admission consumption informs the preserved boundary, not their implementation or approval.
