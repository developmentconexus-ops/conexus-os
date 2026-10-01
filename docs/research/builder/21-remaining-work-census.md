# 21. Remaining-work census: specs 0002 and 0003, Q4 closure, PR packaging

Read-only census of `feat/builder-own-harness-int` at `40d9671d` (`<worktree>`, merge base with
`origin/main` `eb564cfe`, which the branch contains), 2026-09-29. Test references are
`tests/implementation/<file>.test.mjs:<line of the test title>`; code references are repo paths.
"Met" means a test or proof on this head shows it; "partly" names the missing piece; "not built" means
no code exists. Live-proof ACs are "not proven" until the declared run. Companion study:
[20-slice7-eval-plan.md](20-slice7-eval-plan.md).

## Headline

- Of spec 0002's 31 ACs, 14 are met by tests, 9 are partly met, 3 are not built (AC-19, AC-24,
  AC-26), and 5 are live proofs not yet run (AC-27 to AC-31). Of spec 0003's 13 ACs, 12 are met by
  tests; AC-13 and the live half of AC-7, AC-8 and AC-10 wait for the live run.
- Three findings change tonight's plan. First, `erp/sales-dashboard` cannot pass on any branch today:
  an app handler can only call `sankhya.purchase-order.read`, and the handler `connectors.fetch` (Q-6,
  Q4 closure item 2) is not built. Second, Factory PR #373 adds `apps/hub/migrations/0032_application_thumbnail.sql`
  and edits `apps/hub/src/builder/factory-runtime.ts`, which the branch replaces with its own `0032`
  to `0038` and deletes. Merging #373 first forces the branch to renumber seven migrations and the
  tests that name them. Third, open issue #342 wants a handler importing `node:fs` refused by the
  project check, while spec 0003's check lets a handler import `node:` modules
  (`builder-application-check:122`, `builder-compiler-allowlist:81`). One of the two must change.
- The PR to `main` has none of the qualification-lane paperwork yet: no task, no evidence folder,
  no C-032, no technology-rule record for 20 new dependencies, no issue. `repository:check` passes;
  `wire:bijection` passes against a fresh bundle.

## 1. Spec 0002 (`docs/tasks/specs/0002-builder-own-harness/index.md`)

