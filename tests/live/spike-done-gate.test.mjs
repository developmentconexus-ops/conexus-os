import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

// Spike (option A): the run's "done" is gated by Mastra's isTaskComplete, which runs the Hub's real
// check.mjs on the candidate. The model is scripted; the check, the compiler and the browser are real.
const WRITE = 'mastra_workspace_write_file'
const write = (path, content) => ({ parts: [{ call: { name: WRITE, args: { path, content } } }] })
const say = (text) => ({ parts: [{ text }] })
const BROKEN = "export const total: number = 'zero'\n"
const FIXED = 'export const total: number = 0\n'

const hubLog = (hub) => readFileSync(join(hub.evidenceDir, 'hub.log'), 'utf8')
const gateLines = (hub, runId) => hubLog(hub).split('\n').filter((line) => line.includes(runId) && /BUILDER_(GATE|CHECK:gate)/.test(line))
const runOf = async (hub, request) => (await hub.db(`select builder_run_id, state, result_kind, failure_code from builder.builder_run where request_text = '${request}'`))[0]
const contentsText = (call) => JSON.stringify(call.contents)

const startProject = async (page, hub, request) => {
  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill(request)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)
}

const settled = (hub, request, timeout = 240_000) => expect.poll(async () => (await runOf(hub, request))?.state, { timeout, intervals: [1_000] }).not.toMatch(/^(QUEUED|RUNNING)$/)

const shot = async (page, hub, name) => {
  await page.screenshot({ path: join(hub.evidenceDir, 'live', `${name}.png`), fullPage: true })
  writeFileSync(join(hub.evidenceDir, 'live', `${name}.aria.txt`), await page.locator('body').ariaSnapshot())
}

liveFlow({ id: 'spike.gate-repairs', nome: 'Um erro do app volta para o agente no mesmo turno e a execução termina verde' }, async ({ page, model, hub }) => {
  const REQUEST = 'Crie um total simples'
  model.script(write('app/src/total.ts', BROKEN), say('Pronto, terminei.'), { ...write('app/src/total.ts', FIXED), delayMs: 12_000 }, say('Corrigi o erro de tipo.'))
  await startProject(page, hub, REQUEST)
  // While the gate checks, and while the agent repairs, the person sees the run's own line.
  const status = page.getByRole('status').filter({ hasText: /Verificando o app|Agente trabalhando/ })
  await expect(page.getByRole('status').filter({ hasText: 'Verificando o app' }).first()).toBeVisible({ timeout: 30_000 }).then(() => console.log('PROOF3 saw "Verificando o app" during the check'), () => console.log('PROOF3 did not see "Verificando o app"'))
  await expect.poll(async () => (await hub.db(`select phase from builder.builder_run where request_text = '${REQUEST}'`))[0]?.phase, { timeout: 30_000 }).toBe('AGENT')
  await page.waitForTimeout(3_000)
  const liveNotice = await page.getByRole('note').filter({ hasText: 'Verificação do Conexus' }).count()
  console.log('PROOF3 notices visible live while the agent repairs:', liveNotice, 'status:', await status.first().textContent().catch(() => null))
  await shot(page, hub, 'proof3-live-while-repairing')
  await settled(hub, REQUEST)
  const run = await runOf(hub, REQUEST)
  console.log('PROOF1 run', JSON.stringify(run))
  console.log('PROOF1 gate', JSON.stringify(gateLines(hub, run.builder_run_id), null, 1))
  console.log('PROOF1 model calls', model.calls.length)
  console.log('PROOF1 call3 tail', contentsText(model.calls[2]).slice(-1500))
  await expect(page.getByRole('log')).toContainText('Corrigi o erro de tipo.', { timeout: 60_000 })
  await shot(page, hub, 'proof3-live-after-run')
  await page.reload()
  await expect(page.getByRole('log')).toContainText('Corrigi o erro de tipo.', { timeout: 60_000 })
  await shot(page, hub, 'proof3-after-reload')
  assert.equal(model.calls.length, 4)
  assert.ok(contentsText(model.calls[2]).includes('TS2322'), 'the third model call carries the check failure')
  assert.deepEqual([run.state, run.result_kind], ['SUCCEEDED', 'SOURCE_CHANGED'])
})

liveFlow({ id: 'spike.gate-parks', nome: 'Uma pergunta ao usuário não dispara a verificação; a resposta segue e a verificação roda uma vez' }, async ({ page, model, hub }) => {
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
  await expect.poll(async () => (await hub.db(`select phase from builder.builder_run where request_text = '${REQUEST}'`))[0]?.phase, { timeout: 30_000 }).toBe('PARKED')
  const run = await runOf(hub, REQUEST)
  const whileParked = gateLines(hub, run.builder_run_id)
  console.log('PROOF2 gate lines while parked', JSON.stringify(whileParked))
  await shot(page, hub, 'proof2-parked')
  await card.getByLabel('Reais (recomendado)').check()
  await card.getByRole('button', { name: 'Enviar resposta' }).click()
  await settled(hub, REQUEST)
  const after = await runOf(hub, REQUEST)
  const lines = gateLines(hub, run.builder_run_id).map((line) => JSON.parse(line).msg)
  console.log('PROOF2 run', JSON.stringify(after))
  console.log('PROOF2 gate lines', JSON.stringify(lines, null, 1))
  await expect(page.getByRole('log')).toContainText('Pronto, o total está em reais.', { timeout: 60_000 })
  await shot(page, hub, 'proof2-answered')
  assert.deepEqual(whileParked, [], 'no gate line while the run is parked')
  assert.equal(lines.filter((line) => line.startsWith('BUILDER_CHECK:gate')).length, 1, 'one check, on the resumed leg')
  assert.deepEqual([after.state, after.result_kind], ['SUCCEEDED', 'SOURCE_CHANGED'])
  assert.equal(model.calls.length, 3)
})

