# Builder repair program plan

Six changes that take the Builder from "one journey worked once" to "the acceptance journey is provable and the product stops asserting what it cannot observe". P-01 restores the verification floor, which is red today and blocks every gate. P-02 and P-03 close what an operator notices when something fails. P-04 makes past work inspectable. P-05 settles which authorized subject runs. P-06 makes the compile answer whether the artifact boots. Order is P-01, P-02, P-03, P-04, P-05, P-06.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `skills/poteto-mode/playbooks/autopilot-stack.md` from the installed plugin. The operator merges every PR. P-01 through P-06 all stop at merge-ready.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on her explicit go.
- [ ] On her go, write this exact text into the standing orders and restate it in your todolist. "Run docs/tasks/builder-repair-program.md. PRs P-01 through P-06 in order. Tests alone are not sufficient verification; a PR is verified only when its unit, live, and perf boxes are all checked. The operator merges every PR. Done when every box carries its evidence and the repair ledger is reconciled."
- [ ] Read these from the installed plugin at program start. Re-read them at every tick.
  - [ ] `skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `skills/swarm/SKILL.md`
  - [ ] `skills/verify/SKILL.md`
  - [ ] `skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `skills/mastra/SKILL.md`
- [ ] Read the repository authority before the first edit. `AGENTS.md`, `docs/roadmap.md`, `docs/reference/builder-c020-mastra-native.md`, `docs/tasks/builder-interactive-delivery.md`.
- [ ] Arm the 30-minute audit tick as a real `/loop` in dynamic mode, which schedules its own wake-up rather than blocking on a sleep. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from the installed plugin and the standing objective. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then send the operator a status message, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph.
  - [ ] P-01 is first and alone. Every other PR gates on it because no gate runs until it lands.
  - [ ] P-02, P-03, P-04 and P-05 are independent of each other. All four branch from P-01.
  - [ ] P-06 after P-03, because it consumes the artifact state P-03 introduces.
- [ ] Hold the file boundaries. P-03 and P-06 both touch Preview. P-03 owns `apps/web/src/features/builder/**` only. P-06 owns `apps/hub/src/builder/application-artifact-runtime.ts` and the compiler template only.
- [ ] Hold the review gate. P-02, P-03, P-04, P-05 and P-06 change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, with `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] Write the failing test first. Show it fails for the right reason before implementing.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every review-bot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Before babysit and the merge-ready report, record the base and head SHAs prepared by the topology owner under the execution playbook.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh swarm and a fresh verdict.
- [ ] The root appends the PR to the base-branch stack and the operator lands it. Apply the patch-id rule from `playbooks/shipping.md` before appending.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head. Drive through the `verify` skill.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Start the Hub with `node --env-file=.audit/slice7/hub.env scripts/build-hub-local.mjs` from the WSL checkout with Node from nvm. Wait for `https://hub.conexus.localhost:3443` to serve the shell.
- [ ] Sign in through the Keycloak realm `r1f` in a headed browser and save the storage state. Never type a password into an automated field. The session idles out after 30 minutes without a request, so a lane that pauses longer signs in again.
- [ ] Deliver input only through the control skill's commands. Read-only diagnostics are the Hub log, the pilot Postgres, and the Mastra LibSQL store at `~/.local/share/conexus/pilot/slice7/storage/builder-session.db`.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Restore the verification floor (P-01)

**Depends on.** None.

**Files.**

- [ ] Edit `apps/hub/migrations/047_reconcile_040_settlement_boundary.sql`.

**Build.**

- [ ] Make migration 047 replace `reg.matches_application_artifact` rather than create it. Migration 040 line 7 and migration 047 line 5 both `CREATE FUNCTION` the same signature, no migration drops it, and neither uses `CREATE OR REPLACE`, so every from-scratch install fails at 047.

**You see.**

