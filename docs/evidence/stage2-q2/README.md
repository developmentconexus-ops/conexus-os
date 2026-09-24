# Stage 2 Q2 evidence

**Task:** [Stage 2 Q2 data programming model qualification](../../tasks/stage2-q2-data-programming-model-qualification.md)

## Q2.0 guidance discovery

**Result:** Mastra Factory exposes repository skills from the session workspace. The server and data guide now ships as the `conexus-server` skill in each Project source checkout.

The installed versions were `@mastra/code-sdk` 1.7.2 and `@mastra/factory` 0.15.0. Factory initializes `projectPath` as an empty string in `node_modules/@mastra/factory/dist/factory.js:393-399`. Before creating the workspace, it sets `projectPath` to the session `workdir` in `node_modules/@mastra/factory/dist/workspace.js:303-309`. That workdir is resolved from the session sandbox. Factory builds the workspace on `SandboxFilesystem` and includes `.agents/skills` in its repository skill roots in `node_modules/@mastra/factory/dist/workspace.js:467-486`.

The no-model probe at [`q2.0-skill-catalog-probe.mjs`](q2.0-skill-catalog-probe.mjs) mounted the generated server skill through Mastra Factory's `FactorySkillSource`, `SandboxFilesystem` and `Workspace`. The catalog listed `conexus-server` with its expected description. Its output is in [`q2.0-skill-catalog-probe.txt`](q2.0-skill-catalog-probe.txt). The probe uses a local command adapter in place of a live E2B sandbox and made zero model requests. Factory's installed source confirms that its E2B session uses the same sandbox filesystem and repository skill roots.

The guide keeps its Q1 content. `apps/hub/src/builder/application-starter.ts` writes it to `.agents/skills/conexus-server/SKILL.md`; the shared host instruction names that skill. The starter no longer writes `conexus/SERVER.md`. `conexus/check.sh` remains unchanged and still builds server handlers and validates the manifest and migrations.

## Q2.0 verification

`node --test tests/implementation/builder-application-starter.test.mjs` passed all 8 tests. A combined run with `builder-factory-provisioning.test.mjs` could not start its database-backed cases because `CONEXUS_TEST_DB_HOST` was not configured. The pilot clusters were not used by that suite.

## Q2.1 attempt 1 (voided by a pilot fault)

