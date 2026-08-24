# F22 Read-Only Data Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompile the approved F22 Data Explorer into the smallest truthful 4A/4B read authority and a revised P-02 functional P8 where authorized Project data opens as a real read-only rows/columns explorer.

**Architecture:** Keep semantic `ProjectDataResource` (`PRJ-18/19`) separate from physical explorer truth. Add four Project-owned reads: source discovery, source-scoped object discovery, exact object inspection, and exact object row browsing. External sources are server-resolved only from current eligible Project bindings; Project Database means Project-owned application/business data only. The browser composes physical explorer truth with existing semantic truth but owns neither.

**Tech Stack:** Markdown Product authority, OpenAPI 3.1.2 YAML, Node.js 24.18 repository checkers/tests, Redocly CLI 2.47.0, generated projection/Kubb proof, self-contained low-fi HTML/CSS/vanilla JS.

**Spec:** `docs/evidence/4c/p02-f22-data-explorer-design.md`

## Global Constraints

- Current accepted executable authority remains F21 until the F22 recompile task is green and independently challenged.
- Do not adopt or rebaseline the newer DevelopmentConexus methodology inside PR #57; methodology adoption remains a later separate repository-governance increment.
- F22 is read-only. No SQL Editor, SQL text, free-form WHERE/expression, INSERT, UPDATE, DELETE, DDL, migrations, DB administration, arbitrary joins, bulk export, credentials, connection strings, provider tokens, or caller-selected target URL.
- Explorer scope is only the exact Project: Project Database business/application data, eligible bound integration sources, and genuinely tabular derived objects at their truthful physical source.
- `hub_control`, owner schemas, `mastra_builder`, `mastra_par`, Keycloak persistence, CredentialBackend material, another Project DB, and foreign Workspace/Project sources are structurally non-disclosable.
- Physical identity and semantic meaning remain separate. Physical names stay visible; semantic labels/rules may augment them.
- Plan-selected minimal Product split is four reads: `PRJ-25..PRJ-28`. If execution Evidence shows this split cannot satisfy the spec without widening authority, STOP at the smallest owning decision; do not silently add a fifth operation or generic framework.
- Plan-selected Permission hypothesis is existing `project.data.read`; no 26th ordinary Permission. If raw-row disclosure cannot be honestly covered by that Permission plus exact current source/object eligibility, STOP and reopen only the Permission/disclosure decision.
- Plan-selected expected fixed census after F22 is `N_platform=121`, `Project=27`; Builder=17, Brain=12, Connections=9, ordinary Permissions=25, Technical Ingress=3/Product impact 0, owners and durable record classes unchanged.
- P-01 and all other locked blocks remain untouched. P8 remains NOT LOCKED until the operator operates the revised HTML and explicitly approves it.
- Product implementation, P9/P10, P-03+, P11, 4D+, and merge remain blocked.

## File Map

**Create**
- `tests/repository/4c-p02-f22-data-explorer.test.mjs` — durable semantic falsifier for F22 authority/wire boundaries; no mutable roadmap-status coupling.
- `scripts/check-wire-project-data-explorer.mjs` — focused bundled-OAS checker plus negative controls for the raw-data disclosure boundary.
- `docs/evidence/4c/p02-f22-data-explorer-recompile-proof.md` — bounded RED/GREEN/review proof; not a second mutable status authority.

**Modify**
- `docs/product/operation-ledger.md` — add F22 Project authority and `PRJ-25..28`.
- `docs/product/permission-contract.md` — recompile `project.data.read` meaning/consumers without adding a Permission.
- `contracts/api/product/openapi.yaml` — route the four new paths into the canonical Product OAS.
- `contracts/api/product/project-paths.yaml` — define the four operations and closed schemas.
- `package.json` — compose the focused F22 checker under `wire:project`.
- `tests/repository/4c-p02-functional-wireframe.test.mjs` — replace the superseded “no physical explorer” P8 invariant with the approved read-only explorer contract.
- `docs/evidence/4c/p02-project-resources-functional-wireframe.html` — revise Data only; preserve Capabilities/Integrations/Brain and GF-01 shell.
- `docs/evidence/4c/p02-f22-data-explorer-design.md` — project approved-spec/realization status and link to this plan/proof without changing the accepted design.
- `docs/evidence/4c/p02-p8-feedback-revision.md` — keep F20/F21 historical truth and route the later F22 supersession; do not rewrite F20 as though it had always allowed physical browsing.
- `docs/roadmap.md` — current state only, compactly.
- PR #57 body — metadata only after the final branch HEAD is verified.

