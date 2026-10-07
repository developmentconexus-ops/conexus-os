# 0018. Rationale: one authorization model for Hub reads and commands

## Context

The original request asked that outsiders and unknown ids receive 404. Repeated review showed that changing a few refusal branches could not establish that outcome: only four of nineteen Hub reads called admission, other reads relied on policies or boolean facts, and commands and served reads had different boundaries. The approved study therefore examined the complete Hub authorization model rather than treating the request as a status-code patch.

The fresh census at main `83188b3a` agrees with the study baseline: 70 Database transaction sites, 19 reads with four admissions, 47 contracted operations and 33 functions taking raw transaction query interfaces. Twenty-seven absence-response candidates require classification; some are legitimate business child absence or authentication, not authorization. The AST reachability census has name/callback heuristics and cannot prove SQL isolation on its own.

The previous format's spec received a review that found two critical deletion defects. The implementation purges the Project before removing its Conexus Git repository, so an owner cannot reach admission to retry the failed removal. Its proposed early deletion unit also depended on reader policies that hide a deleting Project from non-administrators. The new spec fixes the lifecycle ordering and assigns target visibility only after row security is gone. It does not carry the old build parts forward as cards.

## Options considered

### Keep row security and make admission/policies agree

This retains a database backstop for a missed tenant predicate. It also retains two answers to visibility and two places that need coordinated evolution. The study found policies, transaction roles, scoped SQL, boolean facts and manual absence refusals in live paths. The operator rejected keeping that combined model. No compatibility policy layer is proposed.

### Remove policies but carry old role switches and raw read interfaces

This makes the database migration smaller and can preserve more old tests. It leaves naming and proof forms that no longer express the authority model, and a raw read callback can issue SQL before checking its actor. The operator explicitly rejected all legacy and compatibility, including names whose meaning exists only in the old model. The new read boundary is closed and the no-policy grant register replaces the split register and checker.

### Extend the existing write admission model to reads

A subject joined with membership is either visible or absent. A named action then decides a member's authority. Reads and commands use one owner, while PostgreSQL remains responsible for identity constraints, serialized command writes and read-only transactions. This matches Documenso's membership/action pattern, adapted to the Hub's existing 404/403 codes and its SQL runtime.

The cost is explicit: removing policies loses a second database tenant wall. A nominal proof does not prevent an admitted SQL author from omitting a predicate. The replacement must therefore include all-operation two-Workspace tests, positive controls, a fail-closed entry census and mutations that demonstrate missing filters/admission are detected. An abstract claim that “the types secure SQL” is insufficient.

### Hide a deleting Project or derive it from audit after early purge

Hiding the Project makes the UI simpler but removes the owner's retry affordance and conflicts with the operator's decision that it disappears only when the flow ends. Falling back to audit could restore that affordance, but creates a second live identity source and retains the early-purge ordering that caused the failure. Keeping the Project row until the external removals and final database transaction finish provides one identity source and a natural retry path.

## Decision and why

The operator's four approved study decisions are binding:

1. Row security leaves the Hub authorization model.
2. Deleting is a flow; the Project disappears only when it ends. A Workspace owner, not an installation administrator, finishes it. No deletion job is added.
3. Copy Documenso's model without inventing a competing access framework; extend the Hub's write gate to reads.
4. Remove all obsolete forms, functions and names, with no compatibility.

On 2026-10-07 the operator answered the remaining product question: **every Workspace member sees a deleting Project; only an owner can finish its deletion**. The planning session delivered that answer before the cards were written. There are no unanswered product questions.

The type shape retains the single proof owner's Run, System and Bootstrap variants. Spec 0017 consumes admitted Run/System proofs for credential rereads and refresh swaps; a person Account proof does not replace run ownership. Spec 0019 owns the failure/result representation. This wave names the refusal and its birth boundary while retaining today's Failure mechanism and existing catches. It introduces no helper/subclass/result type that would become a competing error-wave API.

Documenso is copied for membership-scoped lookup and named role permissions, not claimed as a verbatim copy of its SQL or every error. Some Documenso role predicates are part of `where` and return 404 when a member lacks a role. The Hub deliberately separates membership from the action cell and preserves role 403s required by its wire contract. Project unknown/outsider 404s are subject mappings, not an action's outsider column.

A no-policy migration is approved work, not authorization to change a shared cluster. The next migration audits exact relation/column/function/default ACLs and cluster role dependencies before removing anything. It replaces transaction roles with exact runtime grants; it preserves factory confinement, object ownership and integrity. The one live integrity function, `iam.lock_administrators`, remains because its owner can take a strong table lock without granting runtime broad table mutations. The spec requires an actual target-ACL proof of that need and treats a failed premise as a reason to return to the planning session.

