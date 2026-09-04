# Phase 4 — Implementation Readiness Program

Current mutable status and exact next action live only in [../roadmap.md](../roadmap.md). This document defines the stable purpose, order and exit law of the post-architecture readiness program. It does not authorize Product implementation.

## 1. Decision

Accepted Phase-3 architecture and accepted Realization Planning are necessary but not sufficient to begin Product code.

The implementation gate is refined globally and per reachable tranche as:

```text
accepted Product / architecture authority
→ 4A Product Surface & Authority Contract
→ 4B Executable Wire Contract
→ 4C Frontend Interaction & Authority Realization
→ global 4D-A/B/applicability contract
→ for exact reachable tranche T:
   applicable 4D-C selections + 4D-D conformance/version/proof
   → 4E(T) composed coherence
   → 4F(T) bounded implementation graph
   → 4G(T) adversarial readiness
   → explicit operator execution grant for T
   → implementation eligible only for T
→ later tranches remain blocked and plan just in time
→ full-composition 4E over the first Budget Analyzer Golden Flow by R7/3O
```

This is an implementation-readiness refinement, not a reopen of C-018 or 3A–3O by preference. Earlier authority reopens only when a concrete Phase-4 falsifier proves it materially incomplete or contradictory.

The working `Blueprint` / `Forge` vocabulary and the planning-harness reconstruction are design inputs only. They become Product vocabulary only if 4A deliberately admits them from accepted F1 meaning and real consumers.

## 2. Why Phase 4 exists

The architecture currently fixes Product meaning, semantic owners, trust boundaries, persistence classes, runtime families, security and proof obligations. It does not yet provide one complete executable Product surface and one exact Project Paved Road from which backend, frontend and runtime can be realized without inventing contract or infrastructure decisions during coding.

The program prevents this failure mode:

```text
implementation starts
→ screen or handler needs missing capability
→ developer invents endpoint / Permission / DTO / state / owner locally
→ coding agent also invents auth / transport / persistence / verification conventions
→ implementation convenience becomes Product authority or accidental platform architecture
```

Instead:

```text
frontend need or runtime need
→ exact admitted Product operation / owner / Permission / wire contract exists
→ exact approved Paved Road or explicit escape hatch exists
→ realize it

missing contract or paved-road property
→ STOP
→ reopen only the smallest owning Phase-4 or earlier authority
```

## 3. Program laws

The following are binding throughout 4A–4G:

```text
repository current authority > Phase-4 derivation > implementation mechanics
Product meaning before wire
wire before frontend topology
frontend interaction before Project Paved Road/runtime mechanism selection
Paved Road before implementation graph
mechanism != authority
frontend visibility != authorization
provider protocol != Product operation
technical ingress != Product API
unknown / partial / unsupported != zero / success
no screen-shaped second API authority
no manual parallel DTO authority
no concrete operation without a current consumer class
no consumer interaction without an admitted operation/capability
no SDK/helper/abstraction before a concrete protected property or repeated consumer
no dependency before a concrete consumer/property
GENERATED != PLATFORM-CONTRACT != APP-OWNED
proof before implementation
```

A stage may discover a bounded upstream defect. It may not silently repair it in a downstream mechanism.

### 3.1 Tranche-scoped incremental eligibility

The operator-ratified incremental-value law applies to the readiness program
itself, not only to later coding:

```text
global direction + owners + protected seams
→ exact next consumer tranche
→ close only its mechanisms, conformance, coherence, graph and readiness
→ explicit tranche grant
→ useful implementation + real Evidence
→ correct or open the next tranche just in time
```

Tranche scoping changes timing, not correctness. Every reachable authority,
security, persistence, recovery and proof obligation remains non-degradable.
Unreachable `PRESERVE_SEAM` and `DEFER` families receive no machinery.

One tranche grant cannot authorize another tranche. R1 foundation/bootstrap is
not the first operational Product proof; that proof still traverses RB Builder.

## 4. 4A — Product Surface & Authority Contract

