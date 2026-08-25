# F22 Read-Only Data Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompile the approved F22 Data Explorer into the smallest truthful 4A/4B read authority and a revised P-02 functional P8 where authorized Project data opens as a real read-only rows/columns explorer.

**Architecture:** Keep semantic `ProjectDataResource` (`PRJ-18/19`) separate from physical explorer truth. Add four Project-owned reads: source discovery, source-scoped object discovery, exact object inspection, and exact object row browsing. External sources are server-resolved from current eligible Project bindings; Project Database means Project-owned business/application data only. The browser composes physical truth with existing semantic truth but owns neither.

**Tech Stack:** Markdown authority, OpenAPI 3.1.2 YAML, Node.js 24.18, Node test runner, Redocly CLI 2.47.0, existing generated-projection/Kubb proof, self-contained HTML/CSS/vanilla JS.

**Spec:** `docs/evidence/4c/p02-f22-data-explorer-design.md`

## Global Constraints

- PR #57 remains the owning Draft PR. Revalidate branch/main/CI before execution; never merge without explicit operator authorization.
- Do not adopt/rebaseline the newer DevelopmentConexus methodology inside PR #57. Methodology adoption remains a later separate governance increment.
- Current accepted executable authority remains F21 until F22 is recompiled, green, and independently challenged.
- F22 is read-only: no SQL Editor/text, free-form WHERE/expression, INSERT/UPDATE/DELETE, DDL, migrations, DB administration, arbitrary joins, bulk export, credentials, connection strings, provider tokens, or caller-selected target URL.
- Explorer scope is only the exact Project: Project Database business/application data, eligible bound integration sources, and genuinely tabular derived objects at their truthful physical source.
- `hub_control`, Conexus owner schemas, `mastra_builder`, `mastra_par`, Keycloak persistence, CredentialBackend material, another Project DB, and foreign Workspace/Project sources are non-disclosable.
- Physical identity and semantic meaning remain separate. Physical names stay visible; semantic labels/rules may augment them.
- Selected minimal Product split for this plan is exactly four reads: `PRJ-25..PRJ-28`. If execution Evidence disproves this split, STOP at the smallest owning decision; do not silently add a fifth operation or generic framework.
- Selected Permission result is existing `project.data.read`; ordinary Permissions stay 25. If raw-row disclosure cannot honestly fit that Permission plus exact source/object eligibility, STOP and reopen only Permission/disclosure.
- Expected census after F22: `N_platform=121`, `Project=27`, Builder=17, Brain=12, Connections=9, Technical Ingress=3/Product impact 0; semantic owners and durable records unchanged.
- P-01 and all other locked blocks remain untouched. P8 remains NOT LOCKED until operator walkthrough.
- Product implementation, P9/P10, P-03+, P11, 4D+, and merge remain blocked.

## File Map

**Create**
- `tests/repository/4c-p02-f22-data-explorer.test.mjs` — semantic authority/wire guard without mutable roadmap coupling.
- `scripts/check-wire-project-data-explorer.mjs` — focused bundled-OAS checker plus executable negative controls.
- `docs/evidence/4c/p02-f22-data-explorer-recompile-proof.md` — bounded RED/GREEN/review proof.

**Modify**
- `docs/product/operation-ledger.md`
- `docs/product/permission-contract.md`
- `contracts/api/product/openapi.yaml`
- `contracts/api/product/project-paths.yaml`
- `package.json`
- `tests/repository/4c-p02-functional-wireframe.test.mjs`
- `docs/evidence/4c/p02-project-resources-functional-wireframe.html`
- `docs/evidence/4c/p02-f22-data-explorer-design.md`
- `docs/evidence/4c/p02-p8-feedback-revision.md`
- `docs/roadmap.md`
- PR #57 body metadata after final verification.

---

### Task 1: Prove the current authority gap RED

**Files:**
- Create: `tests/repository/4c-p02-f22-data-explorer.test.mjs`

