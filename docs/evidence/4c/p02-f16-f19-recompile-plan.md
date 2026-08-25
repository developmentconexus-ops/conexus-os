# P-02 F16–F19 bounded 4A/4B recompile plan

> **For agentic workers:** REQUIRED SUB-SKILL: use the repository-approved TDD / execution workflow task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Recompile the operator-approved P-02 `F16..F19` authority correction into 4A Product authority and the canonical 4B Product wire, proving `117↔117` without adding a Permission, owner, durable record, generic resource framework, SQL console, natural-language analytics regime or Product implementation.

**Architecture:** Preserve the current owners and operation families. F16/F17/F18 enrich existing Project/Connections/Brain reads; only F19 adds one fixed Brain Product read (`BRN-13 GetProjectAnalyticQueryCatalog`). The work lands as sequential RED→GREEN slices and closes with the existing whole-wire, deterministic projection and real Kubb proof stack.

**Tech Stack:** Node.js `>=24.18.0`; Node test runner; OpenAPI 3.1.2; Redocly CLI `2.47.0`; AJV CLI `5.0.0`; Kubb `5.0.0`; TypeScript `7.0.2`; Markdown authority/evidence.

**Spec:** `docs/evidence/4c/p02-f16-f19-selected-correction-contract.md`

## Global constraints

- Start from exact current branch `agent/4c-frontend-interaction`; revalidate PR #57, `main`, branch HEAD and CI before each material gate.
- Repository current authority beats this plan if a later accepted commit changes the subject.
- Product implementation remains BLOCKED; this plan changes only planning authority, contract wire, executable contract guards and Evidence.
- Preserve all LOCKED `GF-01`, `W-01`, `W-02A`, `W-02B`, `W-03`, `W-04`, `P-01` artifacts/contracts.
- `F16`: no new operation, Permission, owner or record; `name` is required server-owned presentation only.
- `F17`: no `ListBindableConnections`; `connection.use` never becomes generic `connection.read`; alternate `CON-03` selection disclosure is exact-Project-context and requires `project.manage + connection.use`.
- `F18`: no `ListBindableBrainRevisions`; `brain.bind` never becomes generic `brain.read`; alternate `BRN-02` disclosure is exact-Project-context, summary-only and requires `project.manage + brain.bind`.
- `F19`: add exactly one operation, `BRN-13 GetProjectAnalyticQueryCatalog`, under `brain.read + project.data.read`; no SQL, physical topology, semantic-search family, natural-language planner or new semantic owner.
- Final census must be `N_platform=117`, `Brain=12`, Product OAS `117`, ordinary Permissions `25`, owners unchanged, durable records unchanged.
- Keep the bootstrap set `AGENTS.md + docs/index.md + docs/roadmap.md <= 20480 bytes`; route detail into Evidence rather than inflating `roadmap.md`.
- Do not open P7/P8 until full `npm ci && npm run verify` is GREEN on the exact closure HEAD.
- Do not merge PR #57 without a later explicit operator merge authorization.

---

### Task 1: Open the selected recompile and prove F16 RED→GREEN

**Files:**
- Create: `tests/repository/4c-p02-f16-data-human-identity.test.mjs`
- Modify: `docs/roadmap.md`
- Modify: `docs/product/operation-ledger.md`
- Modify: `contracts/api/product/project-paths.yaml`
- Modify: `scripts/check-wire-project.mjs`
- Modify: `docs/evidence/4b/project-schema-closure.md`

**Interfaces:**
- Consumes: selected F16 contract: `ProjectDataResourceSummary` and `ProjectDataResource` require server-owned nonblank `name`; `dataResourceId` remains machine identity.
- Produces: F16-green Project/Data Product+wire projection consumed by P-02 Data browse; Project operation count remains 23.

- [ ] **Step 1: Move roadmap from spec-review gate to selected-recompile gate without changing current census.**

Use compact status equivalent to:

```text
P-02 = OPEN / F16-F19 OPERATOR APPROVED / 4A+4B RECOMPILE ACTIVE / P7 BLOCKED / P8 BLOCKED
current wire = 116↔116 until whole recompile GREEN
```

Keep the exact-next-action at the selected RED/recompile, not P7/P8.

- [ ] **Step 2: Write the F16 repository test before changing 4A/4B.**

Create `tests/repository/4c-p02-f16-data-human-identity.test.mjs` with this behavior:

