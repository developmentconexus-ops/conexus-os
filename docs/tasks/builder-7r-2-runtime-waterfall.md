# 7R-2 — Runtime waterfall and measurement baseline

> **Status:** PRE-BASELINE QUALIFICATION AUTHORIZED / S1-S6 TEMPORARILY BLOCKED
> **Predecessor:** 7R-1 ACCEPTED / independent review PASS
> **Program:** [`builder-first-app.md`](builder-first-app.md)
> **Status/grant owner:** [`../roadmap.md`](../roadmap.md)
> **Builder technical owner:** [`../reference/builder-c020-mastra-native.md`](../reference/builder-c020-mastra-native.md)
> **Decision owner:** C-020 in [`../decisions/index.md`](../decisions/index.md)

7R-2 measures the current accepted engine. It does not optimize it.

The slice exists because live use showed material latency, while source inspection shows several plausible expensive boundaries. Those are hypotheses until the same current Product journeys are measured under a reproducible environment.

# 1. Protected result

Produce a reproducible baseline that answers, with raw measurements rather than source-reading guesses:

```text
where does current user-visible time go?
which expensive boundaries execute?
how many times do they execute?
which costs are serial, parallel, cold, warm, fixed or input-scaled?
which later optimization hypotheses are actually supported by the trace?
```

The baseline must cover the current Product path from Project creation through Builder execution, live activity, source inspection, compilation and Preview.

The output is Evidence for later planning. No 7R-3/7R-4 optimization is part of this slice.

# 2. PSTACK / measurement law

This is a Poteto **Perf issue** measurement slice.

Apply these rules during execution:

- measure before optimizing;
- current implementation and historical latency observations are Evidence, not conclusions;
- use `how` to trace the measured path before adding instrumentation;
- prefer measurement at existing boundaries over new abstractions;
- a strategy such as elimination, batching, caching, lazy work, pooling or scheduling earns later consideration only when the baseline shows its signal;
- keep each scenario independently reproducible and verifiable;
- `INCONCLUSIVE` is a valid result; a fake or wrong-surface number is not;
- no claim such as “Git is the bottleneck” or “E2B startup dominates” is allowed without the artifact that supports it.

## 2.1 7R2-PROBE-01 — pre-baseline qualification gate

The first authorized 7R-2 execution correctly activated this task's STOP law before a valid baseline existed.

Subject at that STOP:

```text
repository HEAD = bd66ae48719028d9d01faa4ed58d3859ca431e7c
baseline.json = not retained
Product optimization = none
Product code change = none
local qualification lever only = qualification/7r2/builder-runtime-waterfall/{README.md,measure.mjs}
```

Observed Evidence:

- the exact hardened Git probe exceeded a 10 s probe budget, but the current Product Git/process paths admit materially larger operation budgets; therefore `>10 s` does **not** prove that the Git runtime or environment is unusable;
- the real compiler E2B path completed three fresh-sandbox samples, approximately 3.1–6.5 s, so E2B is not globally unavailable in the observed environment;
- the first coding-runtime measurement composition omitted the persistent Project Thread and is invalid evidence; it was correctly discarded;
- a corrected manually composed coding harness using the shared `AgentController`/Memory/modes shape remained unresolved for more than five minutes, and no active provider connection was observed at the inspection point;
- that hang does not yet distinguish a qualification-harness defect from an environment/provider defect or a defect in the exact current C-020 Product composition.

Therefore the baseline gate is narrowed before S1–S6. Do not infer or retain baseline numbers until the following controls discriminate the cause.

### P1 — real Git control

Exercise the actual hardened Git execution path with the Product's admitted operation timeout semantics, preferably timing the existing `runProcess` seam in `createOciGitExecutionPort`.

Requirements:

- do not impose an arbitrary 10 s pass/fail threshold;
- record real elapsed time and real Docker/process count;
- if the current Product operation completes, its duration is measurement Evidence rather than an environment failure;
- if it fails or reaches the Product timeout, retain the exact failure/timeout as Evidence and stop before attributing cause.

### P2 — direct coding-runtime control

Run the existing admitted live coding-runtime proof for the current branch/configuration, currently `tests/implementation/rb-builder-mastra-e2b-live.test.mjs`, with its explicit live authority/configuration.

Purpose:

```text
prove provider + model admission + coding E2B + direct runtime
without the shared C-020 module composition
```

Do not call this the Product-composed baseline. It is only a discriminating control.

### P3 — exact C-020 composition control

