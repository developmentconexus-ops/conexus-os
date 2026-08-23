# 4B Evidence — Brain Schema Closure

> **Kind:** bounded 4B executable Evidence; not Product authority by itself.
> **Accepted semantic source:** current 4A Product authority plus accepted Brain/knowledge/data contracts and operator-accepted bounded `4C-F05` / `4C-F06` / `4C-F07` corrections.
> **Machine authority under proof:** `contracts/api/product/openapi.yaml` resolved graph.

## 1. Decision question

> Can the current Brain Product surface be given exact wire shapes without turning Brain into self-publishing memory, arbitrary SQL/text-to-SQL authority, a frontend-owned semantic catalog, or a new credential/data owner?

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

## 3. Current closure laws proved

### 3.1 One Workspace Brain authority

`GetWorkspaceBrain` projects the canonical Workspace Brain publication state only. Brain does not absorb runtime conversation memory, vector/RAG indexes, tool authority, Permissions or Product authorization.

### 3.2 Published Brain revision detail is exact-source human-inspectable and structurally browseable

`BRN-02 ListBrainRevisions` and `BRN-09 PublishBrainRevision` remain bounded `BrainRevision` summary/publication projections.

The exact `BRN-03 GetBrainRevision` detail now returns `BrainRevisionDetail`:

```text
brainRevisionId
brainDigest
sourceRevision
availability = AVAILABLE
reviewText
knowledgeBrowse
  → domains[]
    → domainRef + label
    → concepts[]
      → conceptRef + label + summary
      → contentClasses[]
      → sections[] { kind, text }
      → provenanceRefs[]
```

`reviewText` remains a nonblank deterministic Brain-owned human-readable projection of the exact `sourceRevision`.

`knowledgeBrowse` is likewise deterministic and source-bound. It lets the approved frontend render business-aligned domain/namespace → concept organization without parsing review prose or DOM. `domainRef` / `conceptRef` are revision-scoped projection coordinates only; they are not canonical semantic/source identity, mutation targets, proposal decision subjects or publication subjects.

Current content classes are exactly:

```text
SEMANTIC
KNOWLEDGE
EVIDENCE_SPEC
```

Current human presentation section roles are exactly:

```text
DEFINITION
BUSINESS_MEANING
CALCULATION
GRAIN
RELATIONSHIPS
BUSINESS_RULES
CAVEATS
VERIFICATION
```

A concept need not contain every section. `provenanceRefs` may truthfully be empty. Empty `domains` is a known-empty projection, never a transport/error substitute.

`AVAILABLE` still does not mean live inheritance. Projects remain explicitly pinned to exact Brain revisions through Project-owned binding authority.

### 3.3 Discovery remains Project-context, read-only and provenance-first

`StartBrainDiscovery` receives only the untrusted `projectId` whose already-admitted source/Connection context is resolved server-side.

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

The exact proposal detail carries nonblank `reviewText` derived deterministically from its exact `candidateSourceRevision`, so re-entry does not depend on browser-local Discovery text or foreign-owner Git access.

Submission cannot self-publish. Decision still requires only the exact current proposal revision plus:

```text
APPROVE | REJECT
```

`reviewText`, `knowledgeBrowse`, `domainRef` and `conceptRef` are forbidden as decision/publication identity/input. Machine confidence never replaces current human review authority.

### 3.5 Publication creates a new immutable AVAILABLE revision

`PublishBrainRevision` names the exact reviewed `candidateSourceRevision` and produces a bounded immutable `BrainRevision` summary. Publication input does not accept review/browse presentation carriers.

A consumer that needs the rich knowledge browse resolves the exact new revision through `BRN-03`; publication therefore does not inflate every response with the whole knowledge projection.

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
BRN-03 missing exact-source knowledgeBrowse detail
knowledgeBrowse widened onto BRN-02 list summaries or BRN-09 publication summary
content-class vocabulary drift beyond SEMANTIC|KNOWLEDGE|EVIDENCE_SPEC
knowledge-section role drift beyond the selected F07 closed union
empty/duplicate invalid F07 carriers
reviewText / knowledgeBrowse / domainRef / conceptRef accepted as BRN-07/08/09 authority inputs
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

W-02A proved that the accepted Discovery journey was not caller-expressible between `BRN-04` hypothesis output and the pre-existing source-only `BRN-07` proposal intake. Brain remained owner and the operator accepted one `BRN-07` operation with two mutually exclusive closed request forms:

```text
SOURCE_BACKED
candidateSourceRevision + provenanceRefs

DISCOVERY_BACKED
discoveryCandidateRef + non-blank humanResolution
→ Brain re-resolves exact discovery provenance/context
→ Brain materializes candidateSourceRevision
→ same KnowledgeProposal result
```

Selected-realization proof:

```text
Verify #559 = EXPECTED RED
Verify #563 = SUCCESS
```

No new Brain operation/owner/Permission/record.

## 8. `4C-F06` bounded Brain-wire recompile

W-02A later proved that exact revision/proposal identity alone was not enough for a reviewer to know what was being reviewed after re-entry. Brain and the existing exact detail reads remained correct; the accepted wire property was nonblank exact-source `reviewText` on `BRN-03` and `BRN-06`.

Protected boundary:

```text
reviewText = deterministic human-readable projection of exact named source revision
reviewText -X-> canonical source
reviewText -X-> decision/publication identity
```

Selected-realization proof:

```text
Verify #585 = EXPECTED RED
Verify #588 = SUCCESS
```

No new Brain operation/owner/Permission/record.

## 9. `4C-F07` bounded Brain-wire recompile

P9 of the operator-approved W-02A functional Brain candidate proved that plain `reviewText` could not support the approved `Knowledge → Domain → Concept` browse without making the frontend infer semantic hierarchy from prose/DOM or read Brain Git directly.

Global-Maximum adjudication preserved the existing Brain owner and `BRN-03` exact detail read. Only that exact revision detail was widened to `BrainRevisionDetail + knowledgeBrowse`; `BRN-02` and `BRN-09` remain bounded summaries and no remote catalog/search/pagination family was introduced.

Selected TDD chronology:

```text
Verify #615 = EXPECTED RED
→ 68 tests / 67 pass / 1 fail
→ only failure: BRN-03 must return BrainRevisionDetail

Verify #619 = SUCCESS
→ selected 4A semantic property + BRN-03 detail schema + Brain checker + generated/whole-wire proof GREEN
```

Current whole-platform closure remains:

```text
fixed Product operations     = 113
fixed Product wire           = 113 ↔ 113
Brain Product operations     = 11
ordinary Permissions         = 25
new F05/F06/F07 operations   = 0
new F05/F06/F07 owners       = 0
new F05/F06/F07 records      = 0
```

F05 closes proposal-intake expressibility; F06 closes exact-source human inspectability; F07 closes exact-revision structured knowledge browse. None creates Product implementation authority.
