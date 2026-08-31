# 4D-04 — Runtime-Family Applicability

> **Status:** `CLOSED / OPERATOR APPROVED / 4E-R1-F01 NON-RUNTIME CLASSIFICATION APPROVED / 2026-08-30`
> **4D gate:** `4D-04 CLOSED / 4D-C-4D-05 OPEN / RF-01 FIRST`
> **Inputs:** approved 4D-02 + approved 4D-03 + operator-approved `117`-property ledger
> **Implementation authority:** `BLOCKED`
> **Exact dependency/version/topology selection:** `0`

## 1. Decision

**Outcome:** `CURRENT STRUCTURE CONFIRMED / 24 CONSUMER-GATED FAMILIES`.

The approved Paved Road compiles into:

```text
14 REALIZE families
  12 FIRST_MANAGED_BUDGET_ANALYZER
   2 CURRENT_PLATFORM_LATER

7 PRESERVE_SEAM families
3 DEFER families
0 STOP families
```

This is an applicability decision, not technology selection. A family means one
coherent repeated mechanism boundary with a current consumer or evidenced seam.
It does not imply one package, process, service, repository, database or SDK.

No current evidence produces `STOP`. Every first-profile property can reach a
credible mechanism family without moving Product authority. Exact alternatives,
versions, package boundaries and physical topology remain 4D-C/4D-05 work after
operator approval.

### 1.1 R1 Project cognition is an owner-local adapter, not a runtime family

The operator-approved `4E-R1-F01` correction keeps the `24`-family census
unchanged. `PRJ-07/PRJ-24` require bounded model calls, but no independent Agent,
memory, workflow, scheduler, durable run, service or lifecycle. Their mechanism
is therefore an owner-local Project infrastructure adapter selected in affected
4D-C, not a twenty-fifth runtime family.

`FE-08` spans exact owner-specific cognition boundaries: the Project-owned R1
portion is realized by this adapter; the Builder-owned later portion remains
inside `RF-09`. Shared interaction appearance creates no shared Product owner.

### 1.2 R1 GitInfra is an owner-local foundation mechanism

`PRJ-03` already requires exactly one canonical Project Git authority and the
accepted architecture already defines `GitInfra` as an infrastructure boundary.
4E exposed that R1 foundation selection had not materialized its mechanism.

The bounded correction keeps the `24`-family census unchanged:

```text
RF-01 staged compiler output
→ owner-local GitInfra adapter
→ one Hub-controlled owner-isolated bare repository per Project
→ temporary worktree/clone
→ immutable commit + atomic expected-old ref update
```

GitInfra owns repository mechanics/custody only. Project owns source identity
and lifecycle meaning. No Git hosting Product, forge, service, runtime family,
repository Permission or generic network fetch is added. Exact executable pin
and firing probe are entry conditions of the 4F `PRJ-03` slice through
`R1C-14`, not machinery to instantiate during planning.

## 2. Applicability law

Each family records:

```text
family identity
+ exact protected-property set
+ current consumer/profile
+ REALIZE | PRESERVE_SEAM | DEFER | STOP
+ activation boundary
+ semantic owner and trust limits
+ proof class
+ selection-opening falsifier
```

Postures mean:

| Posture | 4D-04 meaning |
| --- | --- |
| `REALIZE` | a current named consumer requires the family when its slice becomes reachable; comparative selection may open in 4D-C |
| `PRESERVE_SEAM` | owner/input/output/failure law remains valid, but no dormant mechanism is instantiated |
| `DEFER` | no current instantiation consumer; a named trigger must reopen applicability |
| `STOP` | no correct mechanism family can satisfy current authority/property; selection cannot proceed |

`REALIZE` still obeys incremental value. It is not permission to instantiate all
families before R1/RB/R2–R7 reach them.

## 3. Mastra-sensitive applicability

Current Mastra concepts distinguish:

```text
Agent    = open-ended decision/tool work
Workflow = defined multi-step process
```

Therefore:

- Builder coding is open-ended and admits an Agent-runtime family;
- Release, Promotion, managed sync and reconciliation are owner-defined
  deterministic processes and do not become Agent authority;