Eight units fit the bounded inventory of 70 distinct product/check/configuration files and six owning documents plus the generated callers reference. U1 pins all entry outcomes on main. U2 first fixes the deletion driver while retaining existing authority; U3 then replaces command role/refusal authority; U4 closes all reads; U5 removes RLS and proves the filters with the target catalog; U6 exposes the discriminated deleting state already kept resumable by U2; U7 closes foreign route gaps and stale web rendering; U8 updates the owning guides and removes the temporary shape. A deleting UI is not promised in U3 or U4, where reader policies still exist. No unit requires a later unit's new type.

## Evidence

- The approved study's census and synthesis, operator notebook, server/platform reference comparisons and type/database experiments are held by the planning session outside the public repository. This rationale records their relevant findings without publishing input files, personal information, machine paths or company data.
- The census was rerun against `83188b3a`: 70 sites, 19 reads, four read admissions, 47 operation keys, 33 raw transaction helper functions. The committed actual catalog has 50 policies on 26 FORCE/RLS tables, four functions and no triggers. Counts of historical CREATE POLICY statements are not catalog counts.
- The type experiments showed that nominal proofs, id brands and mode-specific transactions catch forged/mismatched calls, but can be weakened by assertions or broad helper signatures. The temporary shape uses the existing branded ids and nominal proof pattern and includes independent expected compile errors; CI must police the imports that open gates.
- The database mutation experiment ran baseline isolation with and without row security and planted tenant-filter defects. With row security removed, many missing-filter mutants failed the intended assertions; two survived: a deletion-summary branch and a private model-account standing filter. Those survivors are not evidence of adequate coverage. U5 requires explicit private/shared/installation model canaries and deleting-summary coverage, and every named mutant must fail before the no-policy cut is accepted.
- The study's new-read timing experiment stopped on a fixture assertion (239 rows versus 240 expected) because the current reader policy hides a deleting Project. It produced no validated target read timing. No latency benefit or throughput claim is made. Historical role-switch overhead is not a measurement of the new read admission cost.
- A spec-stage PostgreSQL 17.10 experiment reproduced the registered administrator SELECT/INSERT/column-UPDATE grants on a disposable table without policies. Direct runtime SHARE ROW EXCLUSIVE lock failed with SQLSTATE 42501; the exact narrow SECURITY DEFINER body succeeded. This proves the privilege premise for retaining `iam.lock_administrators`, not the full migration or concurrent bootstrap proof. The scratch log is held privately by the planning session, and the disposable container was stopped.
- The first compiled shape is `99588f7f`; strict TypeScript and `npm run verify:quick` passed before it was published. Published shape `b8d6f9ec` preserves Run/System/Bootstrap, bound Authentication and role-free served producers plus deletion lost signals and thumbnail etag metadata; strict TypeScript passed. The initial 16 negative examples were verified independently; final compiled/published shape `6bb7a6f6` adds two read-action negatives and explicit driver/list/card signatures. All 18 expected-error annotations removed in memory produced exactly 18 diagnostics on 18 distinct lines and zero elsewhere; strict TypeScript, verify:quick and verify:docs passed again. `npm run verify:quick` and `npm run verify:docs` both passed. This is shape/check evidence, not proof of unbuilt product behavior.

### Earlier review, rechecked against main

Every finding from the previous format's Sonnet review is answered here and in the corresponding index design/card. These answers describe required build outcomes, not fixes already made to product code.

