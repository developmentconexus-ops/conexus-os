# P-04 — Release operations Screen Contract

> **Status:** `P12 FAMILY 3 RE-LOCKED / P12 FAMILY 4 ORIGINATING-RUN DELTA RE-LOCKED / OPERATOR APPROVED`
> **Method:** Frontend Product Experience Planning Method v2.3
> **P9:** `P9 EXACT TRACE CLOSED`
> **P10:** `P10 CONSOLIDATED`
> **P11:** `P11 LATER ASSEMBLED PRODUCT`
> **Final operator-approved P8:** `docs/evidence/4c/p04-release-operations-functional-wireframe.html`
> **Exact artifact identity:** `approved final P8 artifact blob = 9aaa2c8e6d85b7b5d535bfba5969c475190ba7e7`
> **P12 Family 3 re-locked identity:** `approved serving-egress P8 delta blob = 77820d283e47ba6c9f5efd19f45471c88675e0b0 / OPERATOR APPROVED 2026-08-28`
> **P12 Family 4 approved identity:** `approved originatingRun-ingress P8 delta blob = e036684e3e66d028361db2d708cf05811a367f4b / OPERATOR APPROVED 2026-08-28`
> **Accepted bounded upstream corrections:** `4C-F31..F34`
> **Product implementation authority:** none; `Product implementation = BLOCKED`.

---

## 1. Locked human experience

P-04 locks two direct Project destinations rather than a generic Operations console:

```text
Project → Releases
→ understand current serving posture per server-disclosed environment
→ compare immutable Releases
→ inspect Overview / Composition / Proof
→ inspect exact chronological Promotion history
→ promote one exact Release with conformance + expected pointer generation

Project → Activity
→ Timeline: human chronological ingress to exact disclosed owner truth
→ Managed jobs: discover currently served jobs, inspect Release-pinned runs, admit run-now
→ Effects: inspect receipt/reconciliation/Evidence without retry authority
→ Usage & cost: inspect exact-period truth classes and provenance
→ Audit: investigate immutable exact-Project facts with server filters
```

Locked truth laws:

```text
Release AVAILABLE != promoted != active pointer != SERVED_VERIFIED
rollback = Promote an eligible prior exact Release
Activity != owner lifecycle truth
trace/provider observation != owner truth or authorization
OUTCOME_UNKNOWN != failed != retry permission
missing usage/cost != zero
JobRun owner truth != queue delivery state
```

The operator-approved HTML remains low-fidelity Evidence. Its in-artifact `REVISED CANDIDATE / NOT LOCKED` marker is historical proof chrome; current LOCK authority lives in this Screen Contract and `docs/roadmap.md`, pinned to the exact blob above.

---

## 2. P9 — shell, routes and information roles

P-04 inherits the locked GF-01 Project shell.

| Surface | Primary information role | Secondary role |
| --- | --- | --- |
| Releases / Serving now | answer what each environment points to and whether serving is verified | enter exact Promotion work |
| Immutable Releases | recognize and compare exact compositions | inspect proof coordinates |
| Promotion history/detail | inspect owner state, actor/time and pointer generations | diagnose failed/not-settled Promotion |
| Activity / Timeline | answer what happened chronologically | navigate only to explicitly disclosed owner/observation detail |
| Managed jobs | discover jobs from the currently served Release | inspect runs and admit one run-now occurrence |
| Effects | investigate external-effect ambiguity | inspect receipt, reconciliation and Evidence |
| Usage & cost | inspect exact-period economics honestly | preserve token/cost classes and provenance |
| Audit | investigate immutable Project-scoped facts | retain exact server-filtered query context |

Navigation law:

```text
Project rail → Releases / Activity             = URL_NAVIGATION
Release / Promotion / observation / run detail = focused in-route drawer
Activity lenses                                = local tabs over independent owner reads
owner-specific continuation                    = exact admitted operation, never generic dispatch
```

---

## 3. Releases and serving trace

### 3.1 Current serving posture

| Contract axis | Locked trace |
| --- | --- |
| Owner/read | Release / `REL-07 GetProjectServingState` |
| Identity | exact Project + server-disclosed `environmentId` |
| Presentation | environment label, pointer state/generation, active Release when set, independent serving verification |
| Success | `SERVED_VERIFIED` only after exact real-path proof |
| Material states | set, unset, pending/not verified, verified, denied and dependency failure |
| Forbidden | infer environment names, call pointer swap live, merge serving verification into Release state |