```js
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('F16 makes Project Data resources human-recognizable without changing resource identity or adding Product operations', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const wire = read('contracts/api/product/project-paths.yaml')

  for (const token of ['4C-F16', 'PRJ-18', 'PRJ-19', 'dataResourceId', 'name = presentation only']) {
    assert.ok(ledger.includes(token), `operation ledger missing F16 token: ${token}`)
  }

  for (const schema of ['ProjectDataResourceSummary:', 'ProjectDataResource:']) {
    const start = wire.indexOf(schema)
    assert.ok(start >= 0, `wire missing ${schema}`)
    const slice = wire.slice(start, start + 1400)
    assert.match(slice, /required:\s*\[[^\]]*dataResourceId[^\]]*name[^\]]*\]/, `${schema} must require dataResourceId + name`)
    assert.match(slice, /name:\s*\n\s*type: string\s*\n\s*minLength: 1/, `${schema} must expose nonblank name`)
  }

  assert.doesNotMatch(wire, /physicalTable|connectionString|rawSql|genericMetadata/, 'F16 must not create physical DB or generic metadata authority')
  assert.ok(ledger.includes('N_platform = 116'), 'F16 alone must not change the fixed-operation census before F19')
})
```

- [ ] **Step 3: Run the F16 test and capture the expected RED.**

Run:

```bash
node --test tests/repository/4c-p02-f16-data-human-identity.test.mjs
```

Expected: exactly this new test fails because `4C-F16` / required `name` is absent from current 4A/4B.

- [ ] **Step 4: Recompile F16 into 4A Product authority.**

In `docs/product/operation-ledger.md`, add a bounded `4C-F16` subsection that states:

```text
PRJ-18 / PRJ-19
→ server-owned required nonblank Data resource name
→ dataResourceId remains exact machine identity
→ name = presentation only
→ name -X-> routing / authorization / containment / uniqueness authority
→ no operation / Permission / owner / record count change
```

Do not change `N_platform=116` yet.

- [ ] **Step 5: Recompile F16 into Project wire.**

In `contracts/api/product/project-paths.yaml`, change the two schemas to the exact shape:

```yaml
ProjectDataResourceSummary:
  type: object
  additionalProperties: false
  required: [dataResourceId, name]
  properties:
    dataResourceId:
      type: string
      minLength: 1
    name:
      type: string
      minLength: 1
      pattern: '.*\S.*'
      description: Server-owned human presentation identity of the declared Project Data resource; never routing, authorization, containment or uniqueness authority.
```

and require the same `name` on `ProjectDataResource` while preserving its existing `grain`, `freshness`, `coverage`, `provenance` properties.

- [ ] **Step 6: Strengthen `scripts/check-wire-project.mjs` for F16.**

Add a helper/assertion equivalent to:

```js
function assertPresentationName(schema, label) {
  const resolved = assertClosedObject(schema, label)
  if (!requiredFields(resolved).has('name')) throw new Error(`${label} must require human presentation name`)
  const name = propertySchema(resolved, 'name')
  if (name?.type !== 'string' || (name.minLength ?? 0) < 1 || typeof name.pattern !== 'string') {
    throw new Error(`${label} name must reject blank presentation`)
  }
}

const dataList = resolveSchema(successSchema('PRJ-18'))
assertPresentationName(resolveSchema(dataList?.items), 'PRJ-18 ProjectDataResourceSummary')
assertPresentationName(successSchema('PRJ-19'), 'PRJ-19 ProjectDataResource')
```

Keep the existing physical-DB negative checks.

- [ ] **Step 7: Update Project 4B Evidence with the F16 bounded recompile and run targeted GREEN.**

Append F16 chronology/semantics to `docs/evidence/4b/project-schema-closure.md`, preserving historical counts as historical.

Run:

```bash
npm run wire:bundle
node --test tests/repository/4c-p02-f16-data-human-identity.test.mjs
npm run wire:project
```

Expected: F16 test GREEN; Project checker GREEN; Project count still 23.

- [ ] **Step 8: Commit only the F16 slice.**

```bash
git add -- docs/roadmap.md docs/product/operation-ledger.md contracts/api/product/project-paths.yaml scripts/check-wire-project.mjs docs/evidence/4b/project-schema-closure.md tests/repository/4c-p02-f16-data-human-identity.test.mjs
git commit -m "docs(4c): recompile F16 data human identity"
```

---

### Task 2: Prove F17 Project binding disclosure RED→GREEN

**Files:**
- Create: `tests/repository/4c-p02-f17-connection-binding-disclosure.test.mjs`
- Modify: `docs/product/operation-ledger.md`
- Modify: `docs/product/permission-contract.md`
- Modify: `contracts/api/product/project-paths.yaml`
- Modify: `contracts/api/product/connection-paths.yaml`
- Modify: `scripts/check-wire-project.mjs`
- Modify: `scripts/check-wire-connections.mjs`
- Modify: `docs/evidence/4b/project-schema-closure.md`
- Modify: `docs/evidence/4b/connections-schema-closure.md`

**Interfaces:**
- Consumes: existing `Connection` lightweight summary with `name`, `currentRevisionId`, `connectionTest`; existing `PRJ-14` exact qualified compatible `ConnectionRevision/environment` write.
- Produces: human-recognizable existing bindings and a purpose-bound candidate-list route without generic `connection.read` widening.

