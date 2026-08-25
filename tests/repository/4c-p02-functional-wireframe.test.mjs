import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')
const htmlPath = 'docs/evidence/4c/p02-project-resources-functional-wireframe.html'
const ledger = read('docs/product/operation-ledger.md')
const projectOas = read('contracts/api/product/project-paths.yaml')
const explorerOas = read('contracts/api/product/project-data-explorer-paths.yaml')
const brainContextOas = read('contracts/api/product/project-brain-context-paths.yaml')
const p7 = read('docs/evidence/4c/p02-structural-hypotheses.md')
const f23 = read('docs/evidence/4c/p02-f23-project-brain-context-design.md')

function requireText(text, needle, message = needle) {
  assert.ok(text.includes(needle), `P-02 P8 missing: ${message}`)
}

test('P-02 P8 preserves four focused Project routes as one coherent Project product model', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'P-02 functional P8 HTML must exist')
  const html = read(htmlPath)
  for (const token of [
    'P-02 P8','F22 + F23','FUNCTIONAL LOW-FI CANDIDATE','NOT LOCKED','fixture-only','GF-01 shell inherited',
    'Four focused Project routes','Data = facts','Brain = meaning','Capabilities = behavior','Integrations = external systems',
    'generic Project Resources hub as new Product ontology = REJECTED',
    'backend owner/revision/binding console as root UX = REJECTED',
    'cross-route relationships require exact server-owned coordinates',
  ]) requireText(html, token)
  for (const id of ['workspaceCrumb','projectCrumb','projectRail','route-data','route-capabilities','route-integrations','route-brain','route-stage']) requireText(html, `id="${id}"`, id)
  for (const behavior of ['selectProjectRoute','renderData','renderCapabilities','renderIntegrations','renderBrain']) requireText(html, behavior, behavior)
  assert.doesNotMatch(html, />Resources<\/button>|id="route-resources"|generic-resource-hub/i, 'P8 must not invent a Project Resources destination')
})

test('P-02 Data opens authorized physical tabular data and keeps semantic meaning complementary', () => {
  const html = read(htmlPath)
  for (const token of [
    'PRJ-S11','PRJ-S12','PRJ-18','PRJ-19','PRJ-25','PRJ-26','PRJ-27','PRJ-28','BRN-13','BRN-12',
    'Project Database','Sankhya ERP','TGFCAB','TGFITE','TGFPAR',
    'Data','Structure','Relationships','Rules','physical identity','semantic meaning',
    '50 rows loaded','truncated','SQL Editor = FORBIDDEN','INSERT / UPDATE / DELETE = FORBIDDEN',
    'Analyze','server-admitted semantic choices','physical source != semantic Data Resource',
  ]) requireText(html, token)
  for (const id of [
    'data-source-tree','data-object-search','data-object-tabs','data-grid',
    'data-structure','data-relationships','data-rules','data-filter-builder',
    'data-sort-control','data-column-picker','data-row-inspector','data-next-page',
    'open-analyze','analyze-panel','analytic-dataset','analytic-semantics','run-analytic','analytic-result','data-scenario',
  ]) requireText(html, `id="${id}"`, id)
  for (const behavior of [
    'openDataObject','searchDataObjects','selectDataObjectTab','applyExplorerFilter',
    'applyExplorerSort','toggleExplorerColumn','openRowInspector','nextExplorerPage',
    'openAnalyze','closeAnalyze','renderAnalyticCatalog','runAnalyticQuery','applyDataScenario',
  ]) requireText(html, behavior, behavior)
  for (const token of ['4C-F22','PRJ-25','PRJ-26','PRJ-27','PRJ-28']) requireText(ledger + explorerOas, token, token)
  for (const token of ['ProjectDataExplorerSource','ProjectDataExplorerObject','ProjectDataExplorerFilter','ProjectDataExplorerRowPage','INTERNAL','INTEGRATION','TABLE','VIEW','DATASET']) requireText(explorerOas, token, token)
  assert.doesNotMatch(html, /<button[^>]*>\s*(Execute Query|Insert|Update|Delete|Create table|Alter table)\s*<\/button>/i, 'Data Explorer P8 must stay read-only')
  assert.doesNotMatch(html, /<textarea[^>]*(sql|query)|id="sql-editor"/i, 'Data Explorer P8 must not add a SQL editor')
})

