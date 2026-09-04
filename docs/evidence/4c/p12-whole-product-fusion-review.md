# P12 — whole-product Fusion review and Lead adjudication

> **Status:** `P12 CLOSED / CLEAR / F01-F02 CORRECTED / F03 ROUTED TO 4C CLOSURE`
> **Reviewed input:** operator-locked P11 blob `536052096dd10dec2f604ccef49aa64ba52e4dac`
> **Material surviving UX/architecture findings:** `0`
> **Corrected P11:** `45172fd437b0c3b0236b641bcb803c20f165959f`
> **Product / plan finding:** `0`
> **Method finding:** `0`
> **Implementation authority:** none

## 1. Protocol and provenance

Common handoff: [`p12-whole-product-fusion-review-brief.md`](p12-whole-product-fusion-review-brief.md)

Independent challengers:

```text
Claude Code CLI 2.1.220
model = fable / claude-fable-5
effort = xhigh
mode = plan / read-only instruction
role = Principal Product Architect + Engineering Method challenger

AGY CLI 1.1.22
model = gemini-3.1-pro-high
effort = high
mode = plan / read-only instruction
role = Principal Product Designer + Information Architecture challenger

Codex Lead
role = authority reconstruction, source/browser reproduction,
       contradiction resolution and smallest-owner adjudication
```

Both reviewers received the same current-state, authority, journey, falsifier and output contract. Their emphasized lenses differed. Reviewer agreement was not treated as authority.

Repository revalidation before review:

```text
repository = /mnt/c/Users/leandro.theodoro/Documents/conexus-os
branch = codex/4c-p02-integrations-ux
HEAD = origin/main = 1619f14d9caed172b6cada9430e6b49ff77a4316
current PR = none
main Verify = GREEN for that HEAD
worktree = shared and materially dirty / preserved
P11 worktree blob = 536052096dd10dec2f604ccef49aa64ba52e4dac
```

The external reviewers did not edit repository files. AGY wrote its own response artifact outside the repository; this Evidence record absorbs only findings that survived Lead verification.

## 2. Lead verdict

```text
METHOD FINDING                         = 0
PRODUCT / PLAN GAP                    = 0
LOCAL EXECUTION GAP / MATERIAL        = 2
REPOSITORY CUSTODY / IMPORTANT        = 1 operator decision
OPTIONAL ACCESSIBILITY RESIDUE        = 1 non-blocking carry-forward
accepted Product/4A/4B authority      = survives
13 locked child structures            = survive
P12 CLEAR at historical reviewed blob = NO
historical verdict                    = BOUNDED CORRECTION BEFORE P12 CLOSE
```

The whole Product model survives attack. The failure remains inside P11 Evidence/assembly, but the directed Global-Maximum audit proved it is systemic rather than K-local: the P11 coordinate law presupposes a coherent integrated scenario identity spine that the thirteen independent child fixtures do not provide. Journey K is the first reproduced counterexample.

## 3. Findings that survive Lead adjudication

### `P12-F01` — LOCAL EXECUTION GAP / MATERIAL — executable P11 proof floor is absent

**Known Evidence**

- [`p11-faithful-assembly-contract.md`](p11-faithful-assembly-contract.md) §6 requires loading the assembled HTML, navigating manifest routes, exercising handoffs, verifying URL coordinates, operating representative child interactions, exercising owner-specific recovery, checking inert controls and proving focus/narrow behavior. It explicitly says lexical tests cannot substitute.
- [`4c-p11-assembled-product-functional-wireframe.test.mjs`](../../../tests/repository/4c-p11-assembled-product-functional-wireframe.test.mjs) pins hashes, searches strings and parses the script with `new Function`; it never loads a browser, clicks a child control or verifies a cross-block URL/state result.
- The guided operator walkthrough intentionally focuses the 13 child blocks and tells the operator not to use the advanced technical boundary. It does not record an A–O adapter proof.

**Failure mode**

P11 can stay `9/9 GREEN` while an adapter carries the wrong identity or a cross-block interaction is inert. `P12-F02` is the concrete counterexample.

**Root cause and invariant**

```text
root cause = proof contract was authored but not realized
target invariant = every claimed cross-block handoff is behaviorally falsifiable
smallest owner = P11 Evidence proof, not Product/4A/4B or child blocks
```

**Global Maximum**

Add the smallest deterministic localhost behavioral proof that traverses the admitted P11 edges and asserts source identity, parent URL, destination state and failure behavior. Do not introduce a framework/runtime Product decision or a generic browser-test architecture merely for ceremony.

**Must not reopen:** the 13 child locks, Product operations, Permissions, wire owners, 4D or implementation.

### `P12-F02` — LOCAL EXECUTION GAP / MATERIAL — Journey K uses harness-invented identity and mislabels simulated truth

**Known Evidence**

- P11 constant registry uses `agentRunId=run-884`, `approvalRequestId=approval-77` and `proposalDigest=sha256:proposal-77`.
- The exact P-03 child owns `approval-781 → run-1042 → sha256:7c9b-fixture` and `approval-782 → run-2051 → sha256:91ad-fixture`; it owns no `run-884` or `approval-77`.
- Live localhost reproduction showed the P11 parent URL and coordinate chrome claiming `run-884 / approval-77` while the mounted P-03 exposed only `approval-781 / approval-782`.
- On the next K edge, `injectOriginatingRunFilter` selects a P-04 row by the parent-known `effectAttemptId`, stamps `data-originating-run-ref=run-884` onto it, and renders `Server-applied originatingRun filter`.
- The exact P-04 effect fixtures own `effect-76 / effect-77` but no `originatingRun` relation. Live reproduction showed the parent-created label and attribute on `effect-77`.
- The accepted GW-01 Product/wire realization remains correct: server-side `originatingRun` filtering before pagination is admitted. The defect is only the P11 simulation/claim.