- [ ] **Step 1: Write the F17 repository test first.**

Create `tests/repository/4c-p02-f17-connection-binding-disclosure.test.mjs`:

```js
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('F17 makes Project Connection bindings selectable without granting generic Connection read authority', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const projectWire = read('contracts/api/product/project-paths.yaml')
  const connectionWire = read('contracts/api/product/connection-paths.yaml')

  for (const token of ['4C-F17', 'project.manage + connection.use', 'CON-03', 'purpose-bound', 'connectionName']) {
    assert.ok(ledger.includes(token), `operation ledger missing F17 token: ${token}`)
  }
  assert.ok(permissions.includes('connection.use -X-> generic connection.read'), 'permission contract must preserve read/use separation')
  assert.match(projectWire, /ProjectConnectionBinding:[\s\S]*required:\s*\[[^\]]*connectionName[^\]]*\]/, 'binding must require connectionName')
  assert.match(connectionWire, /name: forProjectId[\s\S]*in: query[\s\S]*required: false/, 'CON-03 must carry optional exact target Project context')
  assert.doesNotMatch(connectionWire, /ListBindableConnections/, 'F17 must not add a screen-shaped bindable-connections operation')
  assert.doesNotMatch(connectionWire, /qualificationHistory|qualificationMatrix/, 'F17 must not prebuild multi-environment qualification history')
})
```

- [ ] **Step 2: Run F17 and capture expected RED.**

```bash
node --test tests/repository/4c-p02-f17-connection-binding-disclosure.test.mjs
```

Expected: fails because `connectionName` and `forProjectId` alternate disclosure are absent.

- [ ] **Step 3: Recompile F17 Product/Permission semantics.**

Add `4C-F17` to `operation-ledger.md` with these exact laws:

```text
PRJ-13 disclosed binding gains response-time connectionName presentation
binding identity remains connectionId + connectionRevisionId + environment
CON-03 ordinary route = connection.read
CON-03 alternate Project-binding selection route = exact target Project + project.manage + connection.use
alternate route -X-> CON-04 / configuration / credentials / manage / qualify / generic connection.read
```

In `permission-contract.md`, preserve the 25-Permission census and state:

```text
connection.use -X-> generic connection.read
purpose-bound CON-03 alternate disclosure requires project.manage + connection.use + exact Project context
```

- [ ] **Step 4: Enrich `ProjectConnectionBinding` only.**

In `project-paths.yaml`, require:

```yaml
required: [connectionId, connectionRevisionId, environment, connectionName]
```

with:

```yaml
connectionName:
  type: string
  minLength: 1
  pattern: '.*\S.*'
  description: Server-composed human presentation of the referenced logical Connection for this disclosed binding; never binding identity, routing or authorization.
```

Do not add `connectionName` to PRJ-14 request input.

- [ ] **Step 5: Add the purpose-bound `CON-03` query coordinate without changing operation identity.**

On `GET /api/control/connection-scopes/{ownerScopeKind}/{ownerId}/connections`, add:

```yaml
parameters:
  - name: forProjectId
    in: query
    required: false
    description: Optional exact target Project context activating the purpose-bound Project binding-selection disclosure. Server revalidates Project containment plus project.manage + connection.use; omission uses ordinary connection.read disclosure. This never grants CON-04/configuration/credential/management/qualification authority.
    schema:
      type: string
      minLength: 1
```

Keep the success schema exactly the existing lightweight `Connection[]`.

- [ ] **Step 6: Encode the current F1 bindability law in owner checkers/Evidence, not as a new lifecycle field.**

In `scripts/check-wire-project.mjs`, require `connectionName` on `ProjectConnectionBinding` and confirm PRJ-14 request still uses only exact machine binding coordinates.

In `scripts/check-wire-connections.mjs`, require optional nonblank `forProjectId` on CON-03 and preserve that CON-03 returns lightweight `Connection` rather than `ConnectionDetail`.

Document in `connections-schema-closure.md`:

```text
UI may present currently bindable from CON-03 summary only when
connectionTest.state = PASSED
AND candidate revision = currentRevisionId
AND selected environment = connectionTest.environment
PRJ-14 revalidates final truth
```

Do not add a qualification-history schema.

- [ ] **Step 7: Run targeted F17 GREEN.**

```bash
npm run wire:bundle
node --test tests/repository/4c-p02-f17-connection-binding-disclosure.test.mjs
npm run wire:project
npm run wire:connections
```

Expected: all commands GREEN; Product operation count remains 116 at this point.

- [ ] **Step 8: Commit only F17.**