4A derives the complete admitted F1 Product operation surface from current Product/architecture authority before HTTP shape or frontend design.

Because Conexus is a platform that publishes Project-defined applications, 4A deliberately closes **three** different operation surfaces instead of fabricating one global count for unknown future software:

```text
A. fixed Conexus platform operations
   → exact finite N_platform

B. Project-defined capability operation grammar
   → exact Release R contains finite Ops(R)
   → registered Query / Action / honest Integration Operation
   → no global execute(anySlug, anyInput)

C. first Budget Analyzer application operations
   → exact finite N_budget
   → concrete first proof that the Project grammar is usable
```

The fixed platform census owns Conexus-provided Product meaning. Project-defined business operations remain exact Project/Product authority even though Conexus validates, publishes and executes them. A provider transport, runtime callback, queue delivery, OIDC route or framework method is not admitted merely because software needs it.

4A owns:

- the exact fixed platform-operation census;
- the Project-defined capability admission grammar and exact-Release law;
- the first Budget Analyzer concrete application-operation census;
- operation semantics and owner;
- actor/principal/caller classes actually admitted by F1;
- ordinary Permission vocabulary and special authenticated/system conditions where current authority requires them;
- Workspace / Project / Published-App / other exact scope rules;
- read versus consequential command semantics;
- current-authority, eligibility and disclosure requirements;
- knowledge/freshness/outcome classes that must remain distinguishable;
- idempotency and concurrency/precondition requirements at semantic level;
- Conexus platform API versus exact Project capability versus Published-App versus Product-Agent versus Technical-Ingress versus internal-mechanic separation;
- consumer-class coverage for every concrete admitted operation.

4A does not choose paths, HTTP methods, router/framework, database schema, frontend package topology, SDK APIs or deployment mechanics.

Owning contract: [4a-product-surface-and-authority-contract.md](4a-product-surface-and-authority-contract.md).

Canonical candidate ledger: [../product/operation-ledger.md](../product/operation-ledger.md).

The non-authoritative [Blueprint Harness design input](../development/blueprint-harness-design.md) may expose candidate Product questions such as planning/execution modes, but it cannot admit those meanings by itself.

## 5. 4B — Executable Wire Contract

4B converts accepted 4A semantics into one canonical machine-readable wire authority.

It closes, where applicable:

```text
operationId
method + path
request/response schemas
Problem codes
headers / cookies
pagination
ETag / If-Match / If-None-Match
Idempotency-Key
exact-byte / upload boundaries
authentication/session carriage
Product versus Technical Ingress routing
mechanically generated client/server projections
```

For fixed Conexus platform operations, 4B freezes the platform wire. For Project-defined operations, 4B freezes the **operation-definition/codegen grammar** that deterministically produces exact wire for `Ops(R)` rather than exposing an unrestricted generic executor. The first Budget Analyzer must instantiate that grammar with an exact generated/conforming application wire.

OpenAPI is the preferred Product wire authority where it fits the accepted surface. 4B remains router/runtime neutral and does not select database or deployment mechanics.

A frontend or backend implementation may not maintain a second hand-written wire/DTO authority.

Every repeated wire property discovered here becomes a candidate protected property for 4D Paved-Road realization; 4B does not invent SDK APIs prematurely.

## 6. 4C — Frontend Interaction & Authority Realization

4C derives the browser Product from 4A/4B rather than inventing backend capability from screens.

The derivation is bidirectional:

```text
Product journey → semantic owner → admitted operation/read model → UX home
frontend interaction → admitted operation → semantic owner → accepted Product journey
```

4C closes:

- human goals and workflows;
- App Shell / information architecture;
- semantic route/screen meanings;
- complete operation-to-consumer mapping for frontend-reachable fixed platform operations;
- complete operation-to-consumer mapping for the first Budget Analyzer application wire;
- state ownership: server, URL/navigation, form draft, ephemeral UI and any proved additional class;
- honest unknown/partial/stale/outcome UX;
- generated transport consumption;
- browser auth/session interaction boundaries;
- low-fidelity wireframe proof sufficient to expose missing or invented capability;
- feature/package topology only after the interaction model is accepted.

