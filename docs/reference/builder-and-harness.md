# Builder and Harness

Current technical detail extracted without semantic rewriting from the accepted Phase-3 architecture baseline. `docs/architecture/index.md` owns the overview; this file owns the detailed task surface named by its title.

## 7. Workspace / Project / Baseline architecture

## 7.1 Workspace

Visible tenant/isolation root:

```text
Workspace
├── Projects
├── access-filtered Agents catalog
├── Brain
├── Connections
├── Members / Areas
└── Settings
```

No hidden/default Workspace is invented to simplify implementation.

## 7.2 Project

Independent Product/software lifecycle unit:

```text
Project
├── Baseline
├── source repository
├── Changes / Plan
├── Data
├── Capabilities
├── Integration bindings
├── Brain binding
├── Product Agents
├── managed jobs when required
├── Releases / Versions
└── Published Application
```

F1 = one canonical source repo per Project.

For every software-publishing Project, the approved Baseline carries the closed F1 fact:

```text
ApplicationRuntimeProfile = MANAGED | DEDICATED
```

Both profiles share Project/Change/Builder/verification/Release and semantic contracts inside one Factory. `MANAGED` is realized by the Managed Application Runtime. `DEDICATED` may own its independently executable runtime/data plane and Product-specific network behavior; Gateway-only is the Conexus-governed capability boundary, not a universal DEDICATED network stack. Conexus-owned capabilities require explicit binding/Platform Service, with no inherited Connection/Hub/Vault credential. Profile choice is material Baseline authority; there is no automatic conversion, plugin registry or second Factory. The DEDICATED semantic/trust contract is current while physical deployment remains deferred to its first real deployment.

## 7.3 Project Baseline

```text
SPEC-ANCHORED
LIVING
INCREMENTAL
```

Readable specification in Git; Hub pins exact approved revision/digest.

```text
ProjectBaselineDigest
+ exact Change/current contract pins
→ execution/proof identity
```

A material Project-level meaning change discovered during coding stops execution before the actor silently crosses the prior Baseline.

## 7.4 Cross-Project reuse

Default:

```text
Project A DB/source/runtime
-X-> Project B direct mutable access
```

Current reuse seams:

```text
published Platform machinery
Workspace Brain + explicit ProjectBrainBinding
Workspace-scoped Connection + explicit ProjectConnectionBinding
```

Small duplication is preferred to premature shared mutable authority.

---

## 8. Plan, checklist and durable purpose memory

## 8.1 Visual Plan

For Changes whose planning depth warrants explicit decomposition, Builder produces an approvable Plan whose current representation can expose:

```text
Work Units / work items
dependency graph
acceptance/assertion links
known blockers/unknowns
current progress
```

The Plan is derived from current accepted Project/Change authority. Planning depth and execution rigor remain independent dimensions.

## 8.2 Hub-owned live checklist

Model/worker proposes transitions; Hub owns application of current state:

```text
plan.item.proposed / start_requested / complete_requested / blocked
→ Hub validates expected current revision/state
→ Hub writes started/completed/blocked/interrupted facts
→ UI projects current truth
```

Arbitrary JSON Patch or model prose does not command the state machine.

Worker/runtime death must produce an honest interrupted/recoverable state rather than leaving UI falsely green.

## 8.3 `tasks.md`

`tasks.md` is Project-Git **purpose/context memory**:

```text
what we are building
why
what remains
known limitations
root-cause/correction notes
```

It is not operational state authority.

At SHARE, a fenced structured status block **must** be checked mechanically against the Hub-owned `planRevision` and current item state. A stale revision or incompatible `statusCode` fails closed. Free prose remains context, not state authority.

## 8.4 Acceptance completeness

Material delivery closes only against accepted criteria/assertions and known limitations. “No Finding” or “agent says complete” is not acceptance.

## 8.5 `PlanningDepth` × `RigorProfile`

```text
PlanningDepth = DIRECT | LIGHT | FULL
RigorProfile  = FAST | BOUNDED | CONTROLLED
```