- [ ] `npm run verify` reaches past step 2 of 28 and runs the remaining 26 gates to completion.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `tests/implementation/hub-migration-postgres.test.mjs` passes every case including "concurrent current Hub installers record each accepted migration once". Run `node --test --test-concurrency=1 tests/implementation/hub-migration-postgres.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `npm run verify` at trunk and at head. Trunk halts at step 2; head completes 28. Save `p01-verify-both.png`. Pass when head completes and trunk does not.
- [ ] Lane 2. Fresh install from empty. Apply every migration to a new database. Save `p01-fresh-install.png`. Pass when migration 050 applies with no error.
- [ ] Lane 3. Re-apply against the operator's existing pilot database. Save `p01-existing-db.png`. Pass when the run is a no-op and no existing object is dropped.
- [ ] Lane 4. Concurrent installers. Run two installers against one fresh database. Save `p01-concurrent.png`. Pass when each accepted migration is recorded once.
- [ ] Lane 5. Start the Hub against the pilot database. Save `p01-hub-boot.png`. Pass when it serves the shell and answers 401 unauthenticated.
- [ ] Lane 6. Sign in and open a Project's Build surface. Save `p01-build-surface.png`. Pass when the composer, the model selector and the connection chip all render.
- [ ] Lane 7. Run the builder Postgres suites that never ran before this PR. Save `p01-builder-postgres.png`. Pass when all three files pass.
- [ ] Lane 8. Run the eleven `wire:*` contract gates. Save `p01-wire.png`. Pass when all eleven pass.
- [ ] Lane 9. Run the repository hygiene, doc-index and architecture checks. Save `p01-repo-checks.png`. Pass when all pass or their failures are pre-existing and recorded.
- [ ] Lane 10. Confirm the compiled artifact registry still reads. Open a Project with a last-good Preview. Save `p01-registry-read.png`. Pass when the Preview frame renders the previously good application.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `npm run verify`. Trunk halts, so record trunk's time-to-halt and head's time-to-completion and do not claim a ratio between them. Also record the absolute head completion time as the budget.
- [ ] Probe. `time npm run verify` at trunk and at head, interleaved, three runs each on the same machine.
- [ ] Baseline. Record trunk's time-to-halt first.
- [ ] Rule. Head must complete. Fail if head exceeds 20 minutes, or if any gate after step 2 fails for a reason this PR introduced.

**Review gate.** None. P-01 is not review-gated.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends P-01 to the base-branch stack and the operator lands it.

## Keep a failed request visible and named (P-02)

**Depends on.** P-01.

**Files.**

- [ ] Create a migration adding durable request text to `builder.builder_run`.
- [ ] Edit `apps/hub/src/builder/store.ts`.
- [ ] Edit `apps/hub/src/builder/service.ts`.
- [ ] Edit `apps/hub/src/builder/routes.ts`.
- [ ] Edit `contracts/api/product/builder-paths.yaml`.
- [ ] Edit `apps/web/src/features/builder/api.ts`.
- [ ] Edit `apps/web/src/features/builder/components/project-build.tsx`.

**Build.**

- [ ] Persist enough of the accepted request on the run to reconstruct the operator's own words. Today the row stores only a content digest, `trigger_message_id` is always null, and the text lives solely in a Mastra message written inside `session.sendMessage()`. Everything from `claimBuilderRun` through sandbox creation, source materialization and `controller.createSession` runs before that call.
- [ ] Render from that field when no bound Mastra message exists. The optimistic bubble is gated on `runActive`, so it vanishes when the run settles to FAILED.
- [ ] Map the internal failure codes onto a small public set. `failureCode()` passes through any message matching `/^[A-Z0-9_]{1,120}$/`, so over seventy internal codes reach the wire unmapped, and anything whose message is not an uppercase snake code collapses to `BUILDER_PREPARATION_FAILED`, which is the most common real code because raw E2B, Postgres and fetch errors all land there.
- [ ] Render each public category distinctly. `runStatus()` special-cases only `BUILDER_MODEL_RATE_LIMITED` today. Keep the existing `BUILDER_MODEL_AUTH_FAILED` and `BUILDER_MODEL_CREDENTIAL_UNRESOLVABLE` distinctions.

**You see.**

- [ ] A run that fails during sandbox preparation still shows the operator's request in the conversation, with a named reason beside it.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] A hub test drives a pre-agent failure and asserts the request text survives on the run row. Run `node --test --test-concurrency=1 tests/implementation/builder-run-dispatch.test.mjs`.
- [ ] A hub test asserts each public failure category for a representative internal code and that no unmapped internal code reaches the wire.
- [ ] `tests/implementation/builder-browser.test.mjs` gains a case where a settled FAILED run with no assistant message still renders the user's request and its named reason.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Induce the same pre-agent failure at trunk and head. Save `p02-preagent-both.png`. Pass when trunk loses the bubble and head keeps it with a named reason.
- [ ] Lane 2. A normal successful run. Save `p02-success.png`. Pass when exactly one user bubble renders, not two.
- [ ] Lane 3. Reload after a pre-agent failure. Save `p02-reload.png`. Pass when the request and its reason are still there.
- [ ] Lane 4. Induce a compile failure. Save `p02-compile.png`. Pass when the reason reads differently from a sandbox failure.
- [ ] Lane 5. Induce a credential failure by revoking the connection mid-run. Save `p02-credential.png`. Pass when the operator can tell it from a compile failure without reading logs.
- [ ] Lane 6. Cancel a run. Save `p02-cancel.png`. Pass when the request stays and the reason reads as cancellation, not failure.
- [ ] Lane 7. A raw unnamed error. Force a Postgres error inside dispatch. Save `p02-unnamed.png`. Pass when the public category is honest rather than a leaked internal string.
- [ ] Lane 8. Confirm no internal detail leaks. Read the session payload for every failed run. Save `p02-no-leak.png`. Pass when no stack, no shell, no provider message and no sandbox id appears.
- [ ] Lane 9. Two consecutive failures. Save `p02-two-failures.png`. Pass when both requests and both reasons are present and distinct.
- [ ] Lane 10. A failure followed by a successful retry. Save `p02-recovery.png`. Pass when the conversation shows the failed request, its reason, and then the successful one.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from clicking send to the request appearing in the conversation.
- [ ] Probe. Drive the composer through the `verify` skill at trunk and at head, interleaved, five sends each, timing from click to the bubble's first paint.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Head must not exceed the trunk median by more than 100ms. The absolute budget is 500ms from click to bubble.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 5 screenshots into `docs/evidence/builder/p02-review-preagent.png` and `docs/evidence/builder/p02-review-credential.png`.
- [ ] Record a 30 to 60 second video of a failing run keeping its request and naming its reason. Save it as `docs/evidence/builder/p02-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends P-02 to the base-branch stack and the operator lands it.

