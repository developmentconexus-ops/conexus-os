# 4D OPP-C04 — Evaluation, Trace Intelligence and Observability Study

> **Status:** `PASS 1 OPERATOR APPROVED / CONEXUS WORKER EVAL + EVIDENCE ENVELOPE PROMOTED / TRACE INTELLIGENCE DEFERRED`
> **Inputs:** C-009, C-013, C-017; Builder/OBS/PAR owners; 3L; C02R/C03; Mitra/Factory AI; current Mastra and external eval/telemetry sources
> **Research date:** `2026-08-29`
> **Live eval/platform execution:** `NOT PERFORMED / FIRST BUILDER WORKER EVAL REQUIRED`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

What is the smallest evaluation and observation system that can select a capable
Builder runtime, protect ongoing Change correctness and discover recurring Agent
failures without allowing score, trace, feedback or theme to become acceptance,
authorization or owner truth?

## 2. Non-collapsible evaluation layers

```text
L0 deterministic mechanical gates
→ format/type/build/unit/integration/schema/security/authority/browser checks

L1 task and golden-flow oracles
→ exact semantic outcomes, artifact retirement, reader/writer closure,
  recovery/output custody, live dependency proof and firing negative controls

L2 comparative Worker Eval
→ native Mastra vs SDK/ACP/private-MCP and bounded composition variants
  across repeated equal-envelope trials

L3 online observation and learning discovery
→ traces, feedback, sampled scoring, themes and reviewed promotion of new cases
```

L3 cannot close L0/L1. L2 selects an implementation candidate through Builder
adjudication; it does not accept an individual Change.

## 3. First Builder Worker Eval

The first operational Budget Analyzer makes Worker Eval current, not deferred.
Use a private, versioned Conexus corpus rather than a public leaderboard.

Required task families:

- greenfield Budget Analyzer vertical slice;
- second-turn semantic change with old artifact retirement;
- complex bug/root-cause correction;
- schema/migration change;
- frontend/browser interaction;
- Sankhya binding/integration change;
- process loss/re-entry/output custody;
- protected-seam/authority bypass attempt;
- verifier finding → correction → revalidation.

Every trial pins:

```text
task/dataset/case version
base source/commit and scaffold/profile digest
candidate runtime/adapter/model/provider/version
prompt/context/skill/tool/policy/autonomy digests
Workspace/E2B/environment identity
time/token/model-call/cost/intervention budgets
evaluator/assertion/rubric/judge identities
result commit/bundle/diff/candidate digest
verifier Finding/Evidence identities
```

Compare both axes explicitly:

1. same model where possible to isolate runtime/harness effects;
2. complete model+harness candidate where provider loop is inseparable.

Run repeated independent trials and report distributions/variance, never only a
best-of-k result or one aggregate average.

## 4. Hard gates and adjudication

Hard protected properties never trade against speed or score:

- any authority/seam/security violation disqualifies the run;
- a non-firing required negative control blocks the claim;
- command exit or “tests passed” is insufficient without inspecting result
  content, exact subject and proof digest;
- one hidden failing case cannot be averaged away;
- missing score/result/trace/Evidence is `NOT_PROVEN`, not zero/pass;
- accepted defects and maintenance stability precede rework/intervention, which
  precede cost/latency/token considerations.

If variance or Evidence cannot distinguish candidates, keep the incumbent or
selection open. Do not manufacture a winner.

## 5. Mastra evaluation mechanics

### Datasets and experiments

Current Mastra supports versioned dataset items, persisted comparable
experiments, agent/workflow/scorer/custom-task targets, synchronous/asynchronous/
caller-driven runs, per-item results, traces, usage and tool mocks.

Useful properties:

- scorer-as-target can calibrate an LLM judge against ground truth;
- retries use fresh threads, and dedicated eval resources can isolate memory;
- experiment hooks can provision/clear exact Workspace fixtures;
- `unmockedToolPolicy: deny` blocks undeclared tool execution;
- caller-driven experiments allow the Conexus harness to retain orchestration;
- result comparison is per item/scorer, not only aggregate.

Critical limits:

- dataset versions reference scorer IDs but do not snapshot scorer definitions;
- unmocked tools run live by default;
- resource-scoped memory/semantic recall can contaminate later items;
- teardown failures can be logged without changing result outcome;
- mocked calls may have no tool span, changing trajectory scoring behavior;
- `succeededCount` means target execution succeeded, not semantic correctness;
- async/no-persistence execution may lack queryable terminal result.