---

### Task 1: Revalidate and prove the F22 authority gap RED

**Files:**
- Create: `tests/repository/4c-p02-f22-data-explorer.test.mjs`
- Read: `docs/product/operation-ledger.md`
- Read: `docs/product/permission-contract.md`
- Read: `contracts/api/product/openapi.yaml`
- Read: `contracts/api/product/project-paths.yaml`

**Interfaces:**
- Consumes: approved F22 spec and current F21 authority.
- Produces: a durable semantic test that fails because J1/J2/J3 are not currently representable and later proves the selected F22 boundary.

- [ ] **Step 1: Revalidate the execution base before editing**

Confirm PR #57 is still Draft/open/unmerged, base `main`, and fetch the current branch HEAD plus latest `Verify`. Abort if main/branch authority moved materially or another actor changed the F22 files.

- [ ] **Step 2: Write the failing semantic test**

Create `tests/repository/4c-p02-f22-data-explorer.test.mjs` with current-source assertions, not historical count snapshots:

```js
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

const ledger = read('docs/product/operation-ledger.md')
const permissions = read('docs/product/permission-contract.md')
const rootOas = read('contracts/api/product/openapi.yaml')
const projectOas = read('contracts/api/product/project-paths.yaml')
const pkg = read('package.json')

const selected = [
  ['PRJ-25', 'ListProjectDataExplorerSources'],
  ['PRJ-26', 'ListProjectDataExplorerObjects'],
  ['PRJ-27', 'GetProjectDataExplorerObject'],
  ['PRJ-28', 'ListProjectDataExplorerRows'],
]

test('F22 has four Project-owned read jobs without creating SQL or write authority', () => {
  for (const [id, operation] of selected) {
    assert.match(ledger, new RegExp(`${id}.*${operation}`), `missing ${id} ${operation} in 4A authority`)
    assert.match(projectOas, new RegExp(`x-conexus-4a-id: ${id}`), `missing ${id} in Project OAS`)
    assert.match(projectOas, new RegExp(`operationId: ${operation}`), `missing ${operation} in Project OAS`)
  }
  assert.match(permissions, /project\.data\.read[\s\S]*PRJ-25\.\.28/)
  assert.doesNotMatch(permissions, /`project\.data\.(explore|sql|admin|write)`/)
})

test('F22 canonical wire routes a bounded Project Data Explorer checker', () => {
  for (const token of [
    '/api/control/projects/{projectId}/data-explorer/sources',
    'data-explorer/sources/{dataSourceId}/objects',
    'objects/{dataObjectId}',
    'rows:query',
  ]) assert.ok(rootOas.includes(token), `missing canonical F22 route ${token}`)
  assert.match(pkg, /check-wire-project-data-explorer\.mjs/)
})

test('F22 remains a Project-scoped read explorer, not a DB console', () => {
  for (const token of [
    'ProjectDataExplorerSource', 'ProjectDataExplorerObject',
    'ProjectDataExplorerFilter', 'ProjectDataExplorerRowPage',
    'dataSourceId', 'dataObjectId', 'dataColumnId',
  ]) assert.ok(projectOas.includes(token), `missing bounded explorer shape ${token}`)
  assert.doesNotMatch(projectOas, /\b(sql|connectionString|credential|password|ddl|insert|update|delete)\b\s*:/i)
})
```

- [ ] **Step 3: Run the focused test and confirm the intended RED**

Run:

```bash
node --test tests/repository/4c-p02-f22-data-explorer.test.mjs
```

Expected: FAIL on missing `PRJ-25..28` / F22 routes, not on file-read errors or unrelated existing assertions.

- [ ] **Step 4: Run the aggregate gate once to record the selected RED**

Run:

```bash
npm ci
npm run verify
```

Expected: repository tests fail only on the new F22 falsifier while prior checks remain green; `wire:verify` may not execute because repository tests stop first. Record the exact GitHub run/HEAD later in the bounded proof; never guess a run number.

- [ ] **Step 5: Commit the falsifier**

```bash
git add tests/repository/4c-p02-f22-data-explorer.test.mjs
git commit -m "test(4c): select F22 data explorer falsifier"
```

---

### Task 2: Recompile 4A Product authority with four explicit reads