**Interfaces:**
- Consumes: approved F22 spec + current F21 authority.
- Produces: one durable semantic falsifier for J1/J2/J3.

- [ ] **Step 1: Revalidate execution base**

Confirm PR #57 is Draft/open/unmerged, base `main`, current branch HEAD, and latest Verify. Abort on material upstream movement or conflicting edits to F22-owned files.

- [ ] **Step 2: Write the failing test**

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

test('F22 has four Project-owned reads and no new Permission family', () => {
  for (const [id, op] of selected) {
    assert.match(ledger, new RegExp(`${id}.*${op}`))
    assert.match(projectOas, new RegExp(`x-conexus-4a-id: ${id}`))
    assert.match(projectOas, new RegExp(`operationId: ${op}`))
  }
  assert.match(permissions, /project\.data\.read[\s\S]*PRJ-25\.\.28/)
  assert.doesNotMatch(permissions, /`project\.data\.(explore|sql|admin|write)`/)
})

test('F22 routes a bounded Project explorer and executable checker', () => {
  for (const token of [
    '/api/control/projects/{projectId}/data-explorer/sources',
    'data-explorer/sources/{dataSourceId}/objects',
    'objects/{dataObjectId}', 'rows:query',
  ]) assert.ok(rootOas.includes(token), `missing ${token}`)
  for (const token of [
    'ProjectDataExplorerSource', 'ProjectDataExplorerObject',
    'ProjectDataExplorerFilter', 'ProjectDataExplorerRowPage',
    'dataSourceId', 'dataObjectId', 'dataColumnId',
  ]) assert.ok(projectOas.includes(token), `missing ${token}`)
  assert.match(pkg, /check-wire-project-data-explorer\.mjs/)
  assert.doesNotMatch(projectOas, /\b(sql|connectionString|credential|password|ddl)\b\s*:/i)
})
```

- [ ] **Step 3: Prove intended RED**

```bash
node --test tests/repository/4c-p02-f22-data-explorer.test.mjs
npm ci
npm run verify
```

Expected: new F22 assertions fail for missing authority/wire only; pre-existing tests remain green. Record exact RED HEAD/run later in the recompile proof.

- [ ] **Step 4: Commit**

```bash
git add tests/repository/4c-p02-f22-data-explorer.test.mjs
git commit -m "test(4c): select F22 data explorer falsifier"
```

---

### Task 2: Recompile 4A Product authority

**Files:**
- Modify: `docs/product/operation-ledger.md`
- Modify: `docs/product/permission-contract.md`
- Test: `tests/repository/4c-p02-f22-data-explorer.test.mjs`

**Interfaces:**
- Produces exactly:
  - `PRJ-25 ListProjectDataExplorerSources`
  - `PRJ-26 ListProjectDataExplorerObjects`
  - `PRJ-27 GetProjectDataExplorerObject`
  - `PRJ-28 ListProjectDataExplorerRows`

- [ ] **Step 1: Add four Project reads to the ledger**

Record each as Project-owned `read` under `project.data.read`:

```text
PRJ-25 → current explorer-eligible Project Database / bound integration sources
PRJ-26 → paged/searchable exact-source TABLE/VIEW/genuinely-tabular DATASET summaries
PRJ-27 → exact physical object columns/keys/relationships/constraints + optional semantic coordinates
PRJ-28 → exact-object rows with bounded typed filter/sort/pagination
```

Set current census to `121` and Project to `27`; do not alter other owner counts.

- [ ] **Step 2: Add F22 negative laws once**

```text
Project Data Explorer -X-> hub_control / owner schemas / Mastra stores / Keycloak / another Project DB
source/object/page coordinates = untrusted references, never authority
current Project binding/source eligibility = server-resolved
INTEGRATION source -X-> caller-selected Connection revision/environment
physical object identity != semantic ProjectDataResource identity
DERIVED != fake physical source
PRJ-28 -X-> SQL / expression / join / DML / DDL / export
page token -X-> Project/source/object/filter/order widening
```

- [ ] **Step 3: Recompile `project.data.read` only**

Use this meaning and consumer set:

```text
project.data.read
→ inspect admitted semantic Data resources and bounded read-only Project Data Explorer projections
→ PRJ-18/19 + PRJ-25..28
→ with brain.read, BRN-12/13 semantic analytics
-X-> generic DB console / SQL / mutation / credentials / foreign-source disclosure
```

Ordinary Permission count remains 25.

- [ ] **Step 4: Run focused test**

```bash
node --test tests/repository/4c-p02-f22-data-explorer.test.mjs
```

Expected: 4A/Permission assertions pass; wire/checker assertions remain RED.

- [ ] **Step 5: Commit**

```bash
git add docs/product/operation-ledger.md docs/product/permission-contract.md
git commit -m "docs(4c): recompile F22 Product authority"
```

---

### Task 3: Realize the four reads in canonical 4B OAS

**Files:**
- Modify: `contracts/api/product/openapi.yaml`
- Modify: `contracts/api/product/project-paths.yaml`

**Interfaces:**
- Produces four schema-closed paths:
  - GET `/api/control/projects/{projectId}/data-explorer/sources`
  - GET `/api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects`
  - GET `/api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}`
  - POST `/api/control/projects/{projectId}/data-explorer/sources/{dataSourceId}/objects/{dataObjectId}/rows:query`

- [ ] **Step 1: Route all four paths from root OAS**

Use normal root `$ref` routing to `project-paths.yaml`; each operation carries its exact `PRJ-25..28`, operationId, `x-conexus-ingress: [CONTROL_PLANE]`, `x-conexus-current-state-carrier: NONE`, and schema-closed state.

- [ ] **Step 2: Define opaque path coordinates**

Add nonblank `DataSourceId` and `DataObjectId`. No F22 request accepts Connection/revision/environment selection, host, URL, or credentials.

- [ ] **Step 3: Define source/object discovery**

`ProjectDataExplorerSource` is closed and requires:

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

`PRJ-26` admits only optional `namespace`, `search`, `cursor`, and technical `limit` (`1..200`, default `100`). Its closed page has `items[]` + optional `nextCursor`. Each object summary requires `dataObjectId`, physical `name`, and `kind=TABLE|VIEW|DATASET`; optional `namespace`, `semanticDataResourceId`, and `derived` are non-authorizing presentation.

- [ ] **Step 4: Define exact object inspection**

`ProjectDataExplorerObject` requires `dataObjectId`, `name`, `kind`, `rowReadAvailability=AVAILABLE|UNAVAILABLE`, `columns[]`, `relationships[]`, and `constraints[]`.

```text
Column: dataColumnId, physical name, sourceType, nullable, keyRole=PRIMARY|FOREIGN|UNIQUE|NONE, semanticFieldId?
Relationship: relationshipId, sourceColumnId, targetDataObjectId, targetColumnId, kind=FOREIGN_KEY|REFERENCE
Constraint: constraintId, kind=PRIMARY_KEY|FOREIGN_KEY|UNIQUE|NOT_NULL|CHECK, columnIds[], summary?
```

Optional `semanticDataResourceId` links to existing PRJ-19 truth; do not duplicate grain/provenance/business rules into F22.

- [ ] **Step 5: Define structured row request**

`PRJ-28` remains semantic read despite HTTP POST. Request is closed:

```yaml
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

