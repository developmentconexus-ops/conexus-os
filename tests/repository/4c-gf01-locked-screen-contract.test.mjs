import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text, 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('operator-approved GF-01 H1-R2 remains locked through exact P9/P10 trace as later blocks advance', () => {
  const htmlPath = 'docs/evidence/4c/gf01-global-frame-wireframe.html'
  const contractPath = 'docs/evidence/4c/gf01-screen-contract.md'
  if (!existsSync(path(contractPath))) throw new Error('GF-01 exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const hypotheses = read('docs/evidence/4c/gf01-structural-hypotheses.md')
  const contract = read(contractPath)
  const roadmap = read('docs/roadmap.md')

  const approvedBlob = '2d899d00484c41c927829bd9f529d3a870159db3'
  if (gitBlobSha(html) !== approvedBlob) throw new Error('operator-approved GF-01 HTML artifact changed after lock')
  requireText(contract, `approved P8 artifact blob = ${approvedBlob}`, 'GF-01 Screen Contract must pin the exact approved HTML blob')

  requireText(hypotheses, 'LOCKED / OPERATOR APPROVED', 'GF-01 hypotheses must record the operator-only lock')
  requireText(hypotheses, 'H1-R2', 'GF-01 lock must identify H1-R2 exactly')

  for (const exactTrace of [
    'IAM-01 GetControlPlaneAccessContext',
    'IAM-02 EndSession',
    'WS-02 GetWorkspace',
    'PRJ-02 GetProject',
    'BLD-16 AskConexusAboutContext',
  ]) requireText(contract, exactTrace, `GF-01 Screen Contract missing ${exactTrace}`)

  for (const law of [
    'context switch = NAVIGATION',
    'workspace shortcut = NAVIGATION',
    'drawer/menu/panel open-close = EPHEMERAL_UI',
    'opening the contextual assistant seam MUST NOT invoke BLD-16',
    'workspaceId / projectId = URL_NAVIGATION',
    'Workspace.name / Project.name = SERVER presentation identity',
    'P10 graduated shared patterns = 0',
    'P11 = NOT TRIGGERED SEPARATELY',
  ]) requireText(contract, law, `GF-01 closure missing law: ${law}`)

  requireText(roadmap, 'GF-01 LOCKED', 'roadmap must show GF-01 locked')
  requireText(roadmap, 'W-01 LOCKED', 'dependent material blocks may advance only after W-01 is locked')
  requireText(roadmap, 'W-02A LOCKED', 'GF-01 progression guard must preserve the locked Brain sub-block')
  requireText(roadmap, 'W-02B LOCKED', 'GF-01 progression guard must preserve the locked Connections sub-block')
  requireText(roadmap, 'W-03 = LOCKED / OPERATOR APPROVED / P9/P10 CLOSED / VERIFIED GREEN', 'GF-01 progression beyond W-03 requires the exact W-03 lock')
  requireText(roadmap, 'W-03 = NEXT / NOT OPEN', 'GF-01 must preserve the historical W-03 predecessor marker')
  if (/P-01\s*=\s*OPEN|4D[^\n|]*\|\s*OPEN/.test(roadmap)) {
    throw new Error('GF-01 lock must not permit skipping past the current W-04 material block into P-01/4D')
  }
})
