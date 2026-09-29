import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { personPart } from '../../apps/web/src/features/builder/construir/plan-sections.ts'

test('personPart keeps what comes before the Para Construir heading', () => {
  const plan = ['## Para a pessoa', '', '- Uma tela de compras', '', '## Para Construir', '', '- Rota /pedidos'].join('\n')
  assert.equal(personPart(plan), '## Para a pessoa\n\n- Uma tela de compras')
})

test('personPart returns a plan without the technical heading whole', () => {
  assert.equal(personPart('1. Tela da semana'), '1. Tela da semana')
  assert.equal(personPart('Texto sobre ## Para Construir no meio da linha'), 'Texto sobre ## Para Construir no meio da linha')
})

test('the Planejar prompt names the two headings the card splits on', async () => {
  const prompt = await readFile(new URL('../../apps/hub/src/builder/harness/prompt/v2/plan.md', import.meta.url), 'utf8')
  assert.equal(prompt.includes('`## Para a pessoa`'), true)
  assert.equal(prompt.includes('`## Para Construir`'), true)
})