| Finding | Current code/evidence and resolution |
| --- | --- |
| 1. Purge removes Project before failed repository deletion | Still present in `project/deletion.ts:65-105`. U2 keeps the Project, removes the Conexus Git repository first, then atomically purges/completes; U3 then changes its actor to owner. Fault each port and purge statement; retry under current owner authority. The earlier review's GitHub/network description was inaccurate: the live port uses the local Conexus Git removal. |
| 2. Early deleting visibility while policies still hide it | Reader policy in migration 0065 still hides it. U4 explicitly retains this intermediate limitation. U5 removes the policy before U6's member-visible state/contract/UI promise, eliminating the order contradiction. |
| 3. Migration/function/grant/dependency/count/runner omissions | Functions for served reads, application checks, purge and repository registration are already deleted in 0067–0070. Four functions remain; the index gives each a verdict. Exact ACL union includes reader-only SELECT, column sets and lock EXECUTE. The current count is 50/26. Audit every grantee/default ACL/cluster dependency and explicitly remove obsolete roles. Replace runner's helper-existence guard with unconditional target invariants and adapt all named PostgreSQL tests. |
| 4. One-statement lookup discards command locks | Current account/membership/Project/owner-set choreography is retained. Reads have ordered lock-free admission; commands are not constrained to one statement and recheck after lock waits. Two-session build/delete and last-owner/admin races are required. |
| 5. Concurrent delete drivers | Current flow can overlap. U6 uses existing session advisory-lock primitive per Project and existing `PROJECT_BUSY`; re-admit owner under lock. Connection loss aborts subsequent effects, while already-started idempotent removal may finish safely. No job or progress lease is invented. |
| 6. Lists/cards/Builder/deleting wire shape unspecified | Operator answered all-member visibility. U6 replaces detail/list/summary live-only contracts with live/deleting unions and no fake revision; only owner retries. Deleting409 refreshes state. No step/progress field is added. |
| 7. Account/deleting failures and run reason undeclared | API table assigns `ACCOUNT_NOT_FOUND`/`ACCOUNT_INACTIVE` to every Account-admitted operation and `PROJECT_DELETING` to affected actions. Central private reasons do not become public codes. Keep `BUILDER_RUN_NOT_ADMITTED` and existing catches; generated failure/OpenAPI artifacts move with callers. |
| 8. Secondary params do not have the same outsider rule | AC-1 explicitly limits subject parity to Workspace/Project ids. The parser retains child-specific malformed codes; after parent admission child absence uses its own 404. Unknown well-formed parent vs outsider parent share subject404. |
| 9. No mutation/census falsification proof | Completed mutation evidence includes survivors; U5 must kill every retained target mutant with positive controls. U1 builds repository-owned symbol/entry census with missing/aliased/ambiguous callback fixtures and fail-closed operation/route coverage. The study's heuristic script is not copied. Authentication and named job/Checked/Run boundaries are explicit exceptions. |
| 10. Credential location and Checked read backstop wrong | Live sensitive SELECTs are in `connectors/store.ts:112,234`, not broker. Check/consumer helpers are allowlisted and wire ciphertext is forbidden. Checked's view only limits methods, not SQL side effects; retain the approved 5B tradeoff with one exact integrity-function allowance. Person reads have PostgreSQL READ ONLY. |
| 11. Tenure read has no reader grant | Obsolete at current main: migration 0070 grants reader SELECT on `iam.installation_administrator`. Only Account.active needs U4's explicit read migration. No temporary function wrapper is kept. |
| 12. New isRefusal violates C and forges identity | No isRefusal, subclass or result mechanism in this wave. Existing Failure/catches stay under the explicit boundary with parallel error wave 0019. Their future representation is not designed here. |
| 13. Single statement vs ordered admission conflict | Neither read nor command has a one-statement requirement. Account precedes membership; absent subject/membership share public404. Private reason probes are scoped and do not return data. Commands preserve locking and rereads. |
| 14. Documenso role403 claim overstates copy | Index reference table discloses role-in-where 404 versus Hub role-cell403 adaptation and explains the contract reason. The shape is Hub's mapping of Documenso's action permission catalogue. |
| 15. Foreign mount/session/admin/connector details missing | U7 removes undefined-resource bypass, admits every allowed route, strictly checks thread resource including absent resource, and preserves native Mastra handling otherwise. Session flag is separate Account-admitted data. Connection administrator existence disclosure is explicit. U6 closes Project sessions/streams on deletion; no instantaneous revocation promise for existing streams. |
| 16. Run role guard/catches/cluster/count nits | Keep current action check in admitRun and all error-wave catch callers, including model-account inactive/missing paths. AC-9 says Hub database, never Applications cluster. Counts distinguish 15 unadmitted reads from all transaction exemptions. |

### Spec-stage adversarial review

The spec was submitted independently to Opus and Sonnet with the same intent, rubric and code-quality lens. Sonnet's eleven finding groups are resolved below; Opus's fourteen finding groups are resolved below. Product implementation and its mutation/catalog/browser proofs are obligations of the approved units, not claims of this spec stage.

## References

