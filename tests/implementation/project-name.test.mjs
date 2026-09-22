import assert from 'node:assert/strict'
import test from 'node:test'
import { suggestProjectName } from '../../apps/web/src/features/project/project-name.ts'

test('the suggested name stops at a sensible boundary, never on a trailing preposition', () => {
  assert.equal(suggestProjectName('Cadastro simples de visitas a clientes com nome, data e observação'), 'Cadastro simples de visitas a clientes')
  assert.equal(suggestProjectName('controle de pedidos de férias, com aprovação do gestor e motivo na recusa'), 'Controle de pedidos de férias')
  assert.equal(suggestProjectName('Um app para a equipe registrar as entregas do dia com foto'), 'Um app para a equipe registrar')
  assert.equal(suggestProjectName('  checklist de abertura da loja  '), 'Checklist de abertura da loja')
  assert.equal(suggestProjectName(''), '')
})
