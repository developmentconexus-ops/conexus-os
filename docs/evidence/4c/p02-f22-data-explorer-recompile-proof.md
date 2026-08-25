# P-02 F22 — Data Explorer recompile proof

> **Status:** `OPERATOR RATIFIED / R2 CONVERGED / WHOLE-WIRE GREEN / P8 F22 REVISED CANDIDATE`
> **Design:** [p02-f22-data-explorer-design.md](p02-f22-data-explorer-design.md)
> **Execution plan:** [p02-f22-data-explorer-implementation-plan.md](p02-f22-data-explorer-implementation-plan.md)
> **Authority:** Evidence only. F22 is operator-ratified in current 4A/4B authority; revised P8 is verified but NOT LOCKED, Product/runtime implementation and merge remain blocked.

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

R1 surfaced one ratification consequence: when F22 runtime exists, already-issued `project.data.read` grants can become eligible for raw-row disclosure on explorer-eligible sources. Exact Project grant and server-resolved eligibility still bind every read. The operator explicitly confirmed this consequence after R2 convergence; the Permission vocabulary therefore remains 25. A real tenant requiring semantic Data inspection without raw-row disclosure is a reopen trigger rather than a reason to invent client-side masking.

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

Continuation/filter law after independent review:

```text
continuationToken + supplied filters/sort
→ supplied filters and sort must equal token-bound filter/order
→ mismatch = 422
→ token is never reinterpreted
→ limit may vary only inside the existing 1..100 transport bound
```

Filter values remain non-executable source-typed lexical scalars. Locale-dependent/ambiguous literals and unsupported operator/type combinations reject `422`; concrete provider codecs remain realization obligations rather than frontend-owned type truth.

After Project-level admission, an undisclosed source/object coordinate is indistinguishable from absent and yields `404`; `403` is reserved for failure of the caller's Project-level grant/Permission before resource probing.

No request can choose Connection revision/environment, SQL fragments, provider target or credentials.

## 5. Focused executable F22 checker

`wire:project` composes the existing Project core/Agent checkers with:

```text
scripts/check-wire-project-data-explorer.mjs
```

The checker proves exact PRJ-25..28 identities/methods/paths, CP-only ingress, `NONE` current-state carrier, exact allowlisted closed projection/request property sets, bounded filter/sort/page shapes, physical-source truth and absence of admitted mutation/query escape hatches. The former forbidden-name blocklist remains defense-in-depth; exact allowlists are the primary structural closure.

Eight load-bearing wire negative controls fire on the canonical bundle mutation harness:

```text
1. F22 cannot admit SQL text
2. F22 cannot select Connection revision
3. F22 sourceClass cannot become DERIVED physical source
4. F22 cannot admit SQL filter operator
5. F22 rows cannot become dynamic object DTOs
6. F22 truncated cell truth is required
7. F22 cannot admit DELETE mutation
8. F22 cannot admit an unlisted source projection property
```

Independent-review checker/contract hardening was TDD-proven:

```text
F1 allowlist RED
HEAD       = 6a9f091650a0fa7d77a7481c4f46b1352d97a209
Verify     = #955 / EXPECTED FAILURE
failure    = unlisted connectionUri projection was accepted

F1 allowlist GREEN
HEAD       = 8c1feb1d2dfddcb49a0184b61cbb02ce8b946261
Verify     = #956 / SUCCESS

review-law RED
HEAD       = 69846965f8657607e1b3da92d8baaa2e3129030e
Verify     = #957 / EXPECTED FAILURE / 131 tests / 130 pass / 1 fail

wire-owner refinement RED
HEAD       = 6df3e6d9549ad052de8a6c8dd89a10a32e5a6619
Verify     = #958 / EXPECTED FAILURE / 131 tests / 130 pass / 1 fail
failure    = continuation/filter conflict law absent from F22 wire
```

`Project=27` is proved compositionally as the 23-operation pre-F22 Project core plus the 4-operation F22 checker. The legacy core checker intentionally still checks only its original 23-operation scope; it is not the whole Project census.

