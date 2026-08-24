import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message = needle) {
  if (!text.includes(needle)) throw new Error(`P-01 P7 structural record missing: ${message}`)
}

test('P-01 P7 preserves the operator-approved Preview-first exact-Change workspace without turning chat or engineering machinery into Product authority', () => {
  const docPath = 'docs/evidence/4c/p01-structural-hypotheses.md'
  if (!existsSync(path(docPath))) throw new Error('P-01 P7 structural record must exist before P8')

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

  requireText(roadmap, 'F14 whole-wire GREEN = Verify #797 SUCCESS', 'P7 must inherit the proven F14 baseline')
  requireText(roadmap, 'P-01 = OPEN / F14 GREEN / P7 OPERATOR APPROVED DIRECTION / RED REQUIRED / P8 BLOCKED / NOT LOCKED', 'roadmap must remain at P7 selected RED until this structural record exists')

  if (/P8\s*=\s*(?:GREEN|LOCKED|APPROVED)/.test(doc)) throw new Error('P-01 P7 must not pre-authorize P8')
  if (/P-01\s*=\s*LOCKED/.test(doc)) throw new Error('P-01 must remain operator-unlocked at P7')
  if (/P-02[^\n]*OPEN/.test(doc) || /P11[^\n]*ASSEMBLED/.test(doc) || /4D[^\n]*OPEN/.test(doc)) throw new Error('P-01 P7 must not advance later blocks or phases')
})