Filter union:

```text
EQ|NE|GT|GTE|LT|LTE|CONTAINS → require dataColumnId + operator + string value
IS_NULL|IS_NOT_NULL          → require dataColumnId + operator and forbid value
```

Sort requires `dataColumnId + ASC|DESC`. The `8/3/100` maxima are transport-safety mechanics, not Product semantics.

- [ ] **Step 6: Define row response and every nested type explicitly**

`ProjectDataExplorerRowPage` is closed and requires:

```text
observedAt              date-time
columns[]               ProjectDataExplorerGridColumn
rows[]                  ProjectDataExplorerRow, max 100
continuationToken?      opaque request-scope-bound string
approximateTotal?       integer >= 0; never required
```

`ProjectDataExplorerGridColumn` is closed and requires:

```text
dataColumnId
name                    physical column name
sourceType              source-native/logical type presentation
semanticFieldId?        optional coordinate into PRJ-19 semantic truth
```

`ProjectDataExplorerRow` is closed and requires only `cells[]`; no arbitrary row object keys are admitted.

`ProjectDataExplorerCell` is closed and requires:

```text
dataColumnId
valueKind = NULL|TEXT|NUMBER|BOOLEAN|TEMPORAL|JSON|BINARY
displayValue = string|null
truncated = boolean
byteLength? = integer >= 0
```