Target proof includes:

```text
all frontend-reachable admitted concrete operations covered
orphaned frontend operations = 0
invented frontend operations = 0
material interaction without admitted operation = 0
```

4C may expose a real 4A/4B gap. It must reopen that smallest contract rather than create a screen-shaped/BFF authority.

Repeated client-side properties become inputs to the 4D Frontend Paved Road; frontend Product code still does not begin here.

## 7. 4D — Project Paved Road & Runtime Realization

Only after Product surface, wire and frontend consumers are known does 4D define the exact environment in which coding agents will later work.

The target property is:

> **A new or evolving Project should not ask a coding model to repeatedly invent foundational auth, transport, persistence, security, generated-contract, integration and verification mechanics that Conexus can correctly precompile. The agent's legitimate degrees of freedom should concentrate on APP-OWNED Product logic.**

4D has four bounded closures.

### 7.1 4D-A — Project Scaffold & Ownership Contract

Define the smallest versioned deterministic Project scaffold/profile and its ownership boundaries.

Preserve the accepted conceptual classes:

```text
GENERATED
→ reproducible from platform source/model; no hand-owned divergent semantics

PLATFORM-CONTRACT
→ Project-visible seam controlled by Conexus; app consumes but cannot silently weaken invariant

APP-OWNED
→ Project-specific business/Product source the Builder may legitimately evolve
```

4D-A closes:

- exact scaffold/profile identities and versioning semantics;
- package/directory/topology only where 4A–4C consumers require it;
- generated-code custody/regeneration law;
- platform-contract versus app-owned mutation boundaries;
- baseline facts needed to identify the exact scaffold/Paved-Road generation used by a Project.

It must remain **infrastructure-rich / Product-feature-poor**. No speculative domain feature is scaffolded because it may be useful later.

### 7.2 4D-B — Backend / Frontend / Data / Integration / Verification Paved-Road Contract

Derive the platform mechanisms that should be easy/correct by default from the protected properties accumulated in 4A–4C.

Candidate property families include only where current consumers prove them:

**Backend**

```text
canonical generated wire binding
request/current-authority context
session/auth integration
scope/containment seams
Problem mapping
ETag / conditional mechanics
idempotency mechanics
structured config / trace correlation
Gateway/platform capability client seams
verification hooks
```

**Frontend**

```text
generated Product transport
same-origin session/credential mechanics
Problem decoding
ETag/idempotency carriage where admitted
TanStack query/invalidation conventions
honest loading/empty/unknown/partial/stale patterns
security/CSP defaults
browser test harness
```

**Data / Persistence Kit**

```text
owner/schema boundaries
migration lifecycle
transaction primitives required by accepted invariants
connection/capability acquisition
constraint/index conventions tied to real properties
test database support
migration/schema-drift verification
read-model patterns where architecture requires them
```

**Integration / Gateway Kit**

```text
governed Project capability seams
exact binding/current-authority carriers
no raw Connection credential inheritance
no caller-selected arbitrary destination
```

**Verification Kit**

```text
format/type/lint where admitted
unit/integration
wire/codegen drift
owner/boundary guards
authorization isolation
migration/schema drift
security/supply-chain
negative controls
golden-flow hooks
source/read-model reconciliation where applicable
```

The names above are property inventories, not preselected SDK APIs or packages. A generic ORM/repository/business framework is not admitted without a real gap.

### 7.3 4D-C — Exact Runtime / Persistence / Dependency / Deployment Selection

Select concrete mechanisms only after the Paved-Road properties are exact.

4D-C owns choices such as, when a current consumer requires them:

- Node/TypeScript exact module/package topology;
- API framework/router and exact supported versions;
- exact Keycloak release and standards-compliant Node OIDC client;
- PostgreSQL physical schema/tables/indexes/constraints;
- owner-role capabilities and transaction/concurrency primitives including CR-1 realization;
- migration tooling;
- Gateway and Sankhya Gateway/API capability adapters;
- MAR queue/scheduler/job mechanics;
- process/binary topology;
- configuration/secrets;
- startup/readiness/shutdown;
- network/trust deployment realization;
- observability mechanics required by admitted proof/operation properties;
- backup/recovery mechanisms required by the accepted first-production contract.

Every material decision follows [Evidence-Grounded Realization Engineering](../development/production-realization-guide.md): protected property → strongest current evidence → `ADOPT | ADAPT | BUILD | DEFER | STOP` → proof.

4D must not add a platform capability merely because a selected framework provides it.

### 7.4 4D-D — Paved-Road Conformance, Versioning, Escape-Hatch & Evaluation Contract

A Paved Road that exists only in documentation is not sufficient.

4D-D closes:

- deterministic scaffold generation/reproduction proof;
- generated/platform/app-owned boundary guards;
- Paved-Road conformance checks on representative Project slices;
- version pin and upgrade/migration law;
- exact escape-hatch contract for a real Project property not supported by the default road;
- removal/rejoin conditions where an escape hatch becomes unnecessary;
- Builder/Worker evaluation tasks that prove agents can use the road without silently bypassing it.

An escape hatch must name the unmet property/consumer, preserve non-degradable platform/security contracts, update Project Baseline when material and add the smallest mechanism/proof. Silent bypass is forbidden.

The non-authoritative [Blueprint Harness design input](../development/blueprint-harness-design.md) defines the candidate orchestration/research/review properties that 4D may later realize over Hub/Mastra without making Mastra authority.

## 8. 4E — Whole-System Coherence & Golden Flows

4E verifies that Product semantics, wire, frontend, Paved Road and runtime
realization form one coherent system at the exact composition boundary reached
by the current tranche before that tranche's implementation graph is authorized.

It composes representative positive and negative flows across real boundaries. The first Budget Analyzer path remains mandatory:

```text
Keycloak authentication
→ Conexus session/current authorization
→ Workspace
→ Project
→ exact Project scaffold/Paved-Road generation
→ Brain binding
→ Sankhya Connection binding
→ governed sync
→ Project read model
→ registered Query
→ exact Release / serving
→ Published Application
→ independent live-source reconciliation
```

Negative flows must demonstrate fail-closed behavior for materially reachable classes such as wrong Workspace, revoked/narrowed authority, stale Release, wrong Connection, unsupported semantic meaning, partial/unverifiable source coverage, invalid serving bytes, forbidden Paved-Road bypass and recovery/continuity faults at their owning stage.

3N falsifiers and `3O-P1..P7` remain routed proof obligations; 4E composes them
with concrete 4A–4D realization instead of creating a new Proof owner. A
tranche-scoped 4E is not final whole-Product closure. Full-composition 4E over
the Budget Analyzer Golden Flow remains mandatory no later than the tranche that
makes R7/3O reachable.

## 9. 4F — Implementation Program & Execution Graph

4F converts accepted realization into bounded implementation work for one exact
reachable tranche.

The accepted [Realization Planning — First Build](realization-planning.md) becomes an **execution skeleton/input** here, not direct authority to code after Phase 3.

4F maintains a derived operation reachability map from the canonical operation
ledger and rederives only the current tranche against exact 4A–4E inputs. The
map bounds scope; it owns no Product meaning and is not a second operation
authority. Each implementation slice receives, at minimum:

- exact Product operations/consumers it realizes;
- owning modules and allowed persistence surfaces;
- exact wire contracts and generated projections;
- frontend consumers where applicable;
- exact Project scaffold/Paved-Road version/profile it instantiates;
- exact GENERATED / PLATFORM-CONTRACT / APP-OWNED mutation permissions;
- admitted dependencies and version pins;
- approved escape-hatch decisions where applicable;
- migrations/config/process surfaces allowed to change;
- proof/falsifier obligations;
- prerequisites and stop/reopen triggers;
- completion criteria.

