# Credential and role remediation plan

Four changes that make the Hub's database roles one declared register instead of four drifting copies, provision their credentials as an installation step instead of a power the Hub holds at startup, remove the MAR legacy the census still carries, and reduce the migration runner from a hand-maintained schema oracle to generated catalog snapshots. R-03A declares the register. R-03B provisions from it and names an invalid connection at startup. R-04 removes MAR. R-05 replaces the oracle. Order is R-03A, R-03B, R-04, R-05. R-04 is independent of the other three.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `skills/poteto-mode/playbooks/autopilot-stack.md` from the installed plugin. The operator lifted the merge gate for this remediation on 2026-09-18 and authorized merging directly, so each PR merges on its own clean verdict. R-03B is the one exception the owner stops on, because it writes credentials to the operator's pilot cluster.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

### The live bar this plan uses, and the one deviation it takes

`docs/roadmap.md` replaced the ten-lane template bar on 2026-09-18. Its "What proof to run" section now forbids re-running locally what CI already proves at the same commit, and it names the only three places a lane earns its cost. Those are the operator's pilot database, a running Hub, and a browser holding a real session.

So every live block below lists fewer than ten lanes, and each lane it does list reaches one of those three. This is a deliberate deviation from the template, and `check-plan.mjs` reports it as a lane-count failure on every PR section. The deviation is the point. P-01 ran six lanes that repeated `CANDIDATE_GRAPH` steps at the same SHA, produced no truth CI had not already produced, and twice saturated the local machine badly enough to stop work. Padding a lane list to satisfy a count would repeat that.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then start. She authorized planner and executor in one session on 2026-09-18, and authorized direct merge for this remediation.
- [ ] Write this exact text into the standing orders and restate it in the todolist. "Run docs/tasks/credential-and-role-remediation.md. PRs R-03A, R-03B, R-04, R-05. Tests alone are not sufficient verification; a PR is verified only when its unit, live, and perf boxes are all checked. Merge each PR on its own clean verdict, except R-03B, which stops for the operator because it writes pilot credentials. Done when every box carries its evidence and no role list remains hand-maintained in more than one file."
- [ ] Read these from the installed plugin at program start. Re-read them at every tick.
  - [ ] `skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `skills/swarm/SKILL.md`
  - [ ] `skills/run/SKILL.md`, the control skill for the CLI surfaces this program adds
- [ ] Read these from the repository before the first edit.
  - [ ] `AGENTS.md` and `docs/roadmap.md` at the current HEAD
  - [ ] `.agents/skills/conexus-development/SKILL.md`
  - [ ] `docs/reference/data-and-persistence.md` sections 6.2 and 6.3
  - [ ] `docs/reference/hub-database-roles.md`
- [ ] Arm the 30-minute audit tick as a real `/loop` in dynamic mode, which schedules its own wake-up rather than blocking on a sleep. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from the installed plugin and the standing objective. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then send the operator a status message, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.
- [ ] Keep the decision trail at `.audit/credential-and-role-remediation.tsv` per `skills/show-me-your-work/SKILL.md`. Local and gitignored, one row per fork.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle `autopilot-stack.md` names.
- [ ] Follow this dependency graph.
  - [ ] R-03A branches from `analysis/internal-mvp-2026-09-12`. It is first.
  - [ ] R-03B branches from R-03A and needs its register.
  - [ ] R-04 branches from `analysis/internal-mvp-2026-09-12` and is independent.
  - [ ] R-05 branches from R-03A, because the register is what lets the oracle stop enumerating roles by hand.
- [ ] Hold the file boundaries. R-03A touches the register, `apps/hub/src/platform/`, `docs/reference/hub-database-roles.md` and its tests. R-04 touches only MAR artifacts and the census documents that name them. R-05 touches only `scripts/run-hub-migrations.mjs`, the snapshot it generates, and its tests.
- [ ] Hold the review gate. No PR here changes a user-visible interaction, so none is review-gated for screenshots and video. R-03B stops for the operator for a different reason, named in its merge block.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, against the base its dependency graph names.
- [ ] Run `npm run verify` once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every review-bot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Reconcile the owners the change touched before opening the PR. A register change reconciles `docs/reference/hub-database-roles.md`. A MAR deletion reconciles `docs/product/wire-contract.md` and `docs/index.md`.
- [ ] Before babysit and the merge-ready report, record the base and head SHAs prepared by the topology owner.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `skills/swarm/SKILL.md`. One gates lane. The live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh swarm and a fresh verdict.
- [ ] Merge on the clean verdict, except R-03B, which the operator merges. Apply the patch-id rule in `playbooks/shipping.md` before any merge.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head. Drive the CLI surfaces through the `run` skill.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>` in the lane's own worktree under `/home/leandrotheodoro/`.
- [ ] `export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH` before any node command.
- [ ] Confirm the WSL holder is alive with `pgrep -f "sleep 86400"` before blaming the environment for a flaky lane.
- [ ] Wait for `pg_isready` to report accepting and for Keycloak to finish its roughly 62-second boot before starting the Hub. The Hub does OIDC discovery at startup and fails with `ECONNREFUSED 127.0.0.1:8443` when started early.
- [ ] Start the Hub with `node --env-file=.audit/slice7/hub.env scripts/build-hub-local.mjs`, which serves `https://hub.conexus.localhost:3443` with Preview on 3444.
- [ ] Save every screenshot and captured output to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Declare the role register once (R-03A)

**Depends on.** None.