This avoids `additionalProperties: true`, binary-download authority, and JS-number precision assumptions. `truncated=true` is explicitly incomplete.

- [ ] **Step 7: Preserve dependency truth**

Use normal 401/403/404/422 Problems. Add inline `503` Problem for an admitted source/object whose backing dependency cannot serve the read; never encode dependency failure as `200 []`.

- [ ] **Step 8: Prove wire shape**

```bash
npm run wire:lint
npm run wire:bundle
npm run wire:bijection
node --test tests/repository/4c-p02-f22-data-explorer.test.mjs
```

Expected: OAS valid; bijection `121↔121`; focused test remains RED only because checker integration is not yet present.

- [ ] **Step 9: Commit**

```bash
git add contracts/api/product/openapi.yaml contracts/api/product/project-paths.yaml
git commit -m "docs(4b): realize F22 data explorer wire"
```

---

### Task 4: Add one focused F22 checker with firing negative controls

**Files:**
- Create: `scripts/check-wire-project-data-explorer.mjs`
- Modify: `package.json`
- Test: `tests/repository/4c-p02-f22-data-explorer.test.mjs`

**Interfaces:**
- Consumes `/tmp/conexus-product-openapi.bundle.json`.
- Produces canonical F22 schema/boundary validation under existing `wire:project` only.

- [ ] **Step 1: Implement the checker as a pure validator plus canonical entrypoint**

Use concrete helpers like these:

```js
import fs from 'node:fs'

const methods = new Set(['get','put','post','delete','patch','head','options','trace'])
const bundlePath = process.env.CONEXUS_PRODUCT_BUNDLE ?? '/tmp/conexus-product-openapi.bundle.json'
const canonical = JSON.parse(fs.readFileSync(bundlePath, 'utf8'))

const fail = message => { throw new Error(`F22 Data Explorer: ${message}`) }

function resolveLocal(oas, value) {
  if (!value?.$ref?.startsWith('#/')) return value
  return value.$ref.slice(2).split('/').map(x => x.replaceAll('~1','/').replaceAll('~0','~')).reduce((n,k) => n?.[k], oas)
}
function resolveSchema(oas, schema) {
  let current = schema
  const seen = new Set()
  while (current?.$ref?.startsWith('#/')) {
    if (seen.has(current.$ref)) fail(`schema cycle ${current.$ref}`)
    seen.add(current.$ref)
    current = resolveLocal(oas, current)
  }
  return current
}
function operations(oas) {
  const out = new Map()
  for (const [path, item] of Object.entries(oas.paths ?? {})) for (const [method, operation] of Object.entries(item ?? {})) {
    if (!methods.has(method)) continue
    if (operation?.['x-conexus-4a-id']) out.set(operation['x-conexus-4a-id'], { path, method, operation })
  }
  return out
}
function operation(oas, id) {
  const found = operations(oas).get(id)
  if (!found) fail(`missing ${id}`)
  return found
}
function success(oas, id) {
  return resolveSchema(oas, operation(oas,id).operation.responses?.['200']?.content?.['application/json']?.schema)
}
function request(oas, id) {
  return resolveSchema(oas, operation(oas,id).operation.requestBody?.content?.['application/json']?.schema)
}
function closed(oas, schema, label) {
  const s = resolveSchema(oas, schema)
  if (s?.type !== 'object' || s.additionalProperties !== false) fail(`${label} must be closed`)
  return s
}
function exactEnum(schema, expected, label) {
  const actual = [...(schema?.enum ?? [])].sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`${label} enum drift`)
}
function forbidProperties(schema, names, label) {
  for (const name of names) if (schema?.properties?.[name]) fail(`${label} cannot expose ${name}`)
}
```

