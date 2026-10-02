import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

const REQUEST = 'Crie uma lista de tarefas da equipe'
const REPLY = 'Posso montar essa lista de tarefas. Quer começar pelas tarefas do dia?'

liveFlow({ id: 'project.delete-wrong-name', nome: 'Excluir um Projeto digitando o nome errado' }, async ({ page, model, hub }) => {
  model.script({ parts: [{ text: REPLY }] })

  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(REQUEST)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)
  await expect(page.getByRole('log')).toContainText(REPLY, { timeout: 60_000 })
  await expect.poll(() => hub.db(`select state from builder.builder_run where request_text = '${REQUEST}'`), { timeout: 30_000 })
    .toEqual([{ state: 'SUCCEEDED' }])
  const projectId = /\/projects\/([^/]+)\//.exec(new URL(page.url()).pathname)[1]
  const [{ name }] = await hub.db(`select name from project.project where project_id = '${projectId}'`)

  await page.goto(`/projects/${projectId}/settings`)
  await page.getByRole('button', { name: 'Excluir Projeto' }).click()
  await expect(page.getByRole('heading', { name: `Excluir ${name}?` })).toBeVisible()
  const confirm = page.getByRole('button', { name: 'Excluir para sempre' })
  await expect(confirm).toBeDisabled()
  await page.getByLabel('Nome do Projeto').fill(`${name} errado`)
  await expect(confirm).toBeDisabled()
  await page.getByLabel('Nome do Projeto').fill(name.toLowerCase() === name ? name.toUpperCase() : name.toLowerCase())
  await expect(confirm).toBeDisabled()
  await page.getByLabel('Nome do Projeto').fill(name)
  await expect(confirm).toBeEnabled()

  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByRole('heading', { name: `Excluir ${name}?` })).toHaveCount(0)
  assert.deepEqual(await hub.db(`select name from project.project where project_id = '${projectId}'`), [{ name }], 'the Project is still stored')
  assert.equal(new URL(page.url()).pathname, `/projects/${projectId}/settings`, 'the person stays on the Project settings')
})