```bash
git add -- docs/product/operation-ledger.md docs/product/permission-contract.md contracts/api/product/project-paths.yaml contracts/api/product/connection-paths.yaml scripts/check-wire-project.mjs scripts/check-wire-connections.mjs docs/evidence/4b/project-schema-closure.md docs/evidence/4b/connections-schema-closure.md tests/repository/4c-p02-f17-connection-binding-disclosure.test.mjs
git commit -m "docs(4c): recompile F17 binding disclosure"
```

---

### Task 3: Prove F18 Brain binding selection disclosure RED→GREEN

**Files:**
- Create: `tests/repository/4c-p02-f18-brain-binding-disclosure.test.mjs`
- Modify: `docs/product/operation-ledger.md`
- Modify: `docs/product/permission-contract.md`
- Modify: `contracts/api/product/brain-paths.yaml`
- Modify: `scripts/check-wire-brain.mjs`
- Modify: `docs/evidence/4b/brain-schema-closure.md`

**Interfaces:**
- Consumes: existing immutable `BRN-02 BrainRevision[]` summary and existing `PRJ-11` compound binding authority.
- Produces: purpose-bound revision selection under exact Project context without granting `BRN-03 knowledgeBrowse` or generic `brain.read`.

- [ ] **Step 1: Write the F18 test first.**

Create `tests/repository/4c-p02-f18-brain-binding-disclosure.test.mjs`:

```js
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('F18 permits exact Project Brain revision selection without widening brain.bind into brain.read', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const wire = read('contracts/api/product/brain-paths.yaml')

  for (const token of ['4C-F18', 'project.manage + brain.bind', 'BRN-02', 'purpose-bound']) {
    assert.ok(ledger.includes(token), `operation ledger missing F18 token: ${token}`)
  }
  assert.ok(permissions.includes('brain.bind -X-> generic brain.read'), 'permission contract must preserve bind/read separation')
  assert.match(wire, /name: forProjectId[\s\S]*in: query[\s\S]*required: false/, 'BRN-02 must carry optional exact target Project context')
  assert.doesNotMatch(wire, /ListBindableBrainRevisions/, 'F18 must not add a screen-shaped bindable-revisions operation')
})
```

- [ ] **Step 2: Run F18 and capture expected RED.**

```bash
node --test tests/repository/4c-p02-f18-brain-binding-disclosure.test.mjs
```

Expected: fails because BRN-02 has no `forProjectId` purpose-bound selection route.

- [ ] **Step 3: Recompile F18 Product/Permission semantics.**

Add F18 law to `operation-ledger.md` and `permission-contract.md`:

```text
BRN-02 ordinary route = brain.read
BRN-02 alternate revision-selection route = exact target Project + project.manage + brain.bind
brain.bind -X-> generic brain.read
alternate BRN-02 -X-> BRN-03 knowledgeBrowse / proposals / publication / mutation
```

Keep ordinary Permissions = 25.

- [ ] **Step 4: Add the exact target Project query coordinate to BRN-02.**

On `GET /api/control/workspaces/{workspaceId}/brain/revisions`, add:

```yaml
parameters:
  - name: forProjectId
    in: query
    required: false
    description: Optional exact target Project context activating purpose-bound immutable revision selection for Project Brain binding. Server revalidates Project containment plus project.manage + brain.bind; omission uses ordinary brain.read disclosure. This route remains BrainRevision summary-only and grants no BRN-03/proposal/publication authority.
    schema:
      type: string
      minLength: 1
```

Do not change the `BrainRevision` summary schema and do not add `knowledgeBrowse` to BRN-02.

- [ ] **Step 5: Strengthen Brain checker for F18 and run GREEN.**

In `scripts/check-wire-brain.mjs`, require optional nonblank `forProjectId` on BRN-02 and retain the existing negative that `revisionSummary.properties?.knowledgeBrowse` must be absent.

Run:

```bash
npm run wire:bundle
node --test tests/repository/4c-p02-f18-brain-binding-disclosure.test.mjs
npm run wire:brain
```

Expected: all GREEN; Brain operation count still 11 until F19.

- [ ] **Step 6: Record F18 in Brain schema Evidence and commit.**

Append F18 semantics/proof to `docs/evidence/4b/brain-schema-closure.md`, preserving historical 11-operation proof as historical.

```bash
git add -- docs/product/operation-ledger.md docs/product/permission-contract.md contracts/api/product/brain-paths.yaml scripts/check-wire-brain.mjs docs/evidence/4b/brain-schema-closure.md tests/repository/4c-p02-f18-brain-binding-disclosure.test.mjs
git commit -m "docs(4c): recompile F18 brain binding disclosure"
```

---

### Task 4: Add BRN-13 and prove F19 + `117↔117` census RED→GREEN

