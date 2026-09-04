# P12 — cross-block identity custody Global Maximum

> **Status:** `OPERATOR APPROVED / RESTRUCTURE NOW / FINAL MATRIX CANDIDATE READY`
> **Supersedes:** the preliminary harness-only correction proposed by the first P12 Lead pass
> **Finding class:** `SYSTEMIC P11 EVIDENCE / ASSEMBLY GAP`
> **Product / 4A / 4B impact:** none currently proven
> **Operator approval:** 2026-08-28
> **Implementation authority:** none; planning deltas only after the final edge matrix

## 1. Decision question

What is the sustainable structure for proving complete P11 journeys when the thirteen locked P8 artifacts contain independent fixture universes, the P11 parent claims exact coordinate custody, and P12 has proved that most source identities are invented by the parent or ignored by the destination?

The decision must remove the defect class, not merely replace `run-884` with `run-1042`.

## 2. Evidence

The whole-edge audit found:

```text
P11 global C registry
→ 23 static coordinates
→ only agent-sales-follow-up and effect-77 occur as exact child-owned values

P11 frameUrl
→ serializes route/query selectors
→ does not serialize the step coords into child ingress

P11 event observation
→ T-01 / W-04 / P-03 only
→ generic P11_REVIEW_BOUNDARY advances most other edges

destination consumption
→ P-01 consumes Agent Studio origin/agentId
→ P-04 consumes route/activity only
→ P-05 consumes lens only
→ most children show their default fixture regardless of parent URL coordinates
```

Material examples:

| Journey | Source-owned truth | P11 claim | Destination-owned truth |
| --- | --- | --- | --- |
| A | T-01 `ws:conexus-factory` | `workspace-metal-nobre` | W-01 has no matching Workspace identity |
| B | W-01 `cand_7f2c9e1a` | `sha256:baseline-candidate-42` | P-01 does not consume candidate/Project ingress |
| E | W-02A revisions `41/42` | `brain-revision-43` | P-02 revisions `brain-r16..r18` |
| F | W-02B `conn-sankhya-prod / rev-18` | `connection-sankhya-production / connection-revision-8` | P-02 `con-sankhya / rev-18..19` |
| H | P-04 `rel-041..043 / env-production` | `release-18 / environment-prod` | PA-01 `rel-2026-08-26`; no ingress re-resolution |
| I | W-04 `agt-*` | observer reads clicked `agt-*` | P-03 owns `agent-sales-follow-up` and receives no ingress |
| K | P-03 `approval-781 → run-1042` | `approval-77 → run-884` | parent selects P-04 `effect-77` and injects the missing relation |
| O | local P-01 Change + W-02A publication | synthetic registry coordinates | P-02 opens default Data and ignores Brain coordinate |

`P12-F01` and `P12-F02` are therefore two symptoms of one structural condition: behavioral proof was absent because an honest behavioral traversal would fail on most edges.

## 3. Root cause

```text
thirteen self-contained P8 fixture universes
→ no integrated scenario identity spine
→ P11 coordinate law assumes one exists
→ parent invents a global identity registry
→ parent URL changes without child ingress/re-resolution
→ destination default fixture masquerades as journey continuity
→ lexical proof cannot falsify the mismatch
```

The defect is not that the constants have the wrong values. Integrated cross-block scenario identity has no Evidence owner and no per-edge enforcement.

## 4. Target invariant

For every material P11 edge:

```text
source child owns and emits the exact coordinate
→ P11 validates an edge-specific allowlist and transports only that coordinate
→ destination child consumes/re-resolves it against its own fixture owner
   OR the journey terminates at an explicitly non-resolving boundary
→ mismatch / stale / undisclosed coordinate fails honestly
→ parent never writes owner truth into the child DOM
→ behavioral proof fails on identity drift, ignored ingress or inert transition
```

For every journey claimed as complete, the relevant source and destination projections must belong to one coherent integrated Evidence scenario. A label saying `non-resolution` cannot substitute for continuity where the accepted human job is publication→binding, qualification→adoption, served Release→app access/entry, Agent discovery→detail, or approval→Effect investigation.

## 5. Alternatives

### A — align parent constants only

`REJECTED / LOCAL MAXIMUM`

It changes examples but preserves parent-owned identity, silent drift, ignored destination ingress and the inability to prove most edges.

### B — observe source identity and keep parent destination simulation

`REJECTED / NECESSARY BUT INSUFFICIENT`

Source observation is required, but parent DOM injection or parent-selected destination rows still duplicates owner truth.

### C — repair only P-03 → P-04

`REJECTED AS FINAL STRUCTURE / VALID SUBSET`

It correctly fixes K but leaves A/B/E/F/H/I/O structurally false. K is a counterexample, not the root boundary.

