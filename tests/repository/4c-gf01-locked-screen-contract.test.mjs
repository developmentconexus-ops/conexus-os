import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('operator-approved GF-01 H1-R2 and Account/session delta remain pinned after re-lock', () => {
  const htmlPath = 'docs/evidence/4c/gf01-global-frame-wireframe.html'
  const contractPath = 'docs/evidence/4c/gf01-screen-contract.md'
  if (!existsSync(path(contractPath))) throw new Error('GF-01 exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const hypotheses = read('docs/evidence/4c/gf01-structural-hypotheses.md')
  const contract = read(contractPath)

  const historicalBlob = '2d899d00484c41c927829bd9f529d3a870159db3'
  const approvedBlob = 'e83a0e8c9e64ee47d28a58d267f5fb1169b41ed3'
  const family1Candidate = '603b47ccaba1fe6557e557b48efa4f40207d3724'
  if (gitBlobSha(html) !== family1Candidate) throw new Error('P12 Family 1 GF-01 candidate identity drifted before operator walkthrough')
  for (const marker of ['accountMenu', 'IAM-01 AccountSummary', 'IAM-02 DELETE /api/session']) requireText(html, marker, `GF-01 bounded Account/session lock missing ${marker}`)
  requireText(contract, `approved P8 artifact blob = ${historicalBlob}`, 'GF-01 Screen Contract must preserve the historical baseline blob')
  requireText(contract, `approved Account/session delta P8 artifact blob = ${approvedBlob}`, 'GF-01 Screen Contract must pin the current approved delta blob')
  requireText(contract, `P12 Family 1 approved P8 delta blob = ${family1Candidate}`, 'GF-01 Screen Contract must pin the re-locked Family 1 delta')

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

  requireText(contract, 'LOCKED / OPERATOR APPROVED', 'GF-01 Screen Contract must own the current lock')
})