**Disposition:** `KEEP AS WORKER-EVAL RUNNER CANDIDATE / CONEXUS MANIFEST REQUIRED`.

### Scorers, gates and verdicts

Mastra supports deterministic Quick Checks, custom/LLM scorers, thresholds and
gates. A framework `passed`, `scored` or `completed` value is only mechanism
output. Aggregates can hide tails, and any scorer—including stochastic judges—
can be configured as a gate.

Protected invariants therefore use deterministic assertions and negative
controls. LLM judges remain secondary Evidence until calibrated against
human/owner labels under exact model/prompt/version identity.

**Disposition:** `ADAPT / NEVER DIRECT ACCEPTANCE`.

### Multi-turn and memory eval

Per-turn gates are required where one good final answer could hide a broken
turn. Whole-conversation judges may supplement them. Eval uses dedicated
resource/thread/Workspace state; real user memory is touched only for an exact
authorized memory-specific claim.

**Disposition:** `ADOPT BOUNDED PER-TURN/ISOLATION PROPERTIES`.

### Live scoring and feedback

Live scorers are asynchronous, sampled and non-blocking. Missing registration,
trace sampling or storage can yield no score. Feedback source metadata is not an
authenticated Conexus reviewer identity.

Feedback must bind authenticated reviewer, rubric/version, exact trace/run/
candidate subject and correction/disagreement history. It remains Evidence—not
ApprovalRequest, Change acceptance or authorization.

**Disposition:** `OPTIONAL ONLINE EVIDENCE / NOT FIRST RELEASE GATE`.

### Trace Intelligence

Trace Intelligence is private beta, Mastra-platform/deployed-Studio only,
typically needs roughly 100+ representative completed traces, and produces
AI-generated goal/outcome/behavior/sentiment themes asynchronously. Themes show
association, not causality; snapshots overlap and labels/clustering/noise may
change.

Use only after human inspection of examples and underlying traces, then promote
a reviewed failure into a versioned regression case through existing owners.

**Disposition:** `DEFER / REFERENCE_ONLY RECURRING-FAILURE DISCOVERY`.

## 6. Observability envelope

Tracing, logs, metrics, scores and feedback remain separate Evidence classes.
Telemetry may be sampled, filtered, buffered, dropped, redacted or absent.
The first Builder/MAR slice realizes only owner-local ordinary observation and
evaluation Evidence; it instantiates no `obs.*` Product path or generic
Observability owner surface. The first real exporter/audit-required consumer
inherits the preserved OBS route separately.

Required envelope:

```text
Conexus owner/run/candidate correlation refs
+ exact telemetry schema/adapter/exporter identity
+ coverage/sampling/filter/redaction/drop state
+ safe minimized attributes
+ OTLP export seam where useful
→ observation Evidence only
```

OpenTelemetry Collector/OTLP is the portability seam. Exact-pinned
OpenInference/GenAI translation may enrich agent/tool/evaluator semantics, but
those conventions are evolving and need adapter conformance. Redaction/
allowlisting occurs before export. `OtelBridge` remains experimental and deferred.

Telemetry/exporter failure does not replay or corrupt owner execution. Ordinary
loss is explicit degradation; required verification Evidence missing remains
`NOT_PROVEN`; audit-required persistence remains independently fail-closed when
that Product surface is first instantiated.

## 7. External evaluation platforms

### Phoenix OSS

Self-hosted traces, annotations, versioned datasets and experiments give the
best current sovereignty/replacement posture. Continuous online-eval automation
is stronger in commercial Arize AX, so Conexus would still own admitted
sampling/scheduling.

**Disposition:** `SOVEREIGN INCUMBENT FOR LATER BOUNDED BAKEOFF / NOT SELECTED`.

### Braintrust

Strong turnkey datasets, experiment snapshots/repetitions, CI, online scoring,
human review and trace-to-dataset workflows. Self-hosting keeps a SaaS control
plane and commercial lock-in.

**Disposition:** `MANAGED CHALLENGER`.

### LangSmith

Strong offline/online eval, experiment comparison, deterministic/LLM/pairwise
evaluators, annotation queues and tracing. Hybrid/self-hosting is enterprise and
operationally heavy.

**Disposition:** `MANAGED CHALLENGER`.

Do not multi-home all three. Select at most one external product after a bounded
bakeoff proves material workflow value over the local/portable envelope.

## 8. Public coding benchmarks

Public leaderboards are reference signals, not Builder selection. Current
evidence includes contamination and broken-test findings serious enough that
SWE-bench recommendations were withdrawn/revised.

