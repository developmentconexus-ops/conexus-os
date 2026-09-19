# Foundation review plan

The Product is one path: sign in, create a Workspace and a Project, connect a model account, pick a model, send a request, watch activity, use Preview. This plan makes the repository say only that. It subtracts first and redesigns second. Subtraction removes dead code, Project Inception and Baseline, and Brain, bindings, Sankhya and the gateway. Redesign replaces three disjoint grant surfaces with one Workspace membership so a second person can join, and lets a model connection be an Anthropic account, an API key for any provider Mastra routes, and later a ChatGPT account, without a Conexus model abstraction.

The operator decided the scope on 2026-09-19. Inception and Baseline may be deleted. Brain, bindings and Sankhya come out now and return only as future features on a solid base. Multi-account is wanted now, at the minimum that is correct. Model selection stays Mastra-native; Conexus adds only credential custody and sign-in.

## How to read this

One box is one unit of work and names the evidence that checks it. Check a box only when the evidence exists. The live bar is the one `docs/roadmap.md` set on 2026-09-18: a lane earns its cost only on the operator's pilot database, a running Hub, or a browser holding a real session. CI proves the rest. The boot recipe, PR mechanics and verdict rules are those of `docs/tasks/credential-and-role-remediation.md` and are not repeated here.

The operator authorized the coordinator to merge on 2026-09-19. A PR merges only behind a passing verdict from an agent that did not write it, posted on the PR, at the head that merges. Every PR opens ready.

## Order

This table is what happened, not what was proposed. A-02 executed as two units. Every row that says merged names the PR and the commit on `analysis/internal-mvp-2026-09-12`.

| Id | What | Migration | PR | Merged as |
|---|---|---|---|---|
| F-00 | Reopen the roadmap grant | none | #86 | with the plan |
| F-01 | Delete dead code | none | #88, #93, #94 | `ba0d93b3`, `84c8e697`, `67cbf491` |
| F-02 | Name the r1 suites by what they prove and admit them to CI | none | #91 | `541de8f2` |
| F-03 | Drop the Builder functions migration 038 orphaned | 051 | #90 | `1f95487e` |
| F-04 | Move shared code out of `project/`; free Builder boot from Inception | none | #87, #101 | `b162fc5c`, `793014a2` |
| F-05 | Remove Inception, Baseline and refinement | none | #89 | `55c3deb6` |
| F-06 | Remove Brain, bindings, Sankhya and the gateway | none | #98 | `4997162a` |
| A-01 | Membership authority, additive | 052 | #92 | `ebbf2052` |
| A-02a | Switch every caller, then excise the grant surfaces | 053 | #103 | `bc661fdb` |
| A-02b | A second person can join a Workspace | 054 | #102 | `aca7f108` |
| F-07 | Drop the Inception and R2 functions, tables and schemas | 055 | #105 | `c767732b` |
| M-01 | Provider-neutral model connections and API keys | 056, 057 | #106 | open, not merged |
| M-02 | ChatGPT account sign-in | none expected | none | not started |

F-07 waited for A-02 on purpose. Migration 049 writes five R2 capability columns inside `iam.establish_project_creator_grant`, so those columns could not drop while that function lived. A-02a deleted the function and the tables that hold the columns.

A-02 was one row in the proposal and two PRs in execution. #103 switched every caller to the membership authority and excised the grant surfaces in 053. #102 added the invitation admission path, the Membros page and the OIDC claim in 054, which is the migration this table did not originally have. F-07 therefore became 055 and M-01 became 056.

The remediation stack, R-03A through R-05, merged to trunk on 2026-09-19, so every base that named one of its branches now reads trunk.

F-04 did not land in one PR. #87 delivered its first box, the move of `anthropic-oauth.ts`, `anthropic-oauth-provider.ts`, `oauth-token-store.ts`, `bounded-provider-fetch.ts` and the model catalog reader into `apps/hub/src/model-connection/`. The OCI Git unification and the single source-revision truth landed later as #101. The file references in the F-04 section below predate both.

This table had an F-08 until 2026-09-19. F-08 was a second migration only because nobody knew whether the tables it dropped held rows. The count below proves they hold none, so F-07 is one migration.

## The pilot count of 2026-09-19