- their structured nature does not itself require a Workflow runtime;
- durable workflow/runtime mechanics remain a seam until a real wait/recovery
  consumer proves owner-local database/occurrence mechanics insufficient;
- Product-Agent runtime remains separate from Builder runtime.

No current Mastra API, package or version claim is made here. Exact adopted
package/source/configuration and any current API assertion require 4D-C Evidence.

## 4. REALIZE — first managed Budget Analyzer

### `RF-01` — Profile compilation and generated distribution

| Field | Decision |
| --- | --- |
| Properties | `SCF-01..07`, `SCF-09..11`, `WIR-01..02`, `CON-01`, `CON-05`, `VER-01`, `VER-10` |
| Consumer | every generated Project; first Budget Analyzer profile |
| Posture | `REALIZE / R1 FOUNDATION` |
| Owner/trust | Project pins profile; canonical owners retain meaning; compiler/manifest/receipt own mechanics only |
| Proof | deterministic tree/receipt, ownership collision/drift, generated-wire census, stale distributed-rule firing |
| Opens selection when | 4D-02 inputs and first R1/RB consumer need an executable compiler/tree/distribution mechanism |
| `STOP` falsifier | no candidate can preserve exact three-class ownership or deterministic offline reproduction |

This family may be one small compiler or composed mechanics. It is not a
whole-repository synth owner.

### `RF-02` — Hub request, authentication and current authority

| Field | Decision |
| --- | --- |
| Properties | `WIR-01`, `WIR-03..05`, `AUT-01..06`, `DAT-01..03`, `IOP-03` |
| Consumer | R1 Control Plane/Published-App session and every protected server operation |
| Posture | `REALIZE / R1` |
| Owner/trust | I&A authenticates/maps/session; each operation owner authorizes; provider/router/context owns no Product authority |
| Proof | real OIDC/browser/server negative paths, current revoke race, cross-scope reference denial, Technical Ingress census |
| Opens selection when | R1 requires exact server/router/OIDC/session/current-authority mechanics |
| `STOP` falsifier | candidate requires provider roles/browser bearer or a broad cross-owner context to authorize Product work |

Accepted Keycloak/Node-TypeScript direction constrains the later comparison but
does not select a release, OIDC client or router here.

### `RF-03` — Browser application host and frontend projection

| Field | Decision |
| --- | --- |
| Properties | `AUT-05`, `FE-01..08`, `FE-11`, `WIR-04` |
| Consumer | R1 Control Plane shell and R5 app-owned Budget Analyzer Published Application |
| Posture | `REALIZE / R1 + R5` |
| Owner/trust | exact Product/Screen owner retains meaning; browser projects only; Project owns app composition/brand |
| Proof | generated client/state matrix, same-origin security, forged routes, P13 wide/narrow/accessibility regression, regeneration-preserved app UI |
| Opens selection when | R1/R5 need generated transport, routing/query/state and accessible neutral primitives |
| `STOP` falsifier | candidate requires browser business authority, universal store, Control Plane shell inheritance or protected-seam edits |

Accepted React/strict TypeScript/Vite/TanStack direction remains architecture
input, not an exact package/version/plugin decision.

### `RF-04` — Hub owner-isolated persistence and CR-1

| Field | Decision |
| --- | --- |
| Properties | `DAT-01..03`, `REL-02..03`, `VER-02..04` |
| Consumer | R1 Hub owners and R6 representative security-sensitive Promotion |
| Posture | `REALIZE / R1 + R6` |
| Owner/trust | each Hub owner retains schema/record lifecycle; narrow joint guards protect only accepted cross-owner invariants |
| Proof | real PostgreSQL role/capability matrix, record/FK census, concurrent revoke vs mutation, non-firing control rejection |
| Opens selection when | R1 needs owner storage/transactions and R6 needs the exact CR-1 primitive |
| `STOP` falsifier | candidate needs umbrella DB authority, generic UnitOfWork or cannot serialize current authority without owner leakage |

PostgreSQL 17 is accepted architecture. Driver, query layer, migration tool,
roles and physical schema remain unselected.

### `RF-05` — Project data, migration and reconciliation runtime