Exercise the **actual current Product composition** that creates the shared `LibSQLStore`/Memory/coding agent/`AgentController` and passes that shared harness to `createMastraE2BCodingWorkerRuntime`.

The current owner entry point is `createConfiguredBuilderModule` in `apps/hub/src/builder/module.ts`.

Requirements:

- do not create a third hand-reconstructed imitation of the shared harness merely to make the probe convenient;
- prefer the real module/Hub composition and current Product route/service path;
- preserve the persistent Project Thread, shared controller/memory, run scope and fresh per-run Workspace/E2B semantics owned by C-020;
- if exact composition cannot be invoked in qualification without a bounded setup adjustment, first prove why; do not change Product architecture to make profiling easier.

If P2 passes and P3 does not, the evidence may identify a real integration defect. At that point STOP and reopen the smallest technical owner before performance work.

### P4 — bounded phase localization, only if needed

If P2/P3 still leave the coding hang unresolved, add temporary qualification-only timing around the smallest useful boundaries:

```text
Sandbox.create
→ sandbox start
→ source materialization
→ shared controller ready
→ createSession
→ sendMessage/provider connection
→ result finalization
```

This is not permission to create a telemetry framework, Product schema, durable profiling record or generalized PerformanceService.

### Gate disposition

Use this decision law:

```text
P1 completes within current Product semantics
→ record duration; Git environment is not rejected merely for exceeding 10 s

P2 fails
→ ENVIRONMENT/PROVIDER OR DIRECT-RUNTIME BLOCKED
→ retain exact evidence
→ STOP; do not manufacture S2/S3 numbers

P2 passes + P3 fails
→ C-020 COMPOSITION SUSPECT
→ STOP
→ reopen the smallest current technical owner before performance work

P2 passes + P3 passes
→ PRE-BASELINE GATE PASS
→ qualification harness/environment is admissible
→ continue S1-S6 under the existing 7R-2 measurement contract

P1/P2/P3 reveal only a qualification-lever defect
→ repair only the bounded qualification lever
→ rerun the controls
→ continue S1-S6 once the gate passes
```

The two local qualification files from the stopped attempt are working evidence, not accepted baseline. Preserve them when present; do not reset/clean them merely because the remote planning authority advanced. `baseline.json` must remain absent until all retained samples are valid under this gate.

# 3. Preserve

Do not change these accepted semantics while measuring:

- C-020 Mastra/Conexus ownership;
- persistent Project Thread/messages;
- fresh scoped Session and current fresh Workspace/E2B per BuilderRun;
- BuilderRun idempotency/concurrency/source/version/settlement;
- source/Git custody and current hardened isolation;
- PLAN/BUILD semantics;
- ProjectWorkingState working-source vs last-good Preview truth;
- compiler/ArtifactRevision/Preview authority;
- 7R-1 native display-state and reconnect behavior;
- Diagnostic UI status. Measurement must not become a frontend redesign.

# 4. Grounded current-path census

These are observed implementation facts to measure, not optimization mandates.

## 4.1 Project create

Current `PRJ-03` path is approximately:

```text
HTTP/auth
→ recoverBeforeIntake
→ reserve/idempotency DB
→ stageNewProjectSource | stageExistingGitProjectSource
→ promoteStagedProjectSource
→ lock receipt DB
→ verifyCanonicalProjectSource
→ create Project/source + creator grant + complete receipt
→ COMMIT
→ HTTP response
```

Relevant current files:

```text
apps/hub/src/project/routes.ts
apps/hub/src/project/store.ts
apps/hub/src/project/git-execution.ts
apps/hub/src/project/source-recovery.ts
```

For NEW Project, current Git realization includes separate hardened process/container boundaries for source stage, staged/canonical verification and later canonical verification. First image admission also has its own inspect/version/hash probes, then caches successful image verification in-process.

## 4.2 Builder BUILD

Current service path:

```text
POST message / BuilderRun intake
→ async claim
→ prepareProjectSource
→ coding runtime execute
→ result classify
→ source result admission
→ working-source advance/CAS
→ application source snapshot
→ compiler
→ ArtifactRevision retain
→ BuilderRun/Preview settlement
```

Relevant files:

```text
apps/hub/src/builder/routes.ts
apps/hub/src/builder/service.ts
apps/hub/src/builder/store.ts
apps/hub/src/builder/source.ts
apps/hub/src/builder/runtime.ts
apps/hub/src/builder/application-build.ts
apps/hub/src/builder/application-artifact-runtime.ts
apps/hub/src/builder/module.ts
```