### 3.2 Immutable Release collection/detail

| Contract axis | Locked trace |
| --- | --- |
| Owner reads | `REL-01 ListReleases`, `REL-02 GetRelease` |
| Recognition | `releaseLabel`, source revision, created time and composition summary |
| Detail | exact components/bindings plus manifest, configuration, runtime-contract and verification Evidence digests |
| Paging | newest-created-first owner page; loaded results never claim complete history |
| Client state | selected Release and local Overview / Composition / Proof tab |
| Forbidden | mutable latest, frontend composition model, availability-to-live inference |

### 3.3 Promotion and rollback

| Control/region | Owner operation | Binding/success law |
| --- | --- | --- |
| History | `REL-04 ListPromotions` | exact environment; chronological owner page |
| Detail | `REL-05 GetPromotion` | exact Promotion state, actor/time and expected/resulting pointer generations |
| Conformance | `REL-08 GetEnvironmentConformance` | exact disclosed environment + candidate Release |
| Confirm Promotion | `REL-06 PromoteRelease` | exact `releaseId` + `environmentId` + `expectedPointerGeneration` + Idempotency-Key |

Conflict/stale/denied/ineligible requests fail closed. A successful Promotion updates pointer owner truth but leaves serving verification independent. Rollback uses the same REL-06 path against an eligible prior Release and never promises business-data or down-migration rewind.

---

## 4. Activity and technical investigation trace

### 4.1 Timeline and observation

| Contract axis | Locked trace |
| --- | --- |
| Timeline | `OBS-01 ListProjectActivity` |
| Recognition | projection-time subject label + deterministic summary + occurred time |
| Owner continuation | optional exact `detailTarget.operationId + ref`; owner rechecks disclosure |
| Technical observation | `OBS-02 GetExecutionObservationDetail` with producer trust, observed time, optional duration, trace refs and Evidence refs |
| Paging | opaque continuation for the same admitted Project projection |
| Forbidden | universal status taxonomy, generic dispatch, telemetry-derived terminal truth, trace explorer |

Trace/provider/Mastra references remain correlation-only. Absence of a truthful/disclosable target produces no false owner affordance.

### 4.2 Managed jobs

| Control/region | Owner operation | Binding/success law |
| --- | --- | --- |
| Available jobs | `MAR-04 ListRunnableManagedJobs` | exact currently served Release; includes never-run job |
| Run history | `MAR-01 ListManagedJobRuns` | exact Project/job owner page |
| Run detail | `MAR-02 GetManagedJobRun` | state, exact pinned Release/job, admitted/settled time, problem and Evidence |
| Run now | `MAR-03 RunManagedJobNow` | exact admitted `jobId` + Idempotency-Key; server resolves served Release |

Run-now admits one occurrence. It does not select a Release or expose queue, retry, redelivery, cancel, resume or catch-up controls. Conflict/denial refuses admission without fabricating a JobRun.

### 4.3 External effects

| Contract axis | Locked trace |
| --- | --- |
| Owner reads | Gateway / `GW-01 ListEffectAttempts`, `GW-02 GetEffectAttempt` |
| Exact inbound investigation | optional exact `originatingRun.kind + originatingRun.ref` from an admitted owner route; `GW-01` filters server-side before pagination |
| Detail | outcome, provider receipt, reconciliation and Evidence |
| Ambiguity | `OUTCOME_UNKNOWN` remains explicit |
| Forbidden | retry, replay, reconcile, mark succeeded or infer terminal truth from receipt |

An empty filtered page means no currently disclosable Gateway EffectAttempt matches that exact run. It does not prove the run produced no effect. The Activity/Effects lens never filters only the loaded browser page and never joins `PAR-07` client-side.

---

## 5. Usage, cost and Audit trace

### 5.1 Usage & cost

