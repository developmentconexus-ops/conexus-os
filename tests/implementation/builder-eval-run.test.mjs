import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from '@playwright/test'
import {
  DEFAULT_BASE_URL, answerPendingCard, lastAssistantText, lastCheckReport, maskDigits, parseArgs, resolveStatePath,
} from '../../scripts/builder-eval/run.mjs'

let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser.close() })

// The markup the web renders for a pending plan and question (pending-card.tsx, ask-user-pt.tsx);
// each click records what the person would have sent and removes the card.
const planPage = `<section aria-label="Plano para aprovar">
  <p>O agente propõe um plano: <strong>Lista de tarefas</strong>. Aprovar e construir?</p>
  <details open><summary>Plano</summary><pre>1. Criar a tabela\n2. Criar a tela</pre></details>
  <button onclick="window.sent = 'approved'; this.closest('section').remove()">Aprovar e construir</button>
  <button disabled>Pedir ajustes</button>
</section>`
const optionsPage = `<div aria-label="Pergunta do agente"><p>Qual formato de data?</p>
  <label><input type="radio" name="q" onchange="window.sent = this.nextElementSibling.innerText; this.closest('div[aria-label]').remove()"><span><span style="display:block">Dia/mês/ano</span><span style="display:block">Padrão brasileiro</span></span></label>
  <label><input type="radio" name="q"><span><span>Ano-mês-dia</span></span></label></div>`
const textPage = `<div aria-label="Pergunta do agente"><label for="a">Qual o nome da empresa?</label>
  <div><input id="a"><button aria-label="Enviar resposta" onclick="window.sent = document.getElementById('a').value">Enviar resposta</button></div>
  <script>document.getElementById('a').addEventListener('keydown', (e) => { if (e.key === 'Enter') window.sent = e.target.value })</script></div>`

const withPage = async (html, run) => {
  const page = await browser.newPage()
  try {
    await page.setContent(html)
    await run(page)
  } finally {
    await page.close()
  }
}

test('the plan card is approved once and recorded with its title and text', async () => {
  await withPage(planPage, async (page) => {
    const answers = []
    const first = await answerPendingCard(page, answers, null)
    assert.equal(first, 'plan:Lista de tarefas:1. Criar a tabela\n2. Criar a tela')
    assert.equal(await page.evaluate(() => window.sent), 'approved')
    assert.deepEqual(answers, [{ kind: 'PLAN', title: 'Lista de tarefas', text: '1. Criar a tabela\n2. Criar a tela', answer: 'Aprovar e construir' }])
    assert.equal(await answerPendingCard(page, answers, first), null)
    assert.equal(answers.length, 1)
  })
})

test('a card still on screen while its answer travels is not answered twice', async () => {
  await withPage(planPage.replace("this.closest('section').remove()", ''), async (page) => {
    const answers = []
    const first = await answerPendingCard(page, answers, null)
    const second = await answerPendingCard(page, answers, first)
    assert.equal(second, first)
    assert.equal(answers.length, 1)
  })
})

test('a question with options gets the first option', async () => {
  await withPage(optionsPage, async (page) => {
    const answers = []
    await answerPendingCard(page, answers, null)
    assert.deepEqual(answers, [{ kind: 'QUESTION', title: 'Qual formato de data?', text: 'Qual formato de data?', answer: 'Dia/mês/ano' }])
    assert.equal(await page.evaluate(() => window.sent), 'Dia/mês/ano\nPadrão brasileiro')
  })
})

test('a question without options gets the fixed simplest-way answer', async () => {
  await withPage(textPage, async (page) => {
    const answers = []
    await answerPendingCard(page, answers, null)
    assert.deepEqual(answers, [{ kind: 'QUESTION', title: 'Qual o nome da empresa?', text: 'Qual o nome da empresa?', answer: 'Pode seguir com o que achar mais simples.' }])
    assert.equal(await page.evaluate(() => window.sent), 'Pode seguir com o que achar mais simples.')
  })
})

