# P-02 F22 — Data Explorer recompile proof

> **Status:** `RECOMPILE CANDIDATE / WHOLE-WIRE GREEN / INDEPENDENT REVIEW REQUIRED`
> **Design:** [p02-f22-data-explorer-design.md](p02-f22-data-explorer-design.md)
> **Execution plan:** [p02-f22-data-explorer-implementation-plan.md](p02-f22-data-explorer-implementation-plan.md)
> **Authority:** Evidence only. F22 is not operator-ratified, P8 remains NOT LOCKED, Product/runtime implementation and merge remain blocked.

## 1. Selected realization

The operator-approved F22 design recompiles as four exact Project-owned reads:

| ID | Operation | Product meaning |
| --- | --- | --- |
| `PRJ-25` | `ListProjectDataExplorerSources` | current explorer-eligible Project Database and exact eligible currently bound integration sources |
| `PRJ-26` | `ListProjectDataExplorerObjects` | bounded source-scoped TABLE/VIEW/genuinely-tabular DATASET discovery |
| `PRJ-27` | `GetProjectDataExplorerObject` | exact physical structure/relationships/constraints with optional non-authorizing semantic cross-links |
| `PRJ-28` | `ListProjectDataExplorerRows` | current read-only rows through bounded typed filter/sort/pagination |

The four-read split is required because source discovery, scalable object discovery, exact physical structure and row paging have independent scale/disclosure shapes. It does not create a generic resource/provider tree or DB-admin framework.

Current semantic/authority result:

```text
N_platform                117 → 121
Project                    23 → 27
ordinary Permissions            25
new semantic owners              0
new principal classes            0
new trust boundaries             0
new durable record classes       0
Technical Ingress                3 / Product-count impact 0
```

`PRJ-18/19` remain the semantic Data-resource family. `PRJ-25..28` are a separate physical read-only explorer projection. Physical names never replace semantic identity; semantic labels/rules never authorize physical disclosure.

## 2. Authority RED — control shown to fire

Selected RED commit:

```text
HEAD       = a11ca06ef2b9762e0df1078d9d3334613671fa5a
Verify     = #938
result     = EXPECTED FAILURE
repository = 130 tests / 128 pass / 2 fail
```

The two failures were exactly the selected F22 falsifiers:

```text
1. PRJ-25 authority absent from current Product ledger/wire
2. Project Data Explorer route absent from current Product OAS
```

All unrelated repository/P-02 guards remained green. This proved F20/F21 could not satisfy the approved real-row explorer job before authority was changed.

## 3. 4A authority result

Canonical current authority changes only the smallest owners:

```text
docs/product/operation-ledger.md
→ adds PRJ-25..28 under Project
→ PRJ-18/19 remain semantic-only Data resources
→ raw-data fail-closed/source eligibility law explicit
→ N_platform=121 / Project=27

docs/product/permission-contract.md
→ keeps ordinary Permission vocabulary exactly 25
→ project.data.read covers exact bounded F22 reads
→ exact Project grant + server-resolved explorer eligibility remain additional current-authority conditions
```

`project.data.read` is necessary but insufficient. In particular:

```text
bound Connection -X-> raw-source disclosure
connection.use -X-> generic explorer authority
source/object/page coordinate -X-> authorization
frontend masking -X-> sensitive-data policy
```

If the owner cannot safely decide raw disclosure, that source/object is not explorer-eligible.

## 4. 4B wire result

F22 uses one focused Project-owned wire fragment:

```text
contracts/api/product/project-data-explorer-paths.yaml
```

The root Product OAS references its four paths directly. This is organization only, not a new semantic owner. The whole-wire topology checker proves the fragment is reachable and that no dead parallel YAML fragment exists.

Wire surface:

```text
GET  /api/control/projects/{projectId}/data-explorer/sources
GET  /api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects
GET  /api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}
POST /api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}/rows:query
```

`PRJ-28` remains a semantic read despite HTTP POST: the body carries structured bounded filters/sorts rather than query authority.

Key schema properties:

```text
physical sourceClass = INTERNAL | INTEGRATION
object kind          = TABLE | VIEW | DATASET
rowReadAvailability  = AVAILABLE | UNAVAILABLE
filter operators     = EQ | NE | GT | GTE | LT | LTE | CONTAINS | IS_NULL | IS_NOT_NULL
sort                  = disclosed dataColumnId + ASC | DESC
rows                  = closed cell arrays, max page 100
continuation          = opaque request-scope-bound token
approximateTotal      = optional; absence means unknown, never zero
large values          = explicit truncated boolean + optional byteLength
```

No request can choose Connection revision/environment, SQL fragments, provider target or credentials.

## 5. Focused executable F22 checker