| Contract axis | Locked trace |
| --- | --- |
| Owner/read | OBS / `OBS-03 GetProjectUsageCostSummary` |
| Scope | exact Project + inclusive `from` / exclusive `to` period |
| Truth states | `REPORTED / INFERRED / MISSING`; `CALCULATED / MISSING_USAGE / MISSING_PRICE / UNSUPPORTED`; reconciliation variants |
| Usage | input, output, cache and reasoning tokens when disclosed |
| Cost | calculated, provider-reported, reconciled and sandbox/runtime monetary classes remain separate |
| Provenance | exact `evidenceRefs[]`; summary never hides missing/inferred/calculation state |
| Forbidden | missing-to-zero conversion, provider invoice guarantee, arbitrary grouping/export/cross-provider explorer |

### 5.2 Exact-Project Audit

| Contract axis | Locked trace |
| --- | --- |
| Owner reads | `OBS-04 ListAuditRecords`, `OBS-05 GetAuditRecord` |
| Scope | Workspace Audit owner with exact Project + period/actor/action server filters before pagination |
| Recognition | immutable actor/action/subject snapshots, occurred time and deterministic summary |
| Detail | exact immutable fact + Evidence |
| Forbidden | current authorization inference, mutable Audit, browser filtering presented as whole-owner filtering |

P-04 reuses the locked W-03 Audit interaction; it does not create a second Project Audit owner.

---

## 6. Authorization, client state and accessibility

```text
project.read     → REL-01/02/04/05/07 + MAR-01/02/04 + OBS-01/03
release.promote → REL-06/08
job.run          → MAR-03
audit.read       → OBS-02/04/05 + GW-01/02
```

No permission implies another. Independently denied detail/action stays independently unavailable.

```text
SERVER
→ environment/pointer/serving, Releases, Promotions, Activity, observations,
  jobs/runs, effects, usage/cost and Audit facts

URL_NAVIGATION
→ route + Activity lens only

EPHEMERAL_UI
→ selected environment/Release/job, local tabs, open drawer/dialog,
  filters, confirmation checkbox and loaded-page markers
```

Locked accessibility/responsive obligations:

- semantic route buttons, tabs, dialogs and labeled controls;
- Escape closes the top overlay and focus returns to its trigger;
- actionable state is not color-only;
- cards/records stack on narrow screens and Audit becomes labeled row cards;
- reduced-motion preference is preserved;
- loading, empty, denied, dependency failure, stale/conflict and missing states remain distinct.

---

## 7. Backend sufficiency and retained reopen seams

P9 found no contradiction invalidating the locked P8. REL-01/02/04..08, MAR-01..04, GW-01/02 and OBS-01..05 are sufficient for the locked structure after F31..F34.

Explicit deferred seams remain:

1. arbitrary cost grouping/export/cross-provider drilldown beyond OBS-03 exact Project-period summary;
2. generic logs/trace explorer beyond OBS-02 exact observation correlation;
3. retry/replay/cancel/resume/reconcile controls absent from the semantic owners;
4. concrete `@mastra/observability` pin/export/backend and real cost ingestion/reconciliation, which remain 4D/first-build qualification work.

These do not block the lock because the UI exposes current truth honestly and does not simulate the deferred capabilities.

---

## 8. P10 — pattern consolidation

Patterns reused because their protected semantics repeat:

```text
GF-01 direct Project routes and single shell
P-02/P-03 whole-card recognition + focused progressive detail
W-03 exact server-filtered immutable Audit investigation
owner paging + honest loaded-result wording
exact identity/generation/digest concurrency + explicit stale state
focused drawer/dialog + Escape/focus return
loading != empty != denied != dependency failure
```

Patterns deliberately not generalized:

```text
universal Operations dashboard or status taxonomy
universal event/detail/dispatch owner
deployment framework console
generic trace/log/cost explorer
generic job/effect retry controls
frontend-composed authorization, serving or terminal truth
```

---

## 9. Lock disposition

```text
P-04 P8 = LOCKED / OPERATOR APPROVED
P-04 P9 = EXACT TRACE CLOSED
P-04 P10 = CONSOLIDATED
P11 = NOT ASSEMBLED
P-05 / PA-01 / BUD-01 / P11 / 4D / Product implementation = NOT AUTHORIZED
```

Only a named material falsifier may reopen the smallest affected P-04 or upstream owner. This lock does not authorize merge or implementation.