**Files:**
- Create: `tests/repository/4c-p02-f19-analytic-query-catalog.test.mjs`
- Modify: `docs/product/operation-ledger.md`
- Modify: `docs/product/permission-contract.md`
- Modify: `docs/evidence/4a/operation-coverage.md`
- Modify: `contracts/api/product/brain-paths.yaml`
- Modify: `scripts/check-wire-brain.mjs`
- Modify: `scripts/check-wire-bijection.mjs`
- Modify: `scripts/check-wire-projections.mjs`
- Modify: `scripts/run-kubb-wire-probe.mjs`
- Modify: `scripts/run-wire-whole-4b-adversarial.mjs`
- Modify: `docs/evidence/4b/brain-schema-closure.md`

**Interfaces:**
- Consumes: exact Project context, current `ProjectBrainBinding`, canonical Brain semantic IDs, current `BRN-12` deterministic semantic-ID executor.
- Produces: `BRN-13 GetProjectAnalyticQueryCatalog` and the new fixed-platform census of 117 operations.

- [ ] **Step 1: Write F19 test before adding BRN-13.**

Create `tests/repository/4c-p02-f19-analytic-query-catalog.test.mjs`:

```js
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('F19 adds one binding-bound analytic semantic-input catalog without widening AnalyticQuery into SQL or natural-language planning', () => {
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const wire = read('contracts/api/product/brain-paths.yaml')

  for (const token of ['4C-F19', 'BRN-13', 'GetProjectAnalyticQueryCatalog', 'N_platform = 117', 'Brain — 12']) {
    assert.ok(ledger.includes(token), `operation ledger missing F19 token: ${token}`)
  }
  assert.ok(permissions.includes('BRN-13'), 'permission contract must map BRN-13')
  assert.match(wire, /\/api\/control\/projects\/\{projectId\}\/analytic-query-catalog:/, 'BRN-13 must be a Project-context Control Plane read')
  for (const token of ['x-conexus-4a-id: BRN-13', 'summary: GetProjectAnalyticQueryCatalog', 'projectBindingDigest', 'datasetSemanticId', 'selectableSemantics', 'semanticId', 'label']) {
    assert.ok(wire.includes(token), `BRN-13 wire missing ${token}`)
  }
  assert.doesNotMatch(wire, /rawSql|physicalTable|joinTopology|semanticSearch|naturalLanguageQuestion/, 'F19 must not widen the analytic regime')
})
```

- [ ] **Step 2: Run F19 and capture expected RED.**

```bash
node --test tests/repository/4c-p02-f19-analytic-query-catalog.test.mjs
```

Expected: fails because BRN-13 and 117 census do not yet exist.

- [ ] **Step 3: Add BRN-13 to 4A and update only current census projections.**

In `operation-ledger.md`:

```text
BRN-13 | GetProjectAnalyticQueryCatalog | Brain + accepted Project binding/data composition | exact Project current semantic-input disclosure for BRN-12 | read/provenance
```

Map Control Plane authority exactly to:

```text
HUMAN_ACCOUNT_SESSION / CP
brain.read + project.data.read
exact Project + current Brain binding + curated analytical admission
READ / IC0
```

Update current counts:

```text
N_platform = 117
Brain = 12
```

Do not renumber any existing operation and keep `BRN-11` absent.

In `permission-contract.md`, add BRN-13 as another consumer of the existing compound `brain.read + project.data.read`; ordinary Permissions remain exactly 25.

Update only current-count/current-closure sections of `docs/evidence/4a/operation-coverage.md`; preserve historical counts as historical Evidence.

- [ ] **Step 4: Add exact BRN-13 wire.**

In `brain-paths.yaml`, add:

```yaml
/api/control/projects/{projectId}/analytic-query-catalog:
  parameters:
    - $ref: '#/components/parameters/ProjectId'
  get:
    summary: GetProjectAnalyticQueryCatalog
    operationId: GetProjectAnalyticQueryCatalog
    x-conexus-4a-id: BRN-13
    x-conexus-ingress: [CONTROL_PLANE]
    x-conexus-current-state-carrier: NONE
    x-conexus-contract-state: SCHEMA_CLOSED
    responses:
      '200':
        description: Current Project-admitted semantic choices for BRN-12, derived from the exact current Project Brain binding and curated analytical admission; no SQL, physical topology or independent semantic authority is disclosed.
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ProjectAnalyticQueryCatalog'
      '401': { $ref: './openapi.yaml#/components/responses/Problem401' }
      '403': { $ref: './openapi.yaml#/components/responses/Problem403' }
      '404': { $ref: './openapi.yaml#/components/responses/Problem404' }
      '409': { $ref: './openapi.yaml#/components/responses/Problem409' }
      '503': { $ref: './openapi.yaml#/components/responses/Problem503' }
```

Add exact closed schemas:

```yaml
ProjectAnalyticQueryCatalog:
  type: object
  additionalProperties: false
  required: [projectId, brainRevisionId, brainDigest, projectBindingDigest, datasets]
  properties:
    projectId: { type: string, minLength: 1 }
    brainRevisionId: { type: string, minLength: 1 }
    brainDigest: { type: string, minLength: 1 }
    projectBindingDigest: { type: string, minLength: 1 }
    datasets:
      type: array
      items:
        $ref: '#/components/schemas/AnalyticDatasetChoice'

AnalyticDatasetChoice:
  type: object
  additionalProperties: false
  required: [datasetSemanticId, label, selectableSemantics]
  properties:
    datasetSemanticId: { type: string, minLength: 1 }
    label:
      type: string
      minLength: 1
      pattern: '.*\S.*'
    selectableSemantics:
      type: array
      minItems: 1
      items:
        $ref: '#/components/schemas/AnalyticSemanticChoice'

AnalyticSemanticChoice:
  type: object
  additionalProperties: false
  required: [semanticId, label]
  properties:
    semanticId: { type: string, minLength: 1 }
    label:
      type: string
      minLength: 1
      pattern: '.*\S.*'
```

Known-empty `datasets: []` is allowed; any returned dataset must contain at least one selectable semantic because BRN-12 requires at least one `selectSemanticId`.

- [ ] **Step 5: Extend Brain checker for BRN-13 positive and negative properties.**

Change the expected Brain IDs to:

```js
const expectedIds = [
  ...Array.from({ length: 10 }, (_, i) => `BRN-${String(i + 1).padStart(2, '0')}`),
  'BRN-12',
  'BRN-13',
]
if (expectedIds.length !== 12) throw new Error('internal Brain gate setup error')
```

Add BRN-13 assertions equivalent to:

```js
const catalog = assertClosedObject(successSchema('BRN-13'), 'BRN-13 success')
required(catalog, 'projectId', 'brainRevisionId', 'brainDigest', 'projectBindingDigest', 'datasets')
const dataset = assertClosedObject(resolveSchema(arrayProperty(catalog, 'datasets', 'BRN-13 datasets').items), 'BRN-13 dataset choice')
required(dataset, 'datasetSemanticId', 'label', 'selectableSemantics')
nonBlankStringProperty(dataset, 'datasetSemanticId', 'BRN-13 datasetSemanticId')
nonBlankStringProperty(dataset, 'label', 'BRN-13 dataset label')
const semantics = arrayProperty(dataset, 'selectableSemantics', 'BRN-13 selectableSemantics')
if ((semantics.minItems ?? 0) < 1) throw new Error('BRN-13 returned dataset must expose at least one selectable semantic')
const semantic = assertClosedObject(resolveSchema(semantics.items), 'BRN-13 semantic choice')
required(semantic, 'semanticId', 'label')
nonBlankStringProperty(semantic, 'semanticId', 'BRN-13 semanticId')
nonBlankStringProperty(semantic, 'label', 'BRN-13 semantic label')
for (const forbidden of ['sql', 'rawSql', 'physicalTable', 'schema', 'joinTopology', 'connectionId', 'naturalLanguageQuestion']) {
  if (catalog.properties?.[forbidden] || dataset.properties?.[forbidden] || semantic.properties?.[forbidden]) {
    throw new Error(`BRN-13 must not expose analytic escape field ${forbidden}`)
  }
}
```

Retain the existing BRN-12 SELECT-only and `conceptRef` noncanonical laws.

- [ ] **Step 6: Update all four active global 116-operation proof constants to 117.**

Modify exactly:

```text
scripts/check-wire-bijection.mjs
  expectedFixedOperationCount = 117

scripts/check-wire-projections.mjs
  expectedProductOperations = 117
  add GetProjectAnalyticQueryCatalog to required generated projection IDs

scripts/run-kubb-wire-probe.mjs
  expectedProductOperations = 117
  add GetProjectAnalyticQueryCatalog to required generated operation IDs

scripts/run-wire-whole-4b-adversarial.mjs
  expectedProductOperations = 117
  assert Product operationIds contains GetProjectAnalyticQueryCatalog / BRN-13
```

Do not change Technical Ingress = 3 or Budget proving operations = 2.

- [ ] **Step 7: Run F19 targeted GREEN plus census proofs.**

```bash
npm run wire:bundle
node --test tests/repository/4c-p02-f19-analytic-query-catalog.test.mjs
npm run wire:brain
npm run wire:bijection
npm run wire:projections
```

Expected: BRN-13 test GREEN; Brain 12; Product fixed census 117; deterministic projection 117; Kubb probe 117.

- [ ] **Step 8: Update Brain 4B Evidence and commit F19+census.**

Append F19 to `docs/evidence/4b/brain-schema-closure.md`, stating current closure `Brain=12` while preserving prior 11-operation runs as historical Evidence.