## Stop claiming the Preview loaded (P-03)

**Depends on.** P-01.

**Files.**

- [ ] Edit `apps/web/src/features/builder/components/project-build.tsx`.
- [ ] Edit `apps/web/src/styles.css`.
- [ ] Edit `tests/implementation/builder-browser.test.mjs`.

**Build.**

- [ ] Distinguish only what the client can observe. An artifact is available. A grant was issued. The frame navigated. The launch failed. Never claim the application loaded. Today the UI renders "Preview emitido e carregado com acesso autorizado." when the launch promise resolves, which is before the hidden form's microtask submit runs, so before navigation starts.
- [ ] Attach a load handler to the iframe, which has none today. A cross-origin `load` fires for a 403 as readily as for a working app, so the state it supports is navigation, not success.
- [ ] Count only a load that follows the entry submit for the current lease, and reset on a new artifact key. The iframe starts at `about:blank`, whose own `load` fires before any grant exists.

**You see.**

- [ ] No string anywhere claims the application loaded or works.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] A browser test asserts the success claim is absent when the grant resolves. Run `node --test --test-concurrency=1 tests/implementation/builder-browser.test.mjs`.
- [ ] A browser test asserts the navigated state appears only after the entry load and never on `about:blank`.
- [ ] The two pinned behaviours still hold. One automatic launch per key until explicit retry, and a stale older launch never replaces a newer frame.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Cold load a Project with a good artifact at trunk and head. Save `p03-cold-both.png`. Pass when trunk claims loaded at grant time and head does not.
- [ ] Lane 2. Watch the states in order on a cold load. Save `p03-sequence.png`. Pass when grant precedes navigated and neither claims the application works.
- [ ] Lane 3. Reload within five seconds of a run settling. Save `p03-window.png`. Pass when the UI states something true during the window rather than nothing or a success claim.
- [ ] Lane 4. Force the launch endpoint to 503. Save `p03-launch-failure.png`. Pass when the failure is named and the previous good frame stays.
- [ ] Lane 5. Click retry after that failure. Save `p03-retry.png`. Pass when exactly one new launch is issued.
- [ ] Lane 6. Change the artifact key while a launch is in flight. Save `p03-stale.png`. Pass when the stale grant never replaces the newer frame.
- [ ] Lane 7. Open a Project that has never built. Save `p03-empty.png`. Pass when the empty state shows and no grant is requested.
- [ ] Lane 8. Click reopen on a loaded frame. Save `p03-reopen.png`. Pass when a fresh grant is issued and the navigated state returns.
- [ ] Lane 9. Serve a 403 from the preview entry. Save `p03-entry-denied.png`. Pass when the UI does not claim the application loaded.
- [ ] Lane 10. A failing compile with a preserved last-good Preview. Save `p03-last-good.png`. Pass when the previous application still renders and the build failure is stated separately.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from the grant response to the frame-navigated state. Trunk has no such state, so also record trunk's time from grant response to its own success claim and treat the two as unlike.
- [ ] Probe. Instrument the browser through the `verify` skill at trunk and head, interleaved, five cold loads each on the same artifact.
- [ ] Baseline. Record trunk's time to its claim first.
- [ ] Rule. Absolute budget. The navigated state must appear within 10s of the grant on a healthy artifact. Fail otherwise.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 10 screenshots into `docs/evidence/builder/p03-review-cold.png` and `docs/evidence/builder/p03-review-last-good.png`.
- [ ] Record a 30 to 60 second video of a cold load showing each state in turn. Save it as `docs/evidence/builder/p03-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends P-03 to the base-branch stack and the operator lands it.

## Make past work inspectable and retries safe (P-04)

**Depends on.** P-01.

**Files.**

- [ ] Edit `apps/web/src/features/builder/components/project-build.tsx`.
- [ ] Edit `apps/hub/src/builder/module.ts`.
- [ ] Edit `tests/implementation/builder-browser.test.mjs`.

**Build.**

- [ ] Add a selected run that Details, Diff and the trace query follow, falling back to latest. `runHistory` already ships every field those views need, the list renders as plain items with no click handler, and all three views are hardwired to the latest run. No server or wire change is needed.
- [ ] Retain the idempotency key on an uncertain failure and reuse it when the content is unchanged. `crypto.randomUUID()` runs on every submit with nothing retained. The server already matches by digest and raises `IDEMPOTENCY_CONFLICT` on a changed body, and `BuilderRequestError.status === null` already means the fetch never got a response.
- [ ] Derive the diagnostic message id from the run so a second append is a no-op. `appendDiagnostic` already names the run and a safe code, but uses a fresh uuid per call.

**You see.**

- [ ] Clicking a past run changes the trace, the model and the diff to that run's, and a resend after a dropped connection produces one run.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] A browser test with two runs in history asserts selecting the older one changes the rendered run id and diff revisions to that run's literal values.
- [ ] A browser test aborts the first send, resends the same text, and asserts both requests carried the same `Idempotency-Key`.
- [ ] A hub test calls the diagnostic append twice for one run and asserts one message.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. With three real runs in history, click the first at trunk and head. Save `p04-select-both.png`. Pass when trunk does nothing and head follows the selection.
- [ ] Lane 2. Select a failed run. Save `p04-failed-run.png`. Pass when its trace loads, not the latest run's.
- [ ] Lane 3. Select a run, then send a new request. Save `p04-selection-reset.png`. Pass when the view returns to the new run.
- [ ] Lane 4. Select a run and open Diff. Save `p04-diff.png`. Pass when the diff shows that run's base and result revisions.
- [ ] Lane 5. Select a run and open Code. Save `p04-code.png`. Pass when the source shown belongs to that run or the view states it cannot.
- [ ] Lane 6. Kill a send in flight, resend the same text. Save `p04-retry-same.png`. Pass when one run exists and both requests carried one key.
- [ ] Lane 7. Kill a send, change the text, resend. Save `p04-retry-changed.png`. Pass when a new key is issued and no conflict is raised.
- [ ] Lane 8. A definite 409 from the server. Save `p04-conflict.png`. Pass when the key is discarded and the operator is told.
- [ ] Lane 9. Induce a compile failure. Save `p04-one-diagnostic.png`. Pass when exactly one diagnostic message appears.
- [ ] Lane 10. Reload with a run selected. Save `p04-reload.png`. Pass when the view returns to latest and nothing is stale.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from clicking a history item to the trace rendering.
- [ ] Probe. Drive the history list through the `verify` skill at head, five selections, and compare against the existing latest-run trace fetch measured at trunk.
- [ ] Baseline. Record trunk's latest-run trace fetch time first.
- [ ] Rule. Selection must not exceed the trunk trace fetch by more than 200ms. The absolute budget is 2s from click to rendered trace.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 6 screenshots into `docs/evidence/builder/p04-review-select.png` and `docs/evidence/builder/p04-review-retry.png`.
- [ ] Record a 30 to 60 second video selecting a past run and driving an uncertain retry. Save it as `docs/evidence/builder/p04-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends P-04 to the base-branch stack and the operator lands it.