Retain useful benchmark design properties instead:

- exact container/repository state;
- real end-to-end tasks and reviewed tests;
- human expert baseline/time calibration;
- holdout cases and rotation after exposure;
- repeated attempts and uncertainty intervals;
- final-state and trajectory scoring kept separate.

## 9. Promoted properties

1. `EVA-01`: every material eval pins complete subject/candidate/dataset/case/
   runtime/model/context/tool/environment/evaluator/repetition identity;
2. `EVA-02`: protected invariants use item-level mechanical gates and firing
   negative controls; stochastic judge is never sole hard gate;
3. `EVA-03`: accounting distinguishes executed/succeeded/failed/skipped/scorer-
   error/missing and cannot hide a failing tail;
4. `EVA-04`: paired representative repeated trials report correctness, variance,
   cost, latency, interventions, rework and forbidden-boundary attempts;
5. `EVA-05`: eval uses isolated resources/threads/workspaces, denies undeclared
   tools and distinguishes mocks from real-dependency proof;
6. `EVA-06`: scorer/judge is calibrated and versioned; changes create new
   evaluation identity and comparability boundary;
7. `EVA-07`: eval output is immutable Evidence; only current owner acceptance
   can select runtime or accept Change;
8. `TEL-01`: trace/log/metric/score/feedback identity/status is correlation only;
9. `TEL-02`: sampling/filter/redaction/drop/export/missingness is explicit;
10. `TEL-03`: minimization, tenant isolation, retention/residency/access and
    tested pre-export redaction protect telemetry;
11. `TEL-04`: feedback binds authenticated reviewer/rubric/candidate provenance
    and remains Evidence;
12. `TEL-05`: exporter/bridge/schema versions are pinned and replaceable through
    Conexus observation projection;
13. `LRN-02`: Trace Intelligence is optional discovery; outage/absence cannot
    block first-Builder correctness and themes require underlying-trace review.

## 10. Required falsifiers

1. `C04-P1`: framework passed/completed/succeeded cannot accept Change or settle ActorRun.
2. `C04-P2`: threshold miss or one failing item hidden by aggregate prevents the required claim.
3. `C04-P3`: missing score/result/trace or scorer error/drop yields `NOT_PROVEN`.
4. `C04-P4`: scorer/judge mutation under same dataset identity fires reproducibility guard.
5. `C04-P5`: stochastic judge disagreement with deterministic/human oracle cannot decide alone.
6. `C04-P6`: every material negative control turns its protected property red.
7. `C04-P7`: unequal task/context/tool/budget/intervention envelopes invalidate comparison.
8. `C04-P8`: one-run/best-of-k/aggregate-only selection is rejected.
9. `C04-P9`: shared real-user/adjacent-item memory or Workspace contamination fails isolation.
10. `C04-P10`: undeclared/live effect in mocked eval is denied; mock cannot prove real integration.
11. `C04-P11`: broken multi-turn middle turn is caught by per-turn gate.
12. `C04-P12`: feedback spoof/stale subject/duplicate cannot become acceptance.
13. `C04-P13`: trace success without owner settlement leaves owner pending/unknown.
14. `C04-P14`: sampling/filter/export/flush failure creates explicit coverage gap.
15. `C04-P15`: canary secret cannot cross exporter when filter/redaction fails.
16. `C04-P16`: forged trace/span cannot alter principal/scope/owner linkage.
17. `C04-P17`: theme/association/noise cannot create causal owner finding or automated fix.
18. `C04-P18`: Trace Intelligence unavailable/<100 traces leaves local Worker Eval functional.

## 11. Pass-1 outcome

```text
OPP-C04 PASS 1 = OPERATOR APPROVED
private versioned Conexus Worker Eval = REQUIRED
deterministic gates + independent verifier = ACCEPTANCE FLOOR
Mastra datasets/experiments/runEvals = IMPLEMENTATION CANDIDATES
Mastra live scoring/feedback = OPTIONAL EVIDENCE
Trace Intelligence = DEFER / REFERENCE_ONLY
OTLP + pinned translation = PORTABILITY SEAM
Phoenix OSS = SOVEREIGN BAKEOFF INCUMBENT
Braintrust/LangSmith = MANAGED CHALLENGERS
public coding leaderboards = REFERENCE ONLY
EVA-01..07 + TEL-01..05 + LRN-02 = PROMOTE TO 4D PROPERTY CONTRACTS
new Product owner/operation/record = 0
exact eval/telemetry platform selection = 0
Product implementation authority = 0
```