### 5.1 Design §13.3 control disposition

The design intentionally includes controls that cannot be honestly discharged before runtime exists. They remain explicit instead of disappearing from the proof contract.

```text
WIRE-PROVED NOW
- SQL/expression-shaped fields are not admitted; exact schema allowlists prevent ordinary named-property request/response growth
- mutation/DDL methods are not admitted on explorer paths
- caller cannot select Connection revision/environment
- physical sourceClass cannot become DERIVED
- filter operator grammar remains closed
- dynamic row DTOs are rejected
- credentials/provider coordinates cannot be added to the allowlisted explorer projection without checker failure
- unknown total remains optional rather than implicit zero
- truncation truth remains required

PENDING-RUNTIME
1. cross-Project / cross-Workspace source/object coordinates fail closed and are status-uniform after Project admission
2. unbound or ineligible integration source cannot be browsed even if a Connection exists
3. filters target only currently disclosed exact-object columns
4. operator/type incompatibility and ambiguous source lexical values reject 422
5. page token cannot switch Project/source/object/filter/order scope and conflicting filter/order cannot be silently reinterpreted
6. hub_control / owner-schema / Mastra / Keycloak / credential substrate remains excluded from actual source discovery
```

These are first-realization falsifiers, not evidence that Product/runtime implementation exists today.

## 6. Current-census guard cleanup

F22 exposed historical count snapshots that were no longer valid global invariants. They were corrected by derivation rather than manually changed to `121`:

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
→ still proves exact set equality, no invented/lost routes, carriers, status typing, no explicit TypeScript `any` and strict compilation
→ TypeScript 7.0 remains the real strict compiler
→ `@typescript/typescript6` is used only for AST inspection because TypeScript 7.0 intentionally ships without the legacy Compiler API