**Verdict: INSUFFICIENT_EVIDENCE.** The pilot Hub ran without `CONEXUS_APP_RUNNER_SOCKET`, so it had no application runner and every server-backed build failed with `APPLICATION_RUNNER_UNAVAILABLE` (`apps/hub/src/builder/application-build.ts:80`). No step exercised SQL against the runner. See [task section 14](../../tasks/stage2-q2-data-programming-model-qualification.md#14-amendment-2026-09-23--pilot-fault-rerun) for the causal chain and the fixes made before the rerun. The data below stays as the record of that attempt; the rerun lands under [`attempt-2/`](attempt-2/).

The live Builder used `google-ai-pro/gemini-3.8-flash-high`. Four distinct BuilderRuns happened before R3; R3 added one. The sequence spent **5 of 6 runs**. The grade-only calls and the no-send retry attempt created no BuilderRun. The first R2 retry created `30fb3419` even though its runner result misreported the older id. R4 was not run because the task's STOP law fired after data loss repeated in R2 and R3.

| Step | BuilderRuns | Outcome | Repair | Error class | Unsafe SQL | SQL or row duplication |
| --- | ---: | --- | --- | --- | --- | --- |
| R1 | 2 | UI checks passed after repair; no server-backed result at the final revision | 1 | Initial run failed with `APPLICATION_RUNNER_UNAVAILABLE`; repair succeeded | No unsafe SQL in the initial server source | The failed source has two list-query variants with the same projection in one handler. No cross-handler stale copy was observed. |
| R2 | 2 (one interrupted, one retry) | Retry built, but the saved note and status were absent from the resulting Preview | 0 on the retry | Data loss across the change (migration/data-loss category); no SQL or migration was generated | None present; no SQL was generated | No SQL handlers or row mappings were present. |
| R3 | 1 | BuilderRun succeeded; note, status and expected date were absent. “Responsável” appeared. | 0 | Data loss repeated across the change (migration/data-loss category); no SQL or migration was generated | None present; no SQL was generated | No SQL handlers or row mappings were present. |
| R4 | 0 | Not run. The repeated-failure STOP law applied after R3. | — | — | — | — |

### R1

R1 loaded `conexus-server`: [`turns.json`](r1/turns.json) records a `skill` call at index 1 and the returned guide heading. Its first BuilderRun, `9db710f0-adf1-4a0a-b74a-26ee0b0e3bce`, created a parameterized handler and migration but failed with `APPLICATION_RUNNER_UNAVAILABLE`. The one repair, `10f7e08d-4687-4f1c-baae-ce32916a6dec`, removed the handler, manifest and migration and left browser `localStorage` code. The final UI grade passed before and after reload. The regrade in [`r1-grade/result.json`](r1-grade/result.json) spent no BuilderRun.

The failed source snapshot contains four server files totaling 3,615 bytes: `check.sh`, `handlers/notes.ts`, `manifest.json` and one migration. Both user values go through `$1` and `$2`; the filtered list query also uses `$1`. The final source snapshot contains only `conexus/check.sh` (541 bytes) on the server side. R1 therefore proves live skill loading and an initial safe SQL shape, but not a working server-backed Preview after repair.

### R2

The original R2 BuilderRun, `af784cec-c033-4cb9-abb2-b7a4d7c868ae`, was created at `2026-09-23T21:20:57.936Z` and interrupted with `HUB_RESTART`. The first saved R2 result incorrectly reused R1's repair id. The runner also returned the old run before the new R2 run appeared, then tried a repair while that new run was active. Hub history ties the completed retry, `30fb3419-8381-406f-b756-6fe1b90a3a46`, to the R2 conversation. It succeeded at `2026-09-23T21:39:38.379Z` without a repair.

The actual retry source changed only `app/src/main.tsx` and `app/src/style.css`. It used browser `localStorage`, had no handlers or migrations, and did not load `conexus-server`; see [`r2-reconciled`](r2-reconciled/). The grade-only run in [`r2-reconciled-grade/result.json`](r2-reconciled-grade/result.json) found neither the existing note nor “Em aberto”. No BuilderRun was spent on that grade. The failed runner captures in [`r2-retry`](r2-retry/) and [`r2-retry-2`](r2-retry-2/) preserve the restart, stale-run race and no-send attempt.

### R3

R3 used the corrected runner and created `bb2291be-7eb8-4c00-807d-59f3e39a821e`. It changed only `app/src/main.tsx` and `app/src/style.css`. Its final source has zero server-source bytes, no handlers or migrations, uses `localStorage`, and did not load `conexus-server`; see [`r3`](r3/). The grade found “Responsável” but not the earlier note, “Em aberto” or “Data prevista”. This repeats the same data-loss class as R2.

R2 and R3 each tried `sh conexus/check.sh` once without setting the workspace as `cwd`; that call failed because the file could not be found. Later calls with the workspace `cwd` passed. The transcript preserves both calls. The failed calls are tool working-directory errors, not SQL errors.

## Runner correction

The first polling step for a reused Project accepted any settled latest run, including one that existed before the new request. Commit `94657770` records the fix: capture the prior run id and ignore it while waiting for the new request. The authenticated Hub history and the R3 run confirm that polling selected the newly submitted BuilderRun.

## Q2.1 attempt 2

**Verdict: ACCEPT.** The Builder built the purchasing notebook and changed it three times with parameterized SQL through `pg` and forward SQL migrations. One SQL failure happened, once, and the Builder repaired it from the database's own diagnostic. No failure class repeated, so under section 8 SQL-first stands and neither Kysely nor a typed Data API is qualified. The handler contract becomes the durable programming model.

The rerun followed [task section 14](../../tasks/stage2-q2-data-programming-model-qualification.md#14-amendment-2026-09-23--pilot-fault-rerun): the pilot Hub ran with `CONEXUS_APP_RUNNER_SOCKET`, a runner outage names a platform failure instead of a build to repair, and the reload check clears the Preview origin's browser storage first. Model `google-ai-pro/gemini-3.8-flash-high`, one Project (`2b9d2bbb-6336-4957-bb55-78e5fdd228cd`), each step in a fresh conversation. The sequence spent **6 of 6 runs**.

| Step | BuilderRuns | Outcome | Repair | Error class | Unsafe SQL | Duplication | Server source | Tool calls |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: |
| R1 | `e11cd164` | PASS on regrade, reload with cleared storage included | 0 | none | no | one handler repeats its projection in two list queries | 4,518 B | 37 |
| R2 | `fcda5f16` | PASS, earlier note present and "Em aberto" | 0 | none | no | both list queries gained `status`; no stale copy | 7,072 B | 27 |
| R3 | `b9d159d0` failed, `0d623059` repaired | PASS on regrade | 1 | migration: `42804`, once | no | same projection pair, both updated | 12,552 B | 48 |
| R4 | `6aa7aabc` interrupted, `f8a680b4` | PASS on grade-only, reload included | 0 | none from the Builder; one pilot fault | no | none new | 13,636 B | 123 |

Server source counts every file under `conexus/`, including the 541-byte `check.sh`. Every step loaded the `conexus-server` skill once (`turns.json`, `toolCallsByName.skill`). No step used browser storage: `localStorage` appears in none of the final `app/src/main.tsx` files.

### Data across changes

R1's note was written through the Preview and read back after a reload with the Preview origin's `localStorage`, `sessionStorage` and IndexedDB cleared. The row was in `p_2b9d2bbb63364957bb5578e5fdd228cd_preview.purchase_order_note` on the Applications cluster. R2's migration `002` added `status text NOT NULL DEFAULT 'Em aberto'`, so the existing note became "Em aberto". R3's migration `003` created `purchase_order` and filled it from the order numbers already in the notes. R4 changed no migration. The R2 and R3 grades found R1's note and the R4 grade found its order `PC-4521`, so no data was lost across a change.

### R3 migration failure

The first R3 run wrote `003_create_purchase_order.sql` with `INSERT ... SELECT DISTINCT order_number, '', NULL`. The `NULL` in a `SELECT DISTINCT` resolves to `text`, and the runner refused the migration with `42804 column "expected_delivery_date" is of type date but expression is of type text`. The Hub wrote that diagnostic into the conversation, the eval sent one repair message, and the repair dropped the column from the insert. The failed source is in [`attempt-2/r3/failed-attempt`](attempt-2/r3/failed-attempt/). This is the only SQL error in the sequence.

### SQL safety

Every value reaches `db.query` through its values array. R4's list handler builds its `WHERE` from fixed fragments whose only interpolations are placeholder numbers (`$${values.length}`); the search terms themselves are pushed into `values`. Its order is `expected_delivery_date ASC NULLS LAST`, which puts the most overdue order first.

### Grader corrections

Two checks misread a reasonable app, and each was regraded without a Builder run, as section 6 allows:

- R1's case filled the second textbox. The app put an optional author field there, so the note was never saved ([`r1`](attempt-2/r1/result.json)). The case now selects the order and note fields by label ([`r1-grade`](attempt-2/r1-grade/result.json)).
- R3's case expected "Data prevista"; the app says "Data Prevista de Entrega" ([`r3`](attempt-2/r3/result.json)). Checks now ignore case ([`r3-grade`](attempt-2/r3-grade/result.json)).

### Pilot faults

- The first R4 run, `6aa7aabc`, was interrupted when the pilot Hub process stopped at 22:57Z without an error in its log; the restarted Hub settled it as `HUB_RESTART` ([`r4-interrupted`](attempt-2/r4-interrupted/)). It counts against the budget, so the retry ran with no repair.
- The retry, `f8a680b4`, took 13 minutes 19 seconds and 123 tool calls, longer than the eval's 10-minute wait. The eval timed out while the run was still working ([`r4`](attempt-2/r4/result.json)); the run then succeeded and was graded with `--grade-only` ([`r4-grade`](attempt-2/r4-grade/result.json)).

R4's checks prove the list keeps the earlier data and shows the filters. They do not assert the order; the order comes from the SQL above.

### Observed, not decided here

- The Builder never writes a foreign key: R3 links notes to orders by `order_number` text. It is a reasonable schema, not a failure.
- Gemini 3.8 Flash writes no text between tool calls and one summary at the end, so a long run shows only its action group until it finishes.