Implement `validateDataExplorer(oas)` with exact assertions:

```js
export function validateDataExplorer(oas) {
  const selected = new Map([
    ['PRJ-25', ['get','ListProjectDataExplorerSources']],
    ['PRJ-26', ['get','ListProjectDataExplorerObjects']],
    ['PRJ-27', ['get','GetProjectDataExplorerObject']],
    ['PRJ-28', ['post','ListProjectDataExplorerRows']],
  ])
  for (const [id,[method,operationId]] of selected) {
    const found = operation(oas,id)
    if (found.method !== method) fail(`${id} method must be ${method}`)
    if (found.operation.operationId !== operationId) fail(`${id} operationId drift`)
    if (found.operation['x-conexus-current-state-carrier'] !== 'NONE') fail(`${id} carrier must be NONE`)
  }

  const sourceList = success(oas,'PRJ-25')
  if (sourceList?.type !== 'array') fail('PRJ-25 must return source array')
  const source = closed(oas, sourceList.items, 'ProjectDataExplorerSource')
  exactEnum(source.properties?.sourceClass, ['INTERNAL','INTEGRATION'], 'sourceClass')

  const objectPage = closed(oas, success(oas,'PRJ-26'), 'ProjectDataExplorerObjectPage')
  const summary = closed(oas, resolveSchema(oas, objectPage.properties?.items)?.items, 'ProjectDataExplorerObjectSummary')
  exactEnum(summary.properties?.kind, ['TABLE','VIEW','DATASET'], 'object kind')

  const detail = closed(oas, success(oas,'PRJ-27'), 'ProjectDataExplorerObject')
  for (const field of ['columns','relationships','constraints','rowReadAvailability']) if (!detail.properties?.[field]) fail(`object missing ${field}`)

  const rowRequest = closed(oas, request(oas,'PRJ-28'), 'ProjectDataExplorerRowsRequest')
  forbidProperties(rowRequest, ['sql','where','expression','connectionId','connectionRevisionId','environment','targetUrl','credential','password'], 'row request')
  const filters = resolveSchema(oas, rowRequest.properties?.filters)
  if (filters?.type !== 'array' || filters.maxItems !== 8) fail('filters must be bounded at 8')
  const filter = resolveSchema(oas, filters.items)
  if (!Array.isArray(filter?.oneOf) || filter.oneOf.length !== 2) fail('filter must be value/null closed union')
  const operatorEnums = filter.oneOf.flatMap(branch => resolveSchema(oas, branch)?.properties?.operator?.enum ?? [])
  if (operatorEnums.some(x => /SQL|WHERE|EXPR|JOIN/i.test(x))) fail('filter operator escaped bounded grammar')

  const page = closed(oas, success(oas,'PRJ-28'), 'ProjectDataExplorerRowPage')
  const rows = resolveSchema(oas, page.properties?.rows)
  if (rows?.type !== 'array' || rows.maxItems !== 100) fail('rows must be bounded at 100')
  const row = closed(oas, rows.items, 'ProjectDataExplorerRow')
  const cells = resolveSchema(oas, row.properties?.cells)
  const cell = closed(oas, cells?.items, 'ProjectDataExplorerCell')
  for (const field of ['dataColumnId','valueKind','displayValue','truncated']) if (!(cell.required ?? []).includes(field)) fail(`cell must require ${field}`)

  for (const [path,item] of Object.entries(oas.paths ?? {})) {
    if (!path.includes('/data-explorer/')) continue
    for (const method of ['put','patch','delete']) if (item?.[method]) fail(`${method.toUpperCase()} forbidden under Data Explorer`)
    if (item?.post && item.post['x-conexus-4a-id'] !== 'PRJ-28') fail('only PRJ-28 semantic read may use POST')
  }
}
```

