# Foundation review plan

The Product is one path: sign in, create a Workspace and a Project, connect a model account, pick a model, send a request, watch activity, use Preview. This plan makes the repository say only that. It subtracts first and redesigns second. Subtraction removes dead code, Project Inception and Baseline, and Brain, bindings, Sankhya and the gateway. Redesign replaces three disjoint grant surfaces with one Workspace membership so a second person can join, and lets a model connection be an Anthropic account, an API key for any provider Mastra routes, and later a ChatGPT account, without a Conexus model abstraction.

The operator decided the scope on 2026-09-19. Inception and Baseline may be deleted. Brain, bindings and Sankhya come out now and return only as future features on a solid base. Multi-account is wanted now, at the minimum that is correct. Model selection stays Mastra-native; Conexus adds only credential custody and sign-in.

## How to read this

One box is one unit of work and names the evidence that checks it. Check a box only when the evidence exists. The live bar is the one `docs/roadmap.md` set on 2026-09-18: a lane earns its cost only on the operator's pilot database, a running Hub, or a browser holding a real session. CI proves the rest. The boot recipe, PR mechanics and verdict rules are those of `docs/tasks/credential-and-role-remediation.md` and are not repeated here.

The operator authorized the coordinator to merge on 2026-09-19. A PR merges only behind a passing verdict from an agent that did not write it, posted on the PR, at the head that merges. Every PR opens ready.

## Order

| Id | What | Base | Migration |
|---|---|---|---|
| F-00 | Reopen the roadmap grant | trunk | none |
| F-01 | Delete dead code | trunk | none |
| F-02 | Name the r1 suites by what they prove and admit them to CI | trunk | none |
| F-03 | Drop the Builder functions migration 038 orphaned | trunk | 051 |
| F-04 | Move shared code out of `project/`; free Builder boot from Inception | F-01 | none |
| F-05 | Remove Inception and Baseline from the application | F-04 | none |
| F-06 | Remove Brain, bindings, Sankhya and the gateway from the application | F-05 | none |
| A-01 | Membership authority, additive | F-06, F-03 | 052 |
| A-02 | Switch every caller, then excise the grant surfaces | A-01 | 053 |
| F-07 | Drop the Inception and R2 functions, tables, schemas and roles | A-02 | 054 |
| M-01 | Provider-neutral model connections and API keys | A-02 | 055 |
| M-02 | ChatGPT account sign-in | M-01 | none expected |

F-07 waits for A-02 on purpose. Migration 049 writes five R2 capability columns inside `iam.establish_project_creator_grant`, so those columns cannot drop while that function lives. A-02 deletes the function and the tables that hold the columns, which removes the need to rewrite it first.

The remediation stack, R-03A through R-05, merged to trunk on 2026-09-19, so every base that named one of its branches now reads trunk. F-04 merged the same day as #87; its file references below predate the move to `apps/hub/src/model-connection/`.

This table had an F-08 until 2026-09-19. F-08 was a second migration only because nobody knew whether the tables it dropped held rows. The count below proves they hold none, so F-07 is one migration and M-01 moves up to 055.

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

## F-00. Reopen the roadmap grant

`docs/roadmap.md` said no new providers and no API-key fallback. `docs/tasks/builder-interactive-delivery.md` repeated it. The operator reversed both on 2026-09-19. This unit is documentation only and changes no code.

- [x] Record the four decisions above in `docs/roadmap.md` with their date, and replace "No new providers" with the grant M-01 and M-02 need. Evidence: the diff.
- [x] Keep the honesty rule unchanged in meaning. Operator consent is not provider endorsement, and a provider refusal is never evaded. Evidence: both sentences survive the diff, in the roadmap and in the interactive-delivery task.
- [x] Point the roadmap at this file as the task after the remediation. Evidence: the diff of the header and of `docs/index.md`.
- [x] Amend this plan with the three facts learned on 2026-09-19. They are the pilot count, the merge of F-08 into F-07, and the decision on `claim_*` and `settle_*`. Evidence: the diff.

## F-01. Delete dead code