| Field | Decision |
| --- | --- |
| Properties | `DAT-04..08`, `DPL-01..06`, `VER-02..05` |
| Consumer | R3–R4 Project read model/Queries and R7 live reconciliation |
| Posture | `REALIZE / R3 + R4 + R7` |
| Owner/trust | Project owns business schema/migration/transformation/cursor/result; platform admits/rehearses; Evidence owns no meaning |
| Proof | real Project DB isolation, migration checksum/rehearsal, kill around merge/cursor, coverage/drift matrix, independent common-coordinate oracle |
| Opens selection when | Builder-produced R3 needs exact Project DB, migration, transformation and data-path mechanics |
| `STOP` falsifier | no candidate can preserve app-authored source, atomic cursor/merge or independent reconciliation without pipeline authority inflation |

Structured ETL shape does not automatically select a workflow/pipeline runtime.

### `RF-06` — Read-only Gateway and enterprise binding runtime

| Field | Decision |
| --- | --- |
| Properties | `INT-01..04`, `INT-06`, `AUT-04`, `VER-02`, `VER-05` |
| Consumer | R2 exact Sankhya Connection binding and R3/R7 governed reads/reconciliation |
| Posture | `REALIZE / R2 + R3 + R7` |
| Owner/trust | Project owns binding intent; Connections owns revision/qualification/credential relation; Gateway owns last-mile governed call |
| Proof | real binding/currentness, secret custody/redaction, destination/operation allowlist, least-privilege read-only provider, common-coordinate comparison |
| Opens selection when | R2 requires an exact real Sankhya transport/capability adapter |
| `STOP` falsifier | provider only exposes an authority-unsafe generic proxy or no honest common comparison coordinate can be established |

Provider transport/connector/source coordinate remain unresolved selection
questions. Oracle access is not inferred from the Sankhya label.

### `RF-07` — Artifact, Release, Promotion and verified serving

| Field | Decision |
| --- | --- |
| Properties | `DAT-06..07`, `REL-01..06`, `RUN-01`, `VER-02..04`, `VER-06` |
| Consumer | R6 exact Budget Analyzer Release/Promotion/SERVED_VERIFIED |
| Posture | `REALIZE / R6` |
| Owner/trust | Registry owns immutable artifact revisions; Release owns composition/Promotion/serving truth; runtime supplies mechanics only |
| Proof | deterministic non-circular manifest, current-proof recheck, real target drift, concurrent loser zero-effect, wrong served digest, config/secret separation |
| Opens selection when | R6 needs exact artifact storage/build/serving/process/config mechanics |
| `STOP` falsifier | candidate rebuilds/latest-resolves at serve time or cannot prove exact real served composition |

Artifact store, packaging, process/container form and deployment topology remain
unselected.

### `RF-08` — Managed sync occurrence and recovery

| Field | Decision |
| --- | --- |
| Properties | `DPL-03..05`, `RUN-02..04`, `TEL-01..02`, `VER-02..04` |
| Consumer | R3 contract and R7 real governed Sankhya sync occurrence |
| Posture | `REALIZE / R3 + R7` |
| Owner/trust | MAR owns occurrence; Project owns cursor/merge/freshness; queue/scheduler owns no admission or terminal truth |
| Proof | exact served-Release admission, single-flight/coalescing, one current catch-up, process loss around merge, quiescence and missing observation honesty |
| Opens selection when | R3/R7 require durable occurrence admission/scheduling/recovery mechanics |
| `STOP` falsifier | candidate replays N slots, treats redelivery as admission or cannot recover without duplicate/skip ambiguity |

The previously qualified queue candidate is incumbent Evidence only. It is not
selected by this applicability result.

### `RF-09` — Builder open-ended Agent runtime

| Field | Decision |
| --- | --- |
| Properties | `FE-08`, `RUN-05`, `RUN-07`, `DPL-06`, `CMP-01..07`, `EVA-01..07`, `CON-04` |
| Consumer | RB first real Builder-produced/evolved Budget Analyzer |
| Posture | `REALIZE / RB` |
| Owner/trust | Builder owns Change/Plan/WorkUnit/ActorRun/acceptance; Agent runtime owns open-ended coding mechanics only |
| Proof | real-task Worker Eval, Hub admission/settlement, serial-writer canary, typed result/cancel, independent verifier, forbidden authority/tool attempts |
| Opens selection when | RB compares exact admitted Builder runtime/topology candidates on equal tasks |
| `STOP` falsifier | no candidate meets minimum capable Builder quality without runtime success becoming Change authority or bypassing exact owner paths |