**Files:**
- Modify: `docs/product/operation-ledger.md`
- Modify: `docs/product/permission-contract.md`
- Test: `tests/repository/4c-p02-f22-data-explorer.test.mjs`

**Interfaces:**
- Consumes: F22 J1/J2/J3 and the plan-selected four-read split.
- Produces: exact 4A Product operations `PRJ-25..28` under Project owner and existing `project.data.read`.

- [ ] **Step 1: Add the four operations to the Project census**

Add exact authority rows using the repository’s existing Project table format:

```text
PRJ-25 ListProjectDataExplorerSources
Owner: Project
Class: read
Consumer: Project > Data source tree
Meaning: list only current explorer-eligible Project Database / bound integration sources
Permission: project.data.read + exact Project grant/current eligibility

PRJ-26 ListProjectDataExplorerObjects
Owner: Project
Class: read
Consumer: exact selected explorer source
Meaning: paged/searchable source-scoped TABLE/VIEW/genuinely-tabular DATASET summaries; namespace is presentation/filter context, never new authority
Permission: project.data.read + exact Project/source eligibility

PRJ-27 GetProjectDataExplorerObject
Owner: Project
Class: read
Consumer: exact object Structure/Relationships/Rules
Meaning: physical columns/keys/relationships/constraints plus optional coordinates back to existing semantic ProjectDataResource truth
Permission: project.data.read + exact Project/source/object eligibility

PRJ-28 ListProjectDataExplorerRows
Owner: Project
Class: read
Consumer: Data grid
Meaning: bounded typed filters/sort/pagination over one exact disclosed object; no SQL/expression or mutation meaning
Permission: project.data.read + exact Project/source/object eligibility
```

Set the current fixed census to `121` and Project to `27`; do not alter other owner counts.

- [ ] **Step 2: Add binding negative laws next to F22 authority**

The ledger F22 section must state once:

```text
Project Data Explorer -X-> hub_control / Conexus owner schemas / Mastra stores / Keycloak / another Project DB
source/object/page coordinates = untrusted references, never authority
ProjectConnectionBinding/current source eligibility = server-resolved
INTEGRATION source -X-> caller-selected Connection revision/environment
physical object identity != semantic DataResource identity
DERIVED != fake physical source
PRJ-28 -X-> SQL / expression / join / DML / DDL / export authority
page token -X-> Project/source/object/filter/order scope widening
```

- [ ] **Step 3: Recompile `project.data.read` without adding a Permission**

Change only the reusable meaning/consumer list to the equivalent of:

```text
project.data.read
→ inspect admitted semantic Data resources and bounded read-only Project Data Explorer projections
→ PRJ-18/19 + PRJ-25..28
→ with brain.read, BRN-12/13 semantic analytics
-X-> generic DB console / SQL / mutation / credentials / foreign-source disclosure
```

Keep the ordinary Permission vocabulary exactly 25.

- [ ] **Step 4: Run the focused test**

```bash
node --test tests/repository/4c-p02-f22-data-explorer.test.mjs
```

Expected: authority assertions now pass; OAS/checker assertions remain RED.

- [ ] **Step 5: Commit the 4A recompile**

```bash
git add docs/product/operation-ledger.md docs/product/permission-contract.md
git commit -m "docs(4c): recompile F22 Product authority"
```

---

### Task 3: Realize the four reads in the canonical 4B OAS

**Files:**
- Modify: `contracts/api/product/openapi.yaml`
- Modify: `contracts/api/product/project-paths.yaml`
- Test: `tests/repository/4c-p02-f22-data-explorer.test.mjs`

**Interfaces:**
- Consumes: `PRJ-25..28` from Task 2.
- Produces: schema-closed HTTP wire for source discovery, object discovery, object inspection, and row browsing.

- [ ] **Step 1: Route the four canonical paths from root OAS**

Add these exact Product paths:

```yaml
/api/control/projects/{projectId}/data-explorer/sources:
  $ref: './project-paths.yaml#/paths/~1api~1control~1projects~1{projectId}~1data-explorer~1sources'
/api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects:
  $ref: './project-paths.yaml#/paths/~1api~1control~1projects~1{projectId}~1data-explorer~1sources~1{dataSourceId}~1objects'
/api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}:
  $ref: './project-paths.yaml#/paths/~1api~1control~1projects~1{projectId}~1data-explorer~1sources~1{dataSourceId}~1objects~1{dataObjectId}'
/api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}/rows:query:
  $ref: './project-paths.yaml#/paths/~1api~1control~1projects~1{projectId}~1data-explorer~1sources~1{dataSourceId}~1objects~1{dataObjectId}~1rows:query'
```

