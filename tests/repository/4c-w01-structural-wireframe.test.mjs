import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('W-01 locked Projects collection is a bounded HTML proof over current Project authority', () => {
  const evidencePath = 'docs/evidence/4c/w01-reference-and-structural-hypotheses.md'
  const htmlPath = 'docs/evidence/4c/w01-projects-inception-wireframe.html'
  if (!existsSync(path(evidencePath))) throw new Error('W-01 reference/hypothesis evidence must exist')
  if (!existsSync(path(htmlPath))) throw new Error('W-01 P8 HTML wireframe must exist')

  const evidence = read(evidencePath)
  const html = read(htmlPath)
  const wire = read('contracts/api/product/project-paths.yaml')
  const gf01 = read('docs/evidence/4c/gf01-global-frame-wireframe.html')

  for (const decision of [
    'H1 — compact structured Project list',
    'H2 — simple Project cards/grid',
    'H3 — dense Project table',
    'cards/grid = LOCKED / OPERATOR APPROVED',
    'structured list = REJECTED AS LEADING',
    'dense table = REJECTED AS LEADING',
    'ProjectSummary = projectId + workspaceId + name + archived',
  ]) requireText(evidence, decision, `W-01 structural evidence missing decision: ${decision}`)

  for (const trace of ['PRJ-01', 'PRJ-03']) {
    requireText(html, `data-operation="${trace}"`, `W-01 HTML missing ${trace} trace`)
  }

  for (const structural of [
    'data-project-collection="simple-card-grid"',
    'data-project-card="true"',
    'data-project-filter="local-name"',
    'data-source-mode="NEW"',
    'data-source-mode="EXISTING_GIT"',
    'name="repositoryLocator"',
    'sourceRevision',
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
    throw new Error('W-01 must not copy GF-01 fixture filler into the accepted card baseline')
  }
  if (/global search|search all projects and resources/i.test(html)) {
    throw new Error('W-01 must not invent global Product search')
  }
  if (/data-mastra-|mastra-thread|mastra-memory/i.test(html)) {
    throw new Error('W-01 P8 must not claim Mastra realization as Product/frontend authority proof')
  }

  if (!gf01.includes('data-context-switcher="breadcrumb"')) throw new Error('GF-01 locked shell precondition lost')
  requireText(html, 'data-context-switcher="breadcrumb"', 'W-01 must inherit locked GF-01 breadcrumb shell')
  requireText(html, 'data-shell="single-adaptive-rail"', 'W-01 must inherit the locked single adaptive rail')

  // The locked W-01 evidence is frozen and still depicts the retired Baseline
  // review journey. Only its Projects collection and source-bootstrap decisions
  // are current Product authority, and only those are asserted here.
  for (const sourceLaw of [
    'const: NEW',
    'const: EXISTING_GIT',
    'repositoryLocator:',
  ]) requireText(wire, sourceLaw, `W-01 test precondition lost from current wire: ${sourceLaw}`)
})
