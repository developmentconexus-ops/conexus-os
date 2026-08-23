import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

function requireText(text, needle, message) {
  if (!text.includes(needle)) throw new Error(message)
}

test('4C boundedly rebaselines onto Frontend Product Experience Planning Method v2.2 without reopening valid locks', () => {
  const method = read('docs/development/frontend-product-experience-planning-method.md')
  const phase = read('docs/phases/4c-frontend-interaction-and-authority-realization.md')
  const roadmap = read('docs/roadmap.md')

  requireText(method, '**Version:** 2.2', 'canonical frontend methodology must be v2.2')
  requireText(phase, 'Frontend Product Experience Planning Method v2.2', '4C profile must explicitly adopt methodology v2.2')
  requireText(phase, 'bounded rebaseline', '4C must adopt v2.2 bounded-rebaseline law')
  requireText(phase, 'functional low-fidelity HTML', '4C P8 must be functional low-fidelity HTML')
  requireText(phase, 'material local interactions work', '4C P8 must require material local interactions to operate')
  requireText(phase, 'P11', '4C must map assembled interactive low-fidelity Product proof')
  requireText(phase, 'P12', '4C must map whole-product adversarial UX + architecture walkthrough')
  requireText(phase, 'P8 proves the block; P11 proves the product', '4C must preserve the v2.2 block-vs-product proof distinction')
  requireText(phase, 'GF-01', '4C rebaseline must preserve existing global-frame lock unless falsified')
  requireText(phase, 'W-01', '4C rebaseline must preserve existing W-01 lock unless falsified')

  requireText(roadmap, 'GF-01 LOCKED', 'roadmap must preserve GF-01 lock across v2.2 rebaseline')
  requireText(roadmap, 'W-01 LOCKED', 'roadmap must preserve W-01 lock across v2.2 rebaseline')
})
