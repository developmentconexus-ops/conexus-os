import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')
const htmlPath = 'docs/evidence/4c/p02-project-resources-functional-wireframe.html'

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

test('P-02 Data keeps human resource browse primary and Analyze contextual/governed', () => {
  const html = read(htmlPath)
  for (const token of [
    'PRJ-S11','PRJ-S12','PRJ-18','PRJ-19','BRN-13','BRN-12',
    'name = human recognition','dataResourceId = exact machine identity','dataResourceId != name',
    'grain','freshness','coverage','provenance','Analyze','server-admitted semantic choices',
    'catalog choice read != durable submit authority','frontend-owned analytic semantic catalog = FORBIDDEN',
    'SQL / physical schema / join explorer = FORBIDDEN',
  ]) requireText(html, token)
  for (const id of ['data-catalog','data-detail','open-analyze','analyze-panel','analytic-dataset','analytic-semantics','run-analytic','analytic-result','data-scenario']) requireText(html, `id="${id}"`, id)
  for (const behavior of ['selectDataResource','openAnalyze','closeAnalyze','renderAnalyticCatalog','runAnalyticQuery','applyDataScenario']) requireText(html, behavior, behavior)
})

test('P-02 Capabilities remain semantic inspection rather than a generic executor', () => {
  const html = read(htmlPath)
  for (const token of ['PRJ-S13','PRJ-16','PRJ-17','QUERY','ACTION','INTEGRATION','semantic operation identity','inspection only','generic capability Run/Execute control = FORBIDDEN']) requireText(html, token)
  for (const id of ['capability-groups','capability-detail']) requireText(html, `id="${id}"`, id)
  requireText(html, 'selectCapability', 'capability detail behavior')
  assert.doesNotMatch(html, /<button[^>]*>\s*(Run|Execute)\s*<\/button>/i, 'Capabilities P8 must not expose generic Run/Execute')
})

test('P-02 Integrations leads with Project bindings and keeps Connection lifecycle secondary', () => {
  const html = read(htmlPath)
  for (const token of [
    'PRJ-S14','PRJ-S15','PRJ-13','PRJ-14','PRJ-15','CON-03',
    'Used by this Project','Project connections','purpose-bound exact-Project chooser',
    'ProjectConnectionBinding != Connection','connection.use -X-&gt; generic connection.read',
    'configured != qualified != bound != healthy','selection disclosure != Connection management authority',
  ]) requireText(html, token)
  for (const id of ['project-bindings','binding-chooser','binding-candidates','binding-status','project-connections']) requireText(html, `id="${id}"`, id)
  for (const behavior of ['openBindingChooser','closeBindingChooser','selectBindingCandidate','saveProjectBinding','removeProjectBinding','toggleProjectConnections']) requireText(html, behavior, behavior)
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