- [ ] **Step 2: Define opaque path parameters**

In `project-paths.yaml`, add nonblank `DataSourceId` and `DataObjectId` parameters. They are untrusted server-issued coordinates; no request field may accept `connectionId`, `connectionRevisionId`, environment selection, host, database URL, or credentials.

- [ ] **Step 3: Define source/object discovery wire**

`PRJ-25` is GET and returns an array of closed `ProjectDataExplorerSource` objects with required:

```yaml
required: [dataSourceId, name, sourceClass, availability]
properties:
  dataSourceId: { type: string, minLength: 1 }
  name: { type: string, minLength: 1, pattern: '.*\S.*' }
  sourceClass: { type: string, enum: [INTERNAL, INTEGRATION] }
  availability: { type: string, enum: [AVAILABLE, UNAVAILABLE] }
  engine: { type: string, minLength: 1 }
  environment: { type: string, minLength: 1 }
```

`DERIVED` must not appear in `sourceClass`.

`PRJ-26` is GET over exact `dataSourceId`. Admit bounded query parameters only for `namespace`, `search`, `cursor`, and technical `limit` (`1..200`, default `100`). Return a closed page:

```yaml
required: [items]
properties:
  items:
    type: array
    items: { $ref: '#/components/schemas/ProjectDataExplorerObjectSummary' }
  nextCursor: { type: string, minLength: 1 }
```

Each summary requires `dataObjectId`, physical `name`, `kind = TABLE|VIEW|DATASET`; optional `namespace`, `semanticDataResourceId`, and `derived` presentation are non-authorizing.

- [ ] **Step 4: Define exact object inspection wire**

`PRJ-27` is GET and returns closed `ProjectDataExplorerObject` with required:

```text
dataObjectId
name
kind
rowReadAvailability = AVAILABLE | UNAVAILABLE
columns[]
relationships[]
constraints[]
```

Column shape:

```text
dataColumnId
name                 physical column name
sourceType           source-native/logical type presentation
nullable             boolean
keyRole              PRIMARY | FOREIGN | UNIQUE | NONE
semanticFieldId?     optional coordinate only; semantic meaning remains PRJ-19-owned
```

Relationship shape:

```text
relationshipId
sourceColumnId
targetDataObjectId
targetColumnId
kind = FOREIGN_KEY | REFERENCE
```

Constraint shape:

```text
constraintId
kind = PRIMARY_KEY | FOREIGN_KEY | UNIQUE | NOT_NULL | CHECK
columnIds[]
summary?             human-safe bounded description; never raw SQL/DDL expression
```

Optional `semanticDataResourceId` links to existing PRJ-19 truth instead of duplicating grain/provenance/business rules into F22.

- [ ] **Step 5: Define structured row-browse request**

`PRJ-28` is semantic **read** projected as HTTP POST only because filters/sorts are structured body data. Use:

```yaml
required: []
properties:
  filters:
    type: array
    maxItems: 8
    items: { $ref: '#/components/schemas/ProjectDataExplorerFilter' }
  sort:
    type: array
    maxItems: 3
    items: { $ref: '#/components/schemas/ProjectDataExplorerSort' }
  continuationToken: { type: string, minLength: 1 }
  limit: { type: integer, minimum: 1, maximum: 100, default: 50 }
```

`ProjectDataExplorerFilter` is a closed union:

```text
value operators: EQ | NE | GT | GTE | LT | LTE | CONTAINS
→ require dataColumnId + operator + string value

null operators: IS_NULL | IS_NOT_NULL
→ require dataColumnId + operator
→ forbid value
```

`ProjectDataExplorerSort` requires `dataColumnId` + `ASC|DESC`.

The numeric maxima are 4B transport-safety mechanics; no Product meaning or UI behavior may depend on exactly `8/3/100`.

- [ ] **Step 6: Define truthful row response without arbitrary JSON DTOs**

Return closed `ProjectDataExplorerRowPage`:

```text
observedAt              required date-time
columns[]               required grid column projection
rows[]                  required, max 100
continuationToken?      opaque and request-scope-bound
approximateTotal?       optional integer >= 0; never required
```