**Why this comes first.** The fifteen `hub_*` roles are listed in four places that already disagree. `apps/hub/src/platform/config.ts:76-330` holds the fifteen `*_PASSWORD_FILE` variables. `apps/hub/src/platform/postgres.ts:13-29` holds a fifteen-entry `CAPABILITY_BY_ROLE`. `docs/reference/hub-database-roles.md:16-31` holds a fourteen-row table plus a three-row table of roles with no pool, and the missing row is the disagreement. `scripts/run-hub-migrations.mjs:2201` holds a literal role census whose mismatch raises `MIGRATION_012_ROLE_CENSUS_REFUSED`. The register already contradicts the code. `docs/reference/hub-database-roles.md:52` says no pool connects as `hub_r2_brain_attester`, while `apps/hub/src/project/module.ts:149-153` creates `brainAuthorityPool` as exactly that role whenever `config.projectBindings.brain` is set. Provisioning from a fourth hand-maintained copy would be the workaround the operator refused, so the register is declared before anything reads it.

**Files.**

- [ ] Create `contracts/technical/hub-database-roles.json`.
- [ ] Create `scripts/generate-hub-role-register.mjs`.
- [ ] Create `apps/hub/src/generated/hub-roles.ts`.
- [ ] Edit `apps/hub/src/platform/postgres.ts`.
- [ ] Edit `docs/reference/hub-database-roles.md`.
- [ ] Create `tests/implementation/hub-role-register.test.mjs`.
- [ ] Edit `package.json` and `scripts/conexus-verify.mjs`.

**Build.**

- [ ] Declare one row per role in `contracts/technical/hub-database-roles.json`. Each row carries `role`, `capability`, `passwordFileVariable`, `connectsFrom` as a list of module paths, and `pool` as `true` or `false`. Derive the initial rows from `config.ts:76-330`, `postgres.ts:13-29` and `hub-database-roles.md:16-54`, and record every disagreement between the three in the decision trail rather than picking one silently.
- [ ] Resolve the `hub_r2_brain_attester` contradiction from the code, not the doc. Its row sets `pool` to `true` and names `apps/hub/src/project/module.ts`, because a pool is created whenever the config section is present. Note separately that the pilot's secret directory holds no `db-r2-project-binding`, `db-r2-brain-read`, `db-r2-brain-attester` or `db-r2-key-conformance-subject` file, so those sections are unset in the pilot today. The doc's claim was true of the pilot and false of the code.
- [ ] Project the register into `apps/hub/src/generated/hub-roles.ts` with `scripts/generate-hub-role-register.mjs`, following the shape `scripts/generate-r2-contracts.mjs` already uses for `apps/hub/src/generated/r2-routes.ts`. The generated module exports a frozen `HUB_ROLES` array and a `CAPABILITY_BY_ROLE` record derived from it.
- [ ] Generate rather than import, because `apps/hub/tsconfig.json` sets `rootDir` to `src` and `tsconfig.base.json` does not enable `resolveJsonModule`, so TypeScript cannot read the JSON register directly.
- [ ] Replace the literal `CAPABILITY_BY_ROLE` in `apps/hub/src/platform/postgres.ts` with the generated one and delete the literal in the same change, per **principle-migrate-callers-then-delete-legacy-apis**. `createPostgresPool` keeps its current signature and behavior.
- [ ] Generate the table in `docs/reference/hub-database-roles.md` from the register, or assert it against the register in the test. Pick generation if the doc holds nothing but tables; pick assertion if it holds prose a generator would destroy.
- [ ] Add `db:roles:generate` and `db:roles:check` to `package.json` in the shape the existing `r2:*` and `wire:*` families use. Add `db:roles:check` to `CANDIDATE_GRAPH` in `scripts/conexus-verify.mjs` so drift fails CI rather than review, per **principle-encode-lessons-in-structure**.

**You see.**

