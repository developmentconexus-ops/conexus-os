import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = value => resolve(root, value)
const read = value => readFileSync(path(value), 'utf8')
const requireText = (text, needle, message = needle) => {
  if (!text.includes(needle)) throw new Error(`P-05 lock missing: ${message}`)
}
function gitBlobSha(text) {
  const bytes = Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('operator-approved P-05 artifact remains pinned and closed through P9/P10', () => {
  const htmlPath = 'docs/evidence/4c/p05-project-lifecycle-and-published-app-access-functional-wireframe.html'
  const contractPath = 'docs/evidence/4c/p05-project-lifecycle-and-published-app-access-screen-contract.md'
  const blob = 'c8d18c942e7f84a746a6ca959c51f18c27f3b6cd'
  const family3Locked = 'd00b2126667a0a51317c653c57c237444a129dfb'

  if (!existsSync(path(contractPath))) throw new Error('P-05 exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const contract = read(contractPath)
  const evidence = read('docs/evidence/4c/p05-project-lifecycle-and-published-app-access-authority-feasibility-and-structural-hypotheses.md')
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')

  if (gitBlobSha(html) !== family3Locked) throw new Error('P12 Family 3 re-locked P-05 artifact drifted')

  for (const token of [
    'LOCKED / OPERATOR APPROVED', 'P9 EXACT TRACE CLOSED', 'P10 CONSOLIDATED', 'P11 LATER ASSEMBLED PRODUCT',
    `approved final P8 artifact blob = ${blob}`,
    `approved app-access-egress P8 delta blob = ${family3Locked} / OPERATOR APPROVED 2026-08-28`,
    'Manage / App access', 'Role consequences', 'Candidate selection', 'Manage / Lifecycle',
    'IAM-14 ListPublishedAppAccess', 'IAM-15 SetPublishedAppAccess', 'IAM-17 RevokePublishedAppAccess',
    'IAM-21 ListPublishedAppAccessCandidates', 'IAM-01 GetControlPlaneAccessContext',
    'PRJ-02 GetProject', 'PRJ-05 ArchiveProject', 'PRJ-06 DuplicateProject',
    'Keycloak authenticated identity != Conexus Account admission != app grant',
    'SERVER', 'URL_NAVIGATION', 'EPHEMERAL_UI',
    'PA-01 / BUD-01 / P11 / 4D / Product implementation = NOT AUTHORIZED',
  ]) requireText(contract, token)

  requireText(evidence, '## 11. Operator LOCK closure', 'decision/Evidence closure')
  requireText(evidence, `approved final P8 artifact blob = ${blob}`, 'decision/Evidence exact artifact')
  requireText(inventory, 'P12 Family 3 access delta `d00b2126...` / RE-LOCKED / OPERATOR APPROVED', 'inventory exact P-05 re-lock')
})