test('a page with no card answers nothing', async () => {
  await withPage('<main>Construindo...</main>', async (page) => {
    const answers = []
    assert.equal(await answerPendingCard(page, answers, null), null)
    assert.deepEqual(answers, [])
  })
})

test('the last conexus_check report is the one with the latest message', () => {
  const check = (createdAt, ok) => ({ role: 'assistant', createdAt, content: { parts: [{ type: 'tool-invocation', toolInvocation: { toolName: 'conexus_check', state: 'result', result: { ok, steps: [], facts: { operations: 1, migrations: 0, jsGzipBytes: 9 } } } }] } })
  const messages = [check('2026-09-29T10:05:00Z', true), { role: 'user', createdAt: '2026-09-29T10:00:00Z', content: { parts: [] } }, check('2026-09-29T10:02:00Z', false)]
  assert.deepEqual(lastCheckReport(messages), { report: { ok: true, steps: [], facts: { operations: 1, migrations: 0, jsGzipBytes: 9 } }, reason: null })
  assert.deepEqual(lastCheckReport([]), { report: null, reason: 'no conexus_check result in the conversation' })
})

test('the last assistant text joins the text parts of the newest assistant message', () => {
  const messages = [
    { role: 'assistant', createdAt: '2026-09-29T10:00:00Z', content: { parts: [{ type: 'text', text: 'antes' }] } },
    { role: 'assistant', createdAt: '2026-09-29T10:09:00Z', content: { parts: [{ type: 'text', text: 'Falta a Conexão.' }, { type: 'tool-invocation', toolInvocation: {} }, { type: 'text', text: 'Vincule em Integrações.' }] } },
    { role: 'user', createdAt: '2026-09-29T10:10:00Z', content: { parts: [{ type: 'text', text: 'ok' }] } },
  ]
  assert.equal(lastAssistantText(messages), 'Falta a Conexão.\nVincule em Integrações.')
})

test('masking replaces every digit and leaves the words', () => {
  assert.equal(maskDigits('Pedido 40118: R$ 1.234,56 em 3 itens'), 'Pedido #####: R$ #.###,## em # itens')
  assert.equal(maskDigits(null), null)
})

test('a non-default base URL without CONEXUS_STATE refuses, and never reaches the pilot helper', () => {
  const saved = process.env.CONEXUS_STATE
  try {
    delete process.env.CONEXUS_STATE
    const options = parseArgs(['--case', 'c.json', '--out', 'o', '--base-url', 'https://hub.conexus.localhost:4443', '--mask-values'])
    assert.equal(options.maskValues, true)
    assert.throws(() => resolveStatePath(options.baseUrl), {
      message: 'builder-eval: --base-url https://hub.conexus.localhost:4443 is not the default Hub, so CONEXUS_STATE must name a storage state for it; the pilot session helper is never used',
    })
    process.env.CONEXUS_STATE = '/tmp/branch-state.json'
    assert.equal(resolveStatePath(options.baseUrl), '/tmp/branch-state.json')
    assert.equal(DEFAULT_BASE_URL, 'https://hub.conexus.localhost:3443')
  } finally {
    if (saved === undefined) delete process.env.CONEXUS_STATE
    else process.env.CONEXUS_STATE = saved
  }
})

test('the refusal grader passes a reply that names the system and Integrações, and fails a source change', async () => {
  const { gradeRefusal } = await import('../../scripts/builder-eval/scorers.mjs')
  const reply = 'Não encontrei uma Conexão com o Sankhya neste projeto. Vincule a Conexão em Integrações e peça de novo.'
  assert.deepEqual(gradeRefusal({ preview: { kind: 'not-built', reason: 'NO_SOURCE_CHANGE' } }, 'Sankhya', reply), {
    score: 1, reason: 'O Builder não mudou o código e disse que falta a Conexão com Sankhya em Integrações.',
  })
  assert.deepEqual(gradeRefusal({ preview: { kind: 'observed' } }, 'Sankhya', reply), { score: 0, reason: 'o Builder mudou o código em vez de recusar' })
})
