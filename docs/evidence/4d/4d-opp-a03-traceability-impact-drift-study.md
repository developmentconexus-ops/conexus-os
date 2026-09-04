# 4D OPP-A03 — Traceability, Impact and Authority-Drift Study

> **Status:** `PASS 1 COMPLETE / MINIMAL GENERATED TRACEABILITY SELECTED AS LEADING HYPOTHESIS / NO TOOL SELECTION`
> **Input:** Fable-adjudicated SoftwareForge assessment; `SCF-09..11`; `VER-10`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

> What is the smallest mechanism that lets Conexus trace accepted intent to
> implementation/proof, calculate minimal correct downstream impact and detect
> bounded authority drift without creating a second editable semantic graph or
> pretending static analysis understands all Product meaning?

## 2. Why this is a real current property

Conexus already has the complete forward chain:

```text
Product intent / journey
→ invariant
→ semantic owner
→ operation / Permission / scope
→ canonical wire
→ locked interaction
→ Paved-Road property
→ later implementation slice / WorkUnit
→ assertion / Evidence
→ result commit
→ Release
```

Today those relations are discoverable across canonical artifacts and existing
checks, but there is no one deterministic fresh projection for later Context
Compiler, impact and SHARE consumers. Asking a coding agent to reconstruct this
chain from prose on every WorkUnit would recreate the context/authority failure
4D exists to remove.

The property is therefore current even though no new Product operation or
durable business record is required.

## 3. Alternatives

### A — editable universal traceability/dependency graph

Rejected. It creates a second authority, makes relationship maintenance a
manual synchronization problem and invites model/user edits to override
canonical owners.

### B — infer all semantics from code/import graphs

Rejected. Build/import/schema graphs can prove mechanical reachability but do
not know Product intent, authorization, owner meaning, interaction contracts or
Release truth. Existing implementation is Evidence, not target authority.

### C — ask the coding model to infer impact each time

Rejected. It is non-deterministic, cannot prove freshness and converts missing
edges into model discretion.

### D — generated digest-pinned authority traceability projection

Leading hypothesis:

```text
canonical owner artifacts
→ deterministic compiler
→ GENERATED traceability manifest
→ freshness verification at every deciding consumer
```

The manifest owns no meaning. It can only restate exact relations that canonical
sources or admitted deterministic rules establish.

**Pass-1 disposition:** `PROMOTE_TO_4D_PROPERTY / BUILD SMALLEST MECHANISM`.

No existing general-purpose catalog or graph is a stronger authority source.
Existing parsers/static tools may be adopted inside detectors where they prove
one declared class.

## 4. Manifest contract hypothesis

Illustrative, not frozen physical schema:

```text
TraceabilityManifest
  profile/version
  canonical source identities + digests
  sorted deterministic edges
    from exact authority identity
    relation class
    to exact downstream identity
    deciding source identity + digest
  compiler identity/version
  covered relation classes
```

Rules:

1. same canonical inputs produce byte-identical output;
2. every deciding edge carries exact source identity and digest;
3. consumers revalidate every deciding source digest before use;
4. mismatch makes the projection `STALE` and blocks deciding use;
5. a missing required edge is a Finding/closure defect, never permission to
   infer intent;
6. unknown/unproved relationships remain absent/unknown;
7. no generated edge grants Product, data, tool, network or runtime authority;
8. no new durable Product record class is created;
9. storage/cache is reconstructible projection mechanics.

Potential relation classes must be admitted from current owners rather than
chosen for graph aesthetics. Initial candidates include:

```text
OWNER_OF
REALIZED_BY_OPERATION
PROJECTED_BY_WIRE
CONSUMED_BY_INTERACTION
PROTECTS_PROPERTY
PROVED_BY_ASSERTION
COMPOSED_IN_RELEASE
```

Names remain candidates. A class survives only when at least one current
deciding consumer and firing falsifier exist.

## 5. Impact and staleness

Impact is a pure derived function over:

```text
changed canonical identity/digest
+ fresh admitted relation classes
→ smallest affected downstream set
```

Candidate dispositions, refined to preserve authority:

| Projection | Meaning |
| --- | --- |
| `UNAFFECTED` | No admitted relevant path from the exact change under the declared covered classes. This is bounded, not universal semantic proof. |
| `REVALIDATE` | Existing realization may remain, but named assertions/proofs must run again. |
| `STALE` | A derived/generated artifact or proof no longer closes over current source identities. |
| `RECOMPILE` | Deterministic downstream projection must be regenerated from current authority. |
| `REOPEN_CANDIDATE` | Evidence suggests an accepted owner may be contradicted; only its Decision Loop/operator may actually reopen it. |