`wire:project` composes the existing Project core/Agent checkers with:

```text
scripts/check-wire-project-data-explorer.mjs
```

The checker proves exact PRJ-25..28 identities/methods/paths, CP-only ingress, `NONE` current-state carrier, closed schemas, bounded filter/sort/page shapes, physical-source truth and absence of mutation/query escape hatches.

Seven load-bearing negative controls fire on the canonical bundle mutation harness:

```text
1. F22 cannot admit SQL text
2. F22 cannot select Connection revision
3. F22 sourceClass cannot become DERIVED physical source
4. F22 cannot admit SQL filter operator
5. F22 rows cannot become dynamic object DTOs
6. F22 truncated cell truth is required
7. F22 cannot admit DELETE mutation
```

`Project=27` is proved compositionally as the 23-operation pre-F22 Project core plus the 4-operation F22 checker. The legacy core checker intentionally still checks only its original 23-operation scope; it is not the whole Project census.

## 6. Current-census guard cleanup

F22 exposed four historical count snapshots that were no longer valid global invariants. They were corrected by derivation rather than manually changed to `121`:

```text
F19 repository guard
→ preserves historical F19 transition 116 → 117 and BRN-13 semantics
→ no longer claims current global N_platform must forever equal 117

wire bijection
→ derives fixed-operation census from the canonical current ledger
→ still rejects missing/extra/duplicate/identity-drift operations

generated projection proof
→ derives expected operation count from the canonical bundled Product OAS
→ still proves byte determinism, exact identity, no parallel DTO and required consumers

real Kubb probe
→ derives expected method+path set from the exact source OAS
→ still proves exact set equality, no invented/lost routes, carriers, status typing, no explicit any and strict TypeScript compilation

whole-4B adversarial proof
→ derives its immutable expected census from the canonical bundle before adversarial mutations
→ still rejects census drift inside mutated candidates and now explicitly requires PRJ-25..28
```

This preserves semantic/structural invariants while removing temporal snapshot coupling from current CI.

## 7. Whole-wire GREEN

Candidate GREEN commit before this Evidence-only proof record:

```text
HEAD                     = ae7d846a943269bbc9cd0e9c6512b84675f5834c
Verify                   = #951 / SUCCESS
repository tests         = 130 / 130
bootstrap_bytes          = 20397 / 20480
4A ↔ OAS                 = 121 ↔ 121 schema-closed
Project                  = 27 total = 23 core + 4 F22
Builder                  = 17
Brain                    = 12
Connections              = 9
IAM/Workspace checker    = 23
Release                  = 7
PAR                      = 16
Gateway                  = 2
MAR                      = 3
OBS                      = 5
ordinary Permissions     = 25
Technical Ingress        = 3 / Product-count impact 0
wire fragments           = 11 reachable / 0 dead parallel
generated projection     = PASS / 121 + F11/F12/F19/F22 consumers
real Kubb probe          = PASS / 121 / deterministic / strict TS green
Budget proof             = PASS
whole 4B adversarial     = PASS / 121
whole 4B executable      = PASS
```

Existing Redocly/AJV warnings remain pre-existing and non-blocking; F22 did not broaden scope to clean unrelated warnings.

## 8. Raw-data trust boundary

The recompile explicitly denies:

```text
Project Data Explorer -X-> hub_control
Project Data Explorer -X-> I&A/Workspace/Project/Builder/Brain/etc owner schemas
Project Data Explorer -X-> mastra_builder / mastra_par
Project Data Explorer -X-> Keycloak provider persistence
Project Data Explorer -X-> CredentialBackend material
Project Data Explorer -X-> another Project Database
Project Data Explorer -X-> foreign Workspace/Project source
PRJ-28 -X-> SQL / free-form WHERE / arbitrary expression / join
PRJ-28 -X-> INSERT / UPDATE / DELETE / DDL
PRJ-28 -X-> arbitrary provider execution / bulk export
page token -X-> Project/source/object/filter/order widening
unknown total -X-> zero
truncated preview -X-> complete value
```

A currently bound integration is listed only when the exact binding plus connector/source contract can truthfully support bounded read-only tabular disclosure. Non-tabular or unsafe sources remain non-eligible.

## 9. Current gate

The recompile is a **GREEN candidate**, not a ratified F22 closure.

Before revised P8 work:

```text
fresh independent adversarial review
→ attack raw-data disclosure / Project isolation / Permission reuse / query escape / continuation scope
→ Lead adjudication
→ bounded correction if justified
→ no unresolved material finding
```

Until that review converges:

```text
F22 ratification = BLOCKED
revised P8       = BLOCKED
P9/P10           = BLOCKED
P-03+            = NOT OPEN
Product runtime  = BLOCKED
merge            = NOT AUTHORIZED
```
