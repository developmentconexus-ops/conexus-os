import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = value => resolve(root, value)
const read = value => readFileSync(path(value), 'utf8')

const requireText = (text, needle, message = needle) => {
  if (!text.includes(needle)) throw new Error(`P-05 authority preflight missing ${message}`)
}

test('operator-approved P-05 remains locked through exact P9/P10 trace', () => {
  const ownerPath = 'docs/evidence/4c/p05-project-lifecycle-and-published-app-access-authority-feasibility-and-structural-hypotheses.md'
  if (!existsSync(path(ownerPath))) throw new Error('canonical P-05 authority/feasibility owner must exist')

  const owner = read(ownerPath)
  const roadmap = read('docs/roadmap.md')
  const index = read('docs/index.md')
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')

  for (const token of [
    'P-05 LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED',
    '4C-F35',
    '4C-F36',
    'IAM-21 ListPublishedAppAccessCandidates',
    'AccountSummary',
    'roleOptions[]',
    'A — one Project Management route with Access and Lifecycle task lenses — leading',
    'P8 HTML = LOCKED / approved blob c8d18c942e7f84a746a6ca959c51f18c27f3b6cd',
    'P9 = EXACT TRACE CLOSED',
    'P10 = CONSOLIDATED',
    'PA-01 / BUD-01 / P11 / 4D / Product implementation = NOT AUTHORIZED',
  ]) requireText(owner, token)

  requireText(roadmap, 'P-05 = LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED')
  requireText(roadmap, 'PA-01 = LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED', 'later PA-01 progression must not reopen the locked P-05 block')
  requireText(index, ownerPath.split('/').at(-1))
  requireText(inventory, 'P12 Family 3 access delta `d00b2126...` / RE-LOCKED / OPERATOR APPROVED')

  if (!existsSync(path('docs/evidence/4c/p05-project-lifecycle-and-published-app-access-functional-wireframe.html'))) {
    throw new Error('P-05 functional P8 candidate must exist after F35-F36 are present in authority')
  }
})

test('P-05 F35-F36 selected realization is present in the current wire', () => {
  const identityWire = read('contracts/api/product/identity-workspace-paths.yaml')
  const projectWire = read('contracts/api/product/project-paths.yaml')

  for (const token of ['operationId: ListPublishedAppAccess', 'operationId: SetPublishedAppAccess', 'operationId: RevokePublishedAppAccess']) {
    requireText(identityWire, token)
  }
  requireText(identityWire, 'required: [account, role]', 'human-recognizable current grant item')
  requireText(identityWire, 'required: [role, expectedCurrent]', 'current-or-absent write guard')
  requireText(identityWire, 'operationId: ListPublishedAppAccessCandidates', 'IAM-21 candidate read')
  requireText(identityWire, 'required: [items, roleOptions]', 'F36 exact role decision truth')
  requireText(identityWire, 'required: [operationId, name, purpose, regime]', 'F36 capability consequence shape')
  requireText(identityWire, 'never a Keycloak-directory query', 'F35 Keycloak/Conexus boundary')
  requireText(projectWire, 'operationId: ArchiveProject')
  requireText(projectWire, 'required: [expectedProjectRevision]')
  requireText(projectWire, 'operationId: DuplicateProject')
  requireText(projectWire, 'const: NO_DATA')

})