liveFlow({ id: 'spike.gate-gives-up', nome: 'Depois de 3 verificações vermelhas a execução falha e mostra o que quebrou' }, async ({ page, model, hub }) => {
  const REQUEST = 'Crie um total que nunca compila'
  model.script(
    write('app/src/total.ts', BROKEN), say('Pronto.'),
    write('app/src/total.ts', "export const total: number = 'ainda errado'\n"), say('Corrigi.'),
    say('Agora sim, terminei.'),
  )
  await startProject(page, hub, REQUEST)
  await settled(hub, REQUEST)
  const run = await runOf(hub, REQUEST)
  const lines = gateLines(hub, run.builder_run_id).map((line) => JSON.parse(line).msg)
  console.log('PROOF4 run', JSON.stringify(run))
  console.log('PROOF4 gate lines', JSON.stringify(lines, null, 1))
  console.log('PROOF4 model calls', model.calls.length)
  const main = await hub.db(`select current_state, last_preview_source_revision from builder.project_working_state w join builder.builder_run r using (project_id) where r.builder_run_id = '${run.builder_run_id}'`)
  console.log('PROOF4 working state', JSON.stringify(main))
  await expect(page.getByRole('log')).toContainText('(3 de 3)', { timeout: 60_000 })
  await shot(page, hub, 'proof4-gave-up')
  await page.reload()
  await expect(page.getByRole('log')).toContainText('(3 de 3)', { timeout: 60_000 })
  await shot(page, hub, 'proof4-gave-up-reload')
  assert.deepEqual([run.state, run.failure_code], ['FAILED', 'BUILDER_APP_NOT_FIXED'])
  assert.equal(model.calls.length, 5)
})

liveFlow({ id: 'spike.publish-retry', nome: 'Uma falha do Conexus depois da verificação verde não volta ao agente e é refeita sem o agente' }, async ({ page, model, hub }) => {
  const REQUEST = 'Crie um total que o Conexus não publica'
  const refuses = join(hub.sandboxRoot, 'store-refuses')
  writeFileSync(refuses, '')
  try {
    model.script(write('app/src/total.ts', FIXED), say('Pronto, o total está criado.'))
    await startProject(page, hub, REQUEST)
    await settled(hub, REQUEST)
  } finally {
    rmSync(refuses, { force: true })
  }
  const failed = await runOf(hub, REQUEST)
  const revision = (await hub.db(`select result_source_revision from builder.builder_run where builder_run_id = '${failed.builder_run_id}'`))[0].result_source_revision
  console.log('PROOF5 failed run', JSON.stringify(failed), revision)
  console.log('PROOF5 model calls after the failure', model.calls.length)
  await expect(page.getByText('Não publicada por uma falha do Conexus')).toBeVisible({ timeout: 60_000 })
  await shot(page, hub, 'proof5-publish-failed')
  assert.deepEqual([failed.state, failed.result_kind, failed.failure_code], ['FAILED', 'SOURCE_CHANGED_PUBLISH_FAILED', 'APPLICATION_ARTIFACT_INPUT_REFUSED'])
  assert.equal(model.calls.length, 2, 'the agent was not sent back to work')
  assert.ok(!model.calls.some((call) => contentsText(call).includes('APPLICATION_ARTIFACT')), 'no model call ever saw the store refusal')

  await page.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect.poll(async () => (await runOf(hub, REQUEST))?.state, { timeout: 120_000, intervals: [1_000] }).toBe('SUCCEEDED')
  const retried = await runOf(hub, REQUEST)
  const after = await hub.db(`select r.result_source_revision, w.current_state, w.last_preview_source_revision from builder.builder_run r join builder.project_working_state w using (project_id) where r.builder_run_id = '${failed.builder_run_id}'`)
  const runs = await hub.db(`select count(*)::int as runs from builder.builder_run r where r.project_id = (select project_id from builder.builder_run where builder_run_id = '${failed.builder_run_id}')`)
  console.log('PROOF5 retried run', JSON.stringify(retried), JSON.stringify(after), JSON.stringify(runs))
  console.log('PROOF5 gate lines', JSON.stringify(gateLines(hub, failed.builder_run_id).map((line) => JSON.parse(line).msg), null, 1))
  console.log('PROOF5 publish lines', JSON.stringify(hubLog(hub).split('\n').filter((line) => line.includes(failed.builder_run_id) && /PUBLISH/.test(line)).map((line) => JSON.parse(line).msg), null, 1))
  await expect(page.getByText('Build passou')).toBeVisible({ timeout: 60_000 })
  await shot(page, hub, 'proof5-retried')
  assert.deepEqual([retried.state, retried.result_kind], ['SUCCEEDED', 'SOURCE_CHANGED'])
  assert.deepEqual(after, [{ result_source_revision: revision, current_state: 'PREVIEW_READY', last_preview_source_revision: revision }])
  assert.deepEqual(runs, [{ runs: 1 }], 'the retry is the same run, not a new one')
  assert.equal(model.calls.length, 2, 'the retry ran no agent turn')
})