whole-4B adversarial proof
→ derives its immutable expected census from the canonical bundle before adversarial mutations
→ still rejects census drift inside mutated candidates and explicitly requires PRJ-25..28
```

This preserves semantic/structural invariants while removing temporal snapshot coupling from current CI.

## 7. Whole-wire GREEN checkpoints

Pre-review candidate:

```text
HEAD                     = 38ebaf23ca715e0449accc6887a1676031a8334d
Verify                   = #954 / SUCCESS
repository tests         = 130 / 130
4A ↔ OAS                 = 121 ↔ 121
```

R1-corrected technical candidate:

```text
HEAD                     = 4b6967926f41915977eee8806fafb24fc46418e0
Verify                   = #965 / SUCCESS
repository tests         = 131 / 131
bootstrap_bytes          = 20210 / 20480
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
F22 focused checker      = PASS / 8 firing negative controls
wire fragments           = 11 reachable / 0 dead parallel
generated projection     = PASS / 121 + F11/F12/F19/F22 consumers
real Kubb probe          = PASS / TS7 strict compile + TS6 compatibility API AST scan
Budget proof             = PASS
whole 4B adversarial     = PASS / 121
whole 4B executable      = PASS
```

Exact R2-reviewed candidate:

```text
HEAD                     = 45ac44ed2342e710c567eedb8ec28b523a40098f
Verify                   = #968 / SUCCESS
repository tests         = 131 / 131
bootstrap_bytes          = 20365 / 20480
4A ↔ OAS                 = 121 ↔ 121
F22 focused checker      = PASS / 8 firing negative controls
whole 4B adversarial     = PASS / 121
whole 4B executable      = PASS
```

The Kubb-probe repair itself exposed a tooling-version assumption rather than a Product/wire defect: TypeScript 7.0 has no legacy Compiler API. The final probe uses TypeScript 7 for the strict compile and the Microsoft-provided TypeScript 6 compatibility package only to detect actual `AnyKeyword` nodes, avoiding the former false positive on the English word `any` in generated documentation.

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

## 9. Independent review and ratification

R1 independent Challenger attacked `38ebaf23` and found **no MATERIAL finding**, with four IMPORTANT + two MINOR findings. Lead adjudication accepted/refined all six without operation/Permission/owner/record growth.

R2 independently attacked the exact corrected candidate `45ac44ed2342e710c567eedb8ec28b523a40098f`, confirmed all six R1 dispositions, independently rechecked the RED/GREEN chain and concluded:

```text
No material uncertainty survives.
R1 corrections close all six findings.
R2 review status = CONVERGED.
```

R2 raised only three MINOR findings, all explicitly `DEFER-SAFE` and non-blocking:

```text
R2-F1 = checker precision: patternProperties / alternate success-status channels
R2-F2 = explicit-any AST scanner has no planted true-positive firing proof
R2-F3 = token + omitted filters/sort interoperability wording remains unspecified
```

Lead disposition:

```text
R2-F1 ACCEPT / DEFER-SAFE
R2-F2 ACCEPT / DEFER-SAFE
R2-F3 ACCEPT / DEFER-SAFE
```

They do not change Product authority, do not reopen an R1 disposition, and are routed to realization/optional hardening rather than spawning another review cycle.

Correction boundary remains:

```text
+0 Product operations
+0 Permissions
+0 semantic owners
+0 durable records
121↔121 preserved
```

The operator then explicitly confirmed R1-F4: existing `project.data.read` grants may become eligible for F22 raw-row disclosure only under exact Project grant + server-resolved explorer source/object eligibility. The 25-Permission vocabulary is retained.

## 10. Functional P8 RED → GREEN

The ratified F22 authority reopened only P-02 Data presentation. Capabilities, Integrations, Brain and the GF-01/P-01 shell stayed unchanged.

Selected P8 RED:

```text
HEAD       = 2655a7fb4e22e1eef7a12d31b1f28bef85337699
Verify     = #974 / EXPECTED FAILURE
repository = 131 tests / 130 pass / 1 fail
failure    = revised P8 lacks PRJ-25 / physical Data Explorer contract
```

All other P-02 route, Capabilities, Integrations, Brain, responsive, accessibility and self-contained guards remained green.

Revised P8 GREEN:

```text
HEAD                     = 5d2aa578bddcf29f5049929cf406bcee24903868
P8 blob                  = 59a7f53fa371297e435ee130bfcdfb86b126a247
Verify                   = #975 / SUCCESS
repository tests         = 131 / 131
bootstrap_bytes          = 20137 / 20480
4A ↔ OAS                 = 121 ↔ 121 schema-closed
Project                  = 27
ordinary Permissions     = 25
F22 focused checker      = PASS / 8 firing negative controls
generated projection     = PASS / 121 + F11/F12/F19/F22 consumers
wire topology            = 11 reachable / 0 dead parallel
whole 4B adversarial     = PASS / 121
whole 4B executable      = PASS
```

The fixture-only HTML demonstrates:

```text
Project Database + Sankhya ERP physical source tree
physical namespace/object names + human semantic meaning
TGFCAB / TGFITE / TGFPAR fixture tables
multiple open object tabs
Data as default object view
Structure / Relationships / Rules secondary views
bounded filter / sort / column visibility
opaque next-page behavior without mandatory exact total
read-only Row Inspector
explicit truncated-value presentation
Derived as object meaning, never fake physical source
Analyze remains BRN-13 → BRN-12 semantic flow, never SQL
loading / empty / denied / absent / dependency / row-unavailable / stale-continuation states
no network, persistence, SQL Editor, DML, DDL or Product implementation authority
```

The example rows are explicit walkthrough fixtures and are not represented as live Metal Nobre, Sankhya or customer data.

## 11. Current gate

F22 ratification is closed; P8 is a verified candidate awaiting the operator's exact walkthrough:

```text
F22 = OPERATOR RATIFIED
4A = CLOSED THROUGH F22 / N_platform=121
4B = CLOSED THROUGH F22 / 121↔121 / Project=27
P8 = F22 REVISED CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED
P9/P10 = BLOCKED UNTIL P8 OPERATOR APPROVAL
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
Product runtime = BLOCKED
merge = NOT AUTHORIZED
```
