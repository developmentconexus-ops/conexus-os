import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('W-02A P9 requires explicit human Project context before Brain Discovery without changing BRN-04 ownership', () => {
  const findingPath = 'docs/evidence/4c/w02a-brain-discovery-project-context-finding.md'
  const gmPath = 'docs/evidence/4c/w02a-brain-discovery-project-context-global-maximum.md'
  if (!existsSync(path(findingPath))) throw new Error('F08 Brain Discovery Project-context finding must exist')
  if (!existsSync(path(gmPath))) throw new Error('F08 Global-Maximum assessment must exist')

  const projectWire = read('contracts/api/product/project-paths.yaml')
  const brainWire = read('contracts/api/product/brain-paths.yaml')
  const html = read('docs/evidence/4c/w02a-brain-functional-wireframe.html')
  const finding = read(findingPath)
  const gm = read(gmPath)
  const roadmap = read('docs/roadmap.md')

  for (const truth of ['ProjectSummary:', 'required: [projectId, workspaceId, name, archived]', 'Human-readable Project identity']) {
    requireText(projectWire, truth, `F08 must preserve sufficient PRJ-01 Project recognition truth: ${truth}`)
  }
  requireText(brainWire, 'required: [projectId]', 'BRN-04 must continue requiring explicit Project context')
  requireText(brainWire, 'Project whose already-admitted source/Connection context is used for read-only discovery', 'BRN-04 must remain source-context server-resolved')

  for (const law of [
    'F08 = OPEN / MATERIAL P9 INTERACTION FINDING',
    'human must know which Project context drives Discovery before invoking BRN-04',
    'PRJ-01 ListProjects',
    'BRN-04 StartBrainDiscovery',
    'browser projectId remains an untrusted reference',
    'source / Connection resolution remains server-owned',
  ]) requireText(finding, law, `F08 finding missing law: ${law}`)

  for (const alternative of [
    'A — hidden/default Project fixture',
    'B — infer a Project from Workspace/current navigation context',
    'C — explicit Project context selector inside Brain Discovery using PRJ-01',
    'D — move Brain Discovery primarily into a Project page',
    'E — remove projectId and make BRN-04 Workspace-wide discovery',
  ]) requireText(gm, alternative, `F08 Global-Maximum assessment missing alternative: ${alternative}`)
  requireText(gm, 'LEADING GLOBAL-MAXIMUM CANDIDATE = C', 'F08 must identify explicit Project context as leading candidate')

  requireText(html, 'data-operation="BRN-04"', 'approved P8 must preserve Brain Discovery action')
  if (html.includes('id="discoveryProject"') || html.includes('data-discovery-project')) {
    throw new Error('solution-neutral F08 inquiry must begin before an explicit Discovery Project control exists')
  }

  requireText(roadmap, 'F08 OPERATOR GATE', 'roadmap must route material P8 revision through operator adjudication')
  requireText(roadmap, 'W-02A P8 OPERATOR APPROVED', 'roadmap must preserve prior P8 approval as direction')
  requireText(roadmap, 'W-02A NOT LOCKED', 'P9 F08 must prevent false W-02A lock')
})