```bash
git add -- docs/product/operation-ledger.md docs/product/permission-contract.md docs/evidence/4a/operation-coverage.md contracts/api/product/brain-paths.yaml scripts/check-wire-brain.mjs scripts/check-wire-bijection.mjs scripts/check-wire-projections.mjs scripts/run-kubb-wire-probe.mjs scripts/run-wire-whole-4b-adversarial.mjs docs/evidence/4b/brain-schema-closure.md tests/repository/4c-p02-f19-analytic-query-catalog.test.mjs
git commit -m "docs(4c): add F19 analytic query catalog"
```

---

### Task 5: Close the bounded 4A/4B recompile and rebaseline P-02 for P7

**Files:**
- Create: `docs/evidence/4c/p02-f16-f19-recompile-proof.md`
- Modify: `docs/phases/4a-product-surface-and-authority-contract.md`
- Modify: `docs/phases/4b-executable-wire-contract.md`
- Modify: `docs/product/wire-contract.md`
- Modify: `docs/evidence/4c/p02-f16-f19-selected-correction-contract.md`
- Modify: `docs/evidence/4c/candidate-screen-surface-inventory.md`
- Modify: `docs/evidence/4c/foundation-and-coverage.md` only if its current-count projection is now stale
- Modify: `docs/roadmap.md`
- Modify: `tests/repository/4c-p02-authority-preflight-status.test.mjs`
- Create: `tests/repository/4c-p02-f16-f19-whole-recompile.test.mjs`

**Interfaces:**
- Consumes: F16/F17/F18 owner slices GREEN; F19 `BRN-13`; all fixed Product/wire proofs.
- Produces: current authority `117↔117`, P-02 `P7 NEXT/READY` with P8 still blocked, and no change to prior LOCKED blocks.

- [ ] **Step 1: Write a whole-recompile repository guard before changing closure docs/status.**

Create `tests/repository/4c-p02-f16-f19-whole-recompile.test.mjs`:

```js
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

test('operator-approved F16-F19 close as a bounded 117-operation recompile before P-02 P7', () => {
  const roadmap = read('docs/roadmap.md')
  const ledger = read('docs/product/operation-ledger.md')
  const permissions = read('docs/product/permission-contract.md')
  const wireContract = read('docs/product/wire-contract.md')

  for (const token of ['4C-F16', '4C-F17', '4C-F18', '4C-F19', 'N_platform = 117', 'Brain — 12']) {
    assert.ok(ledger.includes(token), `current Product authority missing ${token}`)
  }
  assert.ok(permissions.includes('ordinary Permissions = 25'), 'bounded correction must not add a Permission')
  assert.ok(wireContract.includes('117'), 'wire contract must project current 117-operation closure')
  assert.ok(roadmap.includes('P-02 = OPEN'), 'P-02 must remain open')
  assert.ok(roadmap.includes('P7'), 'roadmap must route next to P7 after whole-wire closure')
  assert.doesNotMatch(roadmap, /P-02\s*=\s*LOCKED|P8\s*=\s*CANDIDATE|P-03\s*=\s*OPEN|P11\s*=\s*ASSEMBLED|4D\s*=\s*OPEN/, 'whole recompile must not skip the P7/P8/operator gates')
})
```

- [ ] **Step 2: Run the whole-recompile test and capture expected RED.**

```bash
node --test tests/repository/4c-p02-f16-f19-whole-recompile.test.mjs
```

Expected: fails because closure/status docs still describe the pre-closure state.

- [ ] **Step 3: Recompile current 4A/4B human-readable authority.**

Update the current sections of:

```text
docs/phases/4a-product-surface-and-authority-contract.md
docs/phases/4b-executable-wire-contract.md
docs/product/wire-contract.md
```

to state:

```text
4C-F16..F19 bounded corrections accepted/recompiled
N_platform = 117
Product wire = 117↔117
Project = 23
Builder = 17
Brain = 12
Connections = 9
IAM = 19
OBS = 5
ordinary Permissions = 25
Technical Ingress = 3
Budget Product-count impact = 0
```

Do not rewrite historical proof numbers/counts as if they had originally been 117.

- [ ] **Step 4: Boundedly rebaseline only affected 4C coverage.**

Update `candidate-screen-surface-inventory.md` so P-02 current authority reflects:

```text
PRJ-S11 Data → server-owned Data resource name + exact detail
PRJ-S12 Analyze → BRN-13 catalog + BRN-12 deterministic execution
PRJ-S14 Integrations → recognizable bindings + purpose-bound CON-03 selection
PRJ-S15 Private Connections → unchanged W-02B lifecycle semantics
PRJ-S19 Brain → purpose-bound BRN-02 revision selection + PRJ-10/11/12 binding
Capabilities → unchanged / no upstream finding
```