## Settle which authorized subject runs (P-05)

**Depends on.** P-01.

**Files.**

- [ ] Edit `apps/hub/migrations/` with a migration exposing the connection preference on the list.
- [ ] Edit `apps/hub/src/claude-account/store.ts`.
- [ ] Edit `contracts/api/product/claude-account-paths.yaml`.
- [ ] Edit `apps/web/src/features/claude-account/api.ts`.
- [ ] Edit `apps/hub/src/project/module.ts`.
- [ ] Edit `apps/hub/src/project/anthropic-oauth-provider.ts`.
- [ ] Edit `apps/web/src/features/builder/components/project-build.tsx`.

**Build.**

- [ ] Expose the existing connection preference on the list and read it in the UI. The UI shows the first ACTIVE connection ordered by creation, while run admission reads `claude_connection.preference`, so with two ACTIVE connections the chip can name one while the server admits another. Do not add a caller-supplied connection id; the server already resolves the authorized subject correctly.
- [ ] Delete `BUILDER_VERIFICATION`, which no caller ever requests, and collapse `PROJECT_INCEPTION` and `BASELINE_EXPLANATION`, which only ever occur as a pair and distinguish nothing.
- [ ] Delete `PROJECT_ANTHROPIC_MODEL_ID` and `PROJECT_ANTHROPIC_ADMISSION_ID`, which pin a model and an admission id in source and are then validated against the catalog by string equality.
- [ ] Drop the model-id existence re-validation against the catalog and keep the registry as the authority for it. Keep admission id, credential slot, enabled and origin pinning, which Mastra does not model.