No implementation slice may begin by selecting its own foundational stack. No slice may be kept merely because it appeared in the earlier planning skeleton if 4A–4E Evidence shows a smaller or different graph is correct.

The current R1 derivation is the independently converged and operator-approved
[`4F(R1) Global-Maximum execution graph`](../evidence/4f/4f-r1-implementation-slice-plan.md).
It composes Chromium proof with each human-meaningful owner increment, reserves
the full three-browser hardening boundary, places Project cognition last,
attaches `R1C-14` immediately before PRJ-03 and `R1C-13` immediately before the
final cognition slice. 4F(R1) is closed and opens only 4G(R1). It is not an
implementation grant.

## 10. 4G — Adversarial Implementation Readiness

4G is the final independent attack before one exact tranche can become eligible
for its own execution grant.

The review must challenge at least:

```text
orphan fixed platform operation
Project operation admitted without exact Release authority
consumer without operation
invented frontend operation
missing Permission/scope
Permission broader than accepted authority
owner duplication
screen-shaped API
parallel DTO/wire authority
generic execute(anySlug, anyInput) escape
runtime mechanism without consumer
persistence class without owner/invariant
SDK/helper/abstraction without protected property
dependency without proved property
scaffold ownership ambiguity
silent GENERATED/PLATFORM-CONTRACT bypass
escape hatch without explicit Baseline/property/proof
unfalsifiable golden flow
R1–R7 ordering contradiction
implementation slice not bound to exact Paved Road
Phase-3 falsifier no longer reachable by a real proof path
```

Findings are Evidence, not automatic requirements. Material findings reopen only the smallest implicated authority and require operator adjudication where they change an accepted decision.

The current R1 adversarial result is the independently converged and
operator-approved [`4G(R1) semantic-CLEAR result`](../evidence/4g/4g-r1-independent-adversarial-review-adjudication.md).
Its plan findings are corrected with no Product-authority change. The operator
separately authorized this recoverable authority checkpoint. Once it exists,
R1 is eligible only for a separate implementation-grant decision.

## 11. Tranche implementation eligibility

Implementation of tranche `T` remains blocked until all are true:

```text
4A CLOSED / OPERATOR-RATIFIED
  fixed N_platform exact
  Project capability grammar closed
  first Budget Analyzer N_budget exact
4B CLOSED / OPERATOR-RATIFIED
4C CLOSED / OPERATOR-RATIFIED
global 4D-A/B/applicability CLOSED / OPERATOR-RATIFIED
applicable 4D-C selections for T exact
applicable 4D-D conformance/version/escape/eval for T exact
4E(T) CLOSED / operator-adjudicated
4F(T) CLOSED / exact operations, owners, dependencies, mutations and proof graph
4G(T) CLOSED / independent challenge converged
repository current authority recoverable at an exact checkpoint
operator execution authorization explicit for T
all other tranches remain BLOCKED
```

No architecture ratification, prior tranche grant, Realization Planning
acceptance, CI success, PR merge, reviewer approval, framework qualification or
probe grant implicitly satisfies a tranche execution grant.

Qualification probes are not Product implementation, but each probe batch still
requires an explicit operator probe grant plus an isolated Evidence-only
contract, exact pins and zero root/Product dependency. Probe success cannot grant
tranche implementation; probe failure may reopen the smallest affected
selection.

Before the first operational Budget Analyzer can close, full-composition 4E,
the Builder-produced candidate law, R6 Release/serving and R7/3O real-source
reconciliation remain mandatory.

## 12. Reopen and YAGNI law

Phase 4 does not reopen Phase 3 to improve aesthetics, copy sibling repositories or prebuild future optionality.

A reopen requires material Evidence that the accepted authority cannot express or safely falsify a real current F1 requirement.

The program must prefer:

```text
complete required contract
+ smallest realization
+ explicit future seam
+ constrained degrees of freedom for repeated infrastructure
- speculative operation
- speculative screen
- speculative dependency
- speculative SDK helper
- speculative abstraction
```