- Documenso commit `cd0cc5f`: `packages/lib/server-only/team/get-team.ts:38-73`, `packages/lib/constants/teams.ts:31-34`, `packages/lib/utils/teams.ts:140-171`, `packages/lib/server-only/envelope/get-envelope-by-id.ts:128-140`, `packages/lib/jobs/definitions/internal/bulk-send-template.handler.ts:1-90`, `packages/trpc/server/trpc.ts:151,304-359`, team member handlers and envelope update transaction boundaries.
- Better Auth commit `0e1a9c8`: organization middleware and admin routes for disabled-user and distinct administrator checks, as recorded in the approved comparison. Their middleware shape is reference evidence, not a new Hub plugin.
- Study comparisons with PostgREST, Supabase, Basejump, cal.com and platform-native identity routes: explain tradeoffs and missing upstream no-policy migration precedent. The cal.com reference clone did not provide a complete current implementation proof; it does not carry a design premise here.
- Installed Mastra server's embedded middleware documentation and `dist/server/handlers/agent-controller.js:1079-1107`, plus the Hub allowed-route mount. Native Fastify hooks and strict resource/thread admission are used without dependency changes.
- Hub main `83188b3a`: `identity-access/admission.ts`, `platform/db.ts`, `project/deletion.ts`, `builder/conexus-git.ts`, `registry/served.ts`, `connectors/store.ts`, `builder/mastra-session-routes.ts`, migration history 0065–0070, actual catalog/role/privilege registers and migration runner.
- Approved study synthesis/notebook, entry/why/server/platform reports, old-format spec commit `1e31adde` and its Sonnet review, type and database mutation experiments; all retained privately by the planning session. The superseded outsider-only spec contributes no new template or authority.
- Guide C, D, S, A, H, T, L, P and V, selected through areas.json. New owning rule sentences and guide-edit unit are in index.md; this spec stage does not edit guides or product code.

### Current-format Sonnet review disposition

| Finding | Judgment and required change |
| --- | --- |
| 1. Incomplete file cap | Accepted. Added shell state narrowing, Builder rendering, existing census dependency, catalog generator/checker, composition and contract ownership. Preserve AuthenticationGate callers without edits to authentication.ts/sign-in/preview-session. Inventory is 70 distinct product paths including both lint rename paths; stop before adding another. |
| 2. Duplicate census | Accepted. Extend census-boundaries.mjs, preserve its symbol resolution/gate-opener rule, remove register.split and obsolete write lint in U5. No second AST scanner. |
| 3. Missing retained proof producers | Accepted. Shape now declares AuthenticationGate Account/application overloads, Checked producers and configured Bootstrap. Checked Project scope remains a role-free served view, separate from role-bearing person admission. Usage exercises bound authentication. |
| 4. Stranded historical deletions | Accepted as an upgrade hazard. U3 preflight refuses open purged/missing-Project records before authority/fallback removal. Planning session must decide any real one-off cleanup; no silent orphan, compatibility restoration or accepted loss. Normal flow proves failures never create that state. |
| 5. Port signal/wiring/kill result | Accepted. Shape ports receive lost signal; U2 names hub.ts and complete-input-versus-returned-id comparison. Best-effort idle cleanup remains unchanged. |
| 6. Catch consumers | Accepted. Refusal-consumer table distinguishes person Project404/409 from executor claim BUILDER_RUN_NOT_ADMITTED and updates the set in U3 before deleting its old code in U7; revocation/tombstone pins required. |
| 7. Connection malformed mismatch | Accepted. Every connection workspaceId cell uses WORKSPACE_NOT_FOUND/404; well-formed non-admin inputs retain administrator403. Named child absence stays child404. |
| 8. Fictitious reference-data migration/stored codes | Accepted. No failure-reference table exists. Migrations normalize retired persisted run codes like 0053; U7 adds its own approved normalization migration and seeded parse proof. JSON/generation declares PROJECT_DELETING. |
| 9. Text/action meaning | Accepted. Exact texts for missing Account and four owner-only cells use existing NONE/ASK_CHANGE vocabulary; no new action or error type. |
| 10. SELECT union loses column wall | Accepted. Table-wide command SELECT dominates restricted reader SELECT on connector/account. Spec states the loss explicitly and requires projection violations plus ciphertext/session wire canaries; READ ONLY is not confidentiality. |
| 11a. Revision negative test | Accepted. A valid branded ProjectRevision now tests the deleting state itself. All expected errors are independently checked. |
| 11b. Thumbnail metadata | Accepted. Shape retains artifactRevisionId plus bytes for etag. |
| 11c. Shape commit evidence | Accepted. First published commit is historical evidence; final compiled shape commit is named separately. |
| 11d. Mastra gap precision | Accepted. Existing sessionless routes already check mayBuild; undefined-resource return is defensive for current paths. Actual missing strict thread/resource comparison drives U7. |
| 11e. Private decision shorthand | Accepted. Served Checked meaning is defined in the public spec; builders need no private study to interpret it. |

### Current-format Opus review disposition