## 4.3 Source snapshot / Code / Diff

`BuilderSourcePort` currently implements `tree` and `file` reads through separate hardened Docker executions.

Application compilation currently performs:

```text
listSourceTree
→ serial readSourceFile for every app/** file
→ compiler.compile
```

The Diagnostic UI currently has separate Code and Diff reads. Diff reconstructs base/result source snapshots in the browser and may fan out multiple source-file HTTP reads.

Relevant files:

```text
apps/hub/src/builder/source.ts
apps/hub/src/builder/application-build.ts
apps/web/src/features/builder/api.ts
apps/web/src/features/builder/components/project-build.tsx
```

## 4.4 Coding E2B

Current coding runtime contains at least these distinguishable phases:

```text
Sandbox.create / physical E2B admission
→ sandbox start
→ source bundle upload/materialization
→ BUILD starter materialization when applicable
→ Workspace + Session creation/mode
→ agent/model sendMessage runtime
→ message/result handling
→ Git result finalize/commit/bundle
→ Session delete
→ sandbox destroy
```

Do not combine model wait with sandbox/source overhead if the trace can separate them safely.

## 4.5 Compiler E2B

Current compiler flow:

```text
Sandbox.create
→ source files write
→ dependency link
→ Vite build
→ output list/read/hash
→ sandbox kill
```

Fresh compiler E2B is current behavior. 7R-2 measures it; it does not decide whether that lifetime should change.

## 4.6 Live and Preview

Current user-visible path also includes:

```text
POST message ACK
→ live Session becomes attachable
→ first current snapshot visible
...
Builder settlement
→ Builder-session polling sees last-good Preview coordinates
→ Preview launch POST
→ iframe entry/grant
→ app visible
```

Measure server/runtime time and user-visible wait separately where they differ.

# 5. Required scenarios

Use fixed, documented inputs and the same environment for comparable samples.

S1–S6 below remain the required baseline, but are executable only after `7R2-PROBE-01` reaches `PRE-BASELINE GATE PASS`.

## S1 — Create NEW Project

Measure a normal internal `sourceBootstrap.mode=NEW` Project creation from request start to 201 response.

Required sub-boundaries:

- auth/request overhead when measurable;
- recovery scan;
- reserve/idempotency DB;
- first/cached Git image admission distinction;
- source stage;
- promotion and its verification work;
- canonical verification;
- final DB transaction;
- total wall time;
- Docker process/container count and aggregate duration.

Do not use remote Git import as the primary baseline because network/provider variability would hide the local source-custody question. It may be a separate optional sample only.

## S2 — Source-changing BUILD

Use one fixed small-app request that causes a bounded `app/**` change.

Required waterfall:

```text
message POST start → ACK
claim
prepare source bundle
coding runtime total
  E2B create/start when separately observable
  source materialization
  Session ready
  agent/model runtime
  result finalization
source admission
working-source advance
build source snapshot
  tree
  file-read count + aggregate/individual durations
compiler total
  E2B create when separately observable
  source write/link
  Vite build
  output collection
artifact retain
settlement
terminal state visible to browser
```

Report model time separately from infrastructure time when the current framework/SDK exposes a safe reliable boundary. If not, keep the bucket honest and mark the unresolved sub-breakdown.

## S3 — RESPONSE_ONLY / PLAN control

Use the same Project with a read-only request that settles `RESPONSE_ONLY`.

Purpose:

- separate conversation/model/Session costs from source admission/compile costs;
- prove no compiler/source mutation is introduced by profiling;
- compare live attach timing without the build tail.

## S4 — Code lens

On the same measured Project, open Code and record:

- click/action to tree response;
- selected file response;
- HTTP/source operation count;
- hardened Docker execution count attributable to the action;
- total user-visible elapsed time.

## S5 — Diff lens

After S2, open Diff and record:

- total user-visible elapsed time;
- source tree request count;
- source file request count;
- backend source-operation aggregate duration;
- Docker execution count/aggregate duration;
- browser-local comparison time where material;
- source file count and byte size used by the sample.

Do not optimize the Diff implementation in this slice.

## S6 — Preview readiness

For S2 measure both:

- Builder settlement → last-good Preview coordinates observable by the client;
- Preview launch request latency;
- launch response → iframe/app visibly ready;
- total settlement → visible app time.

Keep current Preview mechanics unchanged.

# 6. Sample discipline

A single favorable run is not a baseline.

