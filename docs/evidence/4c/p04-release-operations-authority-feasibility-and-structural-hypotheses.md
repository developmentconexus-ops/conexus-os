# 4C P-04 — Release Operations Authority Feasibility + Structural Hypotheses

> **Status:** `P-04 LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED`
> **Block:** `P-04 — Releases + Promotions + Activity + effect/job/usage/audit Evidence`
> **Leading hypothesis:** `A — current-serving Releases route + owner-specific Activity lenses`.
> **Methods:** DevelopmentConexus Engineering Method v1.0.0 + Frontend Product Experience Planning Method v2.3.
> **Product implementation authority:** none.

## 1. Decision question

What is the smallest coherent Project experience in which a human can understand what is actually available and served, promote or roll back one exact Release safely, investigate operational work and cost, and follow technical Evidence without flattening Release, Promotion, MAR, Gateway, OBS or Audit into one fake deployment owner?

P-04 tests current Product/backend authority as a falsifiable baseline. It does not begin P8 while a material job depends on opaque identity, frontend-composed owner truth or an undiscoverable write subject.

## 2. P0 — bounded authority pack

### 2.1 Semantic owners

```text
Release
→ immutable composition, Promotion history/current state, target conformance and serving truth

MAR
→ exact Release-pinned managed JobRun and admitted run-now occurrence

Gateway
→ EffectAttempt receipt, outcome and reconciliation truth

OBS
→ chronological Project Activity, typed technical observation and usage/cost projection

Audit
→ immutable actor/action/subject fact and Evidence

I&A
→ current disclosure, release.promote, job.run and audit.read authority
```

Visual composition must preserve those owners. Activity can link to owner facts but cannot become their lifecycle authority.

### 2.2 Human-facing operations

```text
REL-01 ListReleases
REL-02 GetRelease
REL-04 ListPromotions
REL-05 GetPromotion
REL-06 PromoteRelease
REL-07 GetProjectServingState
REL-08 GetEnvironmentConformance

GW-01 ListEffectAttempts
GW-02 GetEffectAttempt

MAR-01 ListManagedJobRuns
MAR-02 GetManagedJobRun
MAR-03 RunManagedJobNow

OBS-01 ListProjectActivity
OBS-02 GetExecutionObservationDetail
OBS-03 GetProjectUsageCostSummary
OBS-04 ListAuditRecords
OBS-05 GetAuditRecord
```

Explicit exclusions:

```text
REL-03 ComposeRelease = system-owner transition, not a human command
rollback = REL-06 against an eligible prior Release, not a distinct mutation
effect retry/replay/reconcile/MarkSucceeded = no admitted Product operation
queue retry/redelivery/catch-up controls = MAR mechanism, not Product authority
Activity = projection, not generic command or owner-state mutation
Project audit = Project-filtered OBS-04/05; no second audit owner
```

### 2.3 Permission boundaries

```text
REL-01/02/04/05/07 → project.read
REL-06/08 → release.promote
MAR-01/02 → project.read
MAR-03 → job.run
OBS-01/03 → project.read
OBS-02/04/05 + GW-01/02 → audit.read
```

Negative laws:

```text
project.read -X-> release.promote / job.run / audit.read
release.promote -X-> project.read
job.run -X-> Release selection authority
audit.read -X-> retry, replay, reconcile or owner mutation
Activity visibility -X-> underlying owner disclosure
AVAILABLE -X-> promoted -X-> active pointer -X-> SERVED_VERIFIED
OUTCOME_UNKNOWN -X-> retry permission
missing usage/cost -X-> zero
telemetry observation -X-> owner terminal truth
```

## 3. P1 — actors, jobs and user needs

### J1 — understand what users are actually receiving

As a Project operator, I need to distinguish the immutable Release, current environment pointer and independent serving verification so that I do not call an available or promoted artifact live before real-path proof exists.

### J2 — promote or roll back safely

As an eligible release operator, I need to recognize the exact target environment, current served Release, candidate Release, conformance checks and consequence before confirming a generation-bound Promotion so that a stale browser cannot force-write the pointer.

### J3 — understand recent Project work

As a Project operator, I need a chronological, human-scannable Activity view that takes me to the current owner fact so that I can answer “what happened?” without treating an event stream as business truth.

### J4 — investigate a technical problem

As an auditor or technical investigator, I need to inspect an exact observation, effect attempt or immutable audit fact with provenance so that ambiguous provider outcomes and telemetry remain honest and actionable only through the actual owner.

### J5 — inspect and run managed work