Use cells rather than dynamic object keys:

```text
ProjectDataExplorerCell
→ dataColumnId
→ valueKind = NULL | TEXT | NUMBER | BOOLEAN | TEMPORAL | JSON | BINARY
→ displayValue = string | null
→ truncated = boolean
→ byteLength? integer >= 0
```

This preserves grid truth without `additionalProperties: true`, binary download authority, or JS-number precision assumptions. `truncated=true` must never be rendered as a complete value.

- [ ] **Step 7: Preserve dependency states in wire**

Use normal 401/403/404/422 shared Problem responses. For a currently admitted source/object whose backing dependency cannot serve the read, add an inline `503` Problem response referencing the canonical `Problem` schema; do not convert dependency failure into `200 []`.

- [ ] **Step 8: Run schema/bijection checks**

```bash
npm run wire:lint
npm run wire:bundle
npm run wire:bijection
```

Expected after Task 3:

```text
Product OAS valid
4A↔OAS = 121 ↔ 121
0 missing / 0 extra / 0 duplicate
```

- [ ] **Step 9: Run focused repository test**

```bash
node --test tests/repository/4c-p02-f22-data-explorer.test.mjs
```

Expected: OAS tokens now pass; package/checker integration may remain RED until Task 4.

- [ ] **Step 10: Commit the wire**

```bash
git add contracts/api/product/openapi.yaml contracts/api/product/project-paths.yaml
git commit -m "docs(4b): realize F22 data explorer wire"
```

---

### Task 4: Add one focused executable F22 checker and negative controls

**Files:**
- Create: `scripts/check-wire-project-data-explorer.mjs`
- Modify: `package.json`
- Test: `tests/repository/4c-p02-f22-data-explorer.test.mjs`

**Interfaces:**
- Consumes: bundled canonical Product OAS at `/tmp/conexus-product-openapi.bundle.json`.
- Produces: one focused raw-data boundary checker composed under `wire:project`; no historical-count/status guard.

- [ ] **Step 1: Implement checker helpers over the bundled OAS**

Structure the checker around a pure `validateDataExplorer(oas)` function and keep the default bundle path overridable for negative-control use:

```js
import fs from 'node:fs'

const bundlePath = process.env.CONEXUS_PRODUCT_BUNDLE ?? '/tmp/conexus-product-openapi.bundle.json'
const canonical = JSON.parse(fs.readFileSync(bundlePath, 'utf8'))

function fail(message) { throw new Error(`F22 Data Explorer: ${message}`) }
function closed(schema, label) {
  if (schema?.type !== 'object' || schema?.additionalProperties !== false) fail(`${label} must be closed`)
  return schema
}

export function validateDataExplorer(oas) {
  // collect operations by x-conexus-4a-id
  // require PRJ-25..28 and exact operationIds
  // require GET/GET/GET/POST method shape
  // require x-conexus-current-state-carrier: NONE on all four reads
  // require schema-closed source/object/filter/sort/row shapes
  // require sourceClass INTERNAL|INTEGRATION and reject DERIVED-as-source
  // reject request properties named sql, where, expression, connectionId,
  // connectionRevisionId, environment, targetUrl, credential, password
  // reject mutating HTTP methods anywhere below /data-explorer except the
  // PRJ-28 POST semantic read
}

validateDataExplorer(canonical)
console.log('Project F22 Data Explorer closure passed (4 bounded reads; no SQL/write/credential authority).')
```

Replace the comments above with concrete assertions before committing; comments are shown here only to define the exact required checker responsibilities, not as implementation placeholders.

- [ ] **Step 2: Make the checker prove its load-bearing controls fire**

After canonical validation, deep-clone the bundled OAS and run negative cases through `validateDataExplorer`. Each mutation must fail for the intended reason:

```js
function expectReject(label, mutate) {
  const candidate = structuredClone(canonical)
  mutate(candidate)
  try { validateDataExplorer(candidate) }
  catch { console.log(`negative control fired: ${label}`); return }
  throw new Error(`negative control failed: ${label}`)
}

expectReject('F22 cannot admit SQL text', oas => {
  const op = /* locate PRJ-28 */
  op.requestBody.content['application/json'].schema.properties.sql = { type: 'string' }
})

expectReject('F22 cannot select Connection revision', oas => {
  const op = /* locate PRJ-28 */
  op.requestBody.content['application/json'].schema.properties.connectionRevisionId = { type: 'string' }
})

expectReject('F22 sourceClass cannot become DERIVED physical source', oas => {
  const schema = /* resolve ProjectDataExplorerSource */
  schema.properties.sourceClass.enum.push('DERIVED')
})
```

