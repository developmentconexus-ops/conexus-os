import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { FAILURES } from '../../apps/web/src/generated/failures.ts'
import { liveFlow } from './harness.mjs'

const REQUEST = 'Crie uma planilha de despesas da viagem'
const IDLE_POLL_MS = 12_000

liveFlow({ id: 'builder.run-failure', nome: 'Uma execução que falha mostra a falha uma vez, ao vivo e depois de recarregar' }, async ({ page, model, hub }) => {
  // The first call and its 10 retries: the controller gives up on the eleventh answer.
  model.script({ error: { status: 500, message: 'LIVE_MODEL_REFUSED' }, times: 11 })
  const sessionReads = []
  page.on('request', (request) => { if (request.url().endsWith('/builder-session')) sessionReads.push(request.url()) })

  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(REQUEST)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)

  await expect.poll(async () => (await hub.db(`select state from builder.builder_run where request_text = '${REQUEST}'`))[0]?.state, { timeout: 240_000, intervals: [1_000] }).toBe('FAILED')
  const [run] = await hub.db(`select builder_run_id, failure_code from builder.builder_run where request_text = '${REQUEST}'`)
  const row = FAILURES[run.failure_code]
  assert.ok(row, `the run ended with ${run.failure_code}, a row of the failure table`)
  const reference = `Referência: ${run.builder_run_id.slice(0, 8)}.`

  const said = async () => (await page.locator('body').innerText()).split(row.message).length - 1
  const expectOneFailure = async () => {
    await expect.poll(said, { timeout: 30_000 }).toBe(1)
    await expect(page.getByRole('alert').filter({ hasText: row.message })).toHaveCount(1)
    await expect(page.getByRole('alert').filter({ hasText: row.message })).toContainText(reference)
    await expect(page.getByText('Tentando de novo')).toHaveCount(0)
    await expect(page.getByText('parou com um erro')).toHaveCount(0)
    await expect(page.getByText('Diagnóstico seguro')).toHaveCount(0)
    await expect(page.getByText('A última execução falhou. Veja a conversa.', { exact: true })).toHaveCount(1)
    await expect(page.getByText('Falhou', { exact: true })).toHaveCount(1)
  }

  await expectOneFailure()
  const readsAtSettle = sessionReads.length
  await page.waitForTimeout(IDLE_POLL_MS)
  assert.equal(sessionReads.length, readsAtSettle, 'a settled run is not polled')
  assert.equal(await said(), 1, 'the failure is still said once')

  await page.reload()
  await expect(page.getByRole('log').getByText(REQUEST, { exact: true })).toBeVisible({ timeout: 30_000 })
  await expectOneFailure()
  await page.waitForTimeout(3_000)
  assert.equal(await said(), 1, 'after reload the failure is said once')
})