As a Project operator, I need to recognize admitted managed jobs and their Release-pinned runs, then—if separately eligible—admit one run-now occurrence without choosing a mutable Release or receiving queue-level controls.

### J6 — understand usage and cost truth

As a Project operator, I need an exact period summary that distinguishes reported, inferred, missing, calculated, provider-reported and reconciled values so that missing data never looks like zero spend.

Relative ordering assumption for P7: current serving posture and urgent failed/unknown work are high-salience; Promotion and run-now are consequential but less frequent; audit and cost are deliberate investigation paths rather than permanent dashboard noise.

## 4. P2 — end-to-end flows

### F1 — serving posture and Release inspection

```text
Project → Release operations
→ inspect current environment serving posture
→ distinguish active pointer from serving verification
→ browse immutable Releases
→ open exact Release composition/proof
→ inspect related Promotion history
```

### F2 — governed Promotion or rollback

```text
open exact target environment
→ compare current served Release with candidate/prior exact Release
→ inspect current conformance Evidence
→ understand consequence
→ confirm exact releaseId + environment + expectedPointerGeneration
→ owner admits Promotion or refuses stale/ineligible request
→ follow Promotion state separately from serving verification
```

### F3 — Activity-led investigation

```text
Project → Activity
→ scan human event/time/subject context
→ open exact owner fact when disclosed
→ optionally inspect typed observation Evidence
→ preserve Activity as chronological projection only
```

### F4 — effect investigation

```text
Project → operational Evidence → Effect attempts
→ scan operation/outcome/time/origin
→ inspect receipt + reconciliation + Evidence
→ preserve OUTCOME_UNKNOWN
→ no retry/replay/MarkSucceeded affordance
```

### F5 — managed job run

```text
Project → managed jobs
→ recognize an admitted job in the currently served Release
→ inspect Release-pinned JobRun history/detail
→ eligible human selects Run now
→ MAR resolves the currently served Release and admits one occurrence
```

### F6 — usage/cost and Project audit

```text
select exact period → inspect usage/cost states + provenance
Project audit → reuse Workspace Audit owner with exact Project filter
→ inspect immutable actor/action/subject snapshot + Evidence
```

## 5. P3 — bounded coverage matrix

| Human surface | Read truth | Material write | Required states |
| --- | --- | --- | --- |
| serving posture | `REL-07` | none | verified, not verified, unavailable, denied, failed |
| Releases + detail | `REL-01/02` | none | collection, exact composition, empty, denied, failed |
| Promotion + conformance | `REL-04/05/08` | `REL-06` | eligible/ineligible, conformant/drift, pending/failed, stale generation, serving not yet verified |
| Activity | `OBS-01` | none | chronological page, empty, more pages, denied, failed |
| observation detail | `OBS-02` | none | producer trust, duration absent/present, Evidence absent/present |
| usage and cost | `OBS-03` | none | reported/inferred/missing; calculated/missing-price/unsupported; reconciliation variants |
| effect attempts | `GW-01/02` | none | outcome, receipt absent/present, reconciliation absent/present, `OUTCOME_UNKNOWN`, pagination |
| managed jobs | `MAR-04` catalog + `MAR-01/02` runs | `MAR-03` | served-Release job discovery, running/terminal owner states, optional timestamps, pagination, command admitted/refused |
| Project audit | Project-filtered `OBS-04/05` | none | server filters before pagination; immutable human snapshots; Evidence |

Independent permission states must remain independently inspectable. A single all-or-nothing “Operations access denied” state would be false.

## 6. P6 — conditional reference study

References are evidence only. Their deployment/runtime models do not replace Conexus owners.

### 6.1 Vercel deployment promotion