Also add negative mutations for: filter operator `SQL`, unbounded/dynamic row object, missing `truncated`, and a DELETE method under an F22 path.

- [ ] **Step 3: Compose the checker under `wire:project` only**

Change:

```json
"wire:project": "node scripts/check-wire-project.mjs && node scripts/check-wire-project-agent-catalog.mjs && node scripts/check-wire-project-data-explorer.mjs"
```

Do not add a new top-level phase gate or duplicate whole-wire command.

- [ ] **Step 4: Run focused wire proof**

```bash
npm run wire:bundle
npm run wire:project
node --test tests/repository/4c-p02-f22-data-explorer.test.mjs
```

Expected: Project closure passes with 27 operations; F22 checker reports canonical PASS plus all named negative-control firings; repository F22 test passes.

- [ ] **Step 5: Commit the checker**

```bash
git add scripts/check-wire-project-data-explorer.mjs package.json tests/repository/4c-p02-f22-data-explorer.test.mjs
git commit -m "test(4b): prove F22 data explorer boundary"
```

---

### Task 5: Close whole-wire candidate and run independent F22 challenge

**Files:**
- Create: `docs/evidence/4c/p02-f22-data-explorer-recompile-proof.md`
- Modify only if a real defect is found: exact F22 authority/wire/checker files from Tasks 2–4.

**Interfaces:**
- Consumes: candidate 121-operation wire.
- Produces: independently challenged F22 authority candidate fit to drive P8; review findings cannot create new authority silently.

- [ ] **Step 1: Run the complete repository/wire proof**

```bash
npm ci
npm run verify
```

Expected current-state results:

```text
repository tests = all green
4A↔OAS = 121 ↔ 121
Project = 27
Builder = 17
Brain = 12
Connections = 9
ordinary Permissions = 25
Technical Ingress = 3 / Product impact 0
generated projection/no-parallel-DTO = 121 + existing F11/F12/F19 consumers + real Kubb probe
whole 4B adversarial = PASS
whole 4B executable = PASS
```

Do not “fix” unrelated existing Redocly warnings in this increment.

- [ ] **Step 2: Write the bounded recompile proof using actual run evidence**

`docs/evidence/4c/p02-f22-data-explorer-recompile-proof.md` must contain:

```text
selected four reads and exact IDs
permission result
RED HEAD + exact Verify run and intended failure
GREEN candidate HEAD + exact Verify run
121↔121 / Project=27 / Permissions=25
F22 checker negative controls
no owner/durable-record/Technical-Ingress change
raw-data trust boundary summary
```

Copy run numbers/SHAs from GitHub after the runs complete; never prefill guessed identifiers.

- [ ] **Step 3: Request the canonical isolated independent review**

Review the exact candidate HEAD against at least:

```text
cross-Project / cross-Workspace disclosure
hub_control / Mastra / Keycloak exposure
whether project.data.read is still semantically honest
binding eligibility vs generic connection.read/use leakage
SQL/expression escape
page-token scope
sensitive raw column/row leakage
physical-vs-semantic duplicate authority
generic explorer framework overreach
```

Use the repository’s canonical Fable review workflow. The handoff must say reviewer findings are Evidence, not new Product requirements.

- [ ] **Step 4: Adjudicate review output**

If review finds a defect against the approved F22 spec, fix only that defect, rerun the focused checker and `npm run verify`, and update the proof with the actual review disposition.

If review proposes broader SQL/admin/masking/framework authority, do **not** implement it; classify it as a new proposal and return to the operator only if it materially blocks F22.

- [ ] **Step 5: Stop at the review checkpoint before P8 if any material finding remains open**

P8 may use the recompiled authority only after the raw-data disclosure candidate has no unresolved material review finding.

- [ ] **Step 6: Commit the proof/adjudication**

```bash
git add docs/evidence/4c/p02-f22-data-explorer-recompile-proof.md
git commit -m "docs(4c): close F22 data explorer recompile proof"
```

---

### Task 6: Select the revised P8 contract RED without creating a second guard family

**Files:**
- Modify: `tests/repository/4c-p02-functional-wireframe.test.mjs`
- Test: same file.

