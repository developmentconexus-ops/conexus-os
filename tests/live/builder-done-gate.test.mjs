import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

// The agent's "done" is gated by the Conexus check, inside Mastra's loop. The model is scripted; the
// check, the compiler and the browser are real.
const write = (path, content) => ({ parts: [{ call: { name: 'mastra_workspace_write_file', args: { path, content } } }] })
const say = (text) => ({ parts: [{ text }] })
const BROKEN = "export const total: number = 'zero'\n"
const FIXED = 'export const total: number = 0\n'
const CHECK_NOTICE = 'Verificação do Conexus'

const runOf = async (hub, request) => (await hub.db(`select builder_run_id, state, result_kind, failure_code, result_source_revision from builder.builder_run where request_text = '${request}'`))[0]
const settled = (hub, request, timeout = 240_000) => expect.poll(async () => (await runOf(hub, request))?.state, { timeout, intervals: [1_000] }).not.toMatch(/^(QUEUED|RUNNING)$/)
const checksOf = (hub, runId) => readFileSync(join(hub.evidenceDir, 'hub.log'), 'utf8').split('\n').filter((line) => {
  try { const record = JSON.parse(line); return record.msg === 'BUILDER_CHECK' && record.run === runId } catch { return false }
}).length
const said = (call) => JSON.stringify(call.contents)
const notices = (page) => page.getByRole('log').getByRole('note')
const shot = async (page, hub, name) => {
  await page.screenshot({ path: join(hub.evidenceDir, 'live', `${name}.png`), fullPage: true })
  writeFileSync(join(hub.evidenceDir, 'live', `${name}.aria.txt`), await page.locator('body').ariaSnapshot())
}

const startProject = async (page, hub, request) => {
  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(request)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)
}

liveFlow({ id: 'builder.done-gate-repairs', nome: 'Um erro do app volta para o agente no mesmo pedido, e a pessoa vê a verificação enquanto ele corrige' }, async ({ page, model, hub }) => {
  const REQUEST = 'Crie um total simples'
  // The repair answer is held, so the screen can be read while the agent works on the fix.
  model.script(write('app/src/total.ts', BROKEN), say('Pronto, terminei.'), { ...write('app/src/total.ts', FIXED), delayMs: 15_000 }, say('Corrigi o erro de tipo.'))
  await startProject(page, hub, REQUEST)

  const notice = notices(page).filter({ hasText: `${CHECK_NOTICE}: o app não passou (1 de 3).` })
  await expect(notice).toBeVisible({ timeout: 90_000 })
  await expect(notice).toContainText('TS2322')
  expect((await runOf(hub, REQUEST)).state).toBe('RUNNING')
  // A notice spans the conversation, never one character per line.
  expect((await notice.boundingBox()).width).toBeGreaterThan(300)
  await shot(page, hub, 'repairs-1-while-the-agent-fixes')

  await settled(hub, REQUEST)
  await expect(page.getByRole('log')).toContainText('Corrigi o erro de tipo.')
  await expect(page.getByText('versão 1 · Build passou')).toBeVisible({ timeout: 60_000 })
  await shot(page, hub, 'repairs-2-green')
  const run = await runOf(hub, REQUEST)
  assert.deepEqual([run.state, run.result_kind], ['SUCCEEDED', 'SOURCE_CHANGED'])
  assert.equal(model.calls.length, 4)
  assert.ok(said(model.calls[2]).includes('TS2322'), 'the model call after the red check carries what failed')
  assert.equal(checksOf(hub, run.builder_run_id), 2, 'one check per finish, reused for admission and the Preview')
  await page.reload()
  await expect(notices(page).filter({ hasText: CHECK_NOTICE })).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByRole('log')).toContainText('Corrigi o erro de tipo.')
  await expect(page.getByRole('log')).toContainText('Pronto, terminei.')
})

liveFlow({ id: 'builder.done-gate-waiting', nome: 'Uma pergunta do agente não dispara a verificação; ela roda uma vez depois da resposta' }, async ({ page, model, hub }) => {
  const REQUEST = 'Crie um total com moeda'
  const QUESTION = 'Em que moeda o total aparece?'
  model.script(
    { parts: [{ call: { name: 'ask_user', args: { questions: [{ question: QUESTION, options: [{ label: 'Reais (recomendado)' }, { label: 'Dólares' }] }] } } }] },
    write('app/src/total.ts', FIXED),
    say('Pronto, o total está em reais.'),
  )
  await startProject(page, hub, REQUEST)
  const card = page.getByLabel('Pergunta do agente')
  await expect(card.getByText(QUESTION, { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect.poll(async () => (await hub.db(`select phase from builder.builder_run where request_text = '${REQUEST}'`))[0]?.phase, { timeout: 30_000 }).toBe('WAITING')
  const waiting = await runOf(hub, REQUEST)
  assert.equal(checksOf(hub, waiting.builder_run_id), 0, 'no check while the run waits for the answer')

  await card.getByLabel('Reais (recomendado)').check()
  await card.getByRole('button', { name: 'Enviar resposta' }).click()
  await settled(hub, REQUEST)
  await expect(page.getByRole('log')).toContainText('Pronto, o total está em reais.', { timeout: 60_000 })
  const run = await runOf(hub, REQUEST)
  assert.deepEqual([run.state, run.result_kind], ['SUCCEEDED', 'SOURCE_CHANGED'])
  assert.equal(checksOf(hub, run.builder_run_id), 1)
  assert.equal(model.calls.length, 3)
})

liveFlow({ id: 'builder.done-gate-budget', nome: 'Depois de três verificações vermelhas a execução para e diz uma vez o que quebrou' }, async ({ page, model, hub }) => {
  const REQUEST = 'Crie um total que nunca compila'
  model.script(
    write('app/src/total.ts', BROKEN), say('Pronto.'),
    write('app/src/total.ts', "export const total: number = 'ainda errado'\n"), say('Corrigi.'),
    say('Agora sim, terminei.'),
  )
  await startProject(page, hub, REQUEST)
  await settled(hub, REQUEST)
  const run = await runOf(hub, REQUEST)
  assert.deepEqual([run.state, run.failure_code, run.result_source_revision], ['FAILED', 'BUILDER_APP_NOT_FIXED', null])
  assert.equal(model.calls.length, 5, 'the third red finish stops the loop instead of calling the model again')

  await expect(notices(page).filter({ hasText: '(3 de 3)' })).toContainText('O limite de tentativas acabou', { timeout: 60_000 })
  await page.reload()
  await expect(notices(page).filter({ hasText: CHECK_NOTICE })).toHaveCount(3, { timeout: 60_000 })
  // The check's last notice is the run's only word on the failure: no note repeats it with the run's id.
  await expect(notices(page)).toHaveCount(3)
  await expect(page.getByRole('log')).not.toContainText(run.builder_run_id)
  await expect(page.getByRole('log')).toContainText('Agora sim, terminei.')
  await shot(page, hub, 'budget-stops-after-three')
})
