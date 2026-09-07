# Brain and Knowledge

Current technical detail extracted without semantic rewriting from the accepted Phase-3 architecture baseline. `docs/architecture/index.md` owns the overview; this file owns the detailed task surface named by its title.

## 20. Brain architecture

## 20.1 One canonical Brain per Workspace F1

```text
Workspace
→ 0..1 canonical Brain
```

Namespaces/domains organize content without creating multiple independent Brain authorities prematurely.

## 20.2 Authority split

```text
Workspace Brain Git      → published source
Artifact Registry        → exact immutable Brain artifact revision/payload
Brain owner              → semantic meaning/validation/publication/health
Project                  → ProjectBrainBinding intent
Project Git              → binding/refinement/override/local realization
Release                  → exact promoted composition
Gateway                  → controlled physical data proof/execution
Builder/PAR              → bounded final context composition
```

`BrainRevision` is the semantic view of exact immutable `ArtifactRevision(kind=brain)`, not duplicate revision authority.

Every admitted `ProjectBrainBinding` must carry/pass the accepted local conformance proof, including required grain/uniqueness assertions; inheriting semantic meaning is not proof that the Project realizes it correctly.

### 20.2.1 Authorized typed input successor

The operator-authorized `conexus-brain/v2` preserves `reviewText` and the v1
knowledge-browse structure, adding an explicit `itemRef` to each concept and
closed `items` and `assertions` arrays. Existing immutable v1 sources and their
Workspace reads remain unchanged; v1 is not silently upgraded for adoption.

An item has `itemId`, `kind` (DATASET, SEMANTIC, KNOWLEDGE or GROUP) and unique
`dependsOn` item IDs. DATASET additionally requires `grainId`; other kinds
cannot declare it. IDs are canonical source identities, never derived from
browse coordinates or prose. Joins must resolve, dependency cycles refuse,
and each concept must name exactly one existing item.

An assertion has unique `assertionId`, DATASET `itemId`, `kind=KEY_CONFORMANCE`,
`predicateVersion=1` (string) and explicit `scope=REVISION|SELECTED`. Every
DATASET requires at least one such assertion. REVISION requirements remain
required even for empty Project selection; SELECTED requirements apply to the
selected dependency closure. Unsupported predicates refuse, rather than
silently dropping a proof obligation. Grain remains declared business meaning;
this grammar neither chooses physical ERP columns nor proves their conformance.

V2 health retains the existing health grammar and state enum, but requires
exact coverage of canonical item IDs with no missing or foreign semanticRef.
This validates identity joins, not health truth or Project-local conformance.

The APP-OWNED `.conexus/brain/realization.json` uses closed
`conexus-project-brain-realization/v1`: `selectedRoots`, `mappings`,
`sourceInputs`. A mapping contains `itemId`, `queryId`, `mappingDigest`; it pins
a trusted registered physical definition, never supplies SQL or a caller PASS.
Source inputs are unique `{path,digest}` references to other APP-owned files.
The manifest cannot reference itself or platform binding declarations. Missing
input is invalid; explicit empty roots are valid input but cannot bypass a
REVISION assertion. Required mappings cover exactly the datasets demanded by
the selected closure and REVISION assertions. The subsequent admission consumer
must read referenced files at the frozen source, check APP ownership and each
digest, and match registration, dataset, grain and mapping identities before
executing proof. Parser success alone is never binding admission or usable
Project context. NEW authoring, source ownership activation, health projection
and shared settlement remain separately verified integration work.

### 20.2.2 Adoption authority and unavailable Project context