| Finding | Lead judgment / resolution |
| --- | --- |
| 1. Inventory cap | Act on; consensus with Sonnet. All certain paths are included. Added conversation.ts for the no-recreation fix; removed unchanged receipt.ts. Existing census-boundaries.json replaces an unnecessary package.json edit because the verification command already exists. 69 product entries plus the second rename path equals 70 distinct paths. workspace/module.ts keeps its public AccountId port and invokes the admitted store internally; authentication callers retain their gate API. Generated callers are documents, not another product mechanism. Stop before a 71st product path. |
| 2. Owner switch strands new failures | Act on; critical sequencing finding. New U2 fixes order, finalization, session lock and session sealing using existing administrator admission. U3 changes the authority only after the retry pin is safe. U6 handles member-visible wire/UI after U5 removes policies. Eight units, each green without future types. Historical stranded rows still require preflight refusal and planning decision. |
| 3. Cluster-global role removal | Act on topology, dismiss claimed default parallel verification: current conexus-verify.mjs already runs postgres tests with --test-concurrency=1. Require one live replay DB on an isolated cluster, teardown/dependency assertions and no concurrent history replay. A shared developer cluster with dependencies is intentionally refused; no DROP OWNED/CASCADE or shared administration. Suggested 0070 guarded retention conflicts with the operator no-legacy target and is rejected. |
| 4. Catch verdicts | Act on; consensus. Consumer table classifies all named catch paths, retains authentication outcomes, adds Project404/409 to the typed claim/model set, removes source404-to-false and wrapper catches, and preserves broker empty/null with deleting refusal. |
| 5. Empty failure migrations | Act on the factual correction; consensus. No reference table. Migrations instead normalize actually persisted retired codes as 0053 does, and U3 performs stranded-upgrade preflight. Seeded run-summary parse tests make their content concrete. |
| 6. Secret-column wall | Act on; expands Sonnet finding. Register and exact symbol-use/mutant checks cover every secret/sealed/token column including model secret and host refresh/digest, with wire canaries. Explicitly accept table-wide SELECT union as code-enforced projections. |
| 7. Read/administrator proof types | Act on. Closed read actions exclude command-only owner edits/create/delete; owner rows are write-mode only; administrator result narrows by action. Bound Authentication overload retained. Negative examples reject read deletion/owner management. |
| 8. Missing deletion/list/card shape | Act on. Separate detail/list/card states preserve each current wire identity; deletion.ts compiles driver, SQL key, private finalizer, purge ports and session seal/open boundary; ports carry lost signal. |
| 9. Deleting credential consumption | Act on. Builder/Preview broker uses project.build, preserving member access but refusing tombstone409; broker treats this as no binding/credential. Application Checked keeps its existing live grant/membership condition. U3 negative credential test required. No new action invented. |
| 10. Session recreation race | Act on. U2 Project session owner serializes opening against durable begin/seal, rejects publication after seal, and tears down every prior open. U7 HTTP barrier tests admitted-before-begin requests. Restart relies on durable tombstone admission, not an in-memory authorization substitute. |
| 11. Duplicate mechanisms | Act on; census consensus. Extend existing census. Replace SHA derivation with application-access.ts:35 hashtextextended SQL pattern; no extra raw SQL session gate. |
| 12. Generated artifacts in wrong card | Act on. Every migration card regenerates catalog snapshot; U5 regenerates function-callers, never hand edits it. Remove from final guide-edit list. |
| 13. Gated areas | Act on. U3/U4/U7 explicitly needs:aprovo for identity/Mastra changes, as well as their migration gates. |
| 14a. Account meaning | Act on; consensus. General missing-account text and existing NONE action fit actor/target; no new Failure type. |
| 14b. Connection malformed cells | Act on; consensus. All four operations' workspaceId cells are subject404, not child codes. |
| 14c. Subject map owner | Act on; consensus. Contract operation owner only; admission consumes it. |
| 14d. Dead purged variant/debt | Act on. U4 deletes ProjectPurged and web empty-revision branch with fallback producer; resolved A §11 debt rows leave in their owning U4/U5 units. Other target guide edits remain U8. |
| 14e. Concurrent finalization | Act on. An already-admitted internal finalizer observing completed audit returns success without purges; a fresh public call still gets Project404. Barrier/rollback proof belongs to U2. |

The review agreement is strongest on inventory coverage, refusal consumers, retained Authentication producers, sensitive SELECT exposure and generated artifacts. Opus additionally exposed the intermediate deletion regression and session recreation race; both changed the unit/design boundaries. No finding is left pending. These are resolved spec obligations, not claims that product behavior was implemented.