| AC | Status | Evidence, or what is missing |
| --- | --- | --- |
| AC-1 prompt text clean, script prints model input | partly | Banned terms absent in both modes: `builder-harness:76`, `builder-harness:141`. **The script that prints the model's real input for a Project, thread, mode, model and revision does not exist** (no such file in `scripts/`). |
| AC-2 two modes, in thread settings, new conversation in Planejar | met | `apps/hub/src/builder/harness/modes.ts:66-89`; `builder-run-dispatch:390`; `builder-harness:652`; `builder-session-routes:339` |
| AC-3 Planejar no command, writes only `.conexus/plans/`, ends with `submit_plan` | met | `builder-harness:70`, `:254`, `:310`, `:342`, `:354`; `builder-run-runtime:558` |
| AC-4 approve continues in Construir, reject revises, settles by change | met | `builder-harness:510`; `builder-run-runtime:547`; `builder-run-recovery-postgres:134`; migration `0036_builder_run_settles_by_change.sql` |
| AC-5 manual mode switch only when idle | met | `builder-session-routes:157`; guard at `apps/hub/src/builder/mastra-session-routes.ts:45`, `186`, `194-196` |
| AC-6 tool lists exact, by name | met | `builder-harness:27` (amended by 0003 for `conexus_check`) |
| AC-7 starter `AGENTS.md` | met | `apps/hub/src/builder/starter/AGENTS.md`; `builder-conexus-git:69`; `builder-conexus-git-postgres:204` |
| AC-8 `AGENTS.md` from `main`, 8 KB cut with note | met | `builder-run-runtime:765` |
| AC-9 Construir updates `AGENTS.md`; candidate refused when missing, not UTF-8, over 8 KB | met | Prompt `apps/hub/src/builder/harness/prompt/v2/build.md:50`; `builder-run-runtime:624` |
| AC-10 skills from `builder-skills/` | met | `builder-harness:160`, `:164`; `builder-skills-guard:13`, `:37` |
| AC-11 web search and page read in both modes, on every pilot model | partly | Prompt rule on company data: `prompt/v2/conexus.md:79`, `:150`. **Google AI Pro and ChatGPT models have no `web_search`** (`builder-harness:421`, `:439`); the common search tool for models without native search is not built. |
| AC-12 `connector_fetch` Q-5 behavior; refuse only without a binding | partly | Brief: `builder-run-runtime:876`, `:894`, `:905`, `:919`; tool: `connector-builder-tool:84`, `:208`; `builder-harness:450`. **The eval refusal case has not run on the new Builder.** |
| AC-13 repository under the Conexus Git root, idempotent, no GitHub call | met | `builder-conexus-git:69`, `:86`, `:103`; `builder-conexus-git-postgres:204`. GitHub App config names remain only as a refusal list (`apps/hub/src/platform/config.ts:154-163`). |
| AC-14 fresh sandbox from `main`, Hub commits, bundle back, fast forward at admission | met | `builder-run-runtime:242`, `:265`, `:274`, `:445`, `:473`; `builder-conexus-git:114`, `:146`, `:174`; live `builder-sandbox-e2b-live:29` (opt-in) |
| AC-15 sandbox holds no model, Git or Hub secret | partly | Empty environment: `builder-composition:58`, `builder-run-runtime:574`; model calls in the Hub process. **No scan of the sandbox's environment, files and the stored thread for a key or token** (the spec's "Secrets" scenario). |
| AC-16 one active run per Project, waiting runs stay active, busy answer | met | Lock: `builder-run-execution-postgres` lines 110-118; waiting stays active: `builder-harness:468`; busy 409: `apps/hub/src/builder/routes.ts:131` |
| AC-17 failure and restart recovery by reading `main` | met | `builder-run-recovery-postgres:99`, `:116`; `builder-run-runtime:359`, `:373`, `:382`, `:592` |
| AC-18 several shared conversations, Postgres threads, list with title and last activity | partly | `builder-session-routes:133`, `:271`. Storage is still schema `factory` (`apps/hub/src/builder/module.ts:188-189`), not `mastra`. The list shows a title with the fallback "Conversa sem título" (`apps/web/src/features/builder/construir/construir.tsx:42`), not the first message, and no last activity. |
| AC-19 observational memory with Mastra Code's settings on the memory model | **not built** | `apps/hub/src/builder/module.ts:342` is `new Memory({ options: { lastMessages: 40, semanticRecall: false } })`. No observational memory, no memory model. |
| AC-20 API key, ChatGPT, Claude, Google AI Pro from Modelos de IA | partly | ChatGPT: `builder-openai-codex:93`; Google AI Pro: `builder-google-ai-pro:344`. **API keys and the Claude subscription are not built** (`apps/hub/src/builder/model-accounts.ts:42-45` says so). |
| AC-21 sharing levels, admin-only `everyone`, one per person, one shared | partly | Database rule: `model-account-postgres:47`. **No sharing route, no 403/409 tests.** |
| AC-22 secrets sealed, never to browser or sandbox, refresh written back first | met (sandbox half with AC-15) | `secrets-envelope-interop:20`, `:43`; `builder-google-ai-pro:189`, `:205`; `builder-openai-codex:180`, `:323`; `model-account-postgres:113`, `:175` |
| AC-23 three defaults, router catalog, per-conversation pick, connect-a-model message | partly | Message: `builder-openai-codex:272`, `:286`, `builder-run-runtime:781`; default read: `model-account-postgres:165`, `builder-openai-codex:293`; pick: `builder-session-routes:174`, `builder-harness:579`. **No screen or route for the three installation defaults; catalog covers only the two offered providers.** |
| AC-24 Factory and code-sdk gone, schema and role dropped, GitHub code deleted, packs gone | **not built** | `package.json` still lists `@mastra/factory` 0.17.2 and `@mastra/code-sdk` 1.8.3; imported by `apps/hub/src/builder/runtime.ts`, `sandbox.ts`, `openai-codex/{oauth,model,credential}.ts`, `harness/plan-file.ts`, `platform/secrets.ts`, `platform/factory-secret-encryption.ts`; storage in schema `factory`; `/settings/installation/github` still routed (`apps/hub/src/http/app.ts:120`); `hub_factory` role still registered (`builder-conexus-git-postgres:241`). The `@octokit` packages are already gone. |
| AC-25 copied files carry the Apache notice and source | partly | Notices in `builder/openai-codex/oauth.ts`, `model.ts`, `platform/factory-secret-encryption.ts`, `builder/harness/plan-file.ts`. Complete only once AC-24 finishes the copy list. |
| AC-26 C-032 recorded | **not built** | No `C-032` in `docs/decisions/index.md` (last is C-031). |
| AC-27 three-case eval | not proven | Driver cannot approve plans; `sales-dashboard` blocked (study 20). |
| AC-28 browser run as a person | in progress | Night-run unit U1. |
| AC-29 app reads the pilot's Sankhya | not proven | Branch Hub has no gateway origin and no Connection (study 20, section 3). Possible tonight only as a purchase-order app after Leandro types the credential. |
| AC-30 Leandro reads the model input | blocked | Needs the AC-1 script, then Leandro. |
| AC-31 backup and tested restore | not proven | Nothing written. |