### D — global shared fixture file/store consumed as Product truth

`REJECTED / PARALLEL AUTHORITY + OVERENGINEERING`

It couples all children to P11, weakens self-contained P8 Evidence and creates a normalized cross-owner store. A scenario contract may describe and verify identity relations; it must not become runtime/business authority.

### E — preserve the current P11 claim but label unresolved edges

`REJECTED WHERE JOURNEY CONTINUITY IS MATERIAL`

Honest boundary termination is correct for C when no Change→Release identity exists and for M when duplicate returns no destination. It is not adequate for E, F, H, I or K because those accepted jobs require the exact subject to continue.

### F — integrated Evidence scenario contract + owner-local projections + transport-only P11 + behavioral proof

`SELECTED GLOBAL MAXIMUM CANDIDATE`

This introduces only the essential seam:

1. a versioned integrated scenario/edge contract records the exact identity chain, semantic owner, source event, destination ingress, resolution law and failure disposition;
2. each child continues to own its local fixture projection;
3. only children missing a material source egress, destination ingress or coherent projection receive a bounded fixture/adapter delta and operator re-lock;
4. P11 removes the global business-coordinate registry and parent DOM mutation, retaining only journey/step, allowlists and transport;
5. a real localhost behavioral proof traverses every material edge and negative coordinate.

## 6. Why this is the Global Maximum

It resolves the root cause and the foreseeable P13/P14 dead end:

```text
P13 hands off the assembled P11
P14 requires navigation identities 100% sourced
```

A P11 whose destinations ignore source coordinates cannot satisfy that closure later. Delaying the fix would preserve accidental complexity and force redesign during visual handoff or implementation.

The integrated scenario contract is Evidence mechanism, not Product authority:

```text
scenario contract = expected cross-owner relation + proof oracle
child fixture      = owner-local projection
P11                = transport-only harness
browser proof      = enforcement
```

No generic store, event bus, framework, SDK, runtime or production data layer is admitted.

## 7. Required planning pass before HTML

Do not begin by editing K. First produce the final per-edge matrix:

```text
journey/edge
source child + exact emitted event/identity
destination child + exact ingress/read
CONSUMES_AND_RESOLVES | HONEST_BOUNDARY | INTERNAL_ONLY
coherent fixture values
negative coordinate behavior
required child reopen, if any
behavioral falsifier
```

Current likely bounded child set for investigation—not yet blanket-authorized—is:

```text
T-01 / GF-01 / W-01
W-02A / W-02B / W-04
P-01 / P-02 / P-03 / P-04 / P-05 / PA-01
```

W-03 has no implicated cross-block identity edge. Some listed blocks may need only proof or no edit after the final matrix; each reopen must be justified edge-by-edge. Do not normalize every fixture merely for aesthetic continuity.

## 8. Behavioral proof floor

The resulting proof must:

1. serve P11 and exact children through localhost;
2. operate the real source control that emits each material edge;
3. assert source identity = adapter envelope = parent URL;
4. assert the destination consumed/re-resolved the same identity, or displayed the admitted honest boundary;
5. inject unknown/stale coordinates and prove fail-closed behavior;
6. prove the parent never inserts, hides or stamps child business rows;
7. traverse A–O at their accepted material contribution;
8. exercise owner-specific recovery and zero inert material controls;
9. preserve focus, overlays and real 390px transformation;
10. keep Budget Analyzer application UI absent and make no 4D choice.

The proof obligation is tool-neutral. Selecting a Product framework/runtime remains forbidden; choosing the smallest repository test mechanism that can drive localhost is an Evidence implementation decision, not Product runtime selection.

## 9. Decision and reopen posture

```text
decision = RESTRUCTURE NOW / OPERATOR APPROVED
scope owner         = P11 assembly/Evidence + only edge-implicated child fixture/adapter deltas
Product authority   = preserved
4A/4B               = preserved
P12                 = remains OPEN
HTML edit authority = gated by final edge matrix and exact bounded reopen set
```

Approved continuation:

```text
final edge matrix
→ exact bounded reopen set
→ child deltas one edge family at a time
→ operator re-lock affected children
→ transport-only P11 reassembly
→ behavioral proof
→ operator P11 re-lock
→ re-enter P12
```

Current matrix candidate: [`p12-integrated-scenario-edge-matrix.md`](p12-integrated-scenario-edge-matrix.md). No HTML may begin until the operator accepts that matrix or requests revision.

## 10. Must not reopen

- Product operations, Permissions, semantic owners or 4A/4B wire;
- GW-01/PAR accepted authority;
- child interaction structure unrelated to an exact edge falsifier;
- W-03 or other blocks without an implicated identity edge;
- 4D, design system, component library, SDK, runtime or Product implementation;
- Budget Analyzer application UI;
- merge.
