import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { liveFlow } from './harness.mjs'

const Q1 = 'Os valores aparecem em reais?'
const Q2 = 'Quem usa o painel?'

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
    window.__shifts = []
    window.__cardAt = null
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__shifts.push({ t: entry.startTime, value: entry.value }) }).observe({ type: 'layout-shift', buffered: true })
    const watch = () => {
      if (window.__cardAt === null && document.querySelector('[data-testid="ask-user"]')) window.__cardAt = performance.now()
      requestAnimationFrame(watch)
    }
    requestAnimationFrame(watch)
  })
  await page.goto(`/workspaces/${hub.workspaceId}/projects`)
  await page.getByLabel('Mensagem para o agente').fill('Crie um painel de vendas')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Criar e começar' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/c\/[^/]+$/)
  const card = page.getByLabel('Pergunta do agente')
  await expect(card.getByText(Q1, { exact: true })).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(5000)
  const { step0, shifts, cardAt } = await page.evaluate(() => ({
    step0: [...document.querySelectorAll('[data-testid="ask-user"] button')].map((el) => ({ name: el.getAttribute('aria-label') ?? el.innerText.trim(), disabled: el.disabled, cursor: getComputedStyle(el).cursor })),
    shifts: window.__shifts,
    cardAt: window.__cardAt,
  }))

  // Revisar and Próxima are disabled because nothing is answered yet; that is "not available", never "busy".
  for (const name of ['Revisar', 'Próxima']) {
    const control = step0.find((entry) => entry.name === name)
    assert.deepEqual([control.disabled, control.cursor], [true, 'not-allowed'], `${name} is disabled and says not allowed`)
  }
  assert.deepEqual(step0.filter((entry) => entry.cursor === 'wait'), [], 'no control of the card shows the wait cursor')

  // Once the card is on the screen, the words above it are all there: nothing shifts under it.
  assert.notEqual(cardAt, null, 'the card was seen')
  assert.deepEqual(shifts.filter((shift) => shift.t >= cardAt && shift.value > 0.0001), [], 'no layout shift once the card is shown')
})