**Interfaces:**
- Consumes: independently accepted F22 authority candidate.
- Produces: the P8 falsifier for the approved physical explorer UX while preserving the other three P-02 routes.

- [ ] **Step 1: Replace only the superseded Data assertions**

Keep the shell, Capabilities, Integrations, Brain, accessibility, fixture-only and no-network tests. Replace the old Data test that requires “not a physical DB explorer” with a semantic read-only explorer test requiring:

```js
for (const token of [
  'Project Database', 'Sankhya ERP', 'TGFCAB', 'TGFITE', 'TGFPAR',
  'Data', 'Structure', 'Relationships', 'Rules',
  'physical identity', 'semantic meaning',
  '50 rows loaded', 'truncated',
  'SQL Editor = FORBIDDEN', 'INSERT / UPDATE / DELETE = FORBIDDEN',
]) requireText(html, token)

for (const id of [
  'data-source-tree', 'data-object-search', 'data-object-tabs', 'data-grid',
  'data-structure', 'data-relationships', 'data-rules',
  'data-filter-builder', 'data-sort-control', 'data-column-picker',
  'data-row-inspector', 'data-next-page',
]) requireText(html, `id="${id}"`, id)

for (const behavior of [
  'openDataObject', 'searchDataObjects', 'selectDataObjectTab',
  'applyExplorerFilter', 'applyExplorerSort', 'toggleExplorerColumn',
  'openRowInspector', 'nextExplorerPage',
]) requireText(html, behavior, behavior)

assert.doesNotMatch(html, /SQL Editor|Execute Query|INSERT\b|UPDATE\b|DELETE\b|CREATE TABLE|ALTER TABLE/i)
```

Permit explanatory evidence text like `SQL Editor = FORBIDDEN`; ensure the final regex targets controls/behavior rather than banning the words from evidence labels if needed.

- [ ] **Step 2: Run the focused P8 test and verify RED**

```bash
node --test tests/repository/4c-p02-functional-wireframe.test.mjs
```

Expected: only the revised Data explorer assertions fail; Capabilities/Integrations/Brain and global P8 properties remain green.

- [ ] **Step 3: Commit the P8 falsifier**

```bash
git add tests/repository/4c-p02-functional-wireframe.test.mjs
git commit -m "test(4c): select F22 Data Explorer P8"
```

---

### Task 7: Revise only the P-02 Data P8 into a functional read-only explorer

**Files:**
- Modify: `docs/evidence/4c/p02-project-resources-functional-wireframe.html`
- Test: `tests/repository/4c-p02-functional-wireframe.test.mjs`

**Interfaces:**
- Consumes: F22 physical explorer authority plus existing PRJ-18/19 semantic augmentation; fixture-only, no API call.
- Produces: operator-operable low-fi Data explorer candidate; no P8 LOCK.

- [ ] **Step 1: Preserve the four-route shell and non-Data routes**

Do not redesign Capabilities, Integrations, Brain, GF-01 rail/topbar, responsive shell, Escape/focus behavior, or their existing fixture semantics.

- [ ] **Step 2: Replace the Data catalog/master-detail with a physical source tree**

Fixture tree must truthfully model:

```text
Project Database
└── public
    ├── follow_up_tasks       TABLE
    ├── customers             TABLE
    └── sales_performance     VIEW · Derived

Sankhya ERP
└── SANKHYA
    ├── TGFCAB                TABLE · Sales documents
    ├── TGFITE                TABLE · Sales document items
    └── TGFPAR                TABLE · Partners / customers
```

`Derived` is a badge/meaning on `sales_performance`, never a fake source.

- [ ] **Step 3: Add local multi-object tabs and Data as the default object lens**

Opening an object must create/select an ephemeral local tab. Each object workspace exposes:

```text
Data               default
Structure
Relationships
Rules
```

Data grid is primary. `Structure` shows physical columns/types/nullable/keys plus semantic labels where available. `Relationships` navigates to another already-authorized fixture object by opening/selecting its local tab. `Rules` visually separates physical constraints from governed business rules.

- [ ] **Step 4: Add realistic row fixtures without implying live Sankhya access**

Use local TGFCAB-like columns/rows sufficient to prove width, booleans/numbers/nulls, and relationships, for example:

```text
NUNOTA | CODPARC | DTNEG      | VLRNOTA  | TIPMOV | STATUSNOTA
184921 | 2188    | 2026-08-24 | 16900.00 | V      | L
184922 | 3220    | 2026-08-24 | 8450.00  | V      | L
```