**Source observation:** Vercel distinguishes staged/promoted/current deployments and makes Promotion a contextual action on an immutable deployment. Its rollback moves routing to a prior deployment rather than rebuilding it. Source: [Promoting Deployments](https://vercel.com/docs/deployments/promoting-a-deployment).

**Inference:** current serving posture should be prominent; immutable candidates and the consequential traffic-pointer action should remain distinct.

**Disposition:** `PRESENT-IN-AUTHORITY` through `REL-01/02/06/07/08`. Vercel-specific domains, automatic branch promotion, rolling releases and its rollback semantics are `REJECTED — different Product/runtime authority`.

### 6.2 Render event-led deploy history

**Source observation:** Render places deploys in an Events history and permits rollback from a prior successful event while explicitly documenting that some current configuration/state is not rolled back. Sources: [Deploying on Render](https://render.com/docs/deploys) and [Render Rollbacks](https://render.com/docs/rollbacks).

**Inference:** chronological context can be a strong ingress, but “rollback” must disclose what exact immutable subject changes and what does not.

**Disposition:** event-to-detail navigation is `PRESENT-IN-AUTHORITY` through `OBS-01` owner references. Render-style generic deploy/restart/cancel and implicit configuration behavior are `REJECTED — no admitted Conexus operation`.

### 6.3 GitHub run history and progressive detail

**Source observation:** GitHub exposes run state in a scan list and progressively opens job/step logs for diagnosis. Source: [Using workflow run logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs).

**Inference:** managed JobRun history should optimize recognition first and reveal Evidence/detail on demand.

**Disposition:** `PRESENT-IN-AUTHORITY` for `MAR-01/02`. Re-run/cancel/log deletion are `REJECTED — owner operations are absent`; they must not leak into P-04 by familiarity.

### 6.4 Datadog Events, Audit and Cost

**Source observation:** Datadog separates recent service events, immutable administrative audit investigation and period-based cost exploration; each opens detail while retaining the current query context. Sources: [Events Explorer](https://docs.datadoghq.com/events/explorer/navigate/), [Audit Trail](https://docs.datadoghq.com/account_management/audit_trail/) and [Cost Explorer](https://docs.datadoghq.com/cloud_cost_management/reporting/explorer/).

**Inference:** Activity, Audit and cost are three distinct jobs. Shared timeline/table mechanics are valid; shared authority or one generic event schema is not.

**Disposition:** distinction is `PRESENT-IN-AUTHORITY` through `OBS-01`, `OBS-03` and `OBS-04/05`. Arbitrary query/grouping, monitors, export and cross-provider drilldown are `DEFERRED — no accepted current Conexus consumer/operation`.

Reference stop condition reached: additional products would repeat current-serving emphasis, event-led ingress and progressive detail without changing the authority questions below.

## 7. P7 feasibility — blocking findings

### 7.1 `4C-F31` — Release recognition and composition are not yet human-operable

**Operator adjudication:** `APPROVED — CURRENT OWNERS ENRICHED`. `REL-01/02` now expose immutable human Release presentation, exact source/time coordinates, safe composition summary/detail and opaque continuation without creating a frontend Release model.

**Evidence:** `REL-01` returns only `releaseId`, manifest digest and owner state. It is an unpaged array. `REL-02.composition` is an open `ReleaseManifestProjection` whose detailed schema is explicitly left to a later realization contract. No accepted created time, human change/revision context or stable human composition projection exists.

**Root cause:** exact machine identity exists, but the human read model required to compare immutable Releases was never closed.

**Target invariant:** a user can recognize and compare exact immutable Releases and inspect their accepted composition without the browser inventing labels, timestamps, component categories or manifest semantics.

**Global-Maximum outcome:** `STOP / SPLIT PREREQUISITE`. Reopen the smallest Release Product/wire read projection. Close a bounded human-recognizable Release summary, a stable safe composition projection and scalable list continuation. Do not create a second frontend Release model.

**Proof falsifier:** P8 must render two materially different Releases entirely from accepted fields and retain exact identity/proof coordinates; deleting the human projection or page continuation must fail a contract guard.

### 7.2 `4C-F32` — target environment and Promotion history cannot be recognized safely

**Operator adjudication:** `APPROVED — CURRENT OWNERS ENRICHED`. `REL-07` now discloses the exact target matrix and pointer/serving truth; `REL-04/05` carry chronological human context; `REL-06` accepts only an exact disclosed `environmentId`.

**Evidence:** `REL-06` accepts caller-supplied `environment`; `REL-08` requires an exact `environmentId`; no admitted read enumerates target environments. `REL-07` has no environment coordinate in its path yet returns one environment. `Promotion` has no admitted/decided/updated time or human decision context, so `REL-04` cannot truthfully present chronological history.

**Root cause:** write concurrency was closed, but human target discovery and historical recognition were not.

**Target invariant:** the operator selects a server-disclosed exact target, sees its current pointer/serving/conformance facts and reviews chronological Promotion owner truth before a generation-bound decision.

**Global-Maximum outcome:** `STOP / SPLIT PREREQUISITE`. Reopen only Release environment disclosure, serving-state coordinate and Promotion human-history projection. Do not infer environments from prior Promotions or let a free-text field become authority.

**Proof falsifier:** a stale browser and two environments must be representable without mixing pointers; an unknown environment cannot reach `REL-06`; chronological ordering must come from owner fields.

### 7.3 `4C-F33` — run-now has no discoverable managed-job subject

**Operator adjudication:** `APPROVED — ONE DISTINCT READ ADDED`. `MAR-04 ListRunnableManagedJobs` is the safe purpose-bound catalog over the exact currently served Release. It adds one independently justified read and no Permission/owner/runtime control.

**Evidence:** `MAR-03` requires `jobId`, while `MAR-01` lists prior JobRuns rather than the admitted jobs in the currently served Release. The only potential source is the currently open/unspecified Release manifest projection. A Project with an admitted job and zero prior runs is therefore not operable from accepted reads.

**Root cause:** execution admission exists, but subject discovery was assumed to emerge from an unresolved manifest mechanism.

**Target invariant:** a human can recognize an exact admitted job from server-owned currently served Release truth before requesting one run-now occurrence; job history is not the job catalog.

**Global-Maximum outcome:** `STOP / SPLIT PREREQUISITE`. Add the smallest safe admitted-job projection to the Release/MAR boundary or close it inside the stable Release composition read. Do not mine JobRun history or accept opaque free-text IDs.

**Proof falsifier:** a never-before-run job must be discoverable and runnable; an absent job and a job from a non-served Release must fail closed.

### 7.4 `4C-F34` — Project Activity lacks sufficient human navigation context

**Operator adjudication:** `APPROVED — CURRENT OWNER ENRICHED`. `OBS-01` now carries a projection-time subject label, deterministic summary and optional exact admitted owner-read target; absence of a truthful/disclosable target produces no detail affordance.

**Evidence:** `ProjectActivityEntry` exposes owner `kind/ref`, event kind, time and optional observation/Evidence refs, but no server-owned human summary or subject presentation. Owner kind is open text. A useful timeline would have to invent labels or maintain an unowned browser registry that claims every kind is navigable.

**Root cause:** correlation coordinates were accepted as if they were a human activity projection.

**Target invariant:** Activity remains a chronological projection while giving a human server-owned summary and an explicit disclosed owner-detail route/availability; absence of underlying disclosure stays honest.

**Global-Maximum outcome:** `STOP / SPLIT PREREQUISITE`. Reopen only `OBS-01` human presentation/navigation metadata. Reuse the established append/projection-time human snapshot pattern where semantically valid; do not turn Activity into Audit or current owner authority.

**Proof falsifier:** two different owner kinds must remain human-scannable; an undisclosed/deleted owner fact must not produce a false clickable destination; summary must not rewrite owner state.

## 8. Non-blocking dispositions

| Question | Disposition |
| --- | --- |
| usage/cost breakdown beyond exact Project-period summary | `DEFERRED` — no accepted current job requires arbitrary grouping; preserve provenance/missing states now |
| Activity filters beyond owner pagination | `DEFERRED` — first prove human scan/navigation; no current server filter authority |
| EffectAttempt retry/replay | `REJECTED` — violates accepted Gateway authority |
| managed JobRun rerun/cancel/force/redeliver | `REJECTED` — no admitted MAR Product operation |
| one universal Operations status taxonomy | `REJECTED` — would flatten semantic owners |
| Project audit redesign | `REJECTED` — reuse locked W-03 Audit interaction with exact Project server filter |
| logs/trace explorer | `DEFERRED` — current `OBS-02` exposes correlation refs/Evidence, not generic telemetry query authority |

## 9. P7 — structural hypotheses after authority closure

The locked GF-01 already exposes separate `Releases` and `Activity` Project destinations. P-04 must fill them without creating an extra Operations hub.

| Hypothesis | Strength | Material failure | Decision |
| --- | --- | --- | --- |
| `A — current-serving Releases route + owner-specific Activity lenses` | answers “what is live?” first; preserves direct GF routes and owner actions | requires careful cross-links between Activity and exact owner detail | `LEADING` |
| `B — chronological Activity home` | strong incident recency and scanability | makes an OBS projection look like Product/Release authority and hides current serving posture | `REJECTED` |
| `C — Releases home with all operations as detail` | keeps Release identity central | falsely subordinates jobs, effects, cost and Audit to Release even when their owner scope differs | `REJECTED` |

Leading structure:

```text
PROJECT → RELEASES
├── current serving posture
│   └── one server-disclosed environment card per target
│       ├── pointer + active Release
│       ├── independent serving verification
│       ├── conformance when release.promote is disclosed
│       └── contextual Promote / promote prior Release as rollback
├── immutable Releases collection
│   └── exact Release detail: Overview / Composition / Proof
└── Promotion history

PROJECT → ACTIVITY
├── Timeline — OBS-01 chronological ingress
├── Managed jobs — MAR-04 + MAR-01/02; Run now only with job.run
├── Effects — GW-01/02 read-only receipt/reconciliation
├── Usage & cost — OBS-03 exact-period truth
└── Audit — locked W-03 Audit pattern with exact Project filter
```

Owner-specific detail opens while retaining the current collection/filter context. Activity does not aggregate statuses or invent a universal severity/action taxonomy.

### 9.1 P7 data and interaction feasibility

| Requirement | Disposition |
| --- | --- |
| Release human identity, immutable composition and scale | `PRESENT-IN-AUTHORITY — F31` |
| server-disclosed environments, pointer/serving matrix and chronological Promotions | `PRESENT-IN-AUTHORITY — F32` |
| never-run job discovery from the currently served Release | `PRESENT-IN-AUTHORITY — F33 / MAR-04` |
| Activity human scan + conditional owner navigation | `PRESENT-IN-AUTHORITY — F34` |
| effect attempt pagination/detail | `PRESENT-IN-AUTHORITY — GW-01/02` |
| exact-period usage/cost and missing-state truth | `PRESENT-IN-AUTHORITY — OBS-03` |
| Project-filtered immutable Audit | `PRESENT-IN-AUTHORITY — OBS-04/05 + locked W-03 pattern` |
| Promote exact Release/environment | `PRESENT-IN-AUTHORITY — REL-06 + Idempotency-Key + expectedPointerGeneration` |
| run one exact admitted job now | `PRESENT-IN-AUTHORITY — MAR-03 + Idempotency-Key` |

Pagination is owner-specific. No loaded page claims to be the complete history. On narrow screens, environment cards and owner summaries stack; dense tables become labeled row cards; every action remains a semantic button with a non-drag path.

## 10. P8 — authorized functional candidate

The operator explicitly approved hypothesis A and authorized P8. The single canonical functional low-fi artifact is [`p04-release-operations-functional-wireframe.html`](p04-release-operations-functional-wireframe.html).

The candidate realizes the accepted structure with deterministic local fixtures and no Product implementation authority:

```text
Releases
→ server-disclosed environment posture
→ immutable Release cards and exact Overview / Composition / Proof detail
→ chronological Promotion history
→ generation-bound Promote / promote-prior-Release interaction

Activity
→ human Timeline with conditional owner navigation
→ currently-served managed-job catalog + Release-pinned run history + run-now
→ read-only EffectAttempt receipt/reconciliation
→ exact-period usage/cost truth
→ exact-Project immutable Audit investigation
```

Walkthrough scenarios keep loading, known-empty, denied, dependency failure, unset environment, stale/denied Promotion, conflicting/denied job run, missing usage and unknown effect outcome independently inspectable. The operator-authorized bounded revision also exposes exact Promotion and JobRun detail, typed OBS-02 trace/provenance correlation, complete OBS-03 token/cost truth classes and the locked W-03-style Project/period/actor/action Audit query. Browser walkthrough is green. The artifact is `REVISED CANDIDATE / NOT LOCKED`; it does not create a Screen Contract or authorize P9, P11, 4D or Product implementation.

## 11. Operator LOCK closure

The operator explicitly locked the revised P8 after the completeness revision and green browser walkthrough. The exact artifact identity is:

```text
approved final P8 artifact blob = 9aaa2c8e6d85b7b5d535bfba5969c475190ba7e7
Screen Contract = p04-release-operations-screen-contract.md
```

P9 closed the bidirectional trace without finding a Product/backend contradiction. P10 consolidated only repeated protected patterns and rejected a universal Operations/event/trace/job abstraction.

## 12. Current decision and exact continuation

```text
P-04 = LOCKED / OPERATOR APPROVED
P6 = COMPLETE
F31-F34 = OPERATOR APPROVED / PRODUCT+WIRE CORRECTION APPLIED / 126↔126 GREEN
P7 = HYPOTHESIS A / OPERATOR APPROVED
P8 = LOCKED / approved blob 9aaa2c8e6d85b7b5d535bfba5969c475190ba7e7
P9 = EXACT TRACE CLOSED
P10 = CONSOLIDATED
P11 / 4D / Product implementation = NOT AUTHORIZED
```

Next action: evaluate and explicitly authorize the next separately routed P-05 block. P-05, PA-01, BUD-01, P11, 4D and Product implementation remain unauthorized.