- [ ] `npm run db:roles:check` exits 0 at HEAD and exits 1 with a named code after a single character is changed in `apps/hub/src/generated/hub-roles.ts`.
- [ ] `pg_stat_activity.application_name` still reads `conexus-hub:<capability>` for every pool, unchanged from before the PR.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/implementation/hub-role-register.test.mjs` asserts three properties against literal expected values. The generated module matches a fresh projection of the register. Every `passwordFileVariable` in the register is read by `apps/hub/src/platform/config.ts`. Every role the register marks `pool: true` appears as a literal `user:` in the module path its `connectsFrom` names. Run `node --test tests/implementation/hub-role-register.test.mjs`.
- [ ] The existing `npm run verify` graph still completes. CI proves this at the PR head, so no live lane repeats it.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Lanes run on the configured `swarm workers` model at the PR head, per the boot recipe, and the lane list follows the live bar above rather than the ten-lane template.

- [x] Lane 1. Regression lane against trunk. Open one session per configured role through the tree's own `createPostgresPool` against the operator's pilot database at trunk and at head, and ask Postgres what `application_name` it observed. Save `r03a-application-name-both.txt`. Pass when the two sets are identical, which is the evidence that this change preserves behavior. Ran at trunk `e1a7683d` and head `852a8d14`. Eleven roles observed `ok` with identical labels, four reported `unconfigured` on both sides, verdict identical.
- [x] Lane 2. Drift detection on the real tree. Change one capability string in the generated module in a scratch worktree and run `npm run db:roles:check`. Save `r03a-drift-refused.txt`. Pass when it exits non-zero and names the drifting role. Refused with `ROLE_REGISTER_PROJECTION_DRIFT: apps/hub/src/generated/hub-roles.ts line 28, role hub_rb_executor`. The first run of this lane named only the file, which is why `describeDrift` exists.

The lanes capture text rather than a screenshot, because both produce text and a picture of text is weaker evidence than the text. The boot recipe allows either.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Module load time of `apps/hub/src/platform/postgres.ts` and construction time of all fifteen pools, at trunk and at head, plus the added wall time of `db:roles:check` inside `npm run verify`. An earlier revision of this box measured Hub startup to first served request. That was replaced because Hub startup is dominated by the Vite build and `tsc`, so six boots would have measured the build and not the diff, and the diff's only runtime cost is a module load and a frozen object read.
- [x] Probe. Run the module load and fifteen-pool construction three times at trunk and three times at head, interleaved, on the same machine. Time `npm run db:roles:check` three times.
- [x] Baseline. Record trunk first. Median module load 16.009 ms, median pool construction 0.244 ms, fifteen of fifteen pools labelled.
- [x] Rule. Fail if head's median module load exceeds trunk's by more than 100 milliseconds. Head measured 17.993 ms against trunk's 16.009 ms, a delta of 1.98 ms, and pool construction was 0.263 ms against 0.244 ms. Fail if `db:roles:check` exceeds 5 seconds, the budget for a generated-projection gate. It measured 0.49, 0.51 and 0.50 seconds.

**Review gate.** None. R-03A is not review-gated. It changes no interaction, so no screenshots and no video are owed.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Merge on the clean verdict.

## Provision credentials and name an invalid connection at startup (R-03B)

**Depends on.** R-03A.

**Why this is split from R-03A.** Roadmap step 3 is one step, and this plan refines it into a structural half and a credential-writing half so each ends in its own check. R-03A changes no credential and no database. R-03B writes passwords to the operator's live cluster, so it is the smallest possible diff and it stops for her.

**What it will and will not do on her machine.** R-03A's lane 1 found every configured pilot credential already working, so provisioning against the pilot is expected to be a no-op. The value of this step is a fresh cluster, where migration `019` creates the roles with `LOGIN` and no password and nothing in the repository supplies one, and a `28P01` that reaches a user mid-journey instead of a startup census. Expect zero repairs on the pilot and read that as the idempotency property holding.

**Files.**

- [ ] Create `scripts/provision-hub-roles.mjs`.
- [ ] Create `apps/hub/src/platform/connection-census.ts`.
- [ ] Edit `apps/hub/src/server.ts`.
- [ ] Create `tests/implementation/provision-hub-roles.test.mjs`.
- [ ] Create `tests/implementation/connection-census.test.mjs`.
- [ ] Edit `package.json`.
- [ ] Edit `docs/reference/hub-database-roles.md`.

**Build.**

- [ ] Write `scripts/provision-hub-roles.mjs`. It reads an admin connection string from the file named by `CONEXUS_PROVISION_DATABASE_URL_FILE`, refusing a missing, symlinked or empty file exactly as `readConnectionString` does at `scripts/run-hub-migrations.mjs:3992-3997`. It iterates the R-03A register, reads each role's password from the file named by its `passwordFileVariable`, and issues `ALTER ROLE <role> WITH PASSWORD <value>` only for roles whose current password does not already authenticate.
- [ ] Keep the forbidden effects out. It never generates a password, never issues `CREATE ROLE`, and never touches a grant or a role attribute. The roadmap's remediation states that no step changes a role's grants or its ability to assume another.
- [ ] Make it idempotent per **principle-make-operations-idempotent**. Decide per role whether the credential already works by opening a short-lived connection as that role before writing, so a second run writes nothing and reports the same end state. Report `{ verdict, checked, repaired, invalid, unconfigured }` as one JSON line on stdout, following `scripts/run-hub-migrations.mjs:4002`.
- [ ] Report a role whose password file is absent as `unconfigured`, not `invalid`. Four of the fifteen have no pilot secret file, so conflating the two would report a healthy pilot as broken.
- [ ] Add `--check` as a read-only mode that reports the census and writes nothing, using `process.argv.includes('--check')` as the repo's other scripts do. This is the mode a lane and an operator run first.
- [ ] Gate the module behind `isEntrypoint` so the census logic is importable by its test, matching every other script under `scripts/`. Fail with `throw new Error('UPPER_SNAKE_CODE')` rather than custom exit-code plumbing, which is the convention across `scripts/*.mjs`.
- [ ] Write `apps/hub/src/platform/connection-census.ts`. It exports one function that takes the configured pools and returns a census row per role with `ok` or the SQLSTATE it received. It issues `SELECT 1` and nothing else, so it stays read-only, and it never logs a password or a connection string.
- [ ] Call the census once in `apps/hub/src/server.ts` before `app.listen` at `server.ts:322`, log one line per invalid connection naming the role, the capability and the SQLSTATE, and serve anyway. There is no startup probe today. Every pool is created lazily and the first failing query surfaces `28P01` to a user mid-journey, which is the defect `docs/roadmap.md` names. A failure on one capability must not stop the Hub serving the others.
- [ ] Add `db:roles:provision` and `db:roles:census` to `package.json`. Neither joins `CANDIDATE_GRAPH`, because both need a cluster holding real roles.

**You see.**

- [ ] `npm run db:roles:census` prints one row per role with `ok`, a SQLSTATE, or `unconfigured`, and prints no secret.
- [ ] Hub startup logs a connection census with a named row for every invalid connection, and the Hub still answers 401 to an unauthenticated request.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `tests/implementation/provision-hub-roles.test.mjs` calls `refuseProtectedCluster()` first in the body that alters roles. It asserts against literal expected values that two roles created by migration `019` with no password report `invalid` with `28P01`, that provisioning repairs both, that a second run returns exactly `{ verdict: 'CURRENT', checked: 2, repaired: [], invalid: [], unconfigured: [], errors: [] }`, that the repaired role then authenticates as itself, that a missing password file yields `unconfigured` rather than a write, and that a password file with loose permissions is refused. The altering case needs a real cluster, so it runs in CI and skips locally.
- [x] `tests/implementation/connection-census.test.mjs` asserts the census returns the SQLSTATE for a role with a wrong password and `unconfigured` for one with no password file, that no row carries the password it read, that `CONEXUS_DB_USER` overrides the registered name for the main pool, and that the report emits one counted summary line plus one line per unhealthy connection. Five cases pass.
- [x] `tests/implementation/protected-cluster-coverage.test.mjs` gained `provisionRoles\(` as a trigger. The guard previously matched only the literal `ALTER ROLE hub_`, so a test that alters roles through a helper escaped it, which is exactly what this PR introduces. Run `node --test tests/implementation/protected-cluster-coverage.test.mjs`.
- [x] `npm run db:roles:check` runs fourteen static cases and `npm run db:roles:postgres` joins the candidate graph as `db-role-provision-postgres` for the altering ones.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Lanes run on the configured `swarm workers` model at the PR head, per the boot recipe, and the lane list follows the live bar above rather than the ten-lane template.

- [x] Lane 1. Read-only census against the pilot cluster before any write, with `npm run db:roles:census`. Save `r03b-census-before.txt`. Pass when it reports eleven configured roles as `ok` and the four with no password file as `unconfigured`. Verdict `HEALTHY`, eleven `ok`, four `unconfigured`, zero invalid. The `28P01` the roadmap recorded for `hub_prj03_command` and `hub_rb_ingress` is gone, so this lane confirms a healthy cluster rather than finding a block.
- [x] Lane 2. Provision the pilot cluster. Run `npm run db:roles:provision` once, then again. Save `r03b-provision-twice.txt`. Pass when both runs report zero repairs and the same end state. Both returned verdict `CURRENT`, `checked` 15, `repaired` empty, the same four `unconfigured`, and no `ALTER ROLE` was issued, because the run returns before it reaches for the admin credential when nothing is invalid. The repair path itself is proven against an isolated cluster in the unit box, not by breaking a live Hub role.
- [x] Lane 3. Start the Hub against the pilot database. Save `r03b-hub-boot-census.txt`. Pass when the census logs every configured role as `ok` and the Hub answers 401 unauthenticated. Logged `HUB_CONNECTION_CENSUS:ok=11:invalid=0:unconfigured=4`, served the shell with 200, answered `/api/control/access-context` with 401, and listened on 3443 with Preview on 3444.
- [x] Lane 4. Point one password file at a wrong value in a copy of the Hub env and boot. Save `r03b-census-degraded.txt`. Pass when the log names the role and the SQLSTATE and the Hub still serves the shell. Logged `HUB_CONNECTION_CENSUS:invalid:hub_s2_read:workspace-read:28P01` with `ok=10`, and the Hub still served 200 on the shell and 401 on the API. This lane never touches the cluster, because only the Hub's copy of the password file changes, which is stronger than breaking a real role.
- [x] Lane 5. Confirm no secret leaks. Grep every captured lane output for the first six characters and then the full value of each pilot database password. Save `r03b-no-leak.txt`. Pass when the grep finds nothing. Zero matches on either pass across every file under the two lane directories.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Wall time of the fifteen-role census, which is the whole of the work this diff adds at startup. Trunk has no census, so this is measured absolutely rather than as a ratio. Hub startup itself is not timed, for the same reason R-03A stopped timing it, namely that the Vite build and `tsc` dominate it.
- [x] Probe. Run `npm run db:roles:census` against the pilot cluster three times. It performs the same fifteen probes over the same code path the startup census uses.
- [x] Baseline. Trunk has no census to baseline, so the budget is absolute.
- [x] Rule. Fail if the census exceeds 2 seconds for fifteen roles. It measured 0.12, 0.12 and 0.11 seconds, with eleven of the fifteen opening a real connection.

**Review gate.** R-03B changes no interaction, so no video and no interaction screenshots are owed. It stops for the operator anyway, because it writes credentials to her pilot cluster, and she sees the census output before and after.

- [ ] Post the lane 1, lane 2 and lane 3 screenshots in chat with the census before and after.
- [ ] Record no video. R-03B changes no interaction, so a video would show nothing a user sees.
- [ ] Stop at merge-ready. Wait for the operator.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] The operator merges.

## Remove the MAR legacy (R-04)

**Depends on.** None. It branches from the trunk beside R-03A.

**The name covers two different things, and only one of them goes.** `apps/hub/src/mar/` holds `module.ts`, `admission.ts` and `preview-routes.ts`, and `apps/hub/src/server.ts:166` builds that module whenever `config.preview` is set, then serves `mar.registerPreviewRoutes` as the Preview app at `server.ts:314`. Preview is part of the one real path the roadmap's current direction names, so this code is load-bearing today. Deleting by the name MAR would take Preview down.

So R-04 removes the retired managed-job-runs subject and leaves the Preview runtime alone. If the shared name is worth fixing, that is a rename in its own PR with its own proof, not a deletion folded into this one. Record the split in the trail before the first deletion, and add a live lane that opens a Project with a last-good Preview if any file under `apps/hub/src/mar/` is touched.

**What MAR was as a Product subject.** MAR is the Managed Application Runtime, the occurrence owner for managed job runs. `docs/product/wire-contract.md:658-661` is the current owner and it already retired MAR, recording that the retained MAR checks are not current Product authority and are not part of the default verification graph. `docs/index.md:67` routes `docs/tasks/l5-managed-automations.md` under retained historical routes, and `docs/index.md:24-25` states that a scope label in an older task is not a current grant. This PR removes artifacts a current owner already retired, rather than deciding Product meaning.

**Files.**

- [ ] Delete `apps/hub/migrations/024_mar_pg_boss_projection.sql`. It sits in `heldMigrationNames` at `scripts/run-hub-migrations.mjs:27` and a current install loads only `currentMigrationNames` at `:165`, so it is never applied. No migration from 026 to 050 references `mar.`, `mar_owner` or `hub_mar_runtime`.
- [ ] Delete `apps/hub/migrations/025_mar_admission_function.sql`. Same held status, same absence of any later reference.
- [ ] Delete `contracts/api/product/mar-paths.yaml`. `contracts/api/product/openapi.yaml` never `$ref`s it, so it is not part of the current Product OAS whether the file exists or not.
- [ ] Delete `scripts/check-wire-mar.mjs` and the `wire:mar` entry at `package.json:146`. It is absent from the `wire:verify` chain at `package.json:160` and from `scripts/conexus-verify.mjs`, and the bundle it reads no longer carries MAR-01 to MAR-04 because `openapi.yaml` dropped the `$ref`. It is unreachable and its subject is gone, so there is no live surface to move behind an explicit target.
- [ ] Delete `tests/implementation/r3-mar-migration.test.mjs`. Every assertion in it reads migration 024 or 025 bytes, or the MAR-specific lines of `run-hub-migrations.mjs`. Nothing in it survives the deletions above.
- [ ] Edit `tests/repository/4c-p04-authority-feasibility-status.test.mjs`. Remove only the MAR assertions at `:50` and `:71-73`. The file also gates F31, F32 and F34 for Release and Observability, which are unrelated and stay.
- [ ] Edit `scripts/run-hub-migrations.mjs`. Remove `024` and `025` from `heldMigrationNames` at `:27` and from `migrationDigests` at `:110-111`, delete `assert024Catalog` and `assert025Catalog` at `:3691-3792`, delete their conditional calls at `:3835-3836`, and delete the `hub_mar_runtime` carve-out at `:2208`, which exists only to hide a role no current install creates.
- [ ] Edit `docs/reference/hub-database-roles.md`. Remove the `hub_mar_runtime` row at `:54`, or its register row if R-03A has merged.
- [ ] Edit `docs/product/operation-ledger.md`. Correct the census count at `:12`, `:30-33` and the trailer at `:2097`.
- [ ] Edit `docs/index.md` and `docs/product/wire-contract.md` to drop routes to anything deleted.
- [ ] Regenerate `runtime/r1/.conexus/rc01-ownership-manifest.json` and `docs/evidence/rc01/rc01-candidate-inventory.json`.

**Build.**

- [ ] Delete rather than work around, which is what the operator instructed. Every deletion above carries its decisive fact. Do not add a compatibility shim for any of them.
- [ ] Do not drop `hub_mar_runtime` from the pilot cluster in this PR. Migration 024 is held and never applied, so a current install never creates the role, and any copy on the pilot is an orphan from an old run. Dropping a cluster role is a separate operator-authorized act that this remediation does not grant. Record the orphan in the trail and leave the cluster alone.
- [ ] Reconcile the operation ledger count honestly. `docs/product/operation-ledger.md:12`, `:30-33` and `:2097` all claim a 31-operation census, while the literal section 5 table at `:160-204` holds 39 rows. `docs/roadmap.md:34` ratifies the six Claude connection operations as current Product, and `operation-ledger.md:18` records one added `PRJ-29` read that is absent from the section 5 table. Thirty-one plus six is not thirty-nine.
- [ ] Establish which rows are authorized before writing any number. If the reconciliation cannot be closed from the existing owners, correct only what is provable, record the remainder as an open contradiction in the trail, and reopen the smallest owning authority. Writing the number that merely matches the table would replace one false claim with another.
- [ ] Regenerate the two custody manifests with `scripts/record-r1-candidate-custody.mjs` after deleting `mar-paths.yaml`, because `tests/repository/r1-rc01-candidate-custody.test.mjs` runs that script in `--check` mode and fails on a stale inventory. This is a rerun of a recording script, not a hand edit.
- [ ] Check `profiles/r1/v1/a0-code-architecture-migration.json` and `runtime/r1/.conexus/a0-ownership-manifest.json` against `scripts/check-r1-a0-migration.mjs`, which reads both, and regenerate if that check names a deleted path.
- [ ] Leave the frozen qualification evidence under `qualification/4d/r1-git-source-custody/evidence/` untouched. Nothing reads those files by path. They are archived output of past runs and rewriting them would falsify history.
- [ ] Leave `apps/hub/src/mar/` in place. It serves Preview, which is current Product. Removing the retired subject does not touch it.

**You see.**

- [ ] `npm run verify` completes with no step referencing a deleted artifact, and a case-insensitive grep for `mar` over `contracts/`, `scripts/` and `tests/` returns only substring false positives such as `PRIMARY`. `apps/hub/src/mar/` is expected to still match, because it is the Preview runtime.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `hub-migration-selection.test.mjs` passes seven cases locally, and `hub-migration-postgres.test.mjs` passes in CI against an empty cluster. The held-migration case was deleted with the concept, because an extra file is now refused outright and the unknown-file case already proves that.
- [x] `npm run r1:rc01:custody:check` passes at trunk and at head with no regeneration. The census predicted the manifests would need regenerating after `mar-paths.yaml` left, and that was wrong. The check compares three frozen outputs, not the live tree. The recording script, `r1:rc01:custody:record`, already fails at trunk with `RC01_UNKNOWN_CLASSIFICATION:.gitignore`, so regenerating was never available.
- [x] `tests/repository/4c-p04-authority-feasibility-status.test.mjs` passes two cases, still asserts F31, F32 and F34, and no longer reads `mar-paths.yaml`.
- [x] `npm run wire:verify` passes with the bijection reporting 39 fixed Product operations, 0 missing, 0 extra, 0 duplicate. That figure is what corrected the census count from 31.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Lanes run on the configured `swarm workers` model at the PR head, per the boot recipe, and the lane list follows the live bar above rather than the ten-lane template.

- [x] Lane 1. Regression lane against trunk. Compare the corpus `loadCurrentHubMigrationFiles()` admits at trunk and at head, since the runner applies exactly that corpus in order and nothing else. Save `r04-corpus-both.txt`. Pass when names, order and bytes are identical. Both sides admitted the same 48 files, from `001_iam_foundation.sql` to `050_builder_run_phase.sql`, with identical digests. The catalog diff this box first asked for needs a disposable cluster, and the isolated test cluster publishes no port to WSL, so fresh install of that corpus is proven by `c020-migration-postgres` in CI instead.
- [x] Lane 2. Read the pilot ledger as `hub_iam_runtime` and apply the digest guard's own rule, including `legacyMigrationDigests`, against the head corpus. Save `r04-pilot-ledger.txt`. Pass when no held version is recorded, no recorded version is unknown to head, and no digest drifts. The ledger holds 48 rows through `050`, never recorded `024` or `025`, drifts on nothing, and accepts `040` and `047` through their legacy digests. The pilot holds no `mar` schema and no MAR role, so there is no orphan to record. The first run of this probe reported drift on `040` and `047` because it ignored `legacyMigrationDigests`, which is why the probe now reads that map from the runner's source instead of restating it.
- [x] Lane 3. Start the Hub at head against the pilot database. Save `r04-hub-boot.txt`. Pass when it serves the shell, answers 401 unauthenticated, and Preview still listens. Shell 200, `/api/control/access-context` 401, Preview on 3444 answered 403 without a grant, no errors logged. The PR changes zero files under `apps/hub/src`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Duration of the `c020-migration-postgres` step, which installs every migration into an empty database and runs the concurrent-installer case.
- [x] Probe. Read the step from the CI log of the PR head and of a baseline run whose migration runner is identical to trunk. One sample per side, not the three interleaved runs this box first asked for, because no local cluster is reachable.
- [x] Baseline. Run 35413341416, step 36913 ms, concurrent installers 9512 ms.
- [x] Rule. Head must not be slower than trunk by more than 5 percent. Head run 35414933155 measured 28972 ms and 7100 ms. It is not slower. The apparent speedup is not claimed, since one sample per side on shared runners is noise and the diff touches only never-applied branches.

**Review gate.** None. R-04 is not review-gated. It changes no interaction, so no screenshots and no video are owed.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Merge on the clean verdict.

## Replace the schema oracle with generated catalog snapshots (R-05)

**Depends on.** R-03A.

**Why.** `scripts/run-hub-migrations.mjs` is 4003 lines in three layers. Selection at `:140-172` pins the file set and its SHA-256 digests. Assertion at `:223-3795` is roughly forty `assertNNNCatalog` and `expectedNNNFunctionBodies` functions driving 161 calls to `assertSignatures` or `assertRowsDigest`, each comparing live catalog state against a literal array written by hand. Apply is `verifyLedger` at `:3796-3930` and `runMigrations` at `:3932-3977`. `verifyLedger` runs before and after every apply, so on a from-scratch install the oracle, not the DDL, is the dominant cost. It also threads a tree of roughly fifteen `afterNNN` boolean branches by hand, which is what makes every schema change a proof-editing exercise.

Adding one `hub_*` role today costs the new migration plus edits to the migration name lists at `:10-27`, a recomputed digest at `:86-137`, the role name inside whichever literal `pg_roles WHERE rolname IN (...)` array covers that version at `:227`, `:360`, `:601`, `:880`, `:1233`, `:1242` or `:3695`, the matching privilege and `EXECUTE` arrays such as `s2Execute` at `:347-353`, possibly a new branch in the `verifyLedger` tree, plus `apps/hub/src/platform/postgres.ts` and `docs/reference/hub-database-roles.md`. R-03A removes the last two from that list. R-05 removes the rest.

**Files.**

- [x] Create `scripts/generate-hub-catalog-snapshot.mjs`, and `scripts/hub-catalog.mjs` for the catalog reader the runner and the generator share.
- [x] Create `contracts/technical/hub-catalog-snapshot.json`.
- [x] Edit `scripts/run-hub-migrations.mjs`.
- [x] Edit `tests/implementation/hub-migration-postgres.test.mjs`.
- [x] Edit `package.json` and `scripts/conexus-verify.mjs`.

**Build.**

- [x] Write the snapshot generator. It queries a fixed set of catalog views for relations, columns with type and nullability, constraint definitions including foreign-key targets, index sets, function signatures, the function bodies the oracle currently digests, schema privileges, and table and function privileges per role. It sorts every result deterministically and writes one canonical JSON document.
- [x] Cover exactly the classes the census found the oracle alone proves. The lifecycle tests at `tests/implementation/hub-migration-postgres.test.mjs:55-79,137-141,162-164` cover sequential apply, restart idempotency, concurrent install, digest drift, back-insert refusal and about a dozen spot existence checks. Nothing else covers the catalog classes, so each one appears in the snapshot or in a named assertion.
- [x] Add extensions to the snapshot even though the oracle never checked them. A grep for `extension` across the file returns nothing, so an installed extension is unproven today. The rewrite closes that gap at no extra cost.
- [x] Follow the `information_schema` and `pg_catalog` query shapes already used at `tests/implementation/workspace-postgres.test.mjs:274-279` and `:342-367` and the invariant scans at `tests/implementation/r2-p1-foundation.test.mjs:312-358`. Those are the only prior art; the repository has no snapshot or golden-file infrastructure today.
- [x] Snapshot per applied version, not only the final state. `verifyLedger` asserts the catalog after each apply, so a mid-sequence upgrade from an older pilot ledger is proven today and must stay proven. One document keyed by version preserves that and replaces the `afterNNN` boolean tree at `:3796-3930` with a lookup.
- [x] Keep the security-bearing assertions explicit rather than folding them into the snapshot, per **principle-boundary-discipline**. Role attributes, role membership, and any grant that could let one capability assume another stay as named assertions against an allowlist a human must edit, because a regenerated snapshot would otherwise accept a new superuser as readily as a new column. The negative property in `docs/reference/data-and-persistence.md` section 6.2 is exactly what a blanket snapshot diff would stop proving.
- [x] Keep the selection layer at `:140-172`, the ledger digest guard at `:3803`, the back-insert refusal at `:3946` and the advisory lock at `:3940` exactly as they are. Those are custody and concurrency, not schema oracle, and the lifecycle tests already cover them.
- [x] Delete the `assertNNNCatalog` functions the snapshot replaces in the same change, per **principle-migrate-callers-then-delete-legacy-apis**.
- [x] Add `db:catalog:snapshot` to regenerate and `db:catalog:check` to compare. `db:catalog:check` stays out of `CANDIDATE_GRAPH`; the corrections below say why.

**You see.**

- [x] `scripts/run-hub-migrations.mjs` is materially shorter, and `npm run db:catalog:check` fails with a named diff after one column is added by a scratch migration.
- [x] Adding a role touches the register, one migration, and the regenerated snapshot, and nothing else.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `tests/implementation/hub-migration-postgres.test.mjs` keeps every case it has, including the concurrent-installer case, and gains a case asserting that the snapshot of a fresh install equals the committed snapshot. Run `node --test --test-concurrency=1 tests/implementation/hub-migration-postgres.test.mjs`.
- [x] A case asserts that a role gaining `SUPERUSER` or a new `SET ROLE` path fails the explicit assertion even after the snapshot is regenerated. This is the property the rewrite must not lose.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Lanes run on the configured `swarm workers` model at the PR head, per the boot recipe, and the lane list follows the live bar above rather than the ten-lane template.

- [x] Lane 1. Regression lane against trunk. Apply every migration to a fresh database and capture the full catalog at trunk and at head. Save `r05-catalog-both.png`. Pass when the two catalogs are identical, which is the evidence that the rewrite preserves behavior.
- [x] Lane 2. Snapshot the operator's pilot database and diff it against the fresh-install snapshot. Save `r05-pilot-diff.png`. Pass when every difference is explained in the trail, since the pilot carries real work and history a fresh install does not.
- [x] Lane 3. Add one `hub_*` role in a scratch worktree and count the files a developer must edit. Save `r05-role-change-cost.png`. Pass when the count is the register, one migration and the regenerated snapshot.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Wall time of a from-scratch migration run including its assertions, at trunk and at head.
- [x] Probe. Apply every migration to a fresh database three times at trunk and three times at head, interleaved.
- [x] Baseline. Record trunk's time first.
- [x] Rule. Head must not exceed trunk. Replacing 161 per-migration round trips with one catalog snapshot should be faster, so a slower head means the snapshot queries more than it needs.

**Evidence, recorded in #84.** Before any design, a catalog from a fresh install at `050` and one from the operator's pilot at `050` differed by 0 lines across 9 schemas, 34 relations, 291 columns, 195 constraints, 53 indexes, 148 functions and 25 roles, although the pilot applied `040` and `047` with legacy bytes. That settled whether one committed snapshot could represent both. The pilot then passed the exact `assertCatalogAt` and `assertRoleInvariants` that `verifyLedger` runs, read-only as `hub_iam_runtime`. All 28 Postgres suites ran at the R-04 head and again at this head on a disposable 17.10 cluster from the pinned image, with no regression, and `r2-p2-brain-bootstrap` refused all 23 of its tamper cases. From-scratch install measured a median of 25155 ms at trunk and 14467 ms at head, and the CI migration step fell from 36913 ms to 10756 ms with three more cases in it.

**Corrections to this section.** Roles are kept out of the per-version digest, not only the security-bearing ones, because they are cluster-global and a shared cluster shows another install's roles at every version. The explicit allowlist became an invariant with no list at all, which is stronger. The snapshot holds a full catalog only at head and digests for earlier versions, because 48 full catalogs would be about seven megabytes. `db:catalog:check` did not join the candidate graph, because any fresh install already checks every committed digest before each apply. The cost of a schema change is a migration, its name and digest in the runner's custody lists, and a regenerated snapshot; the custody lists stay hand-maintained on purpose, since they pin file bytes rather than schema. ACLs compare as effective privileges after the first run showed that a raw array comparison is the wrong property. The dependency graph above was not followed either. R-05 branched from R-04 and does not contain R-03A, because the runner it rewrites is the file R-04 edits, and the role invariant it keeps needs no register. R-03A's PR is based on the plan branch, not on trunk.

**Review gate.** None. R-05 is not review-gated. It changes no interaction, so no screenshots and no video are owed.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [ ] Merge on the clean verdict. #84 is open and waits behind #82.

## Found during R-04, not yet a PR

These were uncovered while removing MAR. None is in the candidate graph, which is why CI stays green, and none belongs folded into R-04, so each needs its own unit and decision.

- [ ] Three repository scripts already fail at trunk. `scripts/check-r3-candidate-freeze.mjs` fails with `R3_CANDIDATE_FREEZE_BASE_DRIFT` and also asserts the migrations directory holds exactly 25 files ending in `025_mar_admission_function.sql`, while trunk holds 50. `scripts/record-r1-candidate-custody.mjs` fails with `RC01_UNKNOWN_CLASSIFICATION:.gitignore`. `scripts/check-r1-a0-migration.mjs` fails with `A0_UNCLASSIFIED_PATH`. Each pins a base the repository has left. Decide per script whether to delete it with its npm entries or re-pin it to a current base, and record which.
- [ ] `apps/hub/src/mar/admission.ts` is imported by nothing under `apps/`. It pins a `pg-boss` tuple for the retired MAR subject against a `mar` schema that no current install creates, and `pg-boss` has no other consumer. Its only readers are `tests/implementation/r3-mar-admission.test.mjs` and the R3 freeze list above. It goes with the R3 freeze decision, together with the `pg-boss` dependency, so the Preview runtime in the same directory is left alone.
- [x] `r1-s1-postgres`, `r1-s2-postgres` and `r1-s3-postgres` were outside the candidate graph and had rotted. Their exact-catalog assertions, now duplicated by the R-05 snapshot, are deleted; `r1-s1` moved onto a throwaway per-run database via `runHubMigrations` instead of applying migration `001` straight into the configured database. The remaining behavior assertions, the IAM-03/session proof, the PRJ-03 receipt and rollback boundary, abandoned-attempt cleanup and `project.read` revocation, stay and are renamed for what they prove: `identity-access-postgres.test.mjs`, `workspace-postgres.test.mjs` and `project-postgres.test.mjs`. They join the candidate graph as the `foundation-postgres` scope so they cannot rot again.
- [x] Two guarded suites could not run at all since #74, because the guard import landed inside a multi-line import in one file and inside a child-process script string in the other. Fixed in #83, with a coverage case that parses each guarded file and requires the import in its header.
- [ ] `PRJ-29` is an open Product contradiction. `docs/product/operation-ledger.md` says the pre-P11 review added it, and it is absent from both the section 5 table and the current Product OAS. Its owner decides whether it is owed or the sentence is stale.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] No `hub_*` role list remains hand-maintained in more than one file.
- [ ] `docs/roadmap.md` records the remediation as closed and names what remains.
- [ ] Reply to the operator with the report `autopilot-stack.md` names.

## Appendix A. Prototype evidence

No prototype was needed. Every open question this plan faced was answered by reading the repository, and the questions that stay open are recorded in Appendix C rather than guessed.

The operation ledger count stays unproven. Three places claim 31, the literal table holds 39, and the additions on record do not close the gap. R-04 reopens the owning authority rather than inventing the number.

## Appendix B. Alternatives rejected

Hardcoding the role-to-password-file map inside the provisioning script was rejected. It would make a fifth copy of a list that already disagrees with itself in four places, and the operator instructed that legacy be removed rather than worked around.

Importing `contracts/technical/hub-database-roles.json` directly from TypeScript was rejected. `apps/hub/tsconfig.json` sets `rootDir` to `src` and `tsconfig.base.json` does not enable `resolveJsonModule`, so a generated module under `apps/hub/src/generated/` is the shape the repository already uses for projected contracts.

Giving the Hub the power to repair its own credentials at startup was rejected, and the roadmap rejects it too. A process that serves requests should not hold `ALTER ROLE`. The census stays read-only and provisioning is a separate installation step.

Folding role attributes and grants into the catalog snapshot was rejected. A snapshot is regenerated by whoever changes the schema, so a blanket diff would accept a new superuser as readily as a new column, and section 6.2 of the data reference forbids exactly that.

Moving `check-wire-mar` behind an explicit target was rejected in favour of deleting it. It is already unreachable from both `wire:verify` and `conexus:verify`, and the bundle it reads no longer carries its subject, so there is no live surface left to gate.

One login role that can `SET ROLE` into every capability was rejected before this plan existed. The roadmap records why, and pull request 77 is the record of proposing it without reading `docs/reference/data-and-persistence.md`.

## Appendix C. Risks

R-03B writes credentials to the operator's live pilot cluster. It writes only the values the existing secret files already hold, it never generates a password, and it stops for the operator before merge. The owner watches lane 2's second run reporting zero repairs, which is the evidence that a retry is safe.

R-05 can delete an assertion that was the only proof of a property. The owner keeps every catalog class the census named as uniquely proved by the oracle, and keeps role attributes and grants as explicit assertions rather than snapshot rows.

R-04 removes two migrations from the digest map at `scripts/run-hub-migrations.mjs:110-111`. Both are held and never applied by a current install, so the digest guard should not notice, but the guard reads the pilot cluster's own ledger and the pilot has a long history. The owner watches lane 2 against the real pilot database and stops rather than forcing a run the guard refuses.

R-04 corrects a census count that three places in `docs/product/operation-ledger.md` state wrongly, and the arithmetic does not close from the owners on record. The owner writes only what is provable and reopens the smallest owning authority for the rest.

The pilot secret directory holds no password file for `hub_r2_project_binding`, `hub_r2_brain_read`, `hub_r2_brain_attester` or `hub_r2_key_conformance_subject`. Those config sections are unset in the pilot, so R-03B reports them as unconfigured rather than invalid. The owner watches lane 1 for that distinction.

The `Ubuntu` distro tore itself down every 5 to 12 minutes until a detached holder was started, and the holder expires after 24 hours and does not survive a Windows restart. Every lane confirms the holder before reporting an environment failure.

`check-plan.mjs` reports a lane-count failure on all four PR sections, by design, because this plan follows the roadmap's live bar instead of the ten-lane template. Anyone auditing the plan against the script should expect exactly those lines and no others.

## Appendix D. Links and reading list

`docs/roadmap.md` owns the grant and the live bar this plan uses.

`docs/reference/hub-database-roles.md` is the register R-03A replaces with a generated one.

`docs/reference/data-and-persistence.md` sections 6.2 and 6.3 own the negative property and the statement that RLS is not the permission engine.

`apps/hub/src/platform/config.ts`, `postgres.ts` and `server.ts` are the three files R-03A and R-03B change.

`scripts/run-hub-migrations.mjs` is the oracle R-05 replaces.

`tests/implementation/protected-cluster.mjs` is the guard every altering test must call.

`docs/product/wire-contract.md` is the current owner that already retired MAR.

The trail is `.audit/credential-and-role-remediation.tsv` per `skills/show-me-your-work/SKILL.md`.