- [ ] **Step 2: Add negative controls that mutate the bundle and must fire**

```js
validateDataExplorer(canonical)
function expectReject(label, mutate) {
  const candidate = structuredClone(canonical)
  mutate(candidate)
  try { validateDataExplorer(candidate) }
  catch { console.log(`negative control fired: ${label}`); return }
  throw new Error(`negative control failed: ${label}`)
}

expectReject('SQL text rejected', oas => {
  request(oas,'PRJ-28').properties.sql = { type: 'string' }
})
expectReject('Connection revision selection rejected', oas => {
  request(oas,'PRJ-28').properties.connectionRevisionId = { type: 'string' }
})
expectReject('DERIVED physical source rejected', oas => {
  const list = success(oas,'PRJ-25')
  resolveSchema(oas,list.items).properties.sourceClass.enum.push('DERIVED')
})
expectReject('SQL filter operator rejected', oas => {
  const filters = resolveSchema(oas, request(oas,'PRJ-28').properties.filters)
  resolveSchema(oas,filters.items).oneOf[0].properties.operator.enum.push('SQL')
})
expectReject('dynamic row DTO rejected', oas => {
  const page = success(oas,'PRJ-28')
  const rows = resolveSchema(oas,page.properties.rows)
  resolveSchema(oas,rows.items).additionalProperties = true
})
expectReject('truncation truth required', oas => {
  const page = success(oas,'PRJ-28')
  const rows = resolveSchema(oas,page.properties.rows)
  const row = resolveSchema(oas,rows.items)
  const cells = resolveSchema(oas,row.properties.cells)
  resolveSchema(oas,cells.items).required = resolveSchema(oas,cells.items).required.filter(x => x !== 'truncated')
})
expectReject('DELETE forbidden', oas => {
  const path = operation(oas,'PRJ-27').path
  oas.paths[path].delete = { operationId: 'DeleteProjectDataObject', responses: { '204': { description: 'forbidden' } } }
})
console.log('Project F22 Data Explorer closure passed (4 bounded reads; no SQL/write/credential authority).')
```

- [ ] **Step 3: Compose under existing `wire:project`**

```json
"wire:project": "node scripts/check-wire-project.mjs && node scripts/check-wire-project-agent-catalog.mjs && node scripts/check-wire-project-data-explorer.mjs"
```

- [ ] **Step 4: Run focused proof**

```bash
npm run wire:bundle
npm run wire:project
node --test tests/repository/4c-p02-f22-data-explorer.test.mjs
```