## 2. Spec 0003 (`docs/tasks/specs/0003-app-stack-v2/index.md`)

| AC | Status | Evidence |
| --- | --- | --- |
| AC-1 exact pins, lockfile digest, import allowlist | met | `builder-compiler-recipe-stack:11`, `:40`; `builder-compiler-allowlist:56`, `:67`, `:81`, `:98`; `builder-template-pins:23`; `builder-application-check:108` |
| AC-2 starter v2 layout, passes the check with zero problems | met | `builder-app-starter-v2:147`, `:171`; `builder-application-check:95` |
| AC-3 look from tokens only | met | `builder-app-starter-v2:229`, `:243`; skill: `builder-skills-guard:59` |
| AC-4 generated `api.gen.ts` and `types.gen.ts`, never in Git | met | `builder-client-generator:100` to `:259`; `builder-application-check:129`, `:139`, `:149`; `builder-run-runtime:722` |
| AC-5 one Hub-owned `check.mjs`, root-owned 0555, steps, limits | met | `builder-run-runtime:691`; `builder-application-check:308`; live `builder-sandbox-e2b-live:109`, `:145` (opt-in) |
| AC-6 blocking steps; `boot` never blocks | met | `builder-application-check:238`; `builder-run-runtime:743`, `:754` |
| AC-7 `boot` with production CSP and deep links, problems reported | met (unit) | `builder-application-check:251`, `:263`, `:274` |
| AC-8 `conexus_check` tool, Construir only, UI sentences | met (unit) | `builder-harness:46`, `:55`; `builder-application-check:326`; `builder-tool-sentences:47`; live sentence pending U1 |
| AC-9 admission runs the check as root on the candidate, problems whole | met | `builder-run-runtime:654`, `:705`; `builder-application-check:179`, `:203` |
| AC-10 one path classifier for Prévia, app host, `boot` | met (unit) | `app-path-classifier:15` to `:73`; `builder-application-check:274`; live deep link pending U1 |
| AC-11 two new skills, `conexus-server` browser section | met | `builder-skills-guard:37` to `:65`; `builder-skill-examples:69`, `:73` |
| AC-12 old artifacts readable, new builds on new pins | met | `builder-template-pins:14`, `:27`, `:34` |
| AC-13 report counts, never "validado" | partly | Rule in `apps/hub/src/builder/harness/prompt/v2/build.md:68-69`; behavior only provable in the live run. |

## 3. Q4 closure (`docs/tasks/stage2-q4-sankhya-connector-qualification.md`, amendment of 2026-09-28)