The axes are orthogonal: `DIRECT + CONTROLLED` and `FULL + BOUNDED` are valid. Human checkpoint/Change authority fixes the `PlanningDepth` floor; system/operator elevation is allowed, but runtime downgrade is not. `RigorProfile` is the maximum calculated from declared effect/authority risk, detected diff/artifact risk and environment risk; unknown never lowers it. Dispatch requires both the planning and rigor gates to pass.

No 3×3 policy matrix, `PlanningEngine`, LOC score or LLM-authoritative classifier is admitted.

---

## 9. Builder runtime architecture

## 9.1 Current execution line

```text
Project
→ Change
→ Builder authority
→ CodingWorkerRuntime boundary
→ Mastra AgentController
→ Change-scoped CodingSession
→ BuilderMastra / mastra_builder
→ Mastra Workspace
→ E2B
```

Pi is not primary F1 Builder. It remains fallback/challenger only if current qualification exposes a structural failure not repairable through the narrow runtime seam.

## 9.2 Cognitive and durable identity

```text
Change lifetime
!= CodingSession mechanics lifetime
!= WorkUnit lifetime
!= ActorRun lifetime
!= physical sandbox lifetime
```

Baseline:

```text
one persistent CodingSession per Change
persistent thread = ON
Builder Observational Memory = OFF
Project hidden memory = OFF
```

WorkUnits/ActorRuns remain bounded/auditable; they do not force cognitive reset.

New session is appropriate for a new Change, independent material verification, material rebaseline or concrete contamination/isolation reason.

In the internal pilot, the next Change receives the project's retained working
source and bounded recent intentions and final responses. A new sandbox does
not reset app source to the initial Baseline. Builder owns the working revision
and one active editing/preparation turn per project. The last successful Preview
artifact is a separate durable reference. Viewing an older artifact does not
change the next edit's parent. Response-only turns do not require a Git diff.

## 9.3 Hub remains authority

Mastra owns coding mechanics; Conexus owns:

```text
Change identity/correctness
accepted Plan/checkpoints
WorkUnit semantics
ActorRun facts/budgets
Findings/Evidence admission
current permissions/bindings
Git remote authority
Release eligibility handoff
```

```text
harness says done
-X-> Change accepted
```

## 9.4 Re-entry/currentness

Every ActorRun/rebind re-applies current/pinned owner authority mechanically. Runtime continuity never authorizes itself.

Conceptual source lineage is explicit:

```text
FRESH_BASE
CONTINUE_LINEAGE
```

### 9.4.1 Immutable lineage admission

Every write-capable ActorRun receives one immutable admission disposition. `CONTINUE_LINEAGE` requires current compatibility, verified physical continuity, established quiescence and no material contamination:

```text
FAILED alone                         -X-> authorize reuse
FAILED + positively admitted basis   → continuation may be admitted
CANCELLED predecessor                → explicit applicable-authority admission required
unknown/orphan basis                 → FRESH_BASE
```

If an admitted continuation later fails binding/quiescence/continuity gates, that ActorRun aborts or terminalizes with the typed basis; it never silently downgrades to `FRESH_BASE`. A later successor may receive a fresh admission.

### 9.4.2 Output custody and cancellation truth

```text
runtime output X
→ Hub-side durable custody + exact identity verification
→ only then producedOutputRef/presentation authority

Builder commits ActorRun CANCELLED
→ best-effort physical abort/inspection
→ late output/snapshot is telemetry/quarantine only and never regains authority
```

### 9.4.3 Failure and recovery

A normal restart may rebind the same ActorRun only through the existing positive continuation basis: current compatibility, exact physical-incarnation continuity, established quiescence and no material contamination. A missing/unknown/dead physical basis never attaches a replacement sandbox silently; successor work follows the existing admission law, including `FRESH_BASE` where continuation is not positively established.

Cancel, timeout and process loss first narrow further Builder progression, then use best-effort physical interruption. Quiescence means the old sandbox/incarnation can no longer mutate under the prior admission; it is not rollback, and late output remains subject to the custody/quarantine law above.