- [ ] Delete `scripts/check-r3-candidate-freeze.mjs`, `scripts/record-r1-candidate-custody.mjs`, `scripts/check-r1-a0-migration.mjs` and their npm scripts. Each already fails on trunk (`BASE_DRIFT`, `RC01_UNKNOWN_CLASSIFICATION:.gitignore`, `A0_UNCLASSIFIED_PATH`). Evidence: each failure reproduced before deletion, `npm run verify` green after.
- [x] Delete `apps/hub/src/mar/admission.ts` and the `pg-boss` dependency if no import remains. Evidence: `git grep pg-boss` empty, typecheck green. Done 2026-09-19: also deleted the R3 gates (`r3:p2p3:check`, `tests/implementation/r3-mar-admission.test.mjs`, `tests/implementation/r3-project-read-model.test.mjs`) and the `pg-boss` qualification programs that kept these alive.
- [ ] Remove the `indexOf` no-op at `scripts/run-hub-migrations.mjs:25`. Evidence: migration suite green.
- [ ] Census the 153 npm scripts against `CANDIDATE_GRAPH` and delete every script nothing runs and no document names. Evidence: the list in the PR body, with the grep that cleared each one.

## F-02. Name the r1 suites by what they prove

The parked work on `remediation/r06-r1-postgres-suites` is the starting point. The rule at `tests/repository/conexus-verify.test.mjs:138-140` forbids a CI scope named after a program phase, and the rule is right.

- [ ] Rename to `identity-access-postgres`, `workspace-postgres`, `project-create-postgres`, files and scope. Evidence: the rule's test passes unmodified.
- [ ] Admit the scope to `CANDIDATE_GRAPH`. Evidence: CI runs it and it is green.

## F-03. Drop the orphaned Builder functions (051)

Migration 038 dropped tables and left their functions. Forty-one `builder.*` functions are alive, the Hub calls eighteen, two Builder tables remain.

- [ ] List every `builder.*` function in `contracts/technical/hub-catalog-snapshot.json` that neither `apps/hub/src/builder/*.ts` nor a surviving function body calls. Evidence: the list, generated, in the PR body.
- [ ] Write `051_builder_orphan_function_excision.sql` in the shape of 038, dropping exactly that list, plus `iam.admit_project_review`. Evidence: the migration aborts on a scratch cluster if any dropped function has a dependent.
- [ ] Regenerate the catalog snapshot. Evidence: `npm run db:catalog:check` green.
- [ ] Live: dry-run 051 against a copy of the pilot's schema. Evidence: the ledger row and zero dependents.

## F-04. Move shared code out of `project/`

`project/` holds what the Builder needs from Anthropic, and Builder boot validates the Inception credential file (`project/module.ts:397,496-500`).

- [ ] Move `anthropic-oauth.ts`, `anthropic-oauth-provider.ts`, `oauth-token-store.ts` and `bounded-provider-fetch.ts` to `apps/hub/src/model-connection/`. Move the model catalog reader with them. Evidence: `check-import-law.mjs` green with its pins updated in the same commit.
- [ ] Keep one OCI Git implementation of the three and point the Builder at it. Evidence: the two deleted files, Builder tests green.
- [ ] Resolve the two source-revision truths to the one the Builder reads. Evidence: a test that fails if a second reader appears.
- [ ] Remove the Inception credential from Hub boot. Evidence, live: the Hub starts with the Inception OAuth file absent and a Builder run completes.

## F-05. Remove Inception and Baseline from the application

- [ ] Delete routes, stores, web features and tests for PRJ-07, PRJ-08, PRJ-09, PRJ-23, PRJ-24, and `createOAuthTokenStore`, the local-file variant only that path used. Evidence: `git grep` for each operation id returns only migrations.
- [ ] Edit the contract and `docs/product/operation-ledger.md` in the same commit, because `wire:bijection` gates on an exact count. Evidence: `npm run wire:bijection` reports the new count on both sides.
- [ ] Update `check-wire-carriers.mjs` and `check-qualification-provenance.mjs` pins. Evidence: both green.
- [ ] Live: sign in, create a Project, run the Builder, open Preview. Evidence: screenshots of each step.