Label the whole artifact `fixture-only`. Do not imply these are real Metal Nobre/Sankhya records.

- [ ] **Step 5: Implement bounded local filter/sort/column controls**

`Filter` is a form builder over disclosed columns/operators; no text field accepts SQL-like expressions. `Sort` uses one or more selected columns/directions within the fixture. Column visibility changes only local rendering.

- [ ] **Step 6: Implement opaque next-page behavior and truth states**

The fixture must show `50 rows loaded · Next →` without mandatory total count. `nextExplorerPage()` swaps to the next local fixture page and updates an observed-at/status region. Add inspectable states for: loading, empty, denied/non-disclosable, source unavailable, row read unavailable, and stale/invalid continuation. Never map dependency failure to empty.

- [ ] **Step 7: Implement Row Inspector and explicit truncation**

Clicking an already-loaded row opens a read-only drawer with field/value + human meaning + relationship navigation. Include at least one structured/large cell rendered as an explicit preview with `truncated`/`View preview` wording; no download/blob endpoint or hidden full value.

- [ ] **Step 8: Preserve Analyze as semantic, not SQL**

Keep BRN-13 → BRN-12 Analyze as the existing contextual semantic workflow. Do not place Analyze inside the physical filter builder and do not label it SQL/query editor.

- [ ] **Step 9: Run focused P8 proof**

```bash
node --test tests/repository/4c-p02-functional-wireframe.test.mjs
```

Expected: all P-02 P8 tests pass.

- [ ] **Step 10: Run full gate**

```bash
npm ci
npm run verify
```

Expected: 121↔121, Project=27, all repository tests green, generated projection/Kubb proof green, whole-4B proofs green.

- [ ] **Step 11: Commit the revised candidate**

```bash
git add docs/evidence/4c/p02-project-resources-functional-wireframe.html
git commit -m "docs(4c): revise P02 Data into read-only explorer"
```

---

### Task 8: Project current state, verify exact final HEAD, and hand back P8

**Files:**
- Modify: `docs/evidence/4c/p02-f22-data-explorer-design.md`
- Modify: `docs/evidence/4c/p02-p8-feedback-revision.md`
- Modify: `docs/evidence/4c/p02-f22-data-explorer-recompile-proof.md`
- Modify: `docs/roadmap.md`
- Update: PR #57 body metadata only.

**Interfaces:**
- Consumes: green independently challenged F22 wire + green revised functional P8.
- Produces: current-state projection and operator walkthrough checkpoint; no P8 lock/merge.

- [ ] **Step 1: Update design/proof status without rewriting history**

The F22 design should say the written spec was operator approved and point to this plan/recompile proof. F20/F21 evidence remains historical accepted truth; add only an explicit later-F22 supersession note where needed.

- [ ] **Step 2: Compact roadmap current state**

Project current truth equivalent to:

```text
4A = CLOSED / F22 RECOMPILED / N_platform=121
4B = CLOSED / F22 RECOMPILED / 121↔121 / Project=27
P-02 = OPEN / P7 APPROVED / F22 GREEN / P8 REVISED CANDIDATE / WALKTHROUGH / NOT LOCKED
P9/P10 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
merge = NOT AUTHORIZED
```

Replace obsolete current-state wording; do not append another historical status log. Preserve bootstrap margin.

- [ ] **Step 3: Run final exact-HEAD verification after all file changes**

```bash
npm ci
npm run verify
```

Fetch the exact GitHub `Verify` job log for the final branch HEAD before claiming success. Confirm the final log includes 121↔121, Project=27, F22 checker PASS/negative controls, generated projection/Kubb PASS, and whole-4B executable PASS.

- [ ] **Step 4: Update PR #57 metadata only**

PR body must show the exact current HEAD/run, F22 four-read result, 121↔121, Project=27, Permissions=25, P8 revised candidate, and exact next action = operator walkthrough. Keep PR Draft/open/unmerged.

- [ ] **Step 5: Hand the exact final HTML artifact to the operator**

Fetch the final wireframe blob from the verified HEAD, create an exact local copy for the chat artifact, verify its Git blob SHA, and provide it for walkthrough.

Ask only for the P8 result:

```text
Aprovado
or
bounded feedback
```

Do not execute P9/P10 or merge on the same approval unless the operator explicitly authorizes those next actions.
