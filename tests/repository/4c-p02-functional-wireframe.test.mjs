import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')
const htmlPath = 'docs/evidence/4c/p02-project-resources-functional-wireframe.html'
const ledger = read('docs/product/operation-ledger.md')
const oas = read('contracts/api/product/project-paths.yaml')
const explorerOas = read('contracts/api/product/project-data-explorer-paths.yaml')
const feedback = read('docs/evidence/4c/p02-p8-feedback-revision.md')

function requireText(text, needle, message = needle) {
  assert.ok(text.includes(needle), `P-02 P8 missing: ${message}`)
}

test('P-02 P8 preserves four focused Project routes and the locked Project shell', () => {
  assert.equal(existsSync(path(htmlPath)), true, 'P-02 functional P8 HTML must exist')
  const html = read(htmlPath)
  for (const token of [
    'P-02 P8','FUNCTIONAL LOW-FI CANDIDATE','NOT LOCKED','fixture-only','GF-01 shell inherited',
    'Four focused Project routes','Data','Capabilities','Integrations','Brain',
    'generic Project Resources hub as new Product ontology = REJECTED',
    'backend owner/revision/binding console as root UX = REJECTED',
  ]) requireText(html, token)
  for (const id of ['workspaceCrumb','projectCrumb','projectRail','route-data','route-capabilities','route-integrations','route-brain','route-stage']) requireText(html, `id="${id}"`, id)
  for (const behavior of ['selectProjectRoute','renderData','renderCapabilities','renderIntegrations','renderBrain']) requireText(html, behavior, behavior)
  assert.doesNotMatch(html, />Resources<\/button>|id="route-resources"|generic-resource-hub/i, 'P8 must not invent a Project Resources destination')
})

test('P-02 Data opens authorized physical tabular data as a bounded read-only explorer', () => {
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

  for (const token of ['4C-F20','ProjectDataField','ProjectDataRelationship','ProjectDataRule']) requireText(ledger + oas + feedback, token, token)
  for (const token of ['4C-F22','PRJ-25','PRJ-26','PRJ-27','PRJ-28']) requireText(ledger + explorerOas, token, token)
  for (const token of ['ProjectDataExplorerSource','ProjectDataExplorerObject','ProjectDataExplorerFilter','ProjectDataExplorerRowPage','INTERNAL','INTEGRATION','TABLE','VIEW','DATASET']) requireText(explorerOas, token, token)

  assert.doesNotMatch(html, /<button[^>]*>\s*(Execute Query|Insert|Update|Delete|Create table|Alter table)\s*<\/button>/i, 'Data Explorer P8 must stay read-only')
  assert.doesNotMatch(html, /<textarea[^>]*(sql|query)|id="sql-editor"/i, 'Data Explorer P8 must not add a SQL editor')
})

test('P-02 Capabilities explain human meaning and logical function without a generic executor', () => {
  const html = read(htmlPath)
  for (const token of [
    'PRJ-S13','PRJ-16','PRJ-17','QUERY','ACTION','INTEGRATION','semantic operation identity','inspection only',
    'generic capability Run/Execute control = FORBIDDEN','What it does','Inputs','Outputs','Technical identity',
    'function-signature','human capability name',
  ]) requireText(html, token)
  for (const id of ['capability-groups','capability-detail']) requireText(html, `id="${id}"`, id)
  requireText(html, 'selectCapability', 'capability detail behavior')
  for (const token of ['4C-F21','ProjectCapabilityField','name','purpose','inputs','outputs']) requireText(ledger + oas + feedback, token, token)
  requireText(oas, 'enum: [QUERY, ACTION, INTEGRATION]', 'finite capability regimes')
  assert.equal(/\/capabilities\/{capabilityId}\/commands\/(run|execute)/i.test(oas), false, 'F21 must not add a generic capability executor path')
  assert.doesNotMatch(html, /<button[^>]*>\s*(Run|Execute)\s*<\/button>/i, 'Capabilities P8 must not expose generic Run/Execute')
})

test('P-02 Integrations makes Project use and switching explicit while keeping Connection lifecycle secondary', () => {
  const html = read(htmlPath)
  for (const token of [
    'PRJ-S14','PRJ-S15','PRJ-13','PRJ-14','PRJ-15','CON-03','Used by this Project','Project connections',
    'Connections used by this Project','Use connection','Switch connection','Connections owned by this Project',
    'Current connection','Switch to','Confirm switch','purpose-bound exact-Project chooser',
    'ProjectConnectionBinding != Connection','connection.use -X-&gt; generic connection.read',
    'configured != qualified != bound != healthy','selection disclosure != Connection management authority',
  ]) requireText(html, token)
  for (const id of ['project-bindings','binding-chooser','binding-current','binding-candidates','binding-status','project-connections']) requireText(html, `id="${id}"`, id)
  for (const behavior of ['openBindingChooser','closeBindingChooser','selectBindingCandidate','saveProjectBinding','removeProjectBinding','toggleProjectConnections']) requireText(html, behavior, behavior)
  assert.equal(html.includes('>Add binding<'), false, 'internal binding vocabulary must not be the primary CTA')
  assert.equal(html.includes('>Change<'), false, 'ambiguous Change CTA must not return')
})

test('P-02 Brain is Project adoption with purpose-bound revision choice, not Workspace publication authoring', () => {
  const html = read(htmlPath)
  for (const token of [
    'PRJ-S19','PRJ-10','PRJ-11','PRJ-12','BRN-02','Project adoption','Workspace Brain publication remains separate',
    'purpose-bound immutable revision chooser','brain.bind -X-&gt; generic brain.read','Project Brain binding != Workspace Brain publication',
    'published revision selection != Workspace Brain authoring','chooser visibility != brain.read grant',
  ]) requireText(html, token)
  for (const id of ['brain-current','brain-revision-chooser','brain-revisions','brain-binding-status','workspace-brain-boundary']) requireText(html, `id="${id}"`, id)
  for (const behavior of ['openBrainRevisionChooser','closeBrainRevisionChooser','selectBrainRevision','saveBrainBinding','clearBrainBinding']) requireText(html, behavior, behavior)
})

test('P-02 P8 stays self-contained, responsive, accessible and explicit about material states', () => {
  const html = read(htmlPath)
  for (const token of [
    'loading != known-empty != denied != absent/non-disclosable != dependency failure',
    'freshness unknown != fresh','coverage partial != complete',
    'no binding != no eligible Connection != denied disclosure','no binding != bound != update available',
    'P8 WALKTHROUGH FIXTURES','@media','aria-live="polite"','keydown','returnFocusTo',
  ]) requireText(html, token)
  assert.match(html, /event\.key\s*===\s*'Escape'/, 'Escape must close the active chooser/panel')
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i, 'P8 must not network or persist fixture state')
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i, 'P8 must be self-contained')
  assert.doesNotMatch(html, /P-02\s*=\s*LOCKED|P8\s*=\s*LOCKED/i, 'P8 candidate must not pre-authorize lock')
})