## F-06. Remove Brain, bindings, Sankhya and the gateway from the application

- [ ] Delete `apps/hub/src/brain/`, `connections/`, the binding half of `project/`, the gateway, their web features, contract paths (BRN-*, CON-*, PRJ-10..15) and tests. Evidence: as F-05.
- [ ] Remove the Brain and Integrations links from `apps/web/src/app/shell.tsx`. Evidence: screenshot of the shell.
- [ ] Keep what the model connection uses: `platform/credential-backend.ts`, `reg.artifact`, and the login role the connection pool authenticates as. Rename that role's register entry from `hub_r2_connections` only in M-01. Evidence: Builder run completes live.
- [ ] Stop mounting Sankhya as a side effect of the Claude configuration. Evidence: route table dump at boot lists no CON route.
- [ ] Regenerate the role register and drop the pools no module opens. Evidence: `HUB_CONNECTION_CENSUS` at boot names only surviving roles.

## A-01. Membership authority, additive (052)

The design is in the appendix. Old gates keep working until A-02.

- [ ] Precondition probe: confirm the pilot realm puts `email_verified` in the ID token, read from a real sign-in. Evidence: the claim name and value, token redacted. If absent, stop and take the bearer-link fallback recorded in the appendix.
- [ ] Create `iam.workspace_role`, `iam.action`, `workspace_membership.role` (existing rows become `owner`), `iam.workspace_invitation`, `bootstrap_context.verified_email`.
- [ ] Create `iam.role_allows`, `iam.admit_workspace`, `iam.admit_project`, `iam.visible_workspaces`, `iam.visible_projects`, and the member operations `list_workspace_roster`, `invite_workspace_member`, `cancel_workspace_invitation`, `set_workspace_member_role`, `remove_workspace_member`, `claim_invitations`.
- [ ] Assert in the migration that no account loses access (every grant row has a membership in that Project's Workspace) and none gains it (no Workspace has two members). Abort otherwise, naming the pairs.
- [ ] Database test: the role-by-action matrix; an inactive account fails all four gates; `remove_workspace_member` blocks behind an open transaction that called `admit_project`; the last owner cannot be removed or demoted; two owners demoting each other do not deadlock. Evidence: the suite, in CI.
- [ ] Live: run 052 against a copy of the pilot's schema and data. Evidence: both assertions pass with zero pairs.

## A-02. Switch every caller, then excise (053)

- [ ] Re-issue every `project.*`, `builder.*` and `claude_connection.*` function so its gate is inside its own body: effects call `admit_*`, reads join `visible_*`. Functions that took an admitted-id array are recreated taking `p_account_id`. Evidence: `git grep "iam\." apps/hub/src` matches only `identity-access/`.
- [ ] Replace `claude_connection.binding` with `workspace_share(connection_id, workspace_id)`, backfilled from live `USER` bindings. Owner use needs no row.
- [ ] Drop `iam.account_project_grant`, `iam.project_builder_grant`, `claude_connection.binding`, the membership capability columns, and the eleven old admission functions including `ensure_project_builder_grant`. Revoke `SELECT` on `iam` tables from `project_owner` and `claude_connection_owner`. These tables hold only derived creator grants and self-bindings. A-01's assertion proves it, and the count of 2026-09-19 shows 22 rows in each grant table against 22 Projects and one connection binding against one connection. The operator gave the word that day, in the sentence quoted above. Quote it again in the PR and keep the migration's own assertion.
- [ ] Hub: `identity-access/current-session.ts` exports the one `CurrentSession`; every module-local alias is deleted. `identity-access/membership.ts` holds the store and IAM-04, IAM-05, IAM-06, IAM-10. The OIDC callback claims invitations. IAM-03's operator branch and WS-01's operator check are deleted.
- [ ] A run whose author lost access mid-run stops at its next claim and keeps what it already did. `claim_*` calls `admit_*` and refuses, because a claim asks for new authority. `settle_*` does not gate on membership, because it records work the run already performed and a refusal there would leave a run that ran and cannot say so. Evidence: a database test that removes the member between a claim and its settle, and asserts the settle row exists and the next claim raises.
- [ ] The Builder worker treats SQLSTATE `42501` as terminal for the run.
- [ ] Web: Workspace > Membros, and "Compartilhar com este Workspace" on a connection.
- [ ] Ledger: add IAM-04, 05, 06, 10; remove IAM-07, 08, 09 and the Area concept; CLA-05 takes a Workspace.
- [ ] Live, with a second real Keycloak user: invite, sign in, see the Workspace, create a Project, run the Builder on a shared connection, get removed mid-run, see the run refused at its next claim and the Workspace gone. Evidence: screenshots and the run's terminal state.
- [ ] Perf: median of `create_builder_run` and project list before and after. Evidence: the two medians.

## F-07. Drop what the application no longer reaches (054)

One migration, not two. The count of 2026-09-19 removed the reason F-08 existed, and the operator's word removed its gate.

- [ ] 054 drops the Inception and R2 functions, tables, empty schemas and login roles, in 038's shape, keeping schema `reg` and `reg.artifact`. Evidence: catalog snapshot regenerated; role register regenerated; provisioning `--check` green on the pilot.
- [ ] 054 counts every table it drops and aborts if one holds a row, naming the table and its count. Evidence: the abort reproduced on a scratch cluster with a single row inserted into one of them.
- [ ] Live: dry-run 054 against a copy of the pilot's schema and data. Evidence: the assertion passes for every table and the drop completes.

## M-01. Provider-neutral model connections and API keys (055)

Mastra 1.63.2 already gives everything except custody. `Agent.model` is a function of `requestContext` (`dist/types/dynamic-argument.d.ts:3-6`) and may return `{ id: 'provider/model', apiKey, headers, url }` (`dist/llm/model/shared.types.d.ts:24-35`), which the router excludes from telemetry. A gateway's `resolveAuth` receives no request context, so it cannot be the per-user seam. The seam is the function the Builder already has at `builder/module.ts:234-238`.

- [x] 056: `connection.provider_id` and `credential_kind` (`OAUTH_TOKEN_SET`, `API_KEY`), backfilled to the pilot's live row; `authorization` PKCE columns stay `NOT NULL`; `preference` keyed `(account_id, provider_id)`; `builder_run` refuses a credential whose provider differs from the run's `model_provider_id`. The encrypted blob at `(connectionId, generation)` never moves. Evidence, live: the pilot's connection still completes a run after 056. Corrected 2026-09-19: this line said the PKCE columns become nullable. An API key never creates an authorization row, so nothing in this unit writes that table, and a constraint is not weakened for a case that does not use it. The migration took 056 because 055 belongs to F-07.
- [ ] One dispatch in `resolveBuilderModel`, two return shapes. Anthropic OAuth returns the existing provider instance, because bounded fetch, the beta headers and the identity rewrite cannot ride a config object. An API key returns the native config object. No provider interface, no registry of Conexus providers. Evidence: the diff of that function.
- [ ] Delete the `!== 'anthropic'` gates (`project/module.ts:387-389,416`) and `officialHttpsOrigin`; the registry already answers both. Delete whichever of `BuilderModelChoice` and `ProjectModelChoice` is the copy. Keep `capabilitySet`, `enabled`, `admissionId` and the `/latest|\*/` pin refusal: that is Product policy, not model logic.
- [ ] One new operation, paste an API key for a provider from `PROVIDER_REGISTRY`. The key is written to custody and never returned. Evidence: the contract, and a test that no response or log carries it.
- [ ] Rename the user-visible surface: routes, operation ids, web feature, pt-BR copy. Rename the database schema last and only if the 053 re-issue makes it mechanical. Evidence: `git grep -i claude apps/web/src` matches only the Anthropic provider's own label.
- [ ] Live: a run on the Anthropic account, then a run on an API key for a second provider, same Project. Evidence: both runs' activity.

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

**Open, for the operator:** whether a member, and not only an owner, may share their own connection into a Workspace. This is still open. The design default is yes, and A-02 builds that unless the operator says otherwise. What to do with accounts minted through IAM-03 that hold no membership is also open (designed: left inert).