Disaster restore does not assume in-flight Builder physical continuity. Restored Change/Plan/WorkUnit/ActorRun facts plus Hub-custodied results preserve operational/correctness history; `mastra_builder` and E2B remain reconstructible mechanics rather than required recovery truth.

Canonical Project/Brain Git history that survives beyond the restored Hub cutoff remains authoring/provenance truth. It must be preserved and reconciled against restored owner facts; it neither recreates lost Change/Plan/acceptance/Release authority nor may it be silently discarded. Git-write-capable Builder/authoring paths remain fenced until that reconciliation completes.

## 9.5 E2B substrate

```text
Mastra Workspace
→ @mastra/e2b
→ E2B physical sandbox
```

Guest/root-capable execution only; never durable Product/control truth.

### Required physical-incarnation guard

Package A found that stock E2B write retry could cross from a dead physical sandbox to a replacement before Conexus regained control.

Required F1 property:

```text
write bound to exact observed physical sandboxId/incarnation
→ incarnation dies
→ operation fails
→ no silent replay on replacement
→ lineage quarantined/rebound only through explicit owner path
```

Status:

```text
E2B = QUALIFIED WITH REQUIRED PHYSICAL-INCARNATION GUARD
```

The qualification spike API/class is not Product architecture; semantically equivalent protection is mandatory.

## 9.6 Builder credentials

E2B guest never receives by inheritance:

```text
Hub DB credential
Project authoritative DB credential
Connection/ERP credential
CredentialBackend/root material
Git remote write credential
model-provider credential
backup credential
DEDICATED private key
```

Model-provider calls are control-side. Historical guest LLM provider key is deleted.

Any guest-readable capability is Hub-minted, bound to exact Project/ActorRun/consumer/scope, bounded, server-expiring and server-revocable with current validation on every use. The guest cannot mint, refresh or widen it; E2B pause/resume never preserves authority after server expiry/revocation.

## 9.7 Material verifier independence

Material verification requires both fresh cognition and fresh candidate materialization:

```text
exact candidate X under Hub custody
→ fresh verifier context
+ fresh independent materialization of X
→ verifier report binds exact X
```

The verifier cannot run against the implementer's live mutable lineage or mutate it.

Independent model review is not a mandatory step for every internal technical
Preview. It remains required for claims that assert independent material
verification. Source admission, authorization and artifact identity remain
mandatory without a model reviewer; unreviewed does not mean VERIFIED.

---

## 10. Git / Change result model

Current C-014/C-017 Git law survives the move from fresh Pi workers to persistent CodingSession:

```text
logical branch per Change
→ successive bounded Work Units contribute result commits
→ Hub owns remote push/integration authority
```

Worker/agent may create temporary local commits inside isolated working state. The durable SHARE/result contract yields **one canonical result commit per bounded WorkUnit** tied to the ActorRun/result lineage.

Normal integration:

```text
no force push
no hidden rebase rewriting accepted lineage
merge conflict
→ explicit resolution / business-owner question where meaning is ambiguous
```

This law governs durable result identity; it does not imply a fresh cognitive session per WorkUnit.

---

## 38. Engineering quality / evaluation architecture

## 38.1 Golden benchmark

Budget Analyzer remains a reproducible Builder regression/quality benchmark. Same accepted spec/input expectations are compared against known benchmark behavior and prior Conexus versions, while correctness/evidence remain more important than superficial visual identity.

## 38.2 Conexus Worker Eval

F1 keeps a real-task evaluation suite for coding runtime/model candidates across representative tasks such as:

```text
backend feature
migration
React page
complex bug
Sankhya integration
recovery/failure task
```

Purpose:

```text
measure current primary runtime/model
compare challenger when material trigger fires
avoid framework/provider selection by anecdote
```

Historical `Pi × Claude Agent SDK` is not the permanent candidate set. Current primary/challenger identities follow current architecture/qualification authority.

## 38.3 Independent material verification

Where material, verifier remains independent from implementer/coding continuation context according to current Builder/Method authority. Persistent CodingSession does not eliminate independent verification.

---
