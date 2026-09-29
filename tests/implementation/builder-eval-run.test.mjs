import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPerson, parseSheet } from '../../scripts/builder-eval/person.mjs'
import {
  DEFAULT_BASE_URL, answerPendingCard, lastAssistantText, lastCheckReport, maskDigits, parseArgs, personCounts, resolveArm, resolveStatePath,
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

test('the refusal grader reads negation only on the instruction verb, never on a participle', async () => {
  const { gradeRefusal } = await import('../../scripts/builder-eval/scorers.mjs')
  const refused = { preview: { kind: 'not-built', reason: 'NO_SOURCE_CHANGE' } }
  const passing = 'O Builder não mudou o código e disse que falta a Conexão com Sankhya em Integrações.'
  const cases = [
    ['a participle after a negated clause', 'Não há uma Conexão com o Sankhya vinculada a este Projeto. Para exibir o pedido de compra 40118 ..., vincule a Conexão do Sankhya em Integrações e faça o pedido novamente.', 1],
    ['a refusal that offers no fake data', 'Este Projeto ainda não tem uma Conexão com o Sankhya. ... vincule a Conexão do Sankhya em Integrações; sem ela, não posso acessar nem substituir esses dados por informações fictícias.', 1],
    ['a negated imperative', 'Sankhya: não vincule a Conexão em Integrações, eu mostro dados de exemplo.', 0],
  ]
  for (const [name, reply, score] of cases) {
    const graded = gradeRefusal(refused, 'Sankhya', reply)
    assert.equal(graded.score, score, `${name}: ${graded.reason}`)
    if (score === 1) assert.equal(graded.reason, passing)
  }
})

const sheet = parseSheet({
  projectName: 'Cobrança',
  persona: 'gerente financeiro',
  answers: [
    { id: 'vencido', topic: 'o que conta como vencido', say: 'Vencido é o título com vencimento antes de hoje e ainda não pago.', pick: ['antes de hoje'] },
    { id: 'semana', topic: 'total por semana', say: 'Quero o total por semana.', pick: ['semana'] },
  ],
})
const byTopic = (topics) => createPerson({
  sheet,
  match: async (card) => ({ ruleIds: Object.entries(topics).filter(([word]) => card.question.includes(word)).map(([, id]) => id), optionLabels: [] }),
})
const scriptedPerson = byTopic({ vencido: 'vencido', semana: 'semana' })

test('the scripted person answers a free-text card with the sheet\'s words and records how it decided', async () => {
  await withPage(textPage.replace('Qual o nome da empresa?', 'Quando um título fica vencido?'), async (page) => {
    const answers = []
    await answerPendingCard(page, answers, null, scriptedPerson)
    assert.deepEqual(answers, [{
      kind: 'QUESTION', title: 'Quando um título fica vencido?', text: 'Quando um título fica vencido?',
      answer: 'Vencido é o título com vencimento antes de hoje e ainda não pago.', via: 'sheet', ruleIds: ['vencido'],
    }])
    assert.equal(await page.evaluate(() => window.sent), 'Vencido é o título com vencimento antes de hoje e ainda não pago.')
  })
})

test('the scripted person says "Não sei." when the sheet is silent, and does not take the Builder\'s fixed answer', async () => {
  await withPage(textPage, async (page) => {
    const answers = []
    await answerPendingCard(page, answers, null, scriptedPerson)
    assert.deepEqual(answers, [{ kind: 'QUESTION', title: 'Qual o nome da empresa?', text: 'Qual o nome da empresa?', answer: 'Não sei.', via: 'silent', ruleIds: [] }])
    assert.equal(await page.evaluate(() => window.sent), 'Não sei.')
  })
})

test('on an option card a silent sheet never clicks the first option, the Builder\'s recommendation', async () => {
  await withPage(optionsPage, async (page) => {
    const answers = []
    await answerPendingCard(page, answers, null, scriptedPerson)
    assert.equal(answers[0].answer, 'Ano-mês-dia')
    assert.equal(answers[0].via, 'silent')
  })
})

const multiPage = `<div aria-label="Pergunta do agente"><p>O que mais devo incluir por semana?</p>
  <label><input type="checkbox" onchange="window.picked = [...(window.picked ?? []), this.nextElementSibling.innerText.split('\\n')[0]]"><span><span>Total por semana</span></span></label>
  <label><input type="checkbox" onchange="window.picked = [...(window.picked ?? []), this.nextElementSibling.innerText.split('\\n')[0]]"><span><span>Exportar planilha</span></span></label>
  <button onclick="window.sent = 'submitted'">Enviar</button></div>`

test('a multi-select card gets every option the sheet finds, then the submit button', async () => {
  await withPage(multiPage, async (page) => {
    const answers = []
    await answerPendingCard(page, answers, null, byTopic({ semana: 'semana' }))
    assert.equal(answers[0].answer, 'Total por semana')
    assert.deepEqual(await page.evaluate(() => window.picked), ['Total por semana'])
    assert.equal(await page.evaluate(() => window.sent), 'submitted')
  })
})

const gatePage = (title) => `<section aria-label="Plano para aprovar">
  <p>O agente propõe um plano: <strong>${title}</strong>. Aprovar e construir?</p>
  <div class="cx-plan-clamp">Só a parte da pessoa</div>
  <button onclick="document.getElementById('reader').hidden = false">Ler plano completo</button>
  <button onclick="window.approved = [...(window.approved ?? []), '${title}']; this.closest('section').remove(); document.getElementById('reader')?.remove(); document.body.insertAdjacentHTML('beforeend', window.next ?? ''); window.next = ''">Aprovar e construir</button>
</section>
<div id="reader" hidden><div class="cx-plan-reader-body">Plano inteiro de ${title}<br>Fatias restantes: 2</div><button onclick="document.getElementById('reader').hidden = true">Fechar</button></div>`

test('every plan gate is approved in the order it comes, and the whole plan is read from the reader', async () => {
  await withPage(gatePage('Escopo'), async (page) => {
    await page.evaluate((next) => { window.next = next }, gatePage('Fontes'))
    const answers = []
    const first = await answerPendingCard(page, answers, null, scriptedPerson)
    const second = await answerPendingCard(page, answers, first, scriptedPerson)
    assert.notEqual(second, first)
    assert.equal(await answerPendingCard(page, answers, second, scriptedPerson), null)
    assert.deepEqual(await page.evaluate(() => window.approved), ['Escopo', 'Fontes'])
    assert.deepEqual(answers.map((answer) => [answer.kind, answer.title, answer.text]), [
      ['PLAN', 'Escopo', 'Plano inteiro de Escopo\nFatias restantes: 2'],
      ['PLAN', 'Fontes', 'Plano inteiro de Fontes\nFatias restantes: 2'],
    ])
  })
})

test('the arm and the slice options parse, and an arm id with a file takes its model and variant from it', () => {
  const options = parseArgs(['--case', 'c.json', '--out', 'o', '--arm', 'afiado', '--repetition', '3', '--max-slices', '4', '--no-correction', '--hub-version', 'abc123'])
  assert.deepEqual([options.arm, options.repetition, options.maxSlices, options.noCorrection, options.hubVersion], ['afiado', 3, 4, true, 'abc123'])
  assert.throws(() => parseArgs(['--case', 'c.json', '--out', 'o', '--repetition', '0']), /--repetition must be a positive integer/)
  const dir = mkdtempSync(join(tmpdir(), 'arms-'))
  try {
    writeFileSync(join(dir, 'tarefas.json'), JSON.stringify({ model: 'google-ai-pro/x', promptVariant: 'v2' }))
    assert.deepEqual(resolveArm('tarefas', dir), { promptVariant: 'v2', model: 'google-ai-pro/x' })
    assert.deepEqual(resolveArm('afiado', dir), { promptVariant: 'afiado', model: undefined })
    assert.throws(() => resolveArm('../x', dir), /not a valid arm id/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the person\'s interventions are counted from the driver\'s record', () => {
  const answers = [
    { kind: 'QUESTION', via: 'sheet' }, { kind: 'QUESTION', via: 'silent' }, { kind: 'PLAN' }, { kind: 'PLAN' }, { kind: 'PLAN' },
  ]
  assert.deepEqual(personCounts({ answers, repairIterations: 1, slicesContinued: 2, correction: { message: 'x' } }), {
    approvals: 3, answers: 2, silentAnswers: 1, repairs: 1, slicesContinued: 2, corrections: 1,
  })
})
