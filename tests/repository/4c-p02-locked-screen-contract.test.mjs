import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = value => resolve(root, value)
const read = value => readFileSync(path(value), 'utf8')
const requireText = (text, needle, message = needle) => {
  if (!text.includes(needle)) throw new Error(`P-02 lock missing: ${message}`)
}
function gitBlobSha(text) {
  const bytes = Buffer.from(text.replaceAll('\r\n', '\n'), 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

test('operator-approved P-02 remains locked through exact P9 trace and bounded P10 consolidation', () => {
  const htmlPath = 'docs/evidence/4c/p02-project-resources-functional-wireframe.html'
  const contractPath = 'docs/evidence/4c/p02-project-product-surfaces-screen-contract.md'
  const approvedBlob = '1ea0f096a6e72000d5d5f09ebf64f03d6a346417'
  const family2Candidate = 'fd23303ac71bbf256887bf361fb0f8c7cf9aae00'

  if (!existsSync(path(contractPath))) throw new Error('P-02 exact Screen Contract must exist after operator lock')

  const html = read(htmlPath)
  const contract = read(contractPath)
  const roadmap = read('docs/roadmap.md')
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const index = read('docs/index.md')

  if (gitBlobSha(html) !== family2Candidate) throw new Error('P12 Family 2 P-02 candidate drifted before operator walkthrough')

  for (const token of [
    'LOCKED BASELINE / P12 FAMILY 2 IDENTITY DELTA RE-LOCKED / OPERATOR APPROVED','P9 EXACT TRACE CLOSED','P10 CONSOLIDATED','P11 LATER ASSEMBLED PRODUCT',
    `approved final P8 artifact blob = ${approvedBlob}`,
    `approved governed-adoption P8 delta blob = ${family2Candidate}`,
    'Data = facts','Brain = meaning','Capabilities = behavior','Integrations = external systems',
    'PRJ-25 ListProjectDataExplorerSources','PRJ-26 ListProjectDataExplorerObjects','PRJ-27 GetProjectDataExplorerObject','PRJ-28 ListProjectDataExplorerRows',
    'PRJ-18 ListProjectDataResources','PRJ-19 GetProjectDataResource','BRN-13 GetProjectAnalyticQueryCatalog','BRN-12 RunAnalyticQuery',
    'PRJ-16 ListProjectCapabilities','PRJ-17 GetProjectCapability',
    'PRJ-13 ListProjectConnectionBindings','PRJ-14 SetProjectConnectionBinding','PRJ-15 RemoveProjectConnectionBinding',
    'CON-03 ListConnections','CON-04 GetConnection','CON-05 CreateConnection','CON-06 ReviseConnection','CON-07 SetConnectionCredential','CON-08 QualifyConnection','CON-09 GetConnectionQualification',
    'BRN-14 GetProjectBrainContext','PRJ-10 GetProjectBrainBinding','PRJ-11 SetProjectBrainBinding','PRJ-12 ClearProjectBrainBinding','BRN-02 ListBrainRevisions',
    'project.read != project.data.read','connection.use != connection.read != connection.manage != connection.qualify','brain.bind != brain.read',
    'ProjectConnectionBinding != Connection','Connection revision != Project binding revision','physical identity != semantic meaning','Project Brain Context != Workspace Brain publication',
    'server projection = SERVER','drawer/panel open state = EPHEMERAL_UI','Project subroute = URL_NAVIGATION',
    'loading != known-empty != denied != absent/non-disclosable != dependency failure','configured != qualified != bound != healthy',
    'context-preserving exact-subject panel','P10 new graduated shared patterns = 0','existing graduated patterns remain = 1',
  ]) requireText(contract, token)

  for (const forbidden of [
    'generic Project Resources hub = FORBIDDEN','SQL editor / arbitrary query execution = FORBIDDEN','generic Capability Run/Execute = FORBIDDEN',
    'generic Integration switch/replacement semantics = FORBIDDEN','binding purpose/role invented by frontend = FORBIDDEN','automatic Project binding advance after Connection revision = FORBIDDEN',
    'connection.use permission elevation = FORBIDDEN','browser-derived Project Brain applicability = FORBIDDEN','Workspace Brain governance inside Project Brain = FORBIDDEN',
    'P11 early assembly = FORBIDDEN','Product implementation = BLOCKED',
  ]) requireText(contract, forbidden)

  requireText(html, 'LOCKED / OPERATOR APPROVED', 'locked artifact marker')
  requireText(roadmap, 'P-02 = LOCKED / OPERATOR APPROVED / P9/P10 CLOSED', 'roadmap P-02 closure')
  requireText(roadmap, 'P-03 = LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED', 'later P-03 lock must remain visible without weakening P-02 lock')
  requireText(inventory, 'P12 Family 2 governed-adoption delta RE-LOCKED', 'inventory Family 2 P-02 re-lock')
  requireText(index, 'p02-project-product-surfaces-screen-contract.md', 'current P-02 Screen Contract index entry')
})