The operator authorized one read-only count against the pilot with the root credential, and it ran that day. It decides two things this plan had left to a later gate. Every table F-07 drops is empty, and every grant table A-02 drops holds exactly one row per Project, which is what a derived creator grant looks like.

| Table | Rows |
|---|---|
| `iam.account` | 1 |
| `workspace.workspace` | 1 |
| `project.project` | 22 |
| `iam.account_project_grant` | 22 |
| `iam.project_builder_grant` | 22 |
| `builder.builder_run` | 23 |
| `claude_connection.connection` | 1 |
| `claude_connection.binding` | 1 |

Zero rows in every `brn.*` table, every `con.*` table, and in `project.baseline_approval`, `project.baseline_candidate`, `project.baseline_state`, `project.binding_source_intent`, `project.brain_binding`, `project.connection_binding` and `project.inception_idempotency`.

On the same day, asked about dropping those objects, the operator said "você roda e deleta o que precisar". That is the operator's word A-02's third box asked for, and it is also what F-07 needed once F-08 merged into it. Neither unit waits on a further approval. Both still assert emptiness in the migration and abort otherwise, because the count is a reading from one day and the migration runs on another.

## Work added during execution

None of this was in the plan. Each line is one PR and what it did.

- Sweeps S1 to S10 removed what the units above left behind. S1 deleted the R3 gates, the orphan MAR admission and `pg-boss` (#93, `84c8e697`). S2 deleted unreachable npm scripts that were red on trunk (#94, `67cbf491`). S3 closed five verifier follow-ups on the role register, the census and the migrations (#96, `35642050`). S6 unified the three OCI Git implementations and the two source-revision truths (#101, `793014a2`). S7 made the import law green (#100, `6ac6db76`). S8 deleted unreachable Product contract surfaces and their gates (#95, `fa8b5c8e`). S10 made the wire bijection absolute and fixed five IAM defects (#107, `d71c410e`).
- The test census deleted dead repository and implementation tests and admitted the survivors to `CANDIDATE_GRAPH`, so they cannot rot outside CI again (#97, `4cf37580`).
- The R1 apparatus deletion removed the generation and custody machinery, 8934 lines, after proving production never read it from disk (#104, `ca80664a`).
- The import-law fix moved the Hub role register into the platform layer it serves (#100, `6ac6db76`).
- The project-browser test fix re-admitted the suite and made it assert that Project create lands on the Builder rather than on the retired detail heading (#99, `ece85db7`).

## Tests serve the product

The operator stated the rule on 2026-09-19. Tests, fixtures, gates and custody pins serve the product. They never hold it in a worse shape. Build the correct shape first, then fix every test that exercised real behaviour and delete every test whose subject is gone.

It changed a decision three times.

The `role` column default in 052. A-01 kept `role` with a standing default so about thirty test fixtures that insert into `iam.workspace_membership` without naming it would keep passing. The verifier's census found that no real writer relied on the default: the only product writer is `iam.establish_workspace_creator_access`, which names `'owner'` explicitly. The default existed for fixtures alone. It was dropped, and the column is now `NOT NULL` with no default, so a future writer that forgets the column fails closed instead of silently minting the weaker role.

The R3 and MAR admission code kept alive by a test. F-01 found `apps/hub/src/mar/admission.ts` had no application importer but could not delete it, because `tests/implementation/r3-mar-admission.test.mjs` asserted against its source text and `npm run r3:p2p3:check` ran that test. A passing check was the only thing keeping dead code in the product. #93 deleted the gates, the tests and the `pg-boss` dependency together with the file.

The generation chain. #104 deleted the R1 generation and custody apparatus rather than repairing its pins. The custody manifest had already moved from one fault to four, and the qualification programs it fed proved nothing about the current product. The apparatus went; the four generated files it used to justify were refreshed from the generators that survive.

## What the independent verifiers caught

The verification bar costs a full independent pass per PR. This is what it bought. Every row is a defect found before merge, by an agent that did not write the change.

| PR | What the verifier found | How it was fixed |
|---|---|---|
| #79 | Three checked boxes stated things the PRs they described did not hold: a script name that never existed, a merge that had not happened, and a CI gate that was not added. | The three boxes were corrected to the artifacts' actual state, one line each. |
| #88 | The "only caller" claim was false. The quoted grep excluded `qualification/`, which held a live importer of the deleted script. CI had also never run at the head, because the branch conflicted with trunk. | The unreachable importer was deleted with the script, and trunk was merged so CI ran at the real head. |
| #85 | The plan carried a superseded copy of the remediation document whose acceptance criterion would have had an implementer delete the Preview-serving MAR module. | Trunk's corrected version was taken whole, restoring the Preview carve-out. |
| #89 | The ledger was not touched at all, so the claimed 39 to 34 operation count was false and ten tests still asserted the removed operations existed. | The ledger, the generated artifacts and the tests were brought in line; `wire:bijection` then reported 34 on both sides. |
| #98 | A conflict resolution resurrected three authority-matrix rows for operations #89 had removed, and the generated S3 contracts were not regenerated after the OAS changed, turning a gate red on trunk. | The three rows were deleted and the two generated files regenerated. |
| #92 | The one replaced function was diffed against a superseded parent, so it silently dropped four capability columns and every new Workspace creator lost Brain read of their own Workspace. | The replacement was rebuilt from the installed body, proven against the catalog rather than against the migration history. |
| #103 | All six functions 053 creates were executable by PUBLIC, where their predecessors were not: `hub_s2_read` could create a Workspace and `hub_prj03_command` could enumerate any account's Projects. A wire gate the PR claimed to have fixed still passed on a planted fault. | The PUBLIC grants were revoked and a runner invariant now refuses any PUBLIC-executable function from 053 onward. The gate was made absolute in #107. |
| #104 | The pinned `expectedSourceRevision` was not what Git produces for that tree, so creating a new greenfield Project refused at head and succeeded at the merge base. CI missed it because the admitted step mocks the OCI calls. | The pin was corrected to the recomputed value and a test now recomputes it, failing loudly if the commit message ever stops matching. |
| #93 | A verdict of FAIL on the ground that `apps/hub/src/server.ts` was not byte-identical to base. | Refuted. The three-dot diff `base...head` for that path is empty; the 55 lines were trunk's own changes from #81 and #87, seen because the comparison used a base older than the merge base. The verdict stands as PASS. |

## F-00. Reopen the roadmap grant

`docs/roadmap.md` said no new providers and no API-key fallback. `docs/tasks/builder-interactive-delivery.md` repeated it. The operator reversed both on 2026-09-19. This unit is documentation only and changes no code.

- [x] Record the four decisions above in `docs/roadmap.md` with their date, and replace "No new providers" with the grant M-01 and M-02 need. Evidence: the diff.
- [x] Keep the honesty rule unchanged in meaning. Operator consent is not provider endorsement, and a provider refusal is never evaded. Evidence: both sentences survive the diff, in the roadmap and in the interactive-delivery task.
- [x] Point the roadmap at this file as the task after the remediation. Evidence: the diff of the header and of `docs/index.md`.
- [x] Amend this plan with the three facts learned on 2026-09-19. They are the pilot count, the merge of F-08 into F-07, and the decision on `claim_*` and `settle_*`. Evidence: the diff.

## F-01. Delete dead code

- [x] Delete `scripts/check-r3-candidate-freeze.mjs`, `scripts/record-r1-candidate-custody.mjs`, `scripts/check-r1-a0-migration.mjs` and their npm scripts. Each already fails on trunk (`BASE_DRIFT`, `RC01_UNKNOWN_CLASSIFICATION:.gitignore`, `A0_UNCLASSIFIED_PATH`). Evidence: #88 (`ba0d93b3`) deleted the freeze and A0 scripts with their orphaned consumers, each failure reproduced first. `record-r1-candidate-custody.mjs` was found alive in #88, because its `--check` mode passed and three tests exercised it, and it went with the rest of the R1 custody apparatus in #104 (`ca80664a`).
- [x] Delete `apps/hub/src/mar/admission.ts` and the `pg-boss` dependency if no import remains. Evidence: `git grep pg-boss` empty, typecheck green. Done 2026-09-19: also deleted the R3 gates (`r3:p2p3:check`, `tests/implementation/r3-mar-admission.test.mjs`, `tests/implementation/r3-project-read-model.test.mjs`) and the `pg-boss` qualification programs that kept these alive.
- [x] Remove the `indexOf` no-op at `scripts/run-hub-migrations.mjs:25`. Evidence: #88 (`ba0d93b3`); the statement looked up a name the array never held, so it assigned to index `-1`.
- [x] Census the npm scripts against `CANDIDATE_GRAPH` and delete every script nothing runs and no document names. Evidence: #94 (`67cbf491`), which deleted the unreachable scripts that were red on trunk.

## F-02. Name the r1 suites by what they prove

The parked work on `remediation/r06-r1-postgres-suites` is the starting point. The rule at `tests/repository/conexus-verify.test.mjs:138-140` forbids a CI scope named after a program phase, and the rule is right.

- [x] Rename to `identity-access-postgres`, `workspace-postgres`, `project-postgres`, files and scope. Evidence: #91 (`541de8f2`). The third suite is named `project-postgres`, not `project-create-postgres`.
- [x] Admit the scope to `CANDIDATE_GRAPH`. Evidence: #91 admitted them as the `foundation-postgres` scope, and every later verdict runs them green in CI.

## F-03. Drop the orphaned Builder functions (051)

Migration 038 dropped tables and left their functions. Forty-one `builder.*` functions are alive, the Hub calls eighteen, two Builder tables remain.

- [x] List every `builder.*` function in `contracts/technical/hub-catalog-snapshot.json` that neither `apps/hub/src/builder/*.ts` nor a surviving function body calls. Evidence: #90 (`1f95487e`), the list in its body.
- [x] Write `051_builder_orphan_function_excision.sql` in the shape of 038, dropping exactly that list, plus `iam.admit_project_review`. Evidence: #90; the file is `apps/hub/migrations/051_builder_orphan_function_excision.sql` on trunk.
- [x] Regenerate the catalog snapshot. Evidence: `npm run db:catalog:check` reported `CURRENT` at every later head, through 055.
- [ ] Live: dry-run 051 against a copy of the pilot's schema. The pilot ledger head is still 050, read read-only on 2026-09-19, so 051 has not been applied to it. It applies on the next Hub start with 052 through 055.

## F-04. Move shared code out of `project/`

`project/` held what the Builder needs from Anthropic, and Builder boot validated the Inception credential file. The line numbers this section used to cite pointed past the end of `project/module.ts` and named unrelated code; the Inception capability gate they meant was `requiredCapabilities: ['PROJECT_INCEPTION', 'BASELINE_EXPLANATION']` with the Inception pool below it. Both are gone with F-05, so there is nothing left to cite.

- [x] Move `anthropic-oauth.ts`, `anthropic-oauth-provider.ts`, `oauth-token-store.ts` and `bounded-provider-fetch.ts` to `apps/hub/src/model-connection/`. Move the model catalog reader with them. Evidence: #87 (`b162fc5c`); all five files are under `apps/hub/src/model-connection/` on trunk and the old copies are gone.
- [x] Keep one OCI Git implementation of the three and point the Builder at it. Evidence: #101 (`793014a2`), which put the one mechanism in `apps/hub/src/platform/oci-git.ts`. The verifier recorded the real container argv for every caller shape and found no flag lost, no mount widened and no cap raised.
- [x] Resolve the two source-revision truths to the one the Builder reads. Evidence: #101. The Hub re-read is now the only authority; the sandbox value is a claim that is compared and never recorded.
- [x] Remove the Inception credential from Hub boot. Evidence: `apps/hub/src/platform/config.ts` refuses `CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE` with `RETIRED_CONFIG_<name>`, so the Hub cannot start while the operator still sets it. The live half, a Builder run after the operator clears the variable, is owed at the next Hub start.

## F-05. Remove Inception and Baseline from the application

- [x] Delete routes, stores, web features and tests for PRJ-07, PRJ-08, PRJ-09, PRJ-23, PRJ-24, and `createOAuthTokenStore`, the local-file variant only that path used. Evidence: #89 (`55c3deb6`), 78 files, 4699 deletions. The whole-tree grep for the five ids returns only this plan and the migrations.
- [x] Edit the contract and `docs/product/operation-ledger.md` in the same commit, because `wire:bijection` gates on an exact count. Evidence: the first attempt did not, which is why the verifier failed it; the merged head reports 34 fixed operations on both sides.
- [x] Update `check-wire-carriers.mjs` and `check-qualification-provenance.mjs` pins. Evidence: both green at the merged head.
- [ ] Live: sign in, create a Project, run the Builder, open Preview. Not done. The pilot is still at migration 050, so no live lane on this trunk has run.

## F-06. Remove Brain, bindings, Sankhya and the gateway from the application

- [x] Delete `apps/hub/src/brain/`, `connections/`, the binding half of `project/`, the gateway, their web features, contract paths (BRN-*, CON-*, PRJ-10..15) and tests. Evidence: #98 (`4997162a`), 145 files, 28632 deletions. Fourteen operations left the census, exactly `BRN-01/02/03/10/14` and `CON-01..09`.
- [x] Remove the Brain and Integrations links from `apps/web/src/app/shell.tsx`. Evidence: #98; the nine remaining links are all still registered in `router.tsx`, and the web typecheck and build pass.
- [x] Keep what the model connection uses: `platform/credential-backend.ts`, `reg.artifact`, and the login role the connection pool authenticates as. Rename that role's register entry from `hub_r2_connections` only in M-01. Evidence: #98; `claude-account/module.ts` still opens its pool as `hub_r2_connections`, and the register still carries it.
- [x] Stop mounting Sankhya as a side effect of the Claude configuration. Evidence: #98; the gateway no longer mounts and no CON route is registered.
- [x] Regenerate the role register and drop the pools no module opens. Evidence: #98 took the register from twelve roles to eight, and `npm run db:roles:check` passes.

## A-01. Membership authority, additive (052)

The design is in the appendix. Old gates keep working until A-02.

- [x] Precondition probe: confirm the pilot realm puts `email_verified` in the ID token, read from a real sign-in. Evidence: the claim is read from the validated ID token in `oidc.ts`, and #102's verifier confirmed it is checked as a strict boolean. The bearer-link fallback was not needed.
- [x] Create `iam.workspace_role`, `iam.action`, `workspace_membership.role` (existing rows become `owner`), `iam.workspace_invitation`, `bootstrap_context.verified_email`. Evidence: #92 (`ebbf2052`), migration 052. `role` ships `NOT NULL` with no default, which is stricter than this box proposed.
- [x] Create `iam.role_allows`, `iam.admit_workspace`, `iam.admit_project`, `iam.visible_workspaces`, `iam.visible_projects`, and the member operations `list_workspace_roster`, `invite_workspace_member`, `cancel_workspace_invitation`, `set_workspace_member_role`, `remove_workspace_member`, `claim_invitations`. Evidence: #92; twelve functions, all `SECURITY DEFINER`, none executable by PUBLIC.
- [x] Assert in the migration that no account loses access and none gains it. Abort otherwise, naming the pairs. Evidence: #92's verifier reproduced both aborts by name on a pilot-shaped fixture, `MIGRATION_052_GRANT_WITHOUT_MEMBERSHIP_REFUSED` and `MIGRATION_052_WORKSPACE_MULTIPLE_MEMBERSHIPS_REFUSED`, each leaving nothing behind.
- [x] Database test: the role-by-action matrix; an inactive account fails all four gates; `remove_workspace_member` blocks behind an open transaction that called `admit_project`; the last owner cannot be removed or demoted; two owners demoting each other do not deadlock. Evidence: `tests/implementation/membership-authority-postgres.test.mjs`, 12 cases, in `CANDIDATE_GRAPH`. The verifier ran twenty rounds of mutual demotion with zero deadlocks.
- [x] Live: run 052 against a copy of the pilot's schema and data. Evidence: #92's verifier staged a pilot-shaped database at 050 and applied 051 and 052 in one runner invocation. Both assertions passed, the membership backfilled to `owner` with every capability column unchanged, and all 22 Projects and both grant tables survived. This is a copy, not the pilot itself, which is still at 050.

## A-02. Switch every caller, then excise (053 and 054)

This unit shipped as two PRs. #103 is A-02a, the caller switch and the excision in 053. #102 is A-02b, the invitation admission path, the Membros page and the OIDC claim in 054.

- [x] Re-issue every `project.*`, `builder.*` and `claude_connection.*` function so its gate is inside its own body: effects call `admit_*`, reads join `visible_*`. Functions that took an admitted-id array are recreated taking `p_account_id`. Evidence: `git grep "iam\." apps/hub/src` matches only `identity-access/`.
- [x] Replace `claude_connection.binding` with `workspace_share(connection_id, workspace_id)`, backfilled from live `USER` bindings. Owner use needs no row. Evidence: #103; `claude_connection.workspace_share` is present at 053 and `binding` is gone.
- [x] Drop `iam.account_project_grant`, `iam.project_builder_grant`, `claude_connection.binding`, the membership capability columns, and the eleven old admission functions including `ensure_project_builder_grant`. Revoke `SELECT` on `iam` tables from `project_owner` and `model_connection_owner`. These tables hold only derived creator grants and self-bindings. A-01's assertion proves it, and the count of 2026-09-19 shows 22 rows in each grant table against 22 Projects and one connection binding against one connection. The operator gave the word that day, in the sentence quoted above. Quote it again in the PR and keep the migration's own assertion. Evidence: #103; at 053 no function in the six schemas names a dropped table, column or admission function, and no non-`iam` owner holds a grant on any `iam` table.
- [x] Hub: `identity-access/current-session.ts` exports the one `CurrentSession`; every module-local alias is deleted. `identity-access/membership.ts` holds the store and IAM-04, IAM-05, IAM-06, IAM-10. The OIDC callback claims invitations. IAM-03's operator branch and WS-01's operator check are deleted. Evidence: #102; `provisionByOperator` and `isOperator` have no match anywhere in the tree, and `r1:s2:import-law` passes with the session contract pinned to that one file.
- [x] A run whose author lost access mid-run stops at its next claim and keeps what it already did. `claim_*` calls `admit_*` and refuses, because a claim asks for new authority. `settle_*` does not gate on membership, because it records work the run already performed and a refusal there would leave a run that ran and cannot say so. Evidence: a database test that removes the member between a claim and its settle, and asserts the settle row exists and the next claim raises.
- [x] The Builder worker treats SQLSTATE `42501` as terminal for the run. Evidence: #103.
- [x] Web: Workspace > Membros, and "Compartilhar com este Workspace" on a connection. Evidence: #102; every management control is behind `viewerRole === 'owner'` and the server refuses regardless, which the verifier proved by reverting each guard in turn and watching the matching test fail.
- [x] Ledger: add IAM-04, 05, 06, 10; remove IAM-07, 08, 09 and the Area concept; CLA-05 takes a Workspace. Evidence: #102; `wire:bijection` reports 25 fixed Product operations on both sides.
- [ ] Live, with a second real Keycloak user: invite, sign in, see the Workspace, create a Project, run the Builder on a shared connection, get removed mid-run, see the run refused at its next claim and the Workspace gone. Not done. It needs the pilot at 054 and a second Keycloak user, both of which are operator steps below.
- [ ] Perf: median of `create_builder_run` and project list before and after. Not done.

## F-07. Drop what the application no longer reaches (055)

One migration, not two. The count of 2026-09-19 removed the reason F-08 existed, and the operator's word removed its gate. It is 055 rather than 054 because A-02b took 054.

- [x] 055 drops the Inception and R2 functions, tables and empty schemas, in 038's shape, keeping schema `reg` and `reg.artifact`. Evidence: #105 (`c767732b`); 47 functions, 13 tables and the schemas `brn` and `con`. The verifier rebuilt the live set independently from a different root scan and found zero dropped objects inside it and zero dead objects left behind.
- [x] 055 counts every table it drops and aborts if one holds a row, naming the table and its count. Evidence: #105's verifier planted one row in each of three tables on separate databases and reproduced `MIGRATION_055_TABLE_NOT_EMPTY_REFUSED` by name each time, with nothing half-applied afterwards.
- [x] Live: dry-run 055 against a copy of the pilot's schema and data. Evidence: #105; a pilot-shaped database at 050 carried to 055 in one invocation, then read back through `project.list_project_summaries`, `project.get_project` for all 22, `claude_connection.list_connections` and the registry tables. The pilot's own catalog was read read-only and holds no dependent that would block a drop.

It does not drop the login roles. A role is cluster-global while its privileges are per database, so `DROP ROLE` answers `2BP01` whenever another database on the same cluster still grants to it, which would make the migration's outcome depend on what else the cluster hosts. 055 revokes every privilege they hold instead, leaving eight roles inert. Removing them is a cluster operation, listed under the operator steps in `docs/roadmap.md`.

## M-01. Provider-neutral model connections and API keys (056, 057)

Mastra 1.63.2 already gives everything except custody. `Agent.model` is a function of `requestContext` (`dist/types/dynamic-argument.d.ts:3-6`) and may return `{ id: 'provider/model', apiKey, headers, url }` (`dist/llm/model/shared.types.d.ts:24-35`), which the router excludes from telemetry. A gateway's `resolveAuth` receives no request context, so it cannot be the per-user seam. The seam is the function the Builder already has at `builder/module.ts:234-238`.

M-01 is open as #106 and is not merged. Its migrations are 056 and 057. 057 adds the credential-kind
read that resolution needs before it decrypts anything, and re-issues
`create_builder_run_with_model` so its provider check asks through that reader: 056 read the
connection table directly, and that check runs as `builder_owner`, which holds no `SELECT` there.

- [x] 056: `connection.provider_id` and `credential_kind` (`OAUTH_TOKEN_SET`, `API_KEY`), backfilled to the pilot's live row; the `authorization` PKCE columns stay `NOT NULL`, because an API key never creates an authorization row and weakening a constraint for a case that does not use the table buys nothing; `preference` keyed `(account_id, provider_id)`; `builder_run` refuses a credential whose provider differs from the run's `model_provider_id`. The encrypted blob at `(connectionId, generation)` never moves. Evidence: `model-connection-migration-postgres.test.mjs` over a pilot-shaped row. The live run is the operator's lane below.
- [x] One dispatch in `resolveBuilderModel`, two return shapes. Anthropic OAuth returns the existing provider instance, because bounded fetch, the beta headers and the identity rewrite cannot ride a config object. An API key returns the native config object. No provider interface, no registry of Conexus providers. Evidence: `model-connection-dispatch.test.mjs`, through a fake that records what the Agent's model function returned.
- [x] Delete the `!== 'anthropic'` gates (`project/module.ts:387-389,416`) and `officialHttpsOrigin`; the registry already answers both. `ProjectModelChoice` was the copy and is deleted. `capabilitySet`, `enabled`, `admissionId` and the `/latest|\*/` pin refusal are kept: that is Product policy, not model logic.
- [x] One new operation, paste an API key for a provider from `PROVIDER_REGISTRY`. The key is written to custody and never returned. Evidence: the contract, and `model-connection-http.test.mjs`, which plants a sentinel key and finds it in no response body and no problem response.
- [x] Rename the user-visible surface: routes, operation ids, web feature, pt-BR copy. Evidence: `git grep -i claude apps/hub/src apps/web/src contracts` matches only the Anthropic provider's own wire constants and the cluster-global `claude_connection_owner` role in the generated catalog snapshot.
- [ ] Live: a run on the Anthropic account, then a run on an API key for a second provider, same Project. Evidence: both runs' activity.

## S-05. Name the database roles for what they may do (059)

The register already carried a capability per role while the names carried the program phase that introduced them. 059 closes that gap: `hub_ws01_command` becomes `hub_workspace_command`, `hub_s2_read` becomes `hub_workspace_read`, `hub_s3_read` becomes `hub_project_read`, `hub_prj03_command` becomes `hub_project_command`, `hub_rb_ingress` becomes `hub_builder_ingress`, `hub_rb_executor` becomes `hub_builder_executor`, `hub_r2_connections` becomes `hub_model_connection`, and the owner role `claude_connection_owner` becomes `model_connection_owner`, which is what its schema has been called since 056. `hub_iam_runtime` was already named for its capability and is unchanged.

- [x] 059 creates each capability-named role idempotently with its predecessor's attributes, moves every privilege and every owned object the old name holds in that database, and asserts the old names are left holding nothing and owning nothing, exactly as 055 left its roles. It does not rename and does not drop: `ALTER ROLE ... RENAME` answers `42710` on the second database of a cluster, because the old migrations re-create the old names on replay, and `DROP ROLE` answers `2BP01` while any other database still grants to them.
- [x] The transfer statements are generated from the catalog of a database at 058 — `aclexplode` over `pg_database`, `pg_namespace`, `pg_class`, `pg_attribute`, `pg_proc` and `pg_default_acl`, plus `pg_auth_members` and the ownership columns — rather than written by hand. 106 privileges and 19 owned objects moved. An object's own owner entry is excluded, because `ALTER ... OWNER TO` rewrites it.
- [x] Evidence: `hub-roles-by-capability-postgres.test.mjs` proves the transfer against a pilot-shaped fixture applied from 058, proves the retired names inert at head, and replays the history from zero in two databases on one cluster in both orders. `hub-call-site-privileges-postgres.test.mjs` proves every Hub call site executable by its new role at head.
- [x] The application follows: the register, its projection, `config.ts`, the three modules that name a role, the census and the provisioning script. `config.ts` refuses each retired variable with `RETIRED_CONFIG_<old>_USE_<new>`, so a stale environment names its own repair instead of failing later as a `28P01`.
- [x] `scripts/cutover-hub-role-names.mjs` performs the operator's half: it copies each secret file to its new name at mode 0600, rewrites the variable names and keeps a timestamped backup, refuses a symbolic link or a mode wider than 0600, prints names only, and changes nothing on a second run. Evidence: `cutover-hub-role-names.test.mjs` over a temp directory with fake secrets.
- [ ] Live: run the cutover against the pilot, apply the migration on the next Hub start, then `npm run db:roles:provision`, and read the startup census. The coordinator runs this; the unit does not touch the pilot.

## M-02. ChatGPT account sign-in

Verified from the public Codex CLI sources: issuer `https://auth.openai.com`, PKCE S256 of the shape this repo already uses, and an API base of `https://chatgpt.com/backend-api/codex` rather than `api.openai.com/v1`. Not verified: the client id, the token path, token lifetime, scopes, whether that base speaks a wire format Mastra's config object can reach, and whether OpenAI's terms allow it.

- [ ] Verify each unverified item from a primary source and record it. Evidence: source and line for each.
- [ ] Record the terms risk in `docs/roadmap.md` in the words used for Anthropic. Evidence: the diff.
- [ ] If the base is OpenAI-wire-compatible, add one provider record beside Anthropic's OAuth constants and return a config object with a bearer header. If not, install `@ai-sdk/openai` and build a bounded-fetch instance like Anthropic's. Evidence: a live run.
- [ ] If a primary source cannot be found for the client id or the terms, stop and report. API keys from M-01 already cover OpenAI models.

## Appendix. Authorization design and the synthesis decision

Three runners designed independently (Opus, Fable, Sonnet). All three put rights at the Workspace, derive them from a role, delete both per-Project grant tables, and share a connection with a Workspace rather than a person. None found a built surface that expresses a per-Project difference.

**Base: the Fable candidate** (`/home/leandrotheodoro/architect-authz/candidate-B.md`). It found the fact that decides the shape: every read runs inside `BEGIN READ ONLY` (`project/store.ts:177,207,240,272`, and the workspace, identity and read-model stores), and Postgres refuses `FOR SHARE` there. The Opus candidate's single locking `iam.admit` would fail on every read path. So there is one question in two forms: `admit_*` locks and raises for effects, `visible_*` is a lock-free set for reads. It is also the only candidate that moves the gate inside the callee's body and revokes the cross-owner `SELECT` grants, which returns the schema to `data-and-persistence.md` section 6.2.

**Kept from Opus:** the bearer-link invitation (token stored as a SHA-256 digest, single acceptance) as the recorded fallback if the realm cannot assert `email_verified`.

**Cut from the base:** `is_operator`, account deactivation and reactivation, and their page. A second person joining does not need them. Every gate still reads `account.active`, so the hole in `admit_project_build` closes regardless. They return as their own task.

**Screened against the design red flags:** `admit_project` adds the Project-to-Workspace resolution and the no-existence-oracle rule, so it is not a pass-through. The action enum has no TypeScript mirror, so the Hub cannot ask for the wrong right. Four functions and one error code are the whole surface other schemas see.

**Accepted:** every member sees and builds every Project in the Workspace, and a Project that must stay private belongs in another Workspace. Two roles, `owner` and `member`, differing only in `members.manage`. Any account may create a Workspace, since accounts exist only by invitation. Sharing a connection lets future members spend its owner's quota, undone in one click.

**Decided by the operator on 2026-09-19:** when a run's author loses access mid-run, `claim_*` refuses and `settle_*` still records work already done. This reverses the design's proposal, which refused both. A claim asks for authority the account no longer has. A settle only writes down work the database already paid for, and refusing it would lose the record of a run that ran.

**Open, for the operator:** whether a member, and not only an owner, may share their own connection into a Workspace. A-02 built the design default, which is yes, so the question is now about shipped behaviour rather than about a plan. It is listed with the other open Product questions in `docs/roadmap.md`. What to do with accounts minted through IAM-03 that hold no membership is also open (designed: left inert).
