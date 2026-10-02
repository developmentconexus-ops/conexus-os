import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { personPart } from '../../apps/web/src/features/builder/construir/plan-sections.ts'

test('personPart keeps what comes before the Para construir heading', () => {
  const plan = ['## Para a pessoa', '', '- Uma tela de compras', '', '## Para construir', '', '- Rota /pedidos'].join('\n')
  assert.equal(personPart(plan), '## Para a pessoa\n\n- Uma tela de compras')
})

test('personPart ignores the case of the heading, so Para Construir splits the same way', () => {
  const plan = ['## Para a pessoa', '', '- Uma tela', '', '## Para Construir', '', '- Rota /pedidos'].join('\n')
  assert.equal(personPart(plan), '## Para a pessoa\n\n- Uma tela')
})

test('personPart returns a plan without the technical heading whole', () => {
  assert.equal(personPart('1. Tela da semana'), '1. Tela da semana')
  assert.equal(personPart('Texto sobre ## Para construir no meio da linha'), 'Texto sobre ## Para construir no meio da linha')
})

test('the plan skill templates write the two headings the card splits on, in the case it matches', async () => {
  for (const name of ['conexus-plan-new', 'conexus-plan-change']) {
    const template = await readFile(new URL(`../../builder-skills/${name}/references/plan-template.md`, import.meta.url), 'utf8')
    assert.equal(template.includes('\n## Para a pessoa\n'), true, `${name} has the person heading`)
    assert.equal(personPart(template).includes('## Para construir'), false, `${name} splits at its technical heading`)
  }
})
