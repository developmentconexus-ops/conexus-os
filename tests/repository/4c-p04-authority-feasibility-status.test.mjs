import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = value => resolve(root, value)
const read = value => readFileSync(path(value), 'utf8')

const requireText = (text, needle, message = needle) => {
  if (!text.includes(needle)) throw new Error(`P-04 authority preflight missing ${message}`)
}

test('operator-approved P-04 closes the revised P8 through exact P9/P10 trace', () => {
  const ownerPath = 'docs/evidence/4c/p04-release-operations-authority-feasibility-and-structural-hypotheses.md'
  if (!existsSync(path(ownerPath))) throw new Error('canonical P-04 authority/feasibility owner must exist')

  const owner = read(ownerPath)
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')

  for (const token of [
    'P-04 LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED',
    '4C-F31', '4C-F32', '4C-F33', '4C-F34',
    'Operator adjudication:',
    'A — current-serving Releases route + owner-specific Activity lenses',
    'PRESENT-IN-AUTHORITY — F31',
    'PRESENT-IN-AUTHORITY — F32',
    'PRESENT-IN-AUTHORITY — F33 / MAR-04',
    'PRESENT-IN-AUTHORITY — F34',
    'P8 = LOCKED / approved blob 9aaa2c8e6d85b7b5d535bfba5969c475190ba7e7',
    'P9 = EXACT TRACE CLOSED',
    'P10 = CONSOLIDATED',
    'P11 / 4D / Product implementation = NOT AUTHORIZED',
  ]) requireText(owner, token)

  requireText(inventory, 'P-04', 'P-04 inventory route')

  if (!existsSync(path('docs/evidence/4c/p04-release-operations-functional-wireframe.html'))) throw new Error('canonical P-04 P8 artifact must exist')
  if (!existsSync(path('docs/evidence/4c/p04-release-operations-screen-contract.md'))) throw new Error('P-04 Screen Contract must exist after explicit P8 lock')
})

// F33 named the MAR runnable-job read. docs/product/wire-contract.md retired MAR, the current
// Product OAS never referenced mar-paths.yaml, and the file is gone, so F33 has no subject to
// assert. F31, F32 and F34 asserted Release and Observability wire (release-paths.yaml,
// observability-paths.yaml) that were unreachable from openapi.yaml with no admitted operations
// (S8 audit G-04, G-06) and are deleted. F31/F32/F34 have no surviving subject to assert.