test('P-02 Capabilities is human-contract-first and never invents generic execution authority', () => {
  const html = read(htmlPath)
  for (const token of [
    'PRJ-S13','PRJ-16','PRJ-17','QUERY','ACTION','INTEGRATION','inspection only',
    'What it does','Inputs','Outputs','Technical details','human capability name',
    'generic capability Run/Execute control = FORBIDDEN',
  ]) requireText(html, token)
  for (const id of ['capability-groups','capability-detail']) requireText(html, `id="${id}"`, id)
  requireText(html, 'selectCapability', 'capability detail behavior')
  for (const token of ['4C-F21','ProjectCapabilityField','name','purpose','inputs','outputs']) requireText(ledger + projectOas, token, token)
  requireText(projectOas, 'enum: [QUERY, ACTION, INTEGRATION]', 'finite capability regimes')
  assert.equal(/\/capabilities\/{capabilityId}\/commands\/(run|execute)/i.test(projectOas), false, 'F21 must not add a generic capability executor path')
  assert.doesNotMatch(html, /<button[^>]*>\s*(Run|Execute)\s*<\/button>/i, 'Capabilities P8 must not expose generic Run/Execute')
})

test('P-02 Integrations is system-use-first while Connection lifecycle stays secondary', () => {
  const html = read(htmlPath)
  for (const token of [
    'PRJ-S14','PRJ-S15','PRJ-13','PRJ-14','PRJ-15','CON-03','Used by this Project',
    'Systems used by this Project','Use connection','Switch connection','Connections owned by this Project',
    'Current connection','Switch to','Confirm switch','purpose-bound exact-Project chooser',
    'ProjectConnectionBinding != Connection','connection.use -X-&gt; generic connection.read',
    'configured != qualified != bound != healthy','selection disclosure != Connection management authority',
  ]) requireText(html, token)
  for (const id of ['project-bindings','binding-chooser','binding-current','binding-candidates','binding-status','project-connections']) requireText(html, `id="${id}"`, id)
  for (const behavior of ['openBindingChooser','closeBindingChooser','selectBindingCandidate','saveProjectBinding','removeProjectBinding','toggleProjectConnections']) requireText(html, behavior, behavior)
  assert.equal(html.includes('>Add binding<'), false, 'internal binding vocabulary must not be the primary CTA')
})

test('P-02 Brain defaults to Project Brain Context and keeps binding administration secondary', () => {
  const html = read(htmlPath)
  for (const token of [
    'PRJ-S19','BRN-14','PRJ-10','PRJ-11','PRJ-12','BRN-02',
    'Brain available to this Project','Knowledge used by this Project','Domains','Concepts','Business rules','Caveats','Evidence requirements',
    'Binding administration','Open Workspace Brain','Project Brain Context != Workspace Brain publication',
    'Project Brain Context != runtime effectiveBrainSlice','brain.bind -X-&gt; generic brain.read',
    'cross-route relationships require exact server-owned coordinates',
  ]) requireText(html, token)
  for (const id of [
    'brain-context','brain-context-summary','brain-domain-list','brain-concept-detail','brain-context-status',
    'brain-binding-admin','brain-current','brain-revision-chooser','brain-revisions','brain-binding-status','workspace-brain-boundary',
  ]) requireText(html, `id="${id}"`, id)
  for (const behavior of [
    'renderBrainContext','selectBrainConcept','toggleBrainBindingAdmin',
    'openBrainRevisionChooser','closeBrainRevisionChooser','selectBrainRevision','saveBrainBinding','clearBrainBinding',
  ]) requireText(html, behavior, behavior)
  for (const token of ['4C-F23','BRN-14','GetProjectBrainContext','brain.read + project.read']) requireText(ledger + brainContextOas + p7 + f23, token, token)
  assert.doesNotMatch(html, /effectiveBrainSliceDigest|healthSnapshotDigest|ToolProjection|Publish Brain|Approve proposal/i, 'Project Brain route must not masquerade as runtime slice or Workspace publication authority')
})

test('P-02 P8 stays self-contained, responsive, accessible and explicit about material states', () => {
  const html = read(htmlPath)
  for (const token of [
    'loading != known-empty != denied != absent/non-disclosable != dependency failure',
    'freshness unknown != fresh','coverage partial != complete',
    'no binding != no eligible Connection != denied disclosure',
    'no Brain binding != denied knowledge access != Project Brain Context unavailable',
    'P8 WALKTHROUGH FIXTURES','@media','aria-live="polite"','keydown','returnFocusTo',
  ]) requireText(html, token)
  assert.match(html, /event\.key\s*===\s*'Escape'/, 'Escape must close the active chooser/panel')
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i, 'P8 must not network or persist fixture state')
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i, 'P8 must be self-contained')
  assert.doesNotMatch(html, /P-02\s*=\s*LOCKED|P8\s*=\s*LOCKED/i, 'P8 candidate must not pre-authorize lock')
})
