import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('W-01 structural candidate is a bounded HTML proof over accepted Journey-B authority', () => {
  const evidencePath = 'docs/evidence/4c/w01-reference-and-structural-hypotheses.md'
  const htmlPath = 'docs/evidence/4c/w01-projects-inception-wireframe.html'
  if (!existsSync(path(evidencePath))) throw new Error('W-01 reference/hypothesis evidence must exist before P8 candidate can close')
  if (!existsSync(path(htmlPath))) throw new Error('W-01 P8 HTML wireframe must exist')

  const evidence = read(evidencePath)
  const html = read(htmlPath)
  const wire = read('contracts/api/product/project-paths.yaml')
  const gf01 = read('docs/evidence/4c/gf01-global-frame-wireframe.html')

  for (const decision of [
    'H1 — compact structured Project list',
    'H2 — simple Project cards/grid',
    'H3 — dense Project table',
    'cards/grid = LEADING / CANDIDATE',
    'structured list = REJECTED AS LEADING',
    'dense table = REJECTED AS LEADING',
    'ProjectSummary = projectId + workspaceId + name + archived',
    'PRJ-03 → PRJ-07 → PRJ-23 / PRJ-08 → PRJ-09',
  ]) requireText(evidence, decision, `W-01 structural evidence missing decision: ${decision}`)

  for (const trace of ['PRJ-01', 'PRJ-03', 'PRJ-07', 'PRJ-08', 'PRJ-09', 'PRJ-23']) {
    requireText(html, `data-operation="${trace}"`, `W-01 HTML missing ${trace} trace`)
  }

  for (const structural of [
    'data-project-collection="simple-card-grid"',
    'data-project-card="true"',
    'data-project-filter="local-name"',
    'data-source-mode="NEW"',
    'data-source-mode="EXISTING_GIT"',
    'name="repositoryLocator"',
    'name="intent"',
    'data-baseline-view="candidate"',
    'data-baseline-view="approved"',
    'candidateBaselineDigest',
    'sourceRevision',
    'applicationRuntimeProfile',
    'data-action="approve-candidate"',
    'data-navigation="candidate-digest-url"',
  ]) requireText(html, structural, `W-01 HTML missing structural proof: ${structural}`)

  const projectCards = [...html.matchAll(/<article class="project-card"[^>]*data-project-card="true"/g)]
  if (projectCards.length < 2) throw new Error('W-01 cards/grid must expose multiple simple Project cards for structural inspection')

  if (/<script[^>]+src=|react|vue|svelte|next\/|@tanstack/i.test(html)) {
    throw new Error('W-01 P8 must remain HTML/CSS + bounded vanilla JS only')
  }
  if (/last activity|last updated|latest release|framework|setup status|source provider|ownership metadata/i.test(html)) {
    throw new Error('W-01 Project cards must not invent richer ProjectSummary metadata')
  }
  if (/Disclosed Project · collection metadata intentionally incomplete/i.test(html)) {
    throw new Error('W-01 must not copy GF-01 fixture filler into the accepted card candidate')
  }
  if (/global search|search all projects and resources/i.test(html)) {
    throw new Error('W-01 must not invent global Product search')
  }
  if (/data-action="reject-candidate"/.test(html)) {
    throw new Error('W-01 must not invent a Baseline rejection Product command')
  }

  if (!gf01.includes('data-context-switcher="breadcrumb"')) throw new Error('GF-01 locked shell precondition lost')
  requireText(html, 'data-context-switcher="breadcrumb"', 'W-01 must inherit locked GF-01 breadcrumb shell')
  requireText(html, 'data-shell="single-adaptive-rail"', 'W-01 must inherit the locked single adaptive rail')

  for (const sourceLaw of [
    'const: NEW',
    'const: EXISTING_GIT',
    'repositoryLocator:',
    'required: [intent]',
    'operationId: GetProjectBaselineCandidate',
  ]) requireText(wire, sourceLaw, `W-01 test precondition lost from current wire: ${sourceLaw}`)
})