Do not alter the locked P-01 or Workspace screen contracts.

Update `foundation-and-coverage.md` only if it contains a current fixed-operation count or current reachability set that is now stale; do not rewrite historical foundation Evidence merely for cosmetic consistency.

- [ ] **Step 5: Record exact recompile proof and selected-spec closure.**

Create `docs/evidence/4c/p02-f16-f19-recompile-proof.md` containing:

```text
selected spec commit
F16 RED + GREEN commit/run
F17 RED + GREEN commit/run
F18 RED + GREEN commit/run
F19 RED + GREEN commit/run
whole verify run
117↔117 census
Brain=12
Permissions=25
owners/records unchanged
bootstrap bytes
P7 next; P8 blocked
```

After the exact CI run IDs exist, write the exact immutable values; do not write guessed run numbers.

Change the selected contract status from `SPEC WRITTEN / 4A+4B RECOMPILE NOT STARTED` to a closure statement that cites the recompile proof document, without changing the approved semantics.

- [ ] **Step 6: Advance the roadmap only to P7.**

Use compact state equivalent to:

```text
4A = CLOSED / N_platform=117 / F16-F19 RECOMPILED
4B = CLOSED / 117↔117 / Brain=12 / F16-F19 RECOMPILED
P-02 = OPEN / AUTHORITY CLOSED / P7 NEXT / P8 BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
```

Keep bootstrap <= 20480 bytes.

Update `tests/repository/4c-p02-authority-preflight-status.test.mjs` so it preserves the historical preflight Evidence but now requires selected correction + whole recompile closure and forbids P8/later gates.

- [ ] **Step 7: Run targeted closure guards.**

```bash
node --test tests/repository/4c-p02-f16-f19-whole-recompile.test.mjs
node --test tests/repository/4c-p02-authority-preflight-status.test.mjs
node scripts/check-current-state.mjs
```

Expected: all GREEN; bootstrap remains within 20 KiB.

- [ ] **Step 8: Run full fresh verification on the exact closure HEAD.**

```bash
npm ci
npm run verify
```

Required success evidence:

```text
repository:check = GREEN
all repository tests = GREEN
wire lint/bundle/schema = GREEN
4A↔OAS bijection = 117 / 0 missing / 0 extra / 0 duplicate
Project checker = GREEN / 23
Brain checker = GREEN / 12
Connections checker = GREEN / 9
generated projection = 117 deterministic Product entries
Kubb real-OAS probe = 117 / TypeScript strict compile GREEN
Budget generation/truth controls = GREEN
Whole 4B adversarial proof = GREEN
```

If any failure is not the expected current slice failure, stop and root-cause it before further edits.

- [ ] **Step 9: Pin exact run/HEAD in Evidence, roadmap and Draft PR, then re-run verification if pinning changes tracked proof guards.**

If recording the run SHA/run number changes guarded docs, run the affected repository tests and then full `npm run verify` again. The final claim must cite the **post-pin exact HEAD** verification, not the pre-pin run.

- [ ] **Step 10: Commit the closure without opening P7 implementation artifacts.**

```bash
git add -- docs/phases/4a-product-surface-and-authority-contract.md docs/phases/4b-executable-wire-contract.md docs/product/wire-contract.md docs/evidence/4c/p02-f16-f19-selected-correction-contract.md docs/evidence/4c/p02-f16-f19-recompile-proof.md docs/evidence/4c/candidate-screen-surface-inventory.md docs/evidence/4c/foundation-and-coverage.md docs/roadmap.md tests/repository/4c-p02-authority-preflight-status.test.mjs tests/repository/4c-p02-f16-f19-whole-recompile.test.mjs
git commit -m "docs(4c): close P-02 F16-F19 wire recompile"
```

Do not create P7 hypothesis files or P8 HTML in this commit.

---

## Self-review checklist

- Spec coverage: F16, F17, F18, F19 each has an isolated RED→GREEN task; final whole-wire closure is separate.
- Count consistency: only F19 changes the fixed count; all active 116 constants identified in the current proof stack become 117 together.
- Type consistency: `connectionName`, `forProjectId`, `ProjectAnalyticQueryCatalog`, `AnalyticDatasetChoice`, `AnalyticSemanticChoice`, `datasetSemanticId`, `selectableSemantics`, `semanticId`, `label` use one spelling throughout.
- Authority consistency: alternate CON-03/BRN-02 disclosures require exact Project context plus the compound write authority; neither becomes generic read authority.
- YAGNI: no bindable-resource API, qualification history/matrix, Brain detail under bind, SQL, semantic search, metric/dimension framework, pagination or natural-language planner.
- Gate consistency: whole-wire GREEN advances only to P7; P8/P-03/P11/4D/Product implementation remain blocked.
- No placeholders or speculative run IDs are embedded in the plan.