Connection-backed adoption proof follows the compound `PRJ-11` authority in
[the permission contract](../product/permission-contract.md#34-brain).
An admitted candidate revision, a prior proof or a stored binding alone grants
no physical read authority.

For `BRN-14`, stale or missing local conformance, missing required health, or
health that blocks the required applicability/dependency closure makes the
context unavailable until the owning prerequisites are restored/revalidated.
Do not serve an earlier usable projection or relabel this as known-empty.
After normal disclosure checks, use the existing `503` Problem response and
return no usable domains or authoring references. Missing binding and denied
disclosure retain their existing `404`/`403` behavior; unavailable dependencies
do not bypass that boundary. A `200` response with empty `domains` is reserved
for a successfully validated, genuinely known-empty Project context.

This response rule does not mutate the persisted Project binding validation
snapshot, publish global Brain health, trigger ERP reads from `BRN-14`, or
introduce a new global lifecycle enum. The wire owner is
[`ProjectBrainContext`](../../contracts/api/product/project-brain-context-paths.yaml).

## 20.3 Brain is not memory/RAG

```text
Brain
!= Conversation memory
!= AgentRun history
!= Builder scratchpad
!= tasks.md
!= personal memory
!= vector index
```

A later retrieval index is derived and can only locate candidate canonical IDs; it never becomes meaning authority.

## 20.4 Published revision/adoption

```text
Brain source review
→ publish/merge under Brain authority
→ compile
→ immutable revision AVAILABLE
→ Project sees UPDATE_AVAILABLE
→ Project independently validates/rebinds
→ Release pins exact Brain+binding composition
```

No live inheritance.

## 20.5 Effective Brain context identity

Every relevant Brain runtime trace records all four identities:

```text
brainDigest
projectBindingDigest
healthSnapshotDigest
effectiveBrainSliceDigest
```

A health/state change can alter the effective slice without mutating the immutable published Brain revision.

## 20.6 Hard context budgets

Brain delivery remains deterministic/bounded. Current architecture preserves hard limits such as `maxBrainTokens` / stable-context budget semantics at compile/deployment time.

Dependency closure matters: a metric must not be injected without the critical caveat/binding/definition needed to interpret it safely. If the required bundle does not fit, fail compilation or omit the capability rather than silently drop the caveat.

## 20.7 Content-security boundary

```text
real ERP data in Brain Git                              = FORBIDDEN
sample_values / verified-query fixtures                 = enum | synthetic only
sampleSource                                             = REQUIRED
PII lint + secret scanning + human review               = REQUIRED
custom_instructions command authorization/tools/
  approvals/credentials/platform policy                 = FORBIDDEN
Brain creates/widens grant, tool, data or platform scope = NEVER
```

Brain content is knowledge under the authority lattice, not a privileged control channel.

---

## 21. Brain assisted Discovery architecture

Current F1 discovery is **machine-propose / human-decide**.

```text
source dictionary/catalog metadata
+ directed profiling of relevant candidate structures
→ semantic candidates
→ provenance/confidence/hypothesis state
→ prioritized human interview
→ reviewed Brain change proposal
→ published authority only after human Brain decision
```

For the current Sankhya consumer, Discovery is TDD*-first: native TDD dictionary/catalog plus PostgreSQL catalog precede directed profiling; profiling is targeted audit, not indiscriminate full-ERP scanning.

Discovery source access occurs through trusted Hub/Gateway read-only authority. ERP credentials do not enter E2B merely for Brain semantic discovery.

An inferred relation never becomes canonical merely because the model is confident.

---

## 22. AnalyticQuery architecture

C-011 admits a second read regime beside static registered Query:

```text
A. static registered Query artifact
OR
B. Brain-bound restricted AnalyticQuery
```

Current AnalyticQuery v0:

```text
semantic IDs only
→ validate exact EffectiveBrainPlan / Project binding
→ canonical restricted semantic plan
→ allowlisted AST / expressions
→ SELECT-only parser proof
→ Gateway/read executor
→ Project query role + read-only transaction
→ result shaping/budgets
```

One query targets one curated analytical dataset in v0. The runtime LLM cannot choose arbitrary SQL, physical table names, expressions or new join topology.

Cross-dataset analytical need that current curated source cannot represent returns to Builder/Project work.

Static Query and AnalyticQuery remain separate read regimes; no universal “execute arbitrary query” tool is introduced.

---

## 23. Brain health/drift architecture

Published Brain content and operational health are distinct.

Operational states include:

```text
UNVERIFIED
VALID
SUSPECT
INVALID
CHECK_ERROR
```

`ASSERTION_FAILED != CHECK_ERROR`.

Health is an operational overlay; it never rewrites Git/immutable BrainPack.

Critical numeric/effectful semantics marked `SUSPECT`/`INVALID` **block** dependent use under the accepted severity/type policy rather than being silently consumed.

Every Brain-dependent AgentRun pins a health snapshot. Before final response and before any effect/approval execution, critical dependency health is rechecked; critical change invalidates continuation/approval and recomposes context. Brain-dependent approval binds `effectiveBrainSliceDigest`.

---
