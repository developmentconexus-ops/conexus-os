import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const path = p => resolve(root, p)
const read = p => readFileSync(path(p), 'utf8')

test('GF-01 P8 authority remains a low-fidelity viewable HTML wireframe after lock', () => {
  const htmlPath = 'docs/evidence/4c/gf01-global-frame-wireframe.html'
  const svgPath = 'docs/evidence/4c/gf01-global-frame-wireframe.svg'

  if (!existsSync(path(htmlPath))) throw new Error('GF-01 P8 HTML wireframe must exist')
  if (existsSync(path(svgPath))) throw new Error('GF-01 current P8 authority must not remain a static SVG wireframe')

  const html = read(htmlPath)
  const hypotheses = read('docs/evidence/4c/gf01-structural-hypotheses.md')
  const screenContract = read('docs/evidence/4c/gf01-screen-contract.md')
  const contract = read('docs/phases/4c-frontend-interaction-and-authority-realization.md')

  for (const required of [
    '<!doctype html>',
    'data-wireframe="gf-01"',
    'data-scope="workspace"',
    'data-scope="project"',
    'aria-label="Workspace navigation"',
    'aria-label="Project navigation"',
    '@media',
    'vanilla',
    'CANDIDATE',
    'NOT LOCKED',
  ]) {
    if (!html.toLowerCase().includes(required.toLowerCase())) throw new Error(`GF-01 HTML wireframe missing ${required}`)
  }

  if (/react|vue|angular|tailwind|bootstrap/i.test(html)) throw new Error('GF-01 P8 wireframe must not use a production/frontend framework')
  if (!hypotheses.includes('gf01-global-frame-wireframe.html')) throw new Error('GF-01 hypotheses must route to the HTML wireframe')
  if (!screenContract.includes('approved P8 artifact blob = 2d899d00484c41c927829bd9f529d3a870159db3')) {
    throw new Error('locked GF-01 Screen Contract must preserve exact P8 artifact identity')
  }
  if (hypotheses.includes('gf01-global-frame-wireframe.svg')) {
    throw new Error('current GF-01 authority must not route to the superseded SVG')
  }

  for (const required of ['primary structural wireframe = unbranded HTML + CSS', 'static image / SVG             = not current wireframe authority']) {
    if (!contract.includes(required)) throw new Error(`4C contract must preserve Conexus P8 medium decision: ${required}`)
  }
})