Role-isolated BuilderMastra is the incumbent direction; native versus hosted
SDK/ACP/private-MCP topology remains comparative 4D-C work.

### `RF-10` — Builder guest execution substrate

| Field | Decision |
| --- | --- |
| Properties | `RUN-05`, `CMP-04`, `CON-04`, `VER-02`, `VER-04` |
| Consumer | RB write-capable Builder ActorRuns |
| Posture | `REALIZE / RB` |
| Owner/trust | Hub admits/custodies; guest is untrusted execution and receives only scoped expiring capabilities |
| Proof | real sandbox physical-incarnation guard, death/replacement refusal, cancellation/quiescence, credential/network/filesystem isolation, late-output quarantine |
| Opens selection when | RB requires exact supported guest substrate/adapters and bounded requalification |
| `STOP` falsifier | substrate can silently replay writes on a replacement or requires durable authority/credentials inside the guest |

E2B is accepted with the physical-incarnation guard; exact current pin and
adapter remain unselected.

### `RF-11` — Builder protocol adapter boundary

| Field | Decision |
| --- | --- |
| Properties | `CMP-05`, `IOP-01..04`, `IOP-06..07`, `VER-02`, `VER-04` |
| Consumer | RB hosted SDK/ACP/private-MCP challenger and any bounded Builder tool boundary |
| Posture | `REALIZE / RB` |
| Owner/trust | protocol discovery/results/status are untrusted; Builder/I&A/capability owners rederive authority and settle truth |
| Proof | malicious metadata/artifact, revoke-after-discovery, cancel/late-result, stale/wider HITL subject and protocol downgrade/mixed-wire controls |
| Opens selection when | Worker Eval admits a concrete protocol/runtime challenger |
| `STOP` falsifier | protocol requires task/session/HITL status to become owner fact or cannot pin compatible safety semantics |

No external-agent/A2A Product surface is admitted by this Builder-local family.

### `RF-12` — Evaluation, verification and local observation

| Field | Decision |
| --- | --- |
| Properties | `EVA-01..07`, `TEL-01..02`, `VER-01..06`, `VER-10`, `CON-01`, `CON-04..05` |
| Consumer | G0/RB admission, every first-profile slice and R7 benchmark |
| Posture | `REALIZE / G0 + RB + R1..R7` |
| Owner/trust | Evidence is immutable claim support; each exact owner retains acceptance/selection/terminal truth |
| Proof | exact eval identity, paired repeated cases, item gates, scorer drift, isolation, missingness, firing negative controls and SHARE detector fixtures |
| Opens selection when | each concrete 4D-C mechanism needs an exact admission/proof chain |
| `STOP` falsifier | candidate can pass with missing Evidence/non-firing control or evaluation/telemetry must become acceptance authority |

This family can be composed from small checks. No generic policy/eval/telemetry
platform is implied.

## 5. REALIZE — current platform later

### `RF-13` — Published-App Product-Agent client experience

| Field | Decision |
| --- | --- |
| Properties | `FE-09`, `MEM-02`, `AUT-05`, `IOP-03..04`, `EVA-01..05` |
| Consumer | proven PA-01 full-page/contextual/inline hosts; not first Budget Analyzer |
| Posture | `REALIZE / CURRENT_PLATFORM_LATER` |
| Owner/trust | PAR owns Conversation/AgentRun/Approval chronology; Project app owns composition; client owns delivery/projection only |
| Proof | bounded contract prototype plus first real PAR integration for history/reconnect/gaps/typed parts/approvals/accessibility |
| Opens selection when | Product-Agent experience becomes the current implementation slice after a real PAR consumer is admitted |
| `STOP` falsifier | candidate requires browser-direct Mastra/tool authority, client chronology truth, forced shell or parallel approval store |

The family contract is current; its runtime/client packages are absent from the
first Product-Agent-free profile.

### `RF-14` — Deterministic review projection and safe rendering

