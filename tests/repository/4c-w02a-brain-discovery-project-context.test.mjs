import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('F08 preserves the P9 finding and Global-Maximum decision history', () => {
  const findingPath = 'docs/evidence/4c/w02a-brain-discovery-project-context-finding.md'
  const gmPath = 'docs/evidence/4c/w02a-brain-discovery-project-context-global-maximum.md'
  const selectedPath = 'docs/evidence/4c/w02a-brain-discovery-project-context-selected-realization.md'
  for (const p of [findingPath, gmPath, selectedPath]) {
    if (!existsSync(path(p))) throw new Error(`F08 evidence missing: ${p}`)
  }

  const projectWire = read('contracts/api/product/project-paths.yaml')
  const brainWire = read('contracts/api/product/brain-paths.yaml')
  const finding = read(findingPath)
  const gm = read(gmPath)
  const selected = read(selectedPath)

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
    'Source / Connection resolution remains server-owned',
  ]) requireText(finding, law, `F08 finding missing law: ${law}`)

  for (const alternative of [
    'A — hidden/default Project fixture',
    'B — infer a Project from Workspace/current navigation context',
    'C — explicit Project context selector inside Brain Discovery using PRJ-01',
    'D — move Brain Discovery primarily into a Project page',
    'E — remove projectId and make BRN-04 Workspace-wide discovery',
  ]) requireText(gm, alternative, `F08 Global-Maximum assessment missing alternative: ${alternative}`)
  requireText(gm, 'LEADING GLOBAL-MAXIMUM CANDIDATE = C', 'F08 must identify explicit Project context as leading candidate')
  requireText(selected, 'OPERATOR ACCEPTED / SELECTED REALIZATION / P8 REVISION RED', 'F08 selected realization must record operator acceptance and RED state')
  requireText(selected, 'selected projectId = FORM_DRAFT / untrusted reference', 'F08 selected realization must keep Project selection client-draft only')
})

test('selected F08 realization makes Project context explicit before BRN-04 without adding backend authority', () => {
  const html = read('docs/evidence/4c/w02a-brain-functional-wireframe.html')
  const roadmap = read('docs/roadmap.md')

  requireText(html, 'id="discoveryProject"', 'F08 RED: Discovery must expose an explicit Project context control')
  requireText(html, 'data-read-operation="PRJ-01"', 'Discovery Project context must trace to PRJ-01')
  requireText(html, 'data-operation="BRN-04"', 'Discovery must preserve BRN-04 as the action owner')
  requireText(html, 'projectId:', 'F08 fixture Projects must carry ProjectSummary projectId')
  requireText(html, 'workspaceId:', 'F08 fixture Projects must carry ProjectSummary workspaceId')
  requireText(html, 'name:', 'F08 fixture Projects must carry ProjectSummary human name')
  requireText(html, 'archived:', 'F08 fixture Projects must carry truthful archived state')
  requireText(html, 'selectedProjectId:null', 'selected Project must start absent rather than hidden/defaulted')
  requireText(html, 'runDiscoveryButton.disabled = !state.selectedProjectId', 'Run discovery must remain disabled until explicit Project selection')
  requireText(html, 'Brain resolves the already-admitted source / Connection context server-side', 'P8 must make the server-owned source/Connection boundary visible')
  requireText(html, 'FORM_DRAFT until Run discovery', 'P8 must label selected Project context as draft before BRN-04')

  for (const forbidden of ['fetch(', 'localStorage', 'sessionStorage']) {
    if (html.includes(forbidden)) throw new Error(`F08 P8 must remain deterministic local Evidence without ${forbidden}`)
  }
  if (/source selector|credential selector|connection selector/i.test(html)) {
    throw new Error('F08 must not add frontend source/Connection/credential selection authority')
  }

  requireText(roadmap, 'F08 OPERATOR ACCEPTED', 'roadmap must preserve F08 operator acceptance')
  requireText(roadmap, 'F08 SELECTED REALIZATION', 'roadmap must route the selected F08 P8 revision')
  requireText(roadmap, 'W-02A NOT LOCKED', 'W-02A must remain unlocked until revised P8 operator re-walkthrough')
})
