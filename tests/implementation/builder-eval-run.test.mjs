import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPerson, parseSheet } from '../../scripts/builder-eval/person.mjs'
import { parseCase } from '../../scripts/builder-eval/checks.mjs'
import {
  DEFAULT_BASE_URL, ac13Of, answerPendingCard, createCards, lastAssistantText, lastCheckReport, maskDigits, parseArgs, pendingCardCall, personCounts, resolveArm, resolveStatePath,
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
  <textarea aria-label="O que mudar no plano"></textarea>
  <button onclick="window.sent = 'rejected: ' + this.previousElementSibling.value; this.closest('section').remove()">Pedir ajustes</button>
</section>`
// The markup of a question card (ask-user-pt.tsx): one [data-ask-question] per question (a card of several shows one at a time) and one
// send button. Sending records each question's answer in window.sent (a list of cards, each a list
// of answers), removes the card and shows the next one of window.next, if any.
const askQuestion = ({ text, options = [], multi = false }) => options.length === 0
  ? `<div data-ask-question="${text}"><label>${text}</label><input type="text"></div>`
  : `<fieldset data-ask-question="${text}"><p>${text}</p>${options.map(([label, description]) => `<label><input type="${multi ? 'checkbox' : 'radio'}" name="${text}"><span><span style="display:block">${label}</span>${description ? `<span style="display:block">${description}</span>` : ''}</span></label>`).join('')}<input type="text" placeholder="Outra resposta"></fieldset>`
const askCard = (...questions) => questions.length === 1
  ? `<div aria-label="Pergunta do agente" data-testid="ask-user" data-ask-total="1">${askQuestion(questions[0])}<button onclick="window.send(this)">Enviar resposta</button></div>
<script>window.send = (button) => {
  const card = button.closest('[aria-label]')
  const answers = [...card.querySelectorAll('[data-ask-question]')].map((entry) => {
    const chosen = [...entry.querySelectorAll('input:checked')].map((input) => input.closest('label').innerText.split('\\n')[0].trim())
    if (entry.querySelector('input[type=checkbox]')) return chosen
    return chosen[0] ?? entry.querySelector('input[type=text]').value
  })
  window.sent = [...(window.sent ?? []), answers]
  card.remove()
  document.body.insertAdjacentHTML('beforeend', window.next?.shift() ?? '')
}</script>`
  : steppedCard(questions)
// The stepped card of ask-user-pt.tsx for 2 to 4 questions: a row of tabs ("data-answered"), one
// visible question with "Próxima", a single choice moving on by itself, then a review with the one send.
const steppedCard = (questions) => `<div aria-label="Pergunta do agente" data-testid="ask-user" data-ask-total="${questions.length}" id="card">
  <div role="tablist">${questions.map((question) => `<button role="tab" data-answered="false">${question.text}</button>`).join('')}<button role="tab">Revisar</button></div>
  <div id="panel"></div>
</div>
<script>{
  const holder = document.createElement('div')
  const entries = ${JSON.stringify(questions.map(askQuestion))}.map((html) => { holder.innerHTML = html; return holder.firstElementChild })
  const card = document.getElementById('card')
  const panel = document.getElementById('panel')
  const answerOf = (entry) => {
    const chosen = [...entry.querySelectorAll('input:checked')].map((input) => input.closest('label').innerText.split('\\n')[0].trim())
    const typed = entry.querySelector('input[type=text]').value.trim()
    if (entry.querySelector('input[type=checkbox]')) return typed ? [...chosen, typed] : chosen
    return typed || chosen[0] || null
  }
  const answered = (entry) => { const answer = answerOf(entry); return answer !== null && answer.length !== 0 }
  let step = 0
  const render = () => {
    [...card.querySelectorAll('[role=tab]')].forEach((tab, index) => { if (index < entries.length) tab.dataset.answered = String(answered(entries[index])) })
    panel.replaceChildren()
    if (step < entries.length) {
      panel.append(entries[step])
      const next = document.createElement('button')
      next.textContent = 'Próxima'
      next.disabled = !answered(entries[step])
      next.onclick = () => { step += 1; render() }
      panel.append(next)
      return
    }
    const send = document.createElement('button')
    send.textContent = 'Enviar respostas'
    send.onclick = () => {
      window.sent = [...(window.sent ?? []), entries.map(answerOf)]
      card.remove()
      document.body.insertAdjacentHTML('beforeend', window.next?.shift() ?? '')
    }
    panel.append(send)
  }
  card.addEventListener('input', () => { const next = panel.querySelector('button'); if (next && step < entries.length) { next.disabled = !answered(entries[step]); card.querySelectorAll('[role=tab]')[step].dataset.answered = String(answered(entries[step])) } })
  card.addEventListener('change', (event) => { if (event.target.type === 'radio') { step += 1; render() } })
  card.querySelectorAll('[role=tab]').forEach((tab, index) => { tab.onclick = () => { step = index; render() } })
  render()
}</script>`
const dateQuestion = { text: 'Qual formato de data?', options: [['Dia/mês/ano', 'Padrão brasileiro'], ['Ano-mês-dia']] }
const nameQuestion = { text: 'Qual o nome da empresa?' }
const optionsPage = askCard(dateQuestion)
const textPage = askCard(nameQuestion)

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
    const cards = createCards()
    const first = await answerPendingCard(page, cards, null)
    assert.equal(first, 'card')
    assert.equal(await page.evaluate(() => window.sent), 'approved')
    assert.deepEqual(cards.answers, [{ kind: 'PLAN', title: 'Lista de tarefas', text: '1. Criar a tabela\n2. Criar a tela', answer: 'Aprovar e construir' }])
    assert.equal(await answerPendingCard(page, cards, first), null)
    assert.equal(cards.answers.length, 1)
  })
})

test('with a scripted change, the plan card is sent back with it once and the next plan card is approved', async () => {
  await withPage(planPage, async (page) => {
    const cards = createCards({ adjust: 'Inclua os fins de semana' })
    const first = await answerPendingCard(page, cards, null)
    assert.equal(await page.evaluate(() => window.sent), 'rejected: Inclua os fins de semana')
    await page.setContent(planPage)
    await answerPendingCard(page, cards, first)
    assert.equal(await page.evaluate(() => window.sent), 'approved')
    assert.deepEqual(cards.answers.map(({ kind, answer, feedback }) => ({ kind, answer, feedback })), [
      { kind: 'PLAN', answer: 'Pedir ajustes', feedback: 'Inclua os fins de semana' },
      { kind: 'PLAN', answer: 'Aprovar e construir', feedback: undefined },
    ])
  })
})

test('a card still on screen while its answer travels is not answered twice', async () => {
  await withPage(planPage.replace("this.closest('section').remove()", ''), async (page) => {
    const cards = createCards()
    await answerPendingCard(page, cards, null)
    assert.equal(await answerPendingCard(page, cards, 'card'), null, 'the card the driver marked is left alone')
    assert.equal(cards.answers.length, 1)
  })
})

test('a question with options gets the first option', async () => {
  await withPage(optionsPage, async (page) => {
    const cards = createCards()
    await answerPendingCard(page, cards, null)
    assert.deepEqual(cards.answers, [{ kind: 'QUESTION', title: 'Qual formato de data?', text: 'Qual formato de data?', answer: 'Dia/mês/ano' }])
    assert.deepEqual(await page.evaluate(() => window.sent), [['Dia/mês/ano']])
  })
})

test('a question without options gets the fixed simplest-way answer', async () => {
  await withPage(textPage, async (page) => {
    const cards = createCards()
    await answerPendingCard(page, cards, null)
    assert.deepEqual(cards.answers, [{ kind: 'QUESTION', title: 'Qual o nome da empresa?', text: 'Qual o nome da empresa?', answer: 'Pode seguir com o que achar mais simples.' }])
    assert.deepEqual(await page.evaluate(() => window.sent), [['Pode seguir com o que achar mais simples.']])
  })
})

test('a page with no card answers nothing', async () => {
  await withPage('<main>Construindo...</main>', async (page) => {
    const cards = createCards()
    assert.equal(await answerPendingCard(page, cards, null), null)
    assert.deepEqual(cards.answers, [])
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
  await withPage(askCard({ text: 'Quando um título fica vencido?' }), async (page) => {
    const cards = createCards({ person: scriptedPerson })
    await answerPendingCard(page, cards, null)
    assert.deepEqual(cards.answers, [{
      kind: 'QUESTION', title: 'Quando um título fica vencido?', text: 'Quando um título fica vencido?',
      answer: 'Vencido é o título com vencimento antes de hoje e ainda não pago.', via: 'sheet', ruleIds: ['vencido'],
    }])
    assert.deepEqual(await page.evaluate(() => window.sent), [['Vencido é o título com vencimento antes de hoje e ainda não pago.']])
  })
})

test('the scripted person says "Não sei." when the sheet is silent, and does not take the Builder\'s fixed answer', async () => {
  await withPage(textPage, async (page) => {
    const cards = createCards({ person: scriptedPerson })
    await answerPendingCard(page, cards, null)
    assert.deepEqual(cards.answers, [{ kind: 'QUESTION', title: 'Qual o nome da empresa?', text: 'Qual o nome da empresa?', answer: 'Não sei.', via: 'silent', ruleIds: [] }])
    assert.deepEqual(await page.evaluate(() => window.sent), [['Não sei.']])
  })
})

test('on an option card a silent sheet types "Não sei." and clicks no option', async () => {
  await withPage(optionsPage, async (page) => {
    const cards = createCards({ person: scriptedPerson })
    await answerPendingCard(page, cards, null)
    assert.equal(cards.answers[0].answer, 'Não sei.')
    assert.equal(cards.answers[0].via, 'silent')
  })
})

const multiPage = askCard({ text: 'O que mais devo incluir por semana?', multi: true, options: [['Total por semana'], ['Exportar planilha']] })

test('a multi-select card gets every option the sheet finds, then the submit button', async () => {
  await withPage(multiPage, async (page) => {
    const cards = createCards({ person: byTopic({ semana: 'semana' }) })
    await answerPendingCard(page, cards, null)
    assert.equal(cards.answers[0].answer, 'Total por semana')
    assert.deepEqual(await page.evaluate(() => window.sent), [[['Total por semana']]])
  })
})

test('a card of three questions is answered question by question, each matched to the sheet, and sent once', async () => {
  const card = askCard(
    { text: 'Qual formato de data?', options: [['Dia/mês/ano'], ['Ano-mês-dia']] },
    { text: 'Quando um título fica vencido?' },
    { text: 'O que mais devo incluir por semana?', multi: true, options: [['Total por semana'], ['Exportar planilha']] },
  )
  await withPage(card, async (page) => {
    const cards = createCards({ person: scriptedPerson, readMessages: async () => threadWith(['ask_user', 'call-3', 'call']) })
    assert.equal(await answerPendingCard(page, cards, null), 'call:call-3')
    assert.deepEqual(await page.evaluate(() => window.sent), [['Não sei.', 'Vencido é o título com vencimento antes de hoje e ainda não pago.', ['Total por semana']]])
    assert.deepEqual(cards.answers.map(({ kind, toolCallId, title, answer, via, ruleIds }) => ({ kind, toolCallId, title, answer, via, ruleIds })), [
      { kind: 'QUESTION', toolCallId: 'call-3', title: 'Qual formato de data?', answer: 'Não sei.', via: 'silent', ruleIds: [] },
      { kind: 'QUESTION', toolCallId: 'call-3', title: 'Quando um título fica vencido?', answer: 'Vencido é o título com vencimento antes de hoje e ainda não pago.', via: 'sheet', ruleIds: ['vencido'] },
      { kind: 'QUESTION', toolCallId: 'call-3', title: 'O que mais devo incluir por semana?', answer: 'Total por semana', via: 'sheet', ruleIds: ['semana'] },
    ])
    assert.equal(await answerPendingCard(page, cards, 'call:call-3'), null)
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
    const cards = createCards({ person: scriptedPerson })
    await answerPendingCard(page, cards, null)
    await answerPendingCard(page, cards, 'card')
    assert.equal(await answerPendingCard(page, cards, 'card'), null)
    assert.deepEqual(await page.evaluate(() => window.approved), ['Escopo', 'Fontes'])
    assert.deepEqual(cards.answers.map((answer) => [answer.kind, answer.title, answer.text]), [
      ['PLAN', 'Escopo', 'Plano inteiro de Escopo\nFatias restantes: 2'],
      ['PLAN', 'Fontes', 'Plano inteiro de Fontes\nFatias restantes: 2'],
    ])
  })
})

test('the arm option parses, and an arm id takes its model from its file and must have one', () => {
  const options = parseArgs(['--case', 'c.json', '--out', 'o', '--arm', 'flash', '--repetition', '3', '--no-correction', '--hub-version', 'abc123'])
  assert.deepEqual([options.arm, options.repetition, options.noCorrection, options.hubVersion], ['flash', 3, true, 'abc123'])
  assert.throws(() => parseArgs(['--case', 'c.json', '--out', 'o', '--repetition', '0']), /--repetition must be a positive integer/)
  assert.throws(() => parseArgs(['--case', 'c.json', '--out', 'o', '--prompt-variant', 'v2']), /unknown option --prompt-variant/)
  assert.throws(() => parseArgs(['--case', 'c.json', '--out', 'o', '--max-slices', '2']), /unknown option --max-slices/)
  const dir = mkdtempSync(join(tmpdir(), 'arms-'))
  try {
    writeFileSync(join(dir, 'tarefas.json'), JSON.stringify({ model: 'google-ai-pro/x' }))
    assert.deepEqual(resolveArm('tarefas', dir), { model: 'google-ai-pro/x' })
    assert.throws(() => resolveArm('afiado', dir), /has no file/)
    assert.throws(() => resolveArm('../x', dir), /not a valid arm id/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the person\'s interventions are counted from the driver\'s record', () => {
  const answers = [
    { kind: 'QUESTION', via: 'sheet' }, { kind: 'QUESTION', via: 'silent' }, { kind: 'PLAN' }, { kind: 'APPROVAL' }, { kind: 'APPROVAL' },
  ]
  assert.deepEqual(personCounts({ answers, repairIterations: 1, correction: { message: 'x' } }), {
    approvals: 3, answers: 2, silentAnswers: 1, repairs: 1, corrections: 1,
  })
})

// The markup of the new approval card: ask_user with the two approval options (ask-user-pt.tsx).
const approvalPage = (question = 'Posso construir assim?') => askCard({ text: question, options: [['Aprovar e construir', 'Começa a construir.'], ['Pedir ajustes']] })
const changePage = askCard({ text: 'O que você quer mudar?' })
const threadWith = (...calls) => [{ role: 'assistant', createdAt: '2026-09-30T10:00:00Z', content: { parts: calls.map(([toolName, toolCallId, state]) => ({ type: 'tool-invocation', toolInvocation: { toolName, toolCallId, state, args: {} } })) } }]

test('the approval card is recognized by its options and approved, and never reaches the scripted person', async () => {
  const asked = []
  const person = { sheet: {}, answer: async (card) => { asked.push(card.question); return { answer: 'Pedir ajustes', via: 'sheet', ruleIds: [] } } }
  await withPage(approvalPage(), async (page) => {
    const cards = createCards({ person, readMessages: async () => [...threadWith(['ask_user', 'call-7', 'call']), { role: 'assistant', createdAt: '2026-09-30T10:05:00Z', content: { parts: [{ type: 'text', text: 'O plano: lista e tela.' }] } }] })
    assert.equal(await answerPendingCard(page, cards, null), 'call:call-7')
    assert.deepEqual(await page.evaluate(() => window.sent), [['Aprovar e construir']])
    assert.deepEqual(cards.answers, [{ kind: 'APPROVAL', toolCallId: 'call-7', title: 'Posso construir assim?', text: 'O plano: lista e tela.', answer: 'Aprovar e construir' }])
    assert.deepEqual(asked, [])
  })
})

test('a case that scripts "Pedir ajustes" asks for one change, sends its text, then approves the next card', async () => {
  await withPage(approvalPage(), async (page) => {
    await page.evaluate((html) => { window.next = [html.change, html.again] }, { change: changePage, again: approvalPage('Posso construir assim agora?') })
    const cards = createCards({ adjust: 'Quero também uma coluna de status.' })
    await answerPendingCard(page, cards, null)
    await answerPendingCard(page, cards, 'card')
    await answerPendingCard(page, cards, 'card')
    assert.deepEqual(await page.evaluate(() => window.sent), [['Pedir ajustes'], ['Quero também uma coluna de status.'], ['Aprovar e construir']])
    assert.deepEqual(cards.answers.map(({ kind, answer, via }) => [kind, answer, via]), [
      ['APPROVAL', 'Pedir ajustes', undefined], ['QUESTION', 'Quero também uma coluna de status.', 'case'], ['APPROVAL', 'Aprovar e construir', undefined],
    ])
  })
})

test('two card calls with the same question are told apart by their tool call ids and both answered', async () => {
  await withPage(approvalPage(), async (page) => {
    await page.evaluate((html) => { window.next = [html] }, approvalPage())
    let messages = threadWith(['ask_user', 'call-1', 'call'])
    const cards = createCards({ readMessages: async () => messages })
    const first = await answerPendingCard(page, cards, null)
    messages = threadWith(['ask_user', 'call-1', 'result'], ['ask_user', 'call-2', 'call'])
    const second = await answerPendingCard(page, cards, first)
    assert.deepEqual([first, second], ['call:call-1', 'call:call-2'])
    assert.deepEqual(cards.answers.map((answer) => answer.toolCallId), ['call-1', 'call-2'])
    assert.equal(await answerPendingCard(page, cards, second), null)
  })
})

test('a card that comes back for the call already answered is not answered again', async () => {
  await withPage(approvalPage().replace('card.remove()', ''), async (page) => {
    const cards = createCards({ readMessages: async () => threadWith(['ask_user', 'call-1', 'call']) })
    const first = await answerPendingCard(page, cards, null)
    await page.evaluate(() => document.querySelector('[data-eval-answered]').removeAttribute('data-eval-answered'))
    assert.equal(await answerPendingCard(page, cards, first), 'call:call-1')
    assert.equal(cards.answers.length, 1)
  })
})

test('the pending card call is the newest ask_user or submit_plan the thread shows without a result', () => {
  assert.deepEqual(pendingCardCall(threadWith(['ask_user', 'a', 'result'], ['mastra_workspace_read_file', 'b', 'call'], ['submit_plan', 'c', 'call'])), { toolCallId: 'c', toolName: 'submit_plan' })
  assert.equal(pendingCardCall(threadWith(['ask_user', 'a', 'result'])), null)
  assert.equal(pendingCardCall([]), null)
})

test('a case names whether it should be planned and may script one round of adjustments', () => {
  const base = { request: 'Crie algo', checks: [] }
  assert.deepEqual([parseCase(base).plan, parseCase(base).adjust], [null, null])
  const scripted = parseCase({ ...base, plan: 'expected', approval: { answer: 'Pedir ajustes', change: ' Mais uma coluna. ' } })
  assert.deepEqual([scripted.plan, scripted.adjust], ['expected', 'Mais uma coluna.'])
  assert.throws(() => parseCase({ ...base, plan: 'sim' }), /case.plan must be one of expected, notApplicable/)
  assert.throws(() => parseCase({ ...base, approval: { answer: 'Aprovar e construir', change: 'x' } }), /case.approval.answer must be "Pedir ajustes"/)
  assert.throws(() => parseCase({ ...base, approval: { answer: 'Pedir ajustes' } }), /case.approval.change must be the non-empty free text/)
})

test('the three B cases parse, and only the small edit needs no plan', () => {
  const read = (name) => parseCase(JSON.parse(readFileSync(new URL(`../../scripts/builder-eval/cases/b/${name}.json`, import.meta.url), 'utf8')))
  assert.deepEqual(['b1-new-app', 'b2-new-feature', 'b3-small-edit'].map((name) => read(name).plan), ['expected', 'expected', 'notApplicable'])
})

test('the AC-13 block of a run joins the first run\'s flow with the checks and operations of every run', () => {
  const block = (checks, operations, flow) => ({ flow, checks: { runs: Array.from({ length: checks }, () => ({ ok: true })) }, tools: { byTool: operations ? { conexus_run_operation: { calls: operations } } : {} } })
  const flow = { planFile: { written: true, legacy: false, beforeFirstAppFile: true }, approval: { via: 'ask_user' }, appFilesBeforeApproval: 0, appFilesChanged: 3 }
  const result = { answers: [{ kind: 'APPROVAL' }], wallTimeToUsablePreviewMs: 90_000 }
  assert.deepEqual(ac13Of(result, { runs: [{ block: block(2, 1, flow) }, { block: block(1, 0, null) }] }, 'expected'), {
    expectation: 'expected', planned: true, plannedWhenExpected: true, planFileBeforeFirstAppFile: true, approvalVia: 'ask_user', legacyPath: false,
    appFilesBeforeApproval: 0, clicks: 1, timeToFirstPreviewMs: 90_000, checkRuns: 3, operationRuns: 1,
  })
  assert.equal(ac13Of(result, { runs: [{ block: null, reason: 'x' }] }, 'expected').checkRuns, null)
})