Expected: Project=27; canonical F22 PASS; all seven negative controls fire; focused repository test passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-wire-project-data-explorer.mjs package.json tests/repository/4c-p02-f22-data-explorer.test.mjs
git commit -m "test(4b): prove F22 data explorer boundary"
```

---

### Task 5: Close the whole-wire candidate and independent challenge

**Files:**
- Create: `docs/evidence/4c/p02-f22-data-explorer-recompile-proof.md`

**Interfaces:**
- Produces a green, independently challenged F22 authority candidate before P8 is revised.

- [ ] **Step 1: Run full gate**

```bash
npm ci
npm run verify
```

Expected:

```text
all repository tests green
4A↔OAS = 121↔121
Project=27; Builder=17; Brain=12; Connections=9; Permissions=25
generated projection/no-parallel-DTO = 121 + existing consumers + real Kubb probe
Technical Ingress=3 / Product impact 0
whole 4B adversarial/executable = PASS
```

Do not fix unrelated existing Redocly warnings.

- [ ] **Step 2: Write bounded proof from actual evidence**

Record exact selected IDs, Permission result, RED HEAD/run, GREEN candidate HEAD/run, 121↔121, Project=27, negative controls, unchanged owners/records/TI. Copy real run numbers/SHAs from GitHub; never guess them.

- [ ] **Step 3: Run canonical isolated Fable review on exact candidate HEAD**

Challenge exactly: cross-Project/Workspace disclosure; `hub_control`/Mastra/Keycloak exposure; honesty of `project.data.read`; binding eligibility vs generic Connection disclosure; SQL/expression escape; page-token scope; sensitive raw data; physical/semantic duplicate authority; generic framework overreach.

- [ ] **Step 4: Adjudicate review**

Defects against approved F22 may be fixed and reverified. Proposals for SQL/admin/masking/framework authority do not enter silently. Any unresolved material finding blocks Task 6.

- [ ] **Step 5: Commit proof after review disposition**

```bash
git add docs/evidence/4c/p02-f22-data-explorer-recompile-proof.md
git commit -m "docs(4c): close F22 data explorer recompile proof"
```

---

### Task 6: Select revised Data P8 RED in the existing guard

**Files:**
- Modify: `tests/repository/4c-p02-functional-wireframe.test.mjs`

**Interfaces:**
- Replaces only the superseded Data assertion; Capabilities/Integrations/Brain/global P8 guards remain.

- [ ] **Step 1: Replace “no physical explorer” with read-only explorer requirements**

Require tokens/IDs/behaviors equivalent to:

```js
for (const token of [
  'Project Database','Sankhya ERP','TGFCAB','TGFITE','TGFPAR',
  'Data','Structure','Relationships','Rules','physical identity','semantic meaning',
  '50 rows loaded','truncated','SQL Editor = FORBIDDEN','INSERT / UPDATE / DELETE = FORBIDDEN',
]) requireText(html, token)
for (const id of [
  'data-source-tree','data-object-search','data-object-tabs','data-grid',
  'data-structure','data-relationships','data-rules','data-filter-builder',
  'data-sort-control','data-column-picker','data-row-inspector','data-next-page',
]) requireText(html, `id="${id}"`, id)
for (const behavior of [
  'openDataObject','searchDataObjects','selectDataObjectTab','applyExplorerFilter',
  'applyExplorerSort','toggleExplorerColumn','openRowInspector','nextExplorerPage',
]) requireText(html, behavior, behavior)
assert.doesNotMatch(html, /<button[^>]*>\s*(Execute Query|Insert|Update|Delete|Create table|Alter table)\s*<\/button>/i)
```

- [ ] **Step 2: Prove focused RED**

```bash
node --test tests/repository/4c-p02-functional-wireframe.test.mjs
```

Expected: revised Data assertions fail; existing Capabilities/Integrations/Brain and no-network/accessibility assertions remain green.

- [ ] **Step 3: Commit**

```bash
git add tests/repository/4c-p02-functional-wireframe.test.mjs
git commit -m "test(4c): select F22 Data Explorer P8"
```

---

### Task 7: Revise Data P8 into the functional explorer

**Files:**
- Modify: `docs/evidence/4c/p02-project-resources-functional-wireframe.html`
- Test: `tests/repository/4c-p02-functional-wireframe.test.mjs`

**Interfaces:**
- Consumes F22 physical explorer authority plus existing PRJ-18/19 semantic augmentation.
- Produces fixture-only operator candidate; no Product network calls and no P8 lock.

- [ ] **Step 1: Preserve shell and the other three P-02 routes**

Do not redesign Capabilities, Integrations, Brain, GF-01 rail/topbar, responsive shell, Escape/focus behavior, or their existing fixture semantics.

- [ ] **Step 2: Build physical source tree**

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

`Derived` is an object badge/meaning, never a fake source.

- [ ] **Step 3: Add local multi-object tabs with Data default**

Each opened object gets `Data | Structure | Relationships | Rules`. Data grid is primary. Structure shows physical columns/types/nullability/keys plus semantic labels; Relationships opens another authorized fixture object tab; Rules visually separates source constraints from governed business rules.

- [ ] **Step 4: Add clearly fake-but-realistic rows**

Use fixture-only data such as:

```text
NUNOTA | CODPARC | DTNEG      | VLRNOTA  | TIPMOV | STATUSNOTA
184921 | 2188    | 2026-08-24 | 16900.00 | V      | L
184922 | 3220    | 2026-08-24 | 8450.00  | V      | L
```

Never imply these are live Metal Nobre/Sankhya records.

- [ ] **Step 5: Implement bounded local exploration controls**

Filter builder uses disclosed column + approved operator + value controls, never expression text. Sort uses disclosed columns/directions. Column visibility is local UI state.

- [ ] **Step 6: Implement pagination/material states**

Show `50 rows loaded · Next →` without mandatory total count. `nextExplorerPage()` swaps local fixture pages and observed-at/status. Inspectable states: loading, empty, denied/non-disclosable, source unavailable, row read unavailable, stale/invalid continuation.

- [ ] **Step 7: Implement Row Inspector and truncation truth**

Clicking a loaded row opens a read-only drawer with field/value, human meaning, and relationship navigation. Include one JSON/BINARY/large-text cell explicitly marked preview/truncated; no hidden full value or download.

- [ ] **Step 8: Keep Analyze semantic**

Preserve BRN-13→BRN-12 Analyze as a separate governed semantic workflow; never relabel it SQL/query editor.

- [ ] **Step 9: Prove P8 then aggregate**

```bash
node --test tests/repository/4c-p02-functional-wireframe.test.mjs
npm ci
npm run verify
```

Expected: all P8 tests green; 121↔121; Project=27; generated projection/Kubb and whole-4B proofs green.

- [ ] **Step 10: Commit**

```bash
git add docs/evidence/4c/p02-project-resources-functional-wireframe.html
git commit -m "docs(4c): revise P02 Data into read-only explorer"
```

---

### Task 8: Project current state and hand back exact P8

**Files:**
- Modify: `docs/evidence/4c/p02-f22-data-explorer-design.md`
- Modify: `docs/evidence/4c/p02-p8-feedback-revision.md`
- Modify: `docs/evidence/4c/p02-f22-data-explorer-recompile-proof.md`
- Modify: `docs/roadmap.md`
- Update: PR #57 body metadata only.

**Interfaces:**
- Produces current-state projection + operator walkthrough; no P8 lock or merge.

- [ ] **Step 1: Project approved design/realization links without rewriting history**

F22 design records operator approval and links this plan/proof. F20/F21 remain historical accepted truth with an explicit later-F22 supersession note only.

- [ ] **Step 2: Compact roadmap to current truth**

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

Replace obsolete current status; do not append a new historical log. Preserve bootstrap margin.

- [ ] **Step 3: Verify exact final branch HEAD after all file changes**

```bash
npm ci
npm run verify
```

Fetch the exact GitHub Verify job log for that final HEAD. Confirm: all repository tests green, 121↔121, Project=27, F22 checker + negative controls, generated projection/Kubb PASS, whole-4B executable PASS.

- [ ] **Step 4: Sync PR metadata only**

PR body states exact final HEAD/run, F22 four-read result, 121↔121, Project=27, Permissions=25, revised P8 candidate, and next action = operator walkthrough. Keep Draft/open/unmerged.

- [ ] **Step 5: Hand the exact verified HTML to the operator**

Fetch the final wireframe blob from the verified HEAD, create an exact chat-local copy, verify Git blob SHA, and return it for walkthrough. Ask for `Aprovado` or bounded feedback only; do not execute P9/P10 or merge without a later explicit authorization.
