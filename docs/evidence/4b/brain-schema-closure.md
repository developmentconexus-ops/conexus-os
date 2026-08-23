# 4B Evidence — Brain Schema Closure

> **Kind:** bounded 4B executable Evidence; not Product authority by itself.
> **Accepted semantic source:** current 4A Product authority plus accepted Brain/knowledge/data contracts.
> **Machine authority under proof:** `contracts/api/product/openapi.yaml` resolved graph.

## 1. Decision question

> Can the current Brain Product surface be given exact wire shapes without turning Brain into self-publishing memory, arbitrary SQL/text-to-SQL authority, or a new credential/data owner?

## 2. Exact Product slice

Current caller Product operations are exactly:

```text
BRN-01 → BRN-10
BRN-12
```

Total:

```text
11 Product operations
```

`BRN-11 RunBrainHealthProbe` remains absent from caller Product wire because current authority classifies it as `SYSTEM_OWNER_TRANSITION`.

Canonical active Path Items:

```text
contracts/api/product/brain-paths.yaml
```

They become authority only through the canonical `contracts/api/product/openapi.yaml` entrypoint and resolved bundle.

## 3. Closure laws proved

### 3.1 One Workspace Brain authority

`GetWorkspaceBrain` projects the canonical Workspace Brain publication state only. Brain does not absorb runtime conversation memory, vector/RAG indexes, tool authority, Permissions or Product authorization.

### 3.2 Published Brain revisions are immutable and human-inspectable

Published Brain revision detail carries exact artifact/source identity plus the accepted F06 review projection:

```text
brainRevisionId
brainDigest
sourceRevision
availability = AVAILABLE
reviewText
```

`reviewText` is a nonblank deterministic Brain-owned human-readable projection of the exact `sourceRevision`. It is read-only presentation content, not canonical Brain source, digest/revision identity or a decision subject.

`AVAILABLE` does not mean live inheritance. Projects remain explicitly pinned to exact Brain revisions through Project-owned binding authority.

### 3.3 Discovery remains read-only and provenance-first

`StartBrainDiscovery` receives only the Project reference whose already-admitted source/Connection context is resolved server-side.

The request does not admit caller-selected:

```text
credential
secret
connectionString
sql
url / targetUrl
physicalTable
fullScan
```

Discovery candidates remain hypotheses bound to provenance. Unsupported mappings do not become canonical truth and no percentage accuracy is manufactured without measured Evidence.

### 3.4 KnowledgeProposal requires human review and exposes exact candidate meaning

KnowledgeProposal carries exact proposal/candidate/provenance coordinates. Its hypothesis/review states remain owner-issued strings because current Product authority does not ratify a lifecycle enum.

After F06, the exact proposal detail also carries nonblank `reviewText` derived deterministically from its exact `candidateSourceRevision`, so re-entry does not depend on browser-local Discovery text or foreign-owner Git access.

Submission cannot self-publish. Decision still requires only the exact current proposal revision plus:

```text
APPROVE | REJECT
```

`reviewText` is forbidden as decision identity/input. Machine confidence never replaces current human review authority.

### 3.5 Publication creates a new immutable AVAILABLE revision

`PublishBrainRevision` names the exact reviewed `candidateSourceRevision` and produces an immutable Brain revision. Publication input does not accept `reviewText`; the returned BrainRevision carries the deterministic review projection associated with its exact source.

Publication does not silently rebind Projects or mutate existing revisions.

### 3.6 Health is an overlay, not content mutation

Brain health uses the accepted exact vocabulary:

```text
UNVERIFIED
VALID
SUSPECT
INVALID
CHECK_ERROR
```

The health projection carries the exact Brain revision/digest and `healthSnapshotDigest`. Critical health can block dependent use under current policy, but the overlay cannot rewrite immutable Brain content.

### 3.7 AnalyticQuery remains a restricted semantic query regime

`RunAnalyticQuery` is closed as:

```text
x-conexus-query-regime = ANALYTIC_QUERY_V0
x-conexus-sql-proof = SELECT_ONLY_REQUIRED
HTTP ingress = CONTROL_PLANE + PUBLISHED_APP
non-HTTP ingress = PAR_TOOL
```

Caller input is restricted to registered semantic authority:

```text
datasetSemanticId
selectSemanticIds[]
```

The wire rejects arbitrary SQL and physical topology authority such as:

```text
sql / rawSql
physical table/schema
caller-defined joins/join topology
connectionId
arbitrary expression
```

The response preserves exact Brain-plan, Project-binding and health-snapshot digests plus semantic columns/rows/provenance. It does not disclose SQL, physical storage topology or credentials.

## 4. Executable falsifiers

The Brain checker rejects at least:

```text
any current BRN Product operation not SCHEMA_CLOSED
BRN-11 appearing in caller Product wire
provisional Brain response authority
Brain memory/vector/tool/Permission ownership creep
mutable/live-inherited Brain revisions
BRN-03 or BRN-06 missing nonblank exact-source reviewText
reviewText accepted as BRN-07 proposal input
reviewText accepted as BRN-08 decision input
reviewText accepted as BRN-09 publication input
Discovery credential/arbitrary-source/full-scan escape hatches
unsupported accuracy percentages or auto-canonical discovery output
KnowledgeProposal self-publish/machine-approval authority
invented proposal lifecycle enums
Brain health state vocabulary drift
health overlay mutation of immutable Brain content
AnalyticQuery arbitrary SQL/physical join/Connection authority
loss of SELECT-only proof law
loss of PAR_TOOL non-HTTP separation
```

Machine guard:

```text
scripts/check-wire-brain.mjs
```

## 5. Original 4B TDD proof

```text
Verify #276 = FAILURE
→ expected RED before Brain schema activation
→ current BRN-01 remained METHOD_PATH_MAPPED/provisional while the new gate required SCHEMA_CLOSED

Verify #278 = SUCCESS
HEAD = 057094bbf4663a5350df1a43eff400e146d43881
```

Historical established counts at that point:

```text
fixed 4A operations      = 111
fixed OAS operations     = 111
schema-closed operations = 69
Brain Product            = 11 / 11
missing                  = 0
extra                    = 0
duplicate                = 0
```

Those counts are historical Evidence of the original 4B closure, not the current whole-platform count after later accepted 4C corrections.

## 6. Original result

```text
Brain           = CLOSED inside 4B
Product code    = BLOCKED
```

Missing semantics remain a falsifier/reopen trigger rather than permission to invent DTO meaning.

## 7. `4C-F05` bounded Brain-wire recompile

W-02A later proved that the accepted Discovery journey was not caller-expressible between `BRN-04` hypothesis output and the pre-existing source-only `BRN-07` proposal intake. Global-Maximum analysis confirmed Brain as the existing owner and the operator accepted enrichment of the existing `SubmitKnowledgeProposal` operation rather than a new operation/domain.

Current `BRN-07` wire is one semantic operation with two mutually exclusive closed request forms:

```text
SOURCE_BACKED
candidateSourceRevision + provenanceRefs
→ existing Brain candidate submitted for review

DISCOVERY_BACKED
discoveryCandidateRef + non-blank humanResolution
→ Brain re-resolves exact discovery provenance/context
→ Brain materializes the candidateSourceRevision
→ same KnowledgeProposal result
```

Preserved negative laws:

```text
BRN-04 remains read-only hypothesis/provenance discovery
Discovery-backed caller -X-> candidateSourceRevision authority
Discovery-backed caller -X-> provenanceRefs authority
BRN-07 -X-> self-publish
BRN-08 remains APPROVE|REJECT proposal decision
BRN-09 remains reviewed candidate publication
Project Builder / Project Git -X-> Workspace Brain source ownership
Brain Product operations remain 11
```

Selected-realization proof:

```text
Verify #559 = EXPECTED RED
→ repository tests 60 / pass 58 / fail 2 exactly F05 selected-realization assertions

Verify #563 = SUCCESS
HEAD = 09ba434d8e8561487b9159422f873e826d9f4a43
→ selected F05 Product authority + oneOf wire + Brain checker + generated/whole-wire proof GREEN
```

## 8. `4C-F06` bounded Brain-wire recompile

W-02A P7/data-feasibility later proved that `BRN-03` and `BRN-06` carried exact identities/state/provenance but no reconstructible human-readable content for the exact source being reviewed. Global-Maximum analysis confirmed Brain and the existing detail reads as the right owner/surface; the operator accepted the bounded `reviewText` realization rather than raw Brain-Git access, Builder reuse, a Brain editor or a generic ReviewProjection Product domain.

Current wire:

```text
BrainRevision.required
→ brainRevisionId + brainDigest + sourceRevision + availability + reviewText

KnowledgeProposal.required
→ proposalId + proposalRevision + candidateSourceRevision
  + provenanceRefs + hypothesisState + reviewState + reviewText
```

Protected boundary:

```text
reviewText = deterministic human-readable projection of exact named source revision
reviewText -X-> canonical source
reviewText -X-> identity/digest/revision authority
reviewText -X-> BRN-08 decision input
reviewText -X-> BRN-09 publication input
DOM / visual anchors -X-> Brain authority
```

Selected-realization proof:

```text
Verify #585 = EXPECTED RED
→ 63 tests / 62 pass / 1 fail exactly F06 selected-realization authority assertion

Verify #588 = SUCCESS
HEAD = 1a84b5ec2bc31f2df90d376100918c15d829b0e7
→ 4A Brain semantics + BRN-03/06 wire + Brain checker + generated/whole-wire proof GREEN
```

Current whole-platform counts remain:

```text
fixed Product operations = 113
fixed Product wire       = 113 ↔ 113
Brain Product operations = 11
ordinary Permissions     = 25
new F05 operations       = 0
new F06 operations       = 0
new F05/F06 owners       = 0
new F05/F06 durable records = 0
```

F05 closes proposal-intake expressibility; F06 closes exact-source human inspectability. Neither creates Product implementation authority.