| Closure item or evidence | State on `main` | Covered by the branch? |
| --- | --- | --- |
| 1. One reconciled contract (C-030, amendment, product and permission contracts, single-owner map) | C-030 recorded (`docs/decisions/index.md:26`, `:30`). Whether the product contract, permission contract and single-owner map say the same was not re-audited here. | No change. |
| 2a. Connections with several accounts, bindings migration | Merged (#365). | Inherited. |
| 2b. Native executor | Merged (#369); negatives and generic seam in `connector-fetch:99` to `:360`. | Inherited. |
| 2c. `connector_fetch` Builder tool | Merged (#372). | Ported to the new Builder: `builder-harness:450`, `builder-run-runtime:919`, `connector-builder-tool:208`. |
| 2d. **`connectors.fetch` for handlers** (Q-6; Leandro's decisions of 2026-09-28: browser gets only the handler return, runner cap 256 KiB, 8 calls) | **Not built.** Handlers still use `connectors.call` over `/v1/call` (`apps/hub/src/app-runner/worker.ts:42-49`, `apps/hub/src/connectors/handler-port.ts:83-102`). | No. |
| 2e. **Delete the per-operation path** (`connectors.call`, `/v1/call`, `sankhya.purchase-order.read`) once the Q3 notebook app calls `connectors.fetch` | **Not done.** Operation still registered (`apps/hub/src/connectors/sankhya/definition.ts:16`). | No. Needs the Q3 app changed, which lives on the pilot. |
| 3. Pilot on `main` (E-1) | **Not done.** Pilot runs spike `a62a2883` (`RELATORIO-MANHA.md` item 2). | No. |
| 4. One autonomous investigation, two materially different reads before building | Not run. The closure text says "a real Factory session"; after spec 0002 it is a Builder session. | The mechanism is on the branch; the run is not. |
| 5. One useful app and one later change, named by the operator before the run | Not run. Needs 2d for any read beyond one purchase order. | No. |
| 6. One frozen verdict | Not started. | No. |
| Evidence, positive (value-digest proof that the model got the body) | Unit: `connector-builder-tool:208`. Live: not run. | Partly. |
| Evidence, negative | Unit tests on `main` (`connector-fetch:99`, `:118`, `:143`, `:161`, `:193`, `:218`, `:227`). Pilot negative (another Project, removed binding): not run. | Inherited. |
| Evidence, read-only confirmation on the Connection (who confirmed, when) | **No field or record exists** (no match for a confirmation in `apps/hub/src`, migrations or contracts). Without it the verdict is at most ACCEPT_WITH_BOUNDARY. | No. |
| Evidence, no leak (marker run, sandbox scan, business-value scan) | Route projection unit test `connector-builder-tool:122`; live marker run not done. | Partly. |
| Evidence, generic seam | `connector-fetch:360`. | Inherited. |

## 4. PR packaging under `docs/development/delivery.md` (read from `origin/main`)

The PR is `lane:qualification` by triggers Q-a (Q4 gate), Q-b (runtime and database boundary), Q-c
(live Builder evidence) and Q-d (new dependencies). What it needs and does not have:

| Requirement | Rule | State |
| --- | --- | --- |
| Task in `docs/tasks` | "Only the qualification lane writes a task", `delivery.md:30`; lane table `:25` | **Missing.** No task names spec 0002 or 0003. |
| Evidence in `docs/evidence` | Lane gate "evidence", `:25`; Q-c `:17-18` | **Missing.** No `docs/evidence/` folder for the Builder harness or stack v2. |
| Decision register | Meaning owned by the register, `delivery.md:4-5` | **Missing.** Spec 0002 AC-26 reserves **C-032 for the Builder off the Factory** (superseding C-022 and C-025, amending C-027), and spec 0003 asks for "C-032 (Builder off the Factory) and this profile change" (`0003 index.md:359`). The stack v2 profile amends C-028's `REACT_VITE_V1`. Recommend C-032 for the harness and a separate C-033 for stack v2, not the stack under C-032 as the brief assumed. |
| Technology-rule record per new dependency: consumer, limitation, exact version, probe, alternative | `delivery.md:83-88` | **Missing in the repo.** Evidence sits outside it (study 17, spec 0003 *App stack* table). New entries: root `ai` 6.0.286 and `@ai-sdk/openai` 3.0.114 (ChatGPT subscription path); compiler template `@base-ui/react` 1.8.0, `@hookform/resolvers` 5.9.1, `@tailwindcss/vite` 4.3.3, `@tanstack/react-query` 5.102.8, `@tanstack/react-router` 1.170.32, `@tanstack/react-table` 9.2.4, `@types/node` 24.19.0, `@vitejs/plugin-react` 6.1.1, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `date-fns` 4.4.0, `lucide-react` 1.47.0, `react-day-picker` 9.14.0, `react-hook-form` 7.89.0, `recharts` 3.10.1, `tailwind-merge` 3.7.0, `tailwindcss` 4.3.3, `zod` 4.6.5 (`apps/hub/compiler-template/package.json`). The roadmap's *Technology baseline* (`docs/roadmap.md:100`) must record them. |
| Linked issue | "Link the issue", `delivery.md:138` | **None exists.** Open issues are #363, #346, #343, #342, #333, #330, #329, #328; none covers the harness or stack v2. Related: #346 (eval simulator, blocks exact `sales-dashboard`), #342 (conflicts with 0003's `node:` rule), #333 (Factory `listProviders`, moot after AC-24), #329/#330 (Modelos de IA screens). |
| Labels | Lane `:21-25`; `needs:aprovo` `:39-45` | `lane:qualification`, `type:change`, `effort:high`, `impact:high`. **`needs:aprovo` applies twice**: migrations `0032` to `0038` touch real data at the switch (the switch drops test Projects and conversations, spec 0002 migration plan), and the change is a security and authentication change (model credentials, ChatGPT device-code sign-in, the secret envelope). |
| `npm run db:catalog:snapshot` committed after migrations | `delivery.md:140` | Snapshot last changed in `2aab0049`, after both `0037` (`7a23f520`) and `0038` (`b5cf25f8`). Not regenerated here (needs Postgres); the DB suites were green at `40d9671d` per the night-run log. |
| `npm run wire:bijection` | `delivery.md:141` | **Passes**: "4A↔OAS bijection passed (30 fixed Product operations; 30 schema-closed; 0 missing; 0 extra; 0 duplicate)" against a fresh bundle. Run alone it fails, because it reads a stale shared `/tmp/conexus-product-openapi.bundle.json` that still lists the removed `/conversations` operations; `verify` bundles first (`scripts/conexus-verify.mjs:154-155`), so CI is unaffected. |
| `npm run repository:check` | `delivery.md:142` | **Passes** (13/13). |
| Operation ledger with the contract change | `delivery.md:141` | `docs/product/operation-ledger.md` changed in `183de931` with the builder paths; `contracts/api/product/builder-paths.yaml` changed again in `7ae06c41`. Bijection green, so they agree. |
| Merge gate | `delivery.md:119-131` | Factory review `approve` and operator verdict pending; the operator merges (`:28`). |

**Specs into the repo.** Yes. The lane requires a task in `docs/tasks`, and a reviewer at the PR head
cannot read the operator's study notes. Recommended placement:

- `docs/tasks/stage2-builder-own-harness-qualification.md`: the protected claim, the closure set
  (spec 0002 AC-1 to AC-31 and spec 0003 AC-1 to AC-13 as they stand after this census), the
  deciding-proof route (the declared AC-27 and AC-28 runs), and the open limits. Link it from the Q4
  task's amendment, since the night-run file places this work inside Q4's "builds and changes a
  useful application".
- `docs/decisions/index.md`: C-032 and C-033 with reasons and reopen triggers; the rationale files
  stay as study material, cited, not copied.
- `docs/evidence/builder-own-harness/`: `README.md` with heads, runs, CheckReports, screenshots
  (values masked), the eval `result.json` files.
- Design facts the code now owns go to the references the branch already edits
  (`docs/reference/builder-c020-mastra-native.md`, `docs/reference/hub-database-roles.md`).

**Factory PR overlap.**

- #370 (issue #330) touches 21 files; 7 overlap: `apps/web/src/features/settings/components/{connect-account,google-ai-pro-account,model-account-row,models-screen}.tsx`,
  `apps/web/src/features/settings/model-account-rows.ts`, `tests/implementation/settings-browser.test.mjs`,
  `tests/implementation/settings-screenshots.mjs`. The branch deletes `settings-screenshots.mjs` and
  rewrites the Modelos de IA screen. A conflict either way.
- #373 (issue #343) touches 22 files; 16 overlap, including `apps/hub/migrations/0032_application_thumbnail.sql`
  against the branch's `0032_conexus_git.sql`, `apps/hub/src/builder/factory-runtime.ts` (deleted on
  the branch), `module.ts`, `service.ts`, `application-build.ts`, `application-artifact-runtime.ts`,
  `server.ts`, `contracts/technical/hub-catalog-snapshot.json` and `scripts/run-hub-migrations.mjs`.
  **Recommendation: do not merge #373 under S1 tonight.** Ask the Factory to rebase it after the
  branch lands, with its migration renumbered past `0038`. Merging it first costs the branch seven
  renamed migrations, the catalog snapshot and the tests that name `0037` and `0038`
  (`builder-template-pins:34`, the hub-migration test at `7f729d23`).

## 5. Build units for tonight

Rules for parallel work: each unit gets its own worktree from `-int`; units in the same group share no
file. `scripts/conexus-verify.mjs`, `package.json`, `package-lock.json` and
`contracts/technical/hub-catalog-snapshot.json` are hot files: units write their new test or script
without touching them and hand the one-line wiring to the integrator. None of these units drive the
branch Hub except where marked.

### Group 1: parallel now, disjoint files, no Leandro

| Unit | Closes | Files | Proof |
| --- | --- | --- | --- |
| **U-EVAL** Driver approves plans, answers questions, records CheckReport, masks values, refuses a non-default origin without `CONEXUS_STATE` | AC-27 prerequisite | `scripts/builder-eval/run.mjs`, `scripts/builder-eval/scorers.mjs` (export `gradeRefusal`), `scripts/builder-eval/cases/sankhya-not-connected-run.json` (new), `scripts/builder-eval/README.md`, `docs/development/builder-eval.md`, `tests/implementation/builder-eval-run.test.mjs` (new) | New test green; `builder-eval` suites green. Detail in study 20, section 5. |
| **U-INPUT** AC-1 script: print the model's real input for a Project, thread, mode, model and revision, in process, without a model call | AC-1; unblocks AC-30 | `scripts/builder-model-input.mjs` (new), `tests/implementation/builder-model-input.test.mjs` (new). Reads `apps/hub/src/builder/harness/{controller,prompt,modes}.ts` without editing them; if a seam is needed, export only, in `harness/prompt.ts`. | Test asserts the printed text for both modes contains the Conexus layer, the mode file and the `AGENTS.md` block, and none of the banned terms. Run it once for Leandro's reading (AC-30). |
| **U-SECRETS** Sandbox and thread secret scan on a real E2B VM (opt-in live test) | AC-15, AC-22 sandbox half | `tests/implementation/builder-secrets-scan-e2b-live.test.mjs` (new) | Seeds a run with known fake secrets in the Hub, asserts none appear in `env`, `/proc/*/cmdline`, the checkout, or the stored thread. E2B is authorized tonight. |
| **U-BACKUP** Backup and tested restore of the branch's Conexus Git folder and database dump | AC-31 (branch rehearsal) | `scripts/conexus-backup.sh` (new), `scripts/conexus-restore-check.sh` (new), `docs/reference/backup.md` (new) | `pg_dump` of `conexus_branch` via `docker exec` (read-only), tar of `CONEXUS_GIT_ROOT`; restore into a `--rm` scratch Postgres on a free port and a scratch folder; compare row counts and `git fsck`; `docker stop` the scratch container. Never the pilot's containers. |
| **U-PAPER** Qualification paperwork | Section 4 | `docs/tasks/stage2-builder-own-harness-qualification.md` (new), `docs/tasks/stage2-q4-sankhya-connector-qualification.md` (one link in the amendment), `docs/decisions/index.md` (C-032, C-033 drafts marked proposed), `docs/roadmap.md` (*Technology baseline*), `docs/evidence/builder-own-harness/README.md` (skeleton) | `npm run repository:check` green. Prose by Sonnet, reviewed by Opus. Leandro approves C-032/C-033 wording later. |

### Group 2: parallel with group 1, one unit per hot Hub file

| Unit | Closes | Files | Proof |
| --- | --- | --- | --- |
| **U-OM** Observational memory with Mastra Code's settings on the installation's memory model | AC-19 | `apps/hub/src/builder/module.ts` (the `Memory` at `:342`), `apps/hub/src/builder/memory.ts` (new; the copied settings of `@mastra/code-sdk` `dist/agents/memory.js` with the Apache notice), `tests/implementation/builder-memory.test.mjs` (new) | Test asserts the `Memory` options equal the copied literal settings and that the memory model resolves from the installation default of role `memory`. Check first with the `mastra` skill which OM options 1.71.0 accepts. |
| **U-ACCOUNTS** Sharing routes and the three installation defaults | AC-21, AC-23 (Hub half) | `apps/hub/src/builder/model-accounts.ts`, `apps/hub/src/builder/model-account-store.ts`, a new migration only if the default-model function lacks a writer (check `0033`), `tests/implementation/builder-model-account-routes.test.mjs` (new) | Non-administrator setting `everyone` gets 403; a second shared account for a provider gets 409; defaults for Planejar, Construir and memory are written and read back. Web screen excluded: it collides with #370 and the frontend freeze. |
| **U-Q6** Handler `connectors.fetch` beside `connectors.call` (part A only) | Q4 2d; unblocks `sales-dashboard` and AC-29 beyond purchase orders | Built from **`main`**, not the branch, as its own qualification PR per the Q4 task: `apps/hub/src/app-runner/worker.ts`, `apps/hub/src/connectors/handler-port.ts`, `apps/hub/src/connectors/sankhya/skill.ts`, the runner's handler SDK types, `builder-skills/conexus-server` (handler section), `tests/implementation/connector-handler-fetch.test.mjs` (new). Then merge `main` into `-int`. | Unit: a handler's fetch reaches the executor with the invocation's scope, returns only the handler's value to the browser, obeys 256 KiB and 8 calls. Leandro's three decisions are already recorded. Opus-level design check before code (it crosses the runner and Hub boundary). |

### Group 3: after group 1, serialized

| Unit | Closes | Files | Why later |
| --- | --- | --- | --- |
| **U-REMOVE** Delete `@mastra/factory` and `@mastra/code-sdk`, move storage to schema `mastra` with its own role, delete the GitHub settings route, drop `factory` schema and `hub_factory` | AC-24, AC-25, AC-18 storage half | `package.json`, `package-lock.json`, `apps/hub/src/builder/{runtime,sandbox,module}.ts`, `apps/hub/src/builder/openai-codex/*`, `apps/hub/src/builder/harness/plan-file.ts`, `apps/hub/src/platform/{secrets,factory-secret-encryption,config}.ts`, `apps/hub/src/http/app.ts`, `apps/hub/migrations/0039_*.sql`, `contracts/technical/hub-database-roles.json`, catalog snapshot, `scripts/builder-eval/scorers.mjs` (schema name), the tests that name `hub_factory` | Touches every hot file and `scorers.mjs` (U-EVAL). The drop is destructive on the branch database: write and test it in CI Postgres tonight; apply to the branch database only with Leandro's yes (nothing destructive tonight). |
| **U-RUN** Declared eval runs `todo-reload` and `erp/sankhya-not-connected` on the branch Hub | AC-27 (two of three), AC-12 | none (runs only) | Needs U-EVAL merged into `-int`, the branch Hub on that head, and U1 finished (one driver of the branch Hub at a time). |

### Blocked on Leandro

- The Sankhya credential typed in Integrações on `:4443` (AC-29, `sales-dashboard`). Adding
  `CONEXUS_SANKHYA_GATEWAY_ORIGIN` to the branch `hub.env` needs no one.
- The pass rule for `sales-dashboard` against real data: structural pass after Q-6 (route A,
  recommended) or exact figures on the simulator after #346 (route B). Study 20, section 2.
- AC-30: his reading of the model input printed by U-INPUT.
- The #342 versus spec 0003 contradiction on `node:` imports in handlers.
- Holding #373 (and #370) until the branch lands, against S1's merge-if-approved plan.
- E-1 (pilot on `main`) and Q4 2e (move the pilot's Q3 notebook app to `connectors.fetch`, then delete
  the per-operation path): both touch the pilot.
- The vendor-side read-only confirmation for the Q4 verdict (who confirmed the integration user
  only reads, and when).
- The web search tool for models without native search (AC-11): which search provider, and its key.
- The Claude subscription sign-in and API key accounts (AC-20): the code can be copied tonight, but
  the proof needs his sign-in; the Modelos de IA screen waits for the frontend freeze and #370.
- Applying U-REMOVE's drop migration to the branch database; the merge; the switch.

## Principles applied

- Prove It Works: `wire:bijection` failed when run alone; instead of recording a red check, I
  suspected the instrument, found it read a stale shared bundle, rebundled to the scratchpad and got
  the real verdict (pass).
- Laziness Protocol: units reuse what exists (the plan card, the Mastra `Memory` object, the existing
  default-model function) and leave the hot files to one integrator instead of adding coordination
  machinery for parallel writers.