**Failure mode**

The selected child decision is not the coordinate transported to Activity. The destination appears exact only because the harness already knows which EffectAttempt to reveal. Fixture state masquerades as server/owner truth.

**Root cause and invariant**

```text
root cause = parent constants compensate for child fixtures that do not share one owner-issued K identity
target invariant = source issues identity; parent transports only; destination re-resolves
smallest owner = P11 harness + proof
```

**Credible alternatives**

1. Preferred: align the P11 K scenario with identities already owned by the mounted child, observe the exact selected boundary identity, and label the destination behavior honestly as a P11 simulation of the accepted GW-01 filter.
2. Stronger but probably disproportionate: boundedly enrich P-04 fixtures with an `originatingRun` relation and re-lock P-04.
3. Honest but weaker: remove the simulated filter and state that K is proven only at Product/wire level, not in P11 interaction Evidence.

The preferred correction preserves all accepted owners and avoids reopening P-04 merely for fixture symmetry.

**Must not reopen:** GW-01/PAR Product authority, F04 selected realization, P-03/P-04 structure, retry/replay/reconcile authority.

## 4. Important operator decision

### `P12-F03` — REPOSITORY CUSTODY / IMPORTANT — immutable checkpoint remains absent

The pre-P11 fusion review already found that the later 4C package was not reachable from a commit and recommended a coherent checkpoint before final whole-package review. `HEAD` still equals `origin/main`; the current 128-operation wire, later locks, P11 lock and P12 Evidence live only in the shared dirty worktree/loose-object state.

This does not falsify Product coherence, but it is a real recoverability/provenance risk. A checkpoint commit requires explicit operator authority. Merge remains separately unauthorized.

Recommended disposition: decide checkpoint timing after the bounded P11 Evidence correction, before relying on another whole-package review cycle.

## 5. Reviewer proposals rejected by Lead

### Gemini `P12-IA-01` — rejected / incomplete reading

The proposed material gap claimed that a Project Builder must leave P-02 Integrations, navigate to Workspace Connections, create a Connection and manually return.

Current locked P-02 already exposes:

```text
Use connection
→ purpose-bound eligible Workspace + same-Project private Connection summaries

Connections owned by this Project
→ New connection
→ non-secret configuration
→ write-only credential
→ qualification
→ explicit Project use/adoption
```

This was verified in the Screen Contract, HTML and live mounted Product after collapsing the guide. A W-02B cross-link is not needed to complete the current proven job and would not grant missing `connection.manage` authority. No Product/plan gap survives.

### Gemini `P12-IA-02` — rejected as finding / retain as visual-language caution

GF-01 exposes a Project-contextual `Ask Conexus` seam, not a global assistant authority. The open panel explicitly says content/eligibility belong to the current P-01/P-02 surface and that the seam grants no authority. The GF-01 contract forbids global assistant authority and treats open/close as local UI only.

The label may require careful visual treatment at P13, but no reproducible authority or task failure was shown. Reopening GF-01 now would be preference-driven.

## 6. Non-blocking residue

Some early child artifacts contain short CSS transitions without an explicit `prefers-reduced-motion` guard. No material motion dependency or inaccessible task was reproduced. Carry this as an optional P13 conformance check; do not reopen a locked block solely for it.

## 7. Decisions that survive attack

- Workspace → Project → independent Published-App hierarchy;
- one adaptive current-scope rail and no Control Plane inheritance in PA-01;
- app-first Build and the Data/Capabilities/Integrations/Brain Project model;
- Connection lifecycle != Project Integration use;
- Brain publication != Project binding/context;
- authored Agent != Release != runtime/serving truth;
- AVAILABLE != promoted != pointer-switched != `SERVED_VERIFIED`;
- exact app-scoped approval instead of a universal Approval Center;
- `NO_DATA` duplicate and archive non-effects;
- trusted one-shot bootstrap;
- Budget Analyzer application UI remains absent / `FUTURE_PRODUCT_APP`;
- no framework, component, SDK or runtime selection.

## 8. Current disposition and Global-Maximum continuation

P12 cannot close while `P12-F01` and `P12-F02` remain material. The initial harness-only recommendation was challenged and rejected as a Local Maximum after all P11 edges were audited.

Current decision owner: [`P12 cross-block identity custody Global Maximum`](p12-cross-block-identity-global-maximum.md).

The selected candidate is an integrated Evidence scenario contract with owner-local child projections, edge-specific source egress/destination ingress, a transport-only P11 and behavioral localhost proof. Exact child reopen scope must be derived edge-by-edge before any HTML edit; the current likely investigation set is wider than P-03/P-04 because A/B/E/F/H/I/O also fail identity custody.

This review does not authorize that restructure. Operator adjudication is required before changing P11 or any locked child artifact.

## 9. P12 closure after correction

The operator approved the Global Maximum, edge matrix, four bounded identity
families and the reassembled transport-only P11. Current Evidence proves:

```text
P12-F01 = CORRECTED
P12-F02 = CORRECTED
13/13 current child identities = operator-locked
current P11 = operator-locked / 45172fd437b0c3b0236b641bcb803c20f165959f
repository transport-core negative proof = GREEN
localhost Journeys H / I / K + mount/narrow proof = GREEN
material UX/architecture findings = 0
P12 CLEAR = YES
```

`P12-F03` remains a repository-custody decision and is routed to 4C closure.
It does not reopen P12 Product/UX semantics. The optional `Ask Conexus` visual
treatment caution and reduced-motion audit are routed to P13 conformance.
