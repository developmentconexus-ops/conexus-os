import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('GF-01 incorporates the bounded Fable shell review without widening Product authority', () => {
  const htmlPath = 'docs/evidence/4c/gf01-global-frame-wireframe.html'
  const reviewPath = 'docs/evidence/4c/gf01-fable-review-adjudication.md'
  if (!existsSync(path(htmlPath))) throw new Error('GF-01 HTML candidate is missing')
  if (!existsSync(path(reviewPath))) throw new Error('GF-01 Fable review adjudication evidence must exist')

  const html = read(htmlPath)
  const review = read(reviewPath)
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const hypotheses = read('docs/evidence/4c/gf01-structural-hypotheses.md')

  if (/<select\b/i.test(html)) throw new Error('GF-01 context switcher must not remain form-like select controls')
  requireText(html, 'data-context-switcher="breadcrumb"', 'GF-01 must expose a breadcrumb-style context switcher')
  requireText(html, 'data-workspace-menu', 'GF-01 must expose a Workspace context menu')
  for (const shortcut of ['Brain', 'Connections', 'People & access']) {
    requireText(html, shortcut, `Workspace context menu must expose ${shortcut} shortcut`)
  }
  requireText(html, 'data-assistant-seam="contextual"', 'GF-01 must reserve a contextual assistant panel seam before lock')
  requireText(html, 'data-project-collection-fixture', 'Projects collection representation must be marked fixture/deferred in GF-01')
  requireText(html, 'data-project-rail-context', 'Project rail must expose a lightweight Project context orientation cue for walkthrough')

  for (const decision of [
    'FABLE-GF01-01 — ACCEPT',
    'FABLE-GF01-02 — ACCEPT',
    'FABLE-GF01-03 — ACCEPT AS CANDIDATE FRAME SEAM',
    'FABLE-GF01-04 — CARRY FORWARD',
    'FABLE-GF01-05 — ACCEPT FOR WALKTHROUGH',
    'FABLE-GF01-06 — CARRY FORWARD',
    'FABLE-GF01-07 — CARRY FORWARD AS 4C-S06',
  ]) requireText(review, decision, `review adjudication missing ${decision}`)

  requireText(review, 'W-04 — Workspace Agent catalog', 'Workspace Agent catalog must have an explicit later material block carry-forward')
  requireText(review, '4C-S06', 'approval discoverability must be carried as an explicit structural finding')
  requireText(hypotheses, 'breadcrumb-switcher', 'GF-01 hypothesis must incorporate breadcrumb-switcher mitigation')
  requireText(hypotheses, 'contextual assistant panel seam', 'GF-01 hypothesis must expose the assistant frame seam decision')

  if (/universal Approval Center\s*=\s*ADMITTED/i.test(review + inventory)) {
    throw new Error('Fable review must not resurrect a universal Approval Center')
  }
  if (/UpdateWorkspace|UpdateProject|RenameWorkspace|RenameProject/.test(html)) {
    throw new Error('GF-01 review must not reintroduce generic Workspace/Project mutation authority')
  }
})
