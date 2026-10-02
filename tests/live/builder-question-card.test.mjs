import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

const Q1 = 'Os valores aparecem em reais?'
const Q2 = 'Quem usa o painel?'
const OUT = process.env.PROBE_OUT

liveFlow({ id: 'builder.question-card', nome: 'Ver a pergunta do agente sem a tela pular e sem cursor de espera' }, async ({ page, model, hub }) => {
  model.script(
    { parts: [
      { thought: 'Preciso entender o pedido antes de montar o painel. Vou perguntar sobre moeda e público para não errar a estrutura dos dados.' },
      { text: 'Antes de começar, tenho duas perguntas rápidas sobre o painel de vendas que você pediu, para acertar a estrutura desde o início.' },
      { thought: 'Duas perguntas curtas bastam.' },
      { call: { name: 'ask_user', args: { questions: [
        { header: 'Atendimento', question: Q1, options: [{ label: 'Sim, com valor' }, { label: 'Não, só as listas' }] },
        { header: 'Público', question: Q2, options: [{ label: 'Diretoria' }, { label: 'Vendedores' }] },
      ] } } },
    ] },
  )
  await page.addInitScript(() => {
    const samples = []
    window.__samples = samples
    window.__shifts = []
    try { new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__shifts.push({ t: Math.round(performance.now()), value: e.value, hadInput: e.hadRecentInput }) }).observe({ type: 'layout-shift', buffered: true }) } catch {}
    let last = ''
    const tick = () => {
      const log = document.querySelector('[role="log"]')
      const card = document.querySelector('[data-testid="ask-user"]')
      const txt = log?.innerText ?? ''
      const s = {
        card: !!card, cardTop: card ? Math.round(card.getBoundingClientRect().top + window.scrollY) : null,
        pensando: (txt.match(/Pensando…/g) ?? []).length, pensou: (txt.match(/Pensou/g) ?? []).length,
        textLen: txt.length, logH: log ? Math.round(log.scrollHeight) : null,
      }
      const k = JSON.stringify(s)
      if (k !== last) { last = k; samples.push({ t: Math.round(performance.now()), ...s }) }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill('Crie um painel de vendas')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)
  const card = page.getByLabel('Pergunta do agente')
  await expect(card.getByText(Q1, { exact: true })).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(5000)
  const controls = async () => page.evaluate(() => [...document.querySelectorAll('[data-testid="ask-user"] button, [data-testid="ask-user"] input')].map((el) => ({
    tag: el.tagName, role: el.getAttribute('role') ?? el.type, name: el.getAttribute('aria-label') ?? el.innerText?.trim() ?? el.placeholder, disabled: el.disabled, cursor: getComputedStyle(el).cursor, opacity: getComputedStyle(el).opacity })))
  const step0 = await controls()
  const data = await page.evaluate(() => ({ samples: window.__samples, shifts: window.__shifts }))
  if (OUT) writeFileSync(OUT, JSON.stringify({ step0, ...data }, null, 1))

  // Revisar and Próxima are disabled because nothing is answered yet; that is "not available", never "busy".
  for (const name of ['Revisar', 'Próxima']) {
    const control = step0.find((entry) => entry.name === name)
    assert.deepEqual([control.disabled, control.cursor], [true, 'not-allowed'], `${name} is disabled and says not allowed`)
  }
  assert.deepEqual(step0.filter((entry) => entry.cursor === 'wait'), [], 'no control of the card shows the wait cursor')

  // Once the card is on the screen, the words above it are all there: nothing shifts under it.
  const appeared = data.samples.find((sample) => sample.card)
  assert.ok(appeared, 'the card was sampled')
  assert.deepEqual(data.shifts.filter((shift) => shift.t >= appeared.t && shift.value > 0.0001), [], 'no layout shift once the card is shown')
})