Capture:

- one clearly labeled cold/first observation where cold behavior exists;
- at least 3 measured samples for deterministic/local boundaries;
- repeated live external samples where cost/rate limits reasonably allow, with every raw sample retained;
- min/median/max or equivalent simple distribution summary; do not hide raw variance in one average.

If real model/E2B/provider execution cannot be repeated safely in the admitted environment, record the available live sample count and mark confidence/coverage honestly. Do not replace a missing live Product measurement with a mock and call it end-to-end.

# 7. Measurement artifact

The deciding baseline must be machine-readable and tied to the exact subject.

Preferred retained location:

```text
qualification/7r2/builder-runtime-waterfall/
```

The final retained package should contain only what has a consumer, normally:

```text
README.md          # exact reproduction command/environment and interpretation law
measure.*          # smallest reusable measurement lever/harness
baseline.json      # raw samples + environment/subject identity
```

Do not create a generic observability framework, database table, telemetry service, event store or new Product API.

`baseline.json` must identify at least:

```text
schemaVersion
repository HEAD
scenario + sample identity
Node/npm/OS identity
Docker/Git image identity where relevant
Mastra/E2B/package identities
model admission/provider/model identity without credentials
Project/source/app size facts
wall-clock total per scenario
monotonic span start/end/duration
operation/process counts
raw sample values
```

Never write credentials, prompts containing secrets, raw provider payloads or arbitrary tool output into the artifact.

# 8. Instrumentation law

Use the least invasive evidence source that can answer the question.

Order:

1. browser/network elapsed time and existing Product owner timestamps;
2. wrappers around existing ports/functions in the qualification composition;
3. existing injection seams, such as the Git execution process runner, to count/time real Docker boundaries;
4. exact adopted framework/SDK timing/trace surfaces if they provide the needed subspan;
5. only then bounded profiling marks/hooks inside current runtime code when a dominant bucket cannot otherwise be separated.

Before any internal instrumentation, state the unresolved bucket and why external measurement is insufficient.

If internal instrumentation is necessary:

- keep it profiling-only and behavior-neutral;
- do not thread a new Product signal through schemas/storage/APIs;
- do not create a general `PerformanceService`, event bus or telemetry owner;
- do not retain permanent instrumentation merely because it was convenient for this slice;
- preserve reproducibility through the qualification lever/artifact rather than Product-state machinery.

For Git process timing, prefer the existing injectable `runProcess` seam in `createOciGitExecutionPort` where it covers the measured path. Do not rewrite Git execution just to profile it.

# 9. Expensive-boundary census

The baseline must derive a census from the raw samples.

For each material boundary report:

```text
scenario
boundary / operation
invocation count
serial | parallel | overlapping
aggregate duration
median/min/max where repeated
share of relevant wall time when mathematically valid
payload/input size where relevant
cold/warm distinction
current authority/security reason
unclassified remainder
```

After the numbers exist, the baseline may label a **later candidate strategy family** such as elimination, batching, caching, lazy evaluation or scheduling. That label is interpretation for the next plan, not permission to implement it.

# 10. Measurement quality / falsifiers

7R-2 is not accepted if any of these is true:

1. a required Product scenario is missing without an explicit `INCONCLUSIVE` reason;
2. numbers come only from mocks/unit fixtures while claiming current Product/composed behavior;
3. model/provider wait is silently attributed to Git/E2B/source work;
4. Docker/E2B/process counts are inferred from source without runtime evidence;
5. cold and warm observations are mixed without labeling;
6. input/source/file counts or environment identity needed to compare samples are missing;
7. a dominant server bucket remains unexplained enough that later planning cannot distinguish likely owners; if practical, deepen measurement rather than guess;
8. raw samples are discarded and only an average remains;
9. instrumentation changes Product state, authorization, execution order or security boundaries;
10. credentials/provider payloads leak into profiling artifacts;
11. a performance optimization is implemented inside the measurement slice;
12. a preselected 7R-3 solution is presented as proven merely because source inspection made it plausible.

A measurement that cannot safely distinguish a sub-boundary must say `INCONCLUSIVE` rather than manufacture precision.

# 11. Expected code/file envelope

Primary planning/measurement surfaces:

```text
qualification/7r2/builder-runtime-waterfall/**            # preferred new measurement lever/artifact
apps/hub/src/project/store.ts                             # observed create boundaries; edit only if profiling cannot stay external
apps/hub/src/project/git-execution.ts                     # existing injectable process seam; no optimization
apps/hub/src/builder/service.ts                           # BUILD orchestration boundaries
apps/hub/src/builder/source.ts                            # source operation boundaries
apps/hub/src/builder/runtime.ts                           # coding runtime subspans only if otherwise unresolved
apps/hub/src/builder/application-build.ts                 # source snapshot/compiler orchestration
apps/hub/src/builder/application-artifact-runtime.ts      # compiler subspans only if otherwise unresolved
apps/web/src/features/builder/components/project-build.tsx# user-visible Code/Diff/Preview timing only if harness cannot observe externally
tests/implementation/**                                  # only when required to prove profiling is behavior-neutral
```

This is an investigation envelope, not permission to edit every listed file. Prefer zero Product-code edits when existing seams and an external qualification harness are sufficient.

# 12. Ordered implementation work

The current grant is bounded by `7R2-PROBE-01`.

1. revalidate branch/HEAD and current owners;
2. preserve the existing local `qualification/7r2/` working evidence and reconcile the current remote planning commit without reset/clean;
3. execute P1 real Git control with Product timeout semantics;
4. execute P2 direct admitted coding-runtime control;
5. execute P3 exact C-020 Product-composition control;
6. use P4 only if the controls still require bounded phase localization;
7. if the gate disposition is `PRE-BASELINE GATE PASS`, repair only any qualification-lever defect proven by the controls and then capture S1–S6 baseline samples on the current engine;
8. deepen only buckets that remain materially ambiguous;
9. produce `baseline.json` only from valid retained samples plus a concise reproducibility/interpretation README;
10. reconcile counts/durations against total wall time and mark unexplained remainder;
11. derive, but do not implement, evidence-supported candidate strategy families for 7R-3/7R-4 planning;
12. run repository verification required for any tracked instrumentation/harness changes;
13. commit + push and STOP for independent review.

If P2 fails or P2 passes while P3 fails, follow the gate disposition and STOP before S1–S6. Do not turn the performance slice into an architecture repair.

# 13. Completion criteria

7R-2 can pass only when a fresh reviewer can answer from the retained artifact:

- current Project-create wall time and its main owners;
- current BUILD wall time with model/runtime/source/compiler/settlement separated enough to avoid false attribution;
- live attach/first-visible timing;
- Code and Diff request/process amplification and user-visible elapsed time;
- Preview settlement-to-visible timing;
- exact Docker/E2B expensive-boundary counts where measured;
- cold/warm and input-size context;
- what remains inconclusive;
- which later hypotheses have evidence and which do not.

No target latency or optimization success threshold is invented in 7R-2. This slice establishes the baseline that later work can improve against.

# 14. Non-goals

Do not:

- batch or merge Git operations;
- replace tree/file APIs;
- add source snapshot/diff APIs;
- cache source reads;
- warm/pool/reuse E2B;
- merge coding and compiler sandboxes;
- move work to background solely for latency;
- redesign Preview correlations;
- redesign final frontend UX;
- add Brain/Sankhya/workflow/subagent capability;
- upgrade Mastra/E2B;
- add a general profiling/telemetry platform.

Those require later evidence and authorization.

# 15. STOP law

Stop and return to planning before inventing a solution if:

- current production composition cannot be measured without materially changing its behavior;
- exact framework/SDK behavior makes a planned metric invalid;
- external-provider/provisioned execution needed for a deciding claim is unavailable;
- instrumentation would require a new trust boundary, durable Product record, credential exposure or cross-cutting telemetry architecture;
- the trace falsifies C-020 or another accepted Product/architecture owner rather than merely revealing cost;
- the scope required to produce a meaningful baseline expands beyond the bounded Builder foundation journeys above.

# 16. Review disposition

The pre-baseline gate returns one of:

- `PRE-BASELINE GATE PASS` — controls admit the environment/current composition; continue S1–S6;
- `ENVIRONMENT/PROVIDER OR DIRECT-RUNTIME BLOCKED` — direct control cannot execute; STOP with exact evidence;
- `C-020 COMPOSITION SUSPECT` — direct runtime works but exact Product composition does not; STOP and reopen the smallest technical owner.

After a valid baseline exists, independent review returns one of:

- `PASS` — baseline is reproducible, sufficiently decomposed and optimization-free;
- `CORRECTION REQUIRED` — smallest measurement/proof gap is named;
- `REPLAN` — evidence falsifies the measurement premise or an upstream owner.

Only after PASS may the measured evidence drive 7R-3 planning.