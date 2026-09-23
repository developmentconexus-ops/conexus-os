# Stage 2 Q2 evidence

**Task:** [Stage 2 Q2 data programming model qualification](../../tasks/stage2-q2-data-programming-model-qualification.md)

## Q2.0 guidance discovery

**Result:** Mastra Factory exposes repository skills from the session workspace. The server and data guide now ships as the `conexus-server` skill in each Project source checkout.

The installed versions were `@mastra/code-sdk` 1.7.2 and `@mastra/factory` 0.15.0. Factory initializes `projectPath` as an empty string in `node_modules/@mastra/factory/dist/factory.js:393-399`. Before creating the workspace, it sets `projectPath` to the session `workdir` in `node_modules/@mastra/factory/dist/workspace.js:303-309`. That workdir is resolved from the session sandbox. Factory builds the workspace on `SandboxFilesystem` and includes `.agents/skills` in its repository skill roots in `node_modules/@mastra/factory/dist/workspace.js:467-486`.

The no-model probe at [`q2.0-skill-catalog-probe.mjs`](q2.0-skill-catalog-probe.mjs) mounted the generated server skill through Mastra Factory's `FactorySkillSource`, `SandboxFilesystem` and `Workspace`. The catalog listed `conexus-server` with its expected description. Its output is in [`q2.0-skill-catalog-probe.txt`](q2.0-skill-catalog-probe.txt). The probe uses a local command adapter in place of a live E2B sandbox and made zero model requests. Factory's installed source confirms that its E2B session uses the same sandbox filesystem and repository skill roots.

The guide keeps its Q1 content. `apps/hub/src/builder/application-starter.ts` writes it to `.agents/skills/conexus-server/SKILL.md`; the shared host instruction names that skill. The starter no longer writes `conexus/SERVER.md`. `conexus/check.sh` remains unchanged and still builds server handlers and validates the manifest and migrations.

## Q2.0 verification

`node --test tests/implementation/builder-application-starter.test.mjs` passed all 8 tests. A combined run with `builder-factory-provisioning.test.mjs` could not start its database-backed cases because `CONEXUS_TEST_DB_HOST` was not configured. The pilot clusters were not used by that suite.

## Q2.1 runs

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

## Proposed verdict

**CHALLENGER_REQUIRED — typed Data API.** The task's migration/data-loss failure class appeared in two change steps. The evidence does not show that parameterized SQL itself failed: R2 and R3 did not produce SQL handlers. It shows that the Builder twice changed the browser app without using the server skill and lost the saved note across Preview revisions. The typed Data API is the task's candidate for schema and migration failures; a planner must prepare and grant a same-sequence challenger probe before any challenger run. This proposal does not select the API or qualify SQL. R4 remains owed for a future granted probe.

Do not start Q3 until the planner resolves the challenger result.
