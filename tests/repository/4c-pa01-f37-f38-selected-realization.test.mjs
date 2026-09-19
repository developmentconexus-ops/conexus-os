import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = value => readFileSync(resolve(root, value), 'utf8')

const requireText = (text, needle, message = needle) => {
  if (!text.includes(needle)) throw new Error(`PA-01 F37/F38 realization missing ${message}`)
}

// F37 asserted Product Agent Runtime wire that was never built: par-paths.yaml was unreachable
// from openapi.yaml with no admitted operations (S8 audit G-03) and is deleted. F37 has no
// surviving subject to assert.

test('F38 keeps one Conexus session owner across Control Plane and Published App', () => {
  const product = read('docs/product/contract.md')
  const ledger = read('docs/product/operation-ledger.md')
  const identity = read('contracts/api/product/identity-workspace-paths.yaml')
  const rootWire = read('contracts/api/product/openapi.yaml')

  requireText(identity, '  /api/session:')
  requireText(rootWire, '  /api/session:')
  requireText(identity, 'x-conexus-ingress: [CONTROL_PLANE, PUBLISHED_APP]')
  requireText(identity, 'required: [account, projectId, activeReleaseId, role]')
  requireText(identity, "$ref: '#/components/schemas/AccountSummary'")
  requireText(product, 'Ending the Conexus session does not claim global Keycloak SSO logout')
  requireText(ledger, '4C-F38')
  requireText(ledger, 'IAM remains 20')

  if (/Keycloak(?:Role|Group|Organization)|keycloakToken|realmRole/.test(identity)) {
    throw new Error('F38 must not expose Keycloak provider authorization in Product wire')
  }
})
