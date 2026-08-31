# 4D — First-Build Operation Reachability Map

> **Status:** `BOUNDING EVIDENCE CANDIDATE / 128↔128 / R1 BATCH INPUT`
> **Authority:** derived from the canonical 4A operation ledger; owns no Product meaning
> **Implementation authority:** none

## 1. Purpose

Measure and bound which fixed Conexus platform operations first become reachable
in the accepted first-build sequence.

```text
canonical operation ledger
→ first reachability only
→ tranche scope guard
-X-> new operation meaning, owner, Permission or implementation graph authority
```

Operation names, semantics and owners remain canonical only in
[`docs/product/operation-ledger.md`](../../product/operation-ledger.md).

## 2. Census

| First reachability | Count | Meaning |
| --- | ---: | --- |
| `R1` | 13 | minimum Account/session + Workspace + Project/Baseline foundation |
| `R2` | 20 | Brain/Connection binding and governed read-only integration foundation |
| `RB` | 18 | minimum capable Builder and current Project model-policy discovery |
| `R3` | 0 | Project-authored data path uses Builder/runtime owners; no new fixed platform operation first appears |
| `R4` | 0 | Budget operations are Project-defined `Ops(R)` (`BUD-01..02`), outside fixed `N_platform` |
| `R5` | 5 | Published-App access administration/context |
| `R6` | 7 | Release, Promotion, conformance and serving truth |
| `R7` | 4 | managed-job discovery, occurrence and JobRun truth |
| `CURRENT_LATER` | 24 | accepted current platform surface not required by the first Budget Analyzer program |
| `NOT_INSTANTIATED` | 37 | Product-Agent, effect, audit/Product-observability and other explicitly absent first-build surfaces |
| **Total** | **128** | exact fixed platform census |

## 3. Exact derived map

### `R1` — 13

```text
IAM-01, IAM-02, IAM-03
WS-01, WS-02
PRJ-01, PRJ-02, PRJ-03, PRJ-07, PRJ-08, PRJ-09, PRJ-23, PRJ-24
```

- I&A owns Account/session/bootstrap identity.
- Workspace owns first Workspace creation/disclosure.
- Project owns creation, inception and approved Baseline review/decision.
- `PRJ-03` establishes the initial Project grant atomically; broader access-
  administration UX is not required by minimum R1.

### `R2` — 20

```text
PRJ-10, PRJ-11, PRJ-12, PRJ-13, PRJ-14, PRJ-15
BRN-01, BRN-02, BRN-03, BRN-10, BRN-14
CON-01, CON-02, CON-03, CON-04, CON-05, CON-06, CON-07, CON-08, CON-09
```

- Project owns exact Brain/Connection binding intent.
- Brain owns the minimal canonical revision/context/health truth.
- Connections owns Connector, revision, write-only credential and qualification.

### `RB` — 18

```text
PRJ-29
BLD-01, BLD-02, BLD-03, BLD-04, BLD-05, BLD-06, BLD-07, BLD-08, BLD-09
BLD-10, BLD-11, BLD-12, BLD-13, BLD-14, BLD-15, BLD-16, BLD-17
```

- Project exposes the bounded current model-policy set.
- Builder owns Change/Plan/progress/source/preview/finding/Evidence/context and
  ActorRun detail needed by a capable Builder.
- Product-Agent draft operations remain absent.

### `R5` — 5

```text
IAM-13, IAM-14, IAM-15, IAM-17, IAM-21
```

Published-App access remains independent from Control Plane/Builder authority.

### `R6` — 7

```text
REL-01, REL-02, REL-04, REL-05, REL-06, REL-07, REL-08
```

Release owns immutable composition, Promotion/conformance and exact serving
truth. `AVAILABLE != SERVED_VERIFIED` remains enforceable.

### `R7` — 4

```text
MAR-01, MAR-02, MAR-03, MAR-04
```

MAR owns exact managed occurrence/JobRun truth after a served Release exists.

### `CURRENT_LATER` — 24

```text
IAM-04, IAM-05, IAM-06, IAM-07, IAM-08, IAM-09, IAM-10, IAM-11, IAM-12
IAM-18, IAM-19, IAM-20
WS-04, WS-05
PRJ-05, PRJ-06
PRJ-16, PRJ-17, PRJ-18, PRJ-19
PRJ-25, PRJ-26, PRJ-27, PRJ-28
```

These operations retain accepted Product authority but are not prerequisites of
the first Budget Analyzer sequence: full People/Area access administration,
Project lifecycle/duplication and broader Capabilities/Data Explorer surfaces.

### `NOT_INSTANTIATED` — 37

```text
PRJ-20, PRJ-21, PRJ-22
BLD-18, BLD-19, BLD-20
BRN-04, BRN-05, BRN-06, BRN-07, BRN-08, BRN-09, BRN-12, BRN-13
PAR-01, PAR-02, PAR-03, PAR-04, PAR-05, PAR-06, PAR-07, PAR-08
PAR-09, PAR-10, PAR-11, PAR-12, PAR-13, PAR-14, PAR-15, PAR-16
GW-01, GW-02
OBS-01, OBS-02, OBS-03, OBS-04, OBS-05
```

The first program instantiates no Product Agent, Product-Agent draft,
Brain Discovery/AnalyticQuery, external effect or OBS Product path. Their
accepted contracts remain available for later current consumers/reopen routes.

## 4. Scope result

```text
fixed operations reached by first program R1/R2/RB/R5/R6/R7 = 67 / 128
accepted fixed operations not required by first program       = 61 / 128
  CURRENT_LATER                                               = 24
  NOT_INSTANTIATED                                            = 37
```

This confirms the first implementation program must not attempt to realize the
whole fixed platform surface. `67` reachable does not mean “implement 67 at
once”; each tranche admits only its own first-reachability set.

## 5. Reopen and use law

Reclassify only when accepted Product/Realization authority or real tranche
Evidence shows an operation becomes reachable earlier/later. A classification
change does not alter operation semantics.

4F consumes this map as bounding Evidence and derives exact implementation
dependencies/ordering for the current tranche. Tests must prove `128↔128`, no
duplicate, no missing and only canonical IDs.