| Field | Decision |
| --- | --- |
| Properties | `FE-10`, `FE-11`, `SCF-09`, `VER-01`, `VER-04` |
| Consumer | Baseline and Brain review; Plan is a distinct challenge consumer |
| Posture | `REALIZE / CURRENT_PLATFORM_LATER` |
| Owner/trust | each exact Product owner retains identity/lifecycle/decision; adapter/renderer owns projection mechanics only |
| Proof | digest/version/anchor reproduction, unsafe markup/link sanitization, unknown content, stale/forged anchor and owner-lifecycle separation |
| Opens selection when | first repeated production review representation needs concrete renderer/sanitizer/accessibility mechanics |
| `STOP` falsifier | candidate requires a universal Review owner/API/store or derives Product identity from rendered DOM/text |

## 6. PRESERVE_SEAM — no dormant mechanism

### `RF-15` — Effect-capable Gateway

`INT-05`, `IOP-05` → `PRESERVE_SEAM`.

Activate only for the first real external-effect consumer. It must add exact
effect identity, idempotency scope, `OUTCOME_UNKNOWN` reconciliation and crash/
duplicate/lost-response proof. The read-only first slice creates no effect
table, budget, worker or replay layer.

### `RF-16` — Production Agent Runtime

`RUN-06` → `PRESERVE_SEAM`.

PAR retains Conversation/AgentRun/Approval/Trigger authority and a role-isolated
runtime boundary. First real Product Agent must re-pin Release/tools, prove
Builder/PAR store/PubSub/tool isolation and suspension/resume/effect behavior.
ParMastra is not instantiated in the first slice.

### `RF-17` — Durable execution/continuation runtime

`DXE-01`, `DXE-02`, `DXE-03` → `PRESERVE_SEAM`.

Activate only when a real owner wait/recovery cannot be satisfied by current
owner-local occurrence/transaction mechanics. Required laws are owner admission
before runtime start, single-winner compatible resume, current-authority recheck
and no effect replay authority. No generic Workflow Product owner is created.

### `RF-18` — Advanced memory and governed learning

`MEM-01`, `MEM-03`, `MEM-04`, `LRN-01` → `PRESERVE_SEAM`.

Activate only with exact scope/provenance/retention and an inspect/correct/forget
lifecycle. Memory remains untrusted context; learning remains Evidence/proposal
until existing Agent/Brain owner acceptance and Release.

### `RF-19` — External telemetry, feedback and audit-required path

`TEL-03`, `TEL-04`, `TEL-05`, `VER-08` → `PRESERVE_SEAM`.

Activate exporter/feedback mechanics only with exact minimization, redaction,
tenant isolation, retention/residency/access and pinned replaceable projection.
The first non-production slice has ordinary local observation and zero
audit-required Product operations.

### `RF-20` — First-production recovery

`VER-09` → `PRESERVE_SEAM`.

Activate only before first production. Proof requires real off-host restore,
identity continuity, credential decryptability, deny-only recovery and served
Release revalidation; DEV simulation cannot close it.

### `RF-21` — DEDICATED/escape/rejoin runtime boundary

`SCF-08`, `CON-02`, `CON-03` → `PRESERVE_SEAM`.

Activate only for a real DEDICATED or unmet-property consumer with explicit
Baseline decision, preserved security/authority contracts, independent
credential/network/data custody and removal/rejoin law. The MANAGED first slice
creates no DEDICATED deployment machinery.

## 7. DEFER

### `RF-22` — Dormant Product-Agent advanced runtime families

`RUN-08` → `DEFER`.

ParMastra first-slice instantiation, advanced non-message memory, durable-agent
and event families remain absent until their exact Product consumer and original
qualification triggers fire.

### `RF-23` — Product-Agent/external-agent composition

`CMP-08` → `DEFER`.

Agent-as-tool/network/A2A Product composition requires a named Product consumer
and exact isolation/effect/approval proof. Builder-local protocol adaptation does
not activate this family.

### `RF-24` — Trace Intelligence discovery

`LRN-02` → `DEFER`.

Optional aggregate discovery may reopen only for a recurring Agent-learning
consumer with sufficient real trace evidence. It cannot block Builder
correctness or create a causal finding/fix without source-trace review.

## 8. Complete property/profile coherence