**You see.**

- [ ] The chip names the connection the next run will use, and a second `BUILDER_CODING` catalog entry needs no code change.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] A browser test with two ACTIVE connections, the second preferred, asserts the chip names the second.
- [ ] A hub test asserts an unknown model id is refused and a valid second entry produces two choices.
- [ ] A hub test asserts a historical run whose admission id is absent from the current catalog still reads back its recorded model triple.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Two real connections with the newer preferred. Save `p05-chip-both.png`. Pass when trunk names the older and head names the preferred one.
- [ ] Lane 2. Send a run and read the recorded connection. Save `p05-recorded.png`. Pass when it matches the chip.
- [ ] Lane 3. Switch the preference and send again. Save `p05-switch-connection.png`. Pass when the chip and the new run both follow.
- [ ] Lane 4. Revoke the preferred connection. Save `p05-revoked.png`. Pass when the chip stops naming it and the composer states the requirement.
- [ ] Lane 5. Two `BUILDER_CODING` entries. Send on the first model. Save `p05-model-one.png`. Pass when the run records that model.
- [ ] Lane 6. Switch the model and send again. Save `p05-model-two.png`. Pass when the second run records the second model. This is the acceptance falsifier that has never been provable.
- [ ] Lane 7. Open run history after both. Save `p05-history-models.png`. Pass when each run names its own model.
- [ ] Lane 8. Remove an entry from the catalog and reopen the Project. Save `p05-removed-entry.png`. Pass when the historical run still names the removed model.
- [ ] Lane 9. Put an unknown model id in the catalog and restart. Save `p05-unknown-model.png`. Pass when the Hub refuses it by name.
- [ ] Lane 10. Confirm the cognition path still works after the hardcode deletion. Save `p05-cognition.png`. Pass when Project inception still resolves its model from the catalog.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Hub start time to listening, since catalog validation runs at composition.
- [ ] Probe. `time` the Hub boot at trunk and at head, interleaved, three boots each against the same database.
- [ ] Baseline. Record the trunk boot time first.
- [ ] Rule. Head must not exceed trunk by more than 200ms.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 6 screenshots into `docs/evidence/builder/p05-review-chip.png` and `docs/evidence/builder/p05-review-model-switch.png`.
- [ ] Record a 30 to 60 second video switching the model between two runs. Save it as `docs/evidence/builder/p05-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends P-05 to the base-branch stack and the operator lands it.

## Make the compile answer whether the artifact boots (P-06)

**Depends on.** P-03.

**Files.**

- [ ] Edit `apps/hub/src/builder/application-artifact-runtime.ts`.
- [ ] Edit `scripts/builder-e2b-template.mjs`.
- [ ] Edit `apps/hub/src/builder/application-build.ts`.

**Build.**

- [ ] After the build, serve the output inside the compiler sandbox, drive headless Chromium, require the root to have a child within a bounded time and zero page errors, and treat failure as compile failure, which section 13 already knows how to settle.
- [ ] Record the verdict as artifact metadata so the client can state it as a fact about the artifact, separate from frame state.
- [ ] Do not inject a beacon. Conexus serves the artifact's own bytes with a sha256 check per request, so serve-time injection defeats the integrity invariant, and a beacon inside `app/**` would be the agent's claim rather than an observation, since section 8.3 makes those files the agent's.

**You see.**

- [ ] An artifact that builds but throws on boot fails the compile and never advances the last-good Preview.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] A compiler test with a source that builds and throws at module evaluation fails the smoke and preserves the previous artifact.
- [ ] A compiler test with a healthy source passes and records the verdict.
- [ ] A compiler test asserts the smoke has a bounded timeout and that exceeding it fails rather than hangs.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` model at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Ask the agent for an app that compiles and throws on render. Save `p06-broken-both.png`. Pass when trunk advances the Preview to a broken artifact and head refuses.
- [ ] Lane 2. A normal build. Save `p06-healthy.png`. Pass when the Preview advances and the verdict is recorded.
- [ ] Lane 3. An app that renders nothing into the root. Save `p06-empty-root.png`. Pass when the smoke fails.
- [ ] Lane 4. An app that throws asynchronously after first paint. Save `p06-async-throw.png`. Pass when the recorded verdict is honest about what was observed.
- [ ] Lane 5. An app with a slow but valid boot. Save `p06-slow-boot.png`. Pass when it is not failed for being slow inside the bound.
- [ ] Lane 6. Confirm the last-good Preview survives a failed smoke. Save `p06-last-good.png`. Pass when the previous application still renders.
- [ ] Lane 7. Confirm working source still advances to the failing revision. Save `p06-working-source.png`. Pass when the next edit starts from it.
- [ ] Lane 8. Confirm the artifact hash check still holds. Save `p06-integrity.png`. Pass when the served bytes match the registry digest.
- [ ] Lane 9. Confirm the failure reads distinctly from a build failure. Save `p06-failure-category.png`. Pass when the operator can tell a build error from a boot error.
- [ ] Lane 10. Two consecutive builds, the first broken and the second healthy. Save `p06-recovery.png`. Pass when the Preview advances only on the second.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Compile wall time from source admission to artifact retention, on the same source.
- [ ] Probe. Run the same build at trunk and at head, interleaved, three builds each on the identical source revision.
- [ ] Baseline. Record the trunk compile time first.
- [ ] Rule. Head must add no more than 15s over trunk, and the whole compile must stay inside the existing build budget. Fail otherwise.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1 and lane 6 screenshots into `docs/evidence/builder/p06-review-broken.png` and `docs/evidence/builder/p06-review-last-good.png`.
- [ ] Record a 30 to 60 second video of a broken build being refused while the last-good Preview survives. Save it as `docs/evidence/builder/p06-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] The root appends P-06 to the base-branch stack and the operator lands it.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reconcile `docs/tasks/builder-interactive-delivery.md` with what each PR proved and correct the two stale records in Appendix B.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

The composed journey ran against real Claude, E2B, source, compiler and Preview on 2026-09-17 in project `dc311c82-0e32-4b42-85bb-7a3e9bb8e9df`, at commits `d27c625` and `c163b01`. A request executed on the admitted connection and reached `SOURCE_CHANGED`; the generated counter responded to input. A second request continued the same Thread from the first result, `9eee02af` to `c2c5ffa5`. Cancellation settled `INTERRUPTED` with `USER_CANCELLED` in five seconds without touching the source. A failing compile settled `SOURCE_CHANGED_BUILD_FAILED`, advanced working source to `89d3f774` and preserved artifact `9633c70c`. Those runs are the trunk baseline for P-02, P-03 and P-06.

The session-loss question was settled by measurement rather than assumption. The saved cookie's row was present, unrevoked, with `absolute_expires_at` seven hours away and `idle_expires_at` thirty minutes past. It is ordinary idle expiry on a sliding thirty-minute window, not an effect of restarting the Hub.

Unproven and deliberately left so. Model switching, which P-05 makes provable for the first time. OAuth reconnect, which no PR here covers. Whether the reload window after a settling run is a defect or latency; P-03 lane 3 measures it rather than assuming.

## Appendix B. Alternatives rejected

Adding a second catalog entry by hand to unblock the model-switching proof. It institutionalises the parallel list the operator objects to, even as a temporary step. P-05 removes the reason instead.

Deriving the offered model list from `PROVIDER_REGISTRY`. The registry carries fourteen Anthropic ids with no date, latest or deprecation metadata, mixing aliases, dated snapshots and superseded generations. Any ordering or filtering would be Conexus opinion, which is the thing being removed. The catalog shrinks instead of disappearing.

A postMessage readiness handshake from the preview document. Conexus serves the artifact's own bytes and checks sha256 per request, so injecting at serve time defeats the integrity invariant. A beacon inside `app/**` is the agent's claim, since section 8.3 makes those files the agent's. No comparable product has a positive health signal either; StackBlitz, CodeSandbox, Replit, v0, bolt and E2B all define ready as a port binding or a painted frame.

Ten separate PRs, one per ledger item. The lane discipline exposed the decomposition as too fine. A PR with fewer than ten real scenarios is not a PR, it is a commit inside one. Six PRs each carry ten genuine scenarios.

Two stale records to correct at close. The claim that restarting the Hub invalidates the operator session is false, per Appendix A. The B-07 entry's premise that native discovery can replace the catalog is false for Mastra 1.63.2, which has no per-credential discovery at all.

## Appendix C. Risks

P-01 changes a migration already applied to the operator's pilot database. The operator cleared this on 2026-09-18. The pilot database is development only, with nobody using the application, so the migration may alter it freely to make it correct. Lane 3 still verifies against the live pilot database, not only a fresh one.

P-02 adds a column to `builder.builder_run`. The owner writes the migration additive and nullable so existing rows stay readable.

P-05 deletes capability values. The catalog lives outside the repository at `~/.config/conexus/project-models.json`, so the owner confirms no entry in the operator's environment carries a deleted value before merge. Lane 10 guards the cognition path, which is the one that reads those values today.

P-06 adds Chromium to the compiler template, roughly 281MB. The perf rule fails the PR if the build budget is breached.

Every live lane needs an operator session, which idles out after thirty minutes without a request. A lane that pauses longer signs in again. The owner never types the password into an automated field.

Live lanes that drive a real build create E2B sandboxes and spend the operator's Claude quota. Lanes that only exercise the UI against an existing artifact cost nothing, and most lanes here are that kind by design.

## Appendix D. Links and reading list

Read before editing. `docs/reference/builder-c020-mastra-native.md` sections 4.2, 8.3, 11, 13 and 13.1. `docs/tasks/builder-interactive-delivery.md`, the repair ledger. `AGENTS.md`. `.agents/skills/mastra/SKILL.md` for anything touching Mastra.

P-05 and P-06 get `skills/how/SKILL.md` before the first edit, because both cross a boundary whose ownership the ledger has previously described wrongly. P-02 gets `skills/interrogate/SKILL.md` before review, because its failure taxonomy is the kind of contested design a single reviewer approves too easily.

The trail for this program follows `skills/show-me-your-work/SKILL.md`, committed, because the operator audits it after the fact rather than watching each step.

Gate list for a PR touching `apps/hub/src/builder` or `apps/web/src/features/builder`. `npm run r1:s2:hub:typecheck` at about 4s. `npm run r1:a0:web:typecheck` at about 3s. `node --test --test-concurrency=1 tests/implementation/builder-browser.test.mjs` at about 32s. The builder Postgres, registry, source-runtime, compiler-runtime and Mastra-lifecycle suites. `npx --no-install biome check` over the touched paths. `npm run wire:bundle && npm run wire:builder` when the contract moves.
