import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { assert4DOpeningIsProperlyGated } from './_roadmap-phase-guards.mjs'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message = needle) {
  if (!text.includes(needle)) throw new Error(`P-01 P7 structural record missing: ${message}`)
}

test('P-01 P7 remains immutable historical Evidence while later authorized blocks may progress', () => {
  const docPath = 'docs/evidence/4c/p01-structural-hypotheses.md'
  if (!existsSync(path(docPath))) throw new Error('P-01 P7 structural record must exist')

  const doc = read(docPath)
  const roadmap = read('docs/roadmap.md')

  for (const token of [
    'P7 OPERATOR APPROVED / F14 GREEN / P8 BLOCKED / NOT LOCKED',
    'A — Preview-first exact-Change workspace',
    'B — Chat-first split',
    'C — Engineering control center',
    'SELECTED / OPERATOR APPROVED',
    'REJECTED',
    'What am I changing?',
    'What is happening now?',
    'What usable candidate can I inspect?',
    'What exactly changed?',
    'Is there something I must decide?',
    'What proof/finding blocks trust?',
    'What should I ask Conexus about the current Change?',
    'BLD-01 ListChanges',
    'BLD-02 GetChange',
    'BLD-03 CreateChange',
    'BLD-04 GetChangePlan',
    'BLD-05 DecideChangePlanCheckpoint',
    'BLD-06 GetChangeProgress',
    'BLD-07 GetChangeDiff',
    'BLD-08 ListProjectSourceTree',
    'BLD-09 GetProjectSourceFile',
    'BLD-10 GetRunPreview',
    'BLD-11 ListChangeFindings',
    'BLD-12 GetFinding',
    'BLD-13 CloseFinding',
    'BLD-14 ListChangeEvidence',
    'BLD-15 GetEvidence',
    'BLD-16 AskConexusAboutContext',
    'BLD-17 GetChangeExecutionDetail',
    'project.build',
    'project.review',
    'project.source.read',
    'intent = human Change meaning',
    'Preview = default / dominant lens',
    'Code / Diff = read-only inspectable lenses',
    'Plan = visual governed work, not a JSON editor',
    'Hub progress != model narration',
    'conversation != Change',
    'conversation != Plan truth',
    'conversation != Progress truth',
    'conversation != verification',
    'last-good Preview survives while next candidate builds',
    'changeId = URL_NAVIGATION',
    'Preview | Code | Diff lens = URL_NAVIGATION',
    'assistant open/close = EPHEMERAL_UI',
    'assistant question draft = FORM_DRAFT',
    'BLD-16 changeId?',
    'Findings / Evidence = trust layer',
    'execution detail = progressive disclosure',
    'Replit',
    'Lovable',
    'Codex',
    'P8 = BLOCKED',
  ]) requireText(doc, token)

  for (const forbidden of [
    'chat transcript = Product truth = FORBIDDEN',
    'second IDE/editor mutation authority = FORBIDDEN',
    'WorkUnit / ActorRun as root IA = REJECTED',
    'generic Change status editor = FORBIDDEN',
    'source mutation from Code lens = FORBIDDEN',
    'frontend-derived verification = FORBIDDEN',
  ]) requireText(doc, forbidden)

  requireText(roadmap, 'P-01 = LOCKED / OPERATOR APPROVED / AGENT STUDIO DELTA RE-LOCKED / P9/P10 CLOSED', 'roadmap must preserve the P-01 baseline and approved Agent Studio delta')

  if (/P8\s*=\s*(?:GREEN|LOCKED|APPROVED)/.test(doc)) throw new Error('historical P7 must not itself pre-authorize P8')
  if (/P11\s*=\s*ASSEMBLED/.test(roadmap)) throw new Error('later authorized progression must not assemble P11')
  assert4DOpeningIsProperlyGated(roadmap, 'later progression must not open 4D before 4C closure')
})