```text
FIRST_MANAGED_BUDGET_ANALYZER REALIZE properties = 93
→ RF-01..RF-12 across R1/RB/R2–R7

CURRENT_PLATFORM_LATER REALIZE properties = 3
→ FE-09 + MEM-02 through RF-13
→ FE-10 through RF-14

PRESERVE_SEAM properties = 18
→ RF-15..RF-21

DEFER properties = 3
→ RF-22..RF-24

STOP properties = 0
```

Families may share a property because enforcement is layered. The approved
ledger remains the exact row-level owner/disposition authority; this artifact
owns applicability grouping only.

## 9. 4D-C selection-opening questions

Operator approval opens only bounded comparative questions for `REALIZE`
families whose first consumer is reachable:

| Reachability | Selection question permitted later |
| --- | --- |
| G0/R1 | profile compiler; Hub request/router; OIDC/session; base persistence; frontend host; admission gates |
| RB | Builder Agent runtime/topology; guest substrate adapter; protocol challenger; Worker Eval mechanics |
| R2 | exact read-only Sankhya Gateway/transport/binding mechanics |
| R3–R4 | Project DB/migration/data-path and MAR occurrence mechanics |
| R5 | Published-App frontend/runtime mechanics |
| R6 | artifact/build/config/process/serving/Promotion mechanics |
| R7 | live-source reconciliation and real Evidence mechanics |
| current later | Product-Agent client experience and review projection only when those implementation consumers open |

`PRESERVE_SEAM` and `DEFER` families do not admit dependency selection. A family
may reach 4D-C only after its consumer, property, proof and alternatives are all
exact.

## 10. Strongest adversarial challenges

### A — family inventory is a disguised package architecture

No family fixes a package/process/module. Each is an owner/trust/proof boundary.
Multiple families may share one process or one family may require composed
mechanics after comparative Evidence.

### B — 12 first-profile families still front-load infrastructure

They span the complete R1/RB/R2–R7 profile, not the first implementation slice.
Reachability gates selection and implementation incrementally; later families
are absent until consumed.

### C — deterministic processes should use a workflow framework now

Structured shape is insufficient evidence. Release/MAR/Project owners already
define state, settlement and recovery. A durable workflow runtime enters only if
a real wait/recovery falsifier proves those mechanics insufficient.

### D — BuilderMastra direction preselects the result

It establishes an incumbent family/direction, not exact version/topology.
Worker Eval still compares admitted native/hosted/protocol shapes on equal tasks,
and current documentation/source must be refreshed before selection.

### E — later Product-Agent client is marked REALIZE without first-slice PAR

The consumer is accepted by PA-01, so the contract is current. Incremental law
keeps its runtime/client absent until that exact implementation slice and first
real PAR proof become reachable.

## 11. Decision and reopen triggers

The operator-approved 4D-04 outcome is:

```text
24 exhaustive consumer-gated families
14 REALIZE / 7 PRESERVE_SEAM / 3 DEFER / 0 STOP
93 + 3 REALIZE profile split preserved
selection questions bounded by G0/R1/RB/R2–R7 reachability
no dependency/version/package/topology selected
```

Reopen applicability only if material Evidence shows:

- one protected property has no covering family or reaches state outside its
  family boundary;
- one family requires authority from another owner to function;
- a real consumer/qualification trigger activates a preserved/deferred family;
- a first-profile family cannot satisfy its proof without a new Product owner;
- real runtime/process-loss/concurrency/provider Evidence requires `STOP` or a
  different family boundary.

Package popularity, framework feature inventory and hypothetical scale are not
reopen triggers.

## 12. Approval and downstream route

```text
4D-04 = CLOSED / OPERATOR APPROVED / 2026-08-29
4D-C/4D-05 = OPEN FOR REACHABLE REALIZE FAMILIES ONLY
first bounded selection = RF-01 profile compilation/distribution
Product implementation authority = 0
```

RF-01 is first because every downstream Project profile consumes its
deterministic generation/ownership/distribution mechanics immediately. Exact
current documentation and alternatives must be refreshed before selecting its
mechanism. Other G0/R1 families remain queued, not implicitly selected. Product
implementation, push, PR and merge remain unauthorized.