`REOPEN` is deliberately not an automatic graph transition. The mechanism can
identify and explain a candidate; it cannot change authority disposition.

Negative properties:

```text
any text edit -X-> invalidate whole Project
no detected path -X-> universal proof of no impact
model-added edge -X-> deciding relationship
stale manifest -X-> positive impact/drift claim
```

## 6. Authority-drift gate before SHARE

Inputs:

```text
candidate diff
+ exact WorkUnit/Change context when Builder exists
+ fresh TraceabilityManifest
+ current canonical authority
+ versioned detector-class set
→ bounded drift Evidence
```

Initial current classes:

1. new Product operation not admitted;
2. new Permission/scope not admitted;
3. parallel wire/DTO authority introduced;
4. `PLATFORM-CONTRACT` weakened/bypassed;
5. `GENERATED` output hand-owned;
6. owner schema/persistence boundary crossed outside admitted slice;
7. new dependency without protected property/admission;
8. frontend interaction inventing backend capability.

Every declared class requires:

- exact detector identity/version;
- deterministic RED fixture proving it fires;
- positive fixture where appropriate;
- explicit blind spots;
- exact checked source/diff identity;
- fresh manifest proof.

Positive wording is only:

```text
NO_DRIFT_DETECTED_IN_DECLARED_CLASSES
```

Never `NO_DRIFT`, `SAFE`, `CORRECT` or Change acceptance.

## 7. Reuse versus build

| Mechanism class | Disposition | Boundary |
| --- | --- | --- |
| canonical OpenAPI/JSON Schema parsers and current repository checkers | `ADOPT/ADAPT` | detect exact wire/schema classes only |
| Git diff and language/AST/import analyzers | `ADOPT/ADAPT` when a detector needs them | code reachability Evidence, never semantic authority |
| tool-neutral generated wire projection | `ADOPT` as one manifest input | Product wire projection only |
| SoftwareForge concepts | `KEEP_REFERENCE_ONLY` | useful properties, no ontology/owner import |
| generic catalog/dependency graph as source of truth | `REJECT` | duplicates authority and misses owner semantics |
| minimal Conexus traceability compiler/manifest | `BUILD` candidate | custom gap exists because the authority graph is Conexus-specific |

The BUILD outcome is justified only for the small compilation/edge/freshness
surface. It does not justify a graph database, visual graph editor, generic
policy engine or separate traceability service.

## 8. Context Compiler and 4F boundary

4D owns the traceability/impact/drift properties and Paved-Road constraints.
4F later compiles an exact WorkUnit-stage execution profile through the existing
single Hub Context Compiler.

```text
TraceabilityManifest = fresh generated relationship projection
ContextManifest      = existing exact compiled context authority projection
WorkUnit profile     = later 4F output view of the same compiler
```

No second context compiler or `WorkOrder` Product concept is admitted.

## 9. Required follow-up before realization

1. Enumerate exact canonical source identities from 4A/4B/P13/4D without
   crawling historical Evidence indiscriminately.
2. Admit the smallest relation-class allowlist with current consumers.
3. Define deterministic sorting/canonical serialization and digest law.
4. Prove stale detection by mutating each deciding source family.
5. Define required-edge closure separately from optional traceability enrichment.
6. Implement detector prototypes only after their exact RED fixtures are written.
7. Demonstrate minimal invalidation on one Permission, one wire and one P13
   interaction change.
8. Demonstrate that a semantic ambiguity produces Finding/unknown rather than a
   guessed edge.
9. Bound manifest size/update cost without preselecting graph infrastructure.
10. Independent challenge must attack false completeness and cross-owner drift.

## 10. Pass-1 outcome

```text
OPP-A03 PASS 1 = COMPLETE
D1 generated digest-pinned traceability = PROMOTE_TO_4D_PROPERTY
D2 minimal impact/staleness = PROMOTE_TO_4D_PROPERTY
D4 bounded SHARE drift gate = PROMOTE_TO_4D_PROPERTY
D5 constraint-ref seam = PRESERVE / STUDY IN SCAFFOLD-CONTEXT WORK
generic traceability owner/graph service = REJECT
minimal Conexus compiler/manifest = leading BUILD hypothesis
external static/schema tools = bounded detector candidates only
exact tool/storage selection = 0
Product implementation authority = 0
```
