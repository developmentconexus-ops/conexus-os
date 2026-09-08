import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('4C boundedly follows the current Frontend Product Experience Planning Method without reopening valid locks', () => {
  const method = read('docs/development/frontend-product-experience-planning-method.md')
  const phase = read('docs/phases/4c-frontend-interaction-and-authority-realization.md')

  requireText(method, '**Version:** 2.3', 'canonical frontend methodology must be the current operator-ratified v2.3')
  requireText(phase, '[Frontend Product Experience Planning Method]', '4C profile must adopt the canonical methodology owner without duplicating its mutable version')
  requireText(phase, 'bounded rebaseline', '4C must adopt the current bounded-rebaseline law')
  requireText(phase, 'functional low-fidelity HTML', '4C P8 must be functional low-fidelity HTML')
  requireText(phase, 'material local interactions work', '4C P8 must require material local interactions to operate')
  requireText(phase, 'P11', '4C must map assembled interactive low-fidelity Product proof')
  requireText(phase, 'P12', '4C must map whole-product adversarial UX + architecture walkthrough')
  requireText(phase, 'P8 proves the block; P11 proves the product', '4C must preserve the v2.2 block-vs-product proof distinction')
  requireText(phase, 'GF-01', '4C rebaseline must preserve existing global-frame lock unless falsified')
  requireText(phase, 'W-01', '4C rebaseline must preserve existing W-01 lock unless falsified')

  requireText(phase, 'GF-01 H1-R2 = preserved LOCKED baseline', '4C must preserve the GF-01 baseline and bounded delta lock')
  requireText(phase, 'W-01 C1-R1 = preserved LOCKED baseline', '4C must preserve W-01 lock across the current rebaseline')
})
