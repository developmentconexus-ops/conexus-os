import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { MockLanguageModelV3 } from 'ai/test'
import {
  correctionMessage, createPerson, decideAnswer, fillSheet, fillValues, loadValues, parseSheet, personModel, silentOption,
} from '../../scripts/builder-eval/person.mjs'
import { completeLogin, startLogin } from '../../scripts/builder-eval/login.mjs'

const caseFile = (id) => JSON.parse(readFileSync(new URL(`../../scripts/builder-eval/cases/bakeoff/${id}.json`, import.meta.url), 'utf8'))
const h1 = parseSheet(caseFile('h1').person)

const free = (question) => ({ question, options: [], multi: false })
const options = (question, ...labels) => ({ question, options: labels.map((label) => ({ label, description: '' })), multi: false })

test('a question the sheet answers gets the sheet\'s words', () => {
  assert.deepEqual(decideAnswer(h1, free('O que conta como vencido?'), ['vencido']), {
    answer: 'Vencido é o título com vencimento antes de hoje e ainda não pago.', via: 'sheet', ruleIds: ['vencido'],
  })
})

test('a silent sheet gives "Não sei." on a free-text question', () => {
  assert.deepEqual(decideAnswer(h1, free('Em qual tabela ficam os títulos?'), []), { answer: 'Não sei.', via: 'silent', ruleIds: [] })
})

test('a silent sheet never picks the first or the recommended option', () => {
  const card = options('Qual formato?', 'Tabela simples (recomendado)', 'Cartões', 'Gráfico')
  assert.deepEqual(decideAnswer(h1, card, []), { answer: 'Gráfico', via: 'silent', ruleIds: [] })
  assert.equal(silentOption([{ label: 'A', description: '' }, { label: 'B', description: 'Recomendado para este caso' }, { label: 'C', description: '' }]).label, 'C')
  assert.equal(silentOption([{ label: 'A', description: '' }, { label: 'Tanto faz', description: '' }, { label: 'C', description: '' }]).label, 'Tanto faz')
  assert.equal(silentOption([{ label: 'Única', description: '' }]).label, 'Única')
})

test('an option card is answered with the option the rule\'s words find, whatever its place', () => {
  const card = options('Quais títulos entram?', 'Todos os títulos (recomendado)', 'Só os com vencimento antes de hoje e não pagos')
  assert.deepEqual(decideAnswer(h1, card, ['vencido']), { answer: 'Só os com vencimento antes de hoje e não pagos', via: 'sheet', ruleIds: ['vencido'] })
})

test('the matcher\'s hinted label counts when no pick word finds an option, and only if the card has it', () => {
  const card = options('Quais títulos entram?', 'Todos', 'Apenas os atrasados sem pagamento')
  assert.equal(decideAnswer(h1, card, ['vencido'], ['Apenas os atrasados sem pagamento']).answer, 'Apenas os atrasados sem pagamento')
  assert.deepEqual(decideAnswer(h1, card, ['vencido'], ['Um rótulo inventado']), { answer: 'Apenas os atrasados sem pagamento', via: 'silent', ruleIds: ['vencido'] })
})

test('a multi-select card takes every option a rule finds, and the silent choice when none', () => {
  const v1 = parseSheet(caseFile('v1').person)
  const card = { question: 'O que mais devo incluir?', multi: true, options: ['Total por semana', 'Alerta de 60 dias sem visita', 'Exportar planilha'].map((label) => ({ label, description: '' })) }
  assert.deepEqual(decideAnswer(v1, card, ['total-semanal', 'sem-visita']), { answer: ['Total por semana', 'Alerta de 60 dias sem visita'], via: 'sheet', ruleIds: ['total-semanal', 'sem-visita'] })
  assert.deepEqual(decideAnswer(v1, card, []), { answer: ['Exportar planilha'], via: 'silent', ruleIds: [] })
})

test('the person asks the model which rule a question touches and says only what the sheet says', async () => {
  const seen = []
  const model = new MockLanguageModelV3({
    doGenerate: async (call) => {
      seen.push(JSON.stringify(call.prompt))
      return {
        content: [{ type: 'text', text: '{"ruleIds":["provisorio","inventado"],"optionLabels":[]}' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        warnings: [],
      }
    },
  })
  const person = createPerson({ sheet: h1, model })
  const decision = await person.answer(free('Títulos provisórios entram?'))
  assert.deepEqual(decision, { answer: 'Título provisório não conta.', via: 'sheet', ruleIds: ['provisorio'] })
  assert.match(seen[0], /Pergunta: Títulos provisórios entram\?/)
  assert.doesNotMatch(seen[0], /afiado|escopo|tarefas|fatias|v2/)
})

test('a matcher that finds nothing leaves the person not knowing', async () => {
  const person = createPerson({ sheet: h1, match: async () => ({ ruleIds: [], optionLabels: [] }) })
  assert.deepEqual(await person.answer(free('Qual coluna guarda o CNPJ?')), { answer: 'Não sei.', via: 'silent', ruleIds: [] })
})

test('a private value is filled from the values file, and a missing one names the placeholder, never a value', () => {
  const dir = mkdtempSync(join(tmpdir(), 'person-'))
  try {
    writeFileSync(join(dir, 'values.json'), JSON.stringify({ quoteNumber: '4711' }))
    const values = loadValues({ CONEXUS_EVAL_VALUES_FILE: join(dir, 'values.json') })
    assert.equal(fillValues('Pode usar o orçamento {{value:quoteNumber}}.', values), 'Pode usar o orçamento 4711.')
    const quote = parseSheet(caseFile('q').person)
    assert.throws(() => fillSheet(quote, {}), /needs the value "quoteNumber"/)
    const filled = fillSheet(quote, { quoteNumber: '4711' })
    assert.equal(filled.rules[0].say, 'Pode usar o orçamento 4711.')
    assert.equal(filled.rules[0].template, 'Pode usar o orçamento {{value:quoteNumber}}.')
    assert.deepEqual(loadValues({}), {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('every bakeoff case holds words and rules only: no company TOP number, no arm word in the request or the project name', () => {
  for (const id of ['q', 'h1', 'h2', 'h3', 'v1']) {
    const raw = caseFile(id)
    parseSheet(raw.person)
    assert.ok(raw.oracle === id)
    assert.doesNotMatch(JSON.stringify(raw), /TOP\s?14|\bTOP\d+\b/)
    assert.doesNotMatch(raw.request, /eval|teste|experimento|afiado|escopo|fatias/i)
    assert.doesNotMatch(raw.person.projectName, /eval|teste|experimento/i)
  }
})

test('the correction message names counts and fields the oracle found and nothing else', () => {
  assert.equal(correctionMessage([]), null)
  assert.equal(correctionMessage([
    { kind: 'rows', expected: 120, actual: 100 },
    { kind: 'filled', field: 'Dias em atraso', expected: 118, actual: 0 },
    { kind: 'sum', name: 'faixas de atraso' },
    { kind: 'spot', field: 'Total devido' },
  ]), [
    'Vi a prévia e encontrei o seguinte:',
    'A lista mostra 100 linhas, mas eu esperava 120.',
    'A coluna Dias em atraso vem preenchida em 0 linhas, mas deveria estar em 118.',
    'A soma de faixas de atraso não fecha com o total.',
    'Conferi um dos registros e o valor de Total devido está errado.',
    'Pode corrigir?',
  ].join('\n'))
})

const withAppData = async (run) => {
  const dir = mkdtempSync(join(tmpdir(), 'person-auth-'))
  const saved = { data: process.env.MASTRA_APP_DATA_DIR, key: process.env.ANTHROPIC_API_KEY, model: process.env.CONEXUS_EVAL_PERSON_MODEL, fetch: globalThis.fetch }
  process.env.MASTRA_APP_DATA_DIR = dir
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.CONEXUS_EVAL_PERSON_MODEL
  try {
    await run(dir)
  } finally {
    for (const [name, value] of [['MASTRA_APP_DATA_DIR', saved.data], ['ANTHROPIC_API_KEY', saved.key], ['CONEXUS_EVAL_PERSON_MODEL', saved.model]]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    globalThis.fetch = saved.fetch
    rmSync(dir, { recursive: true, force: true })
  }
}

const prompt = [{ role: 'user', content: [{ type: 'text', text: 'oi' }] }]

test('without an API key the person calls Claude Opus 5.5 with the subscription signed in to Mastra Code', async () => {
  await withAppData(async (dir) => {
    writeFileSync(join(dir, 'auth.json'), JSON.stringify({ anthropic: { type: 'oauth', access: 'fake-access', refresh: 'fake-refresh', expires: Date.now() + 3_600_000 } }))
    const calls = []
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      calls.push({ url: request.url, authorization: request.headers.get('authorization'), apiKey: request.headers.get('x-api-key'), body: await request.json() })
      return Response.json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })
    }
    const result = await personModel().doGenerate({ prompt })
    assert.equal(result.content[0].text, 'ok')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages')
    assert.equal(calls[0].authorization, 'Bearer fake-access')
    assert.equal(calls[0].apiKey, null)
    assert.equal(calls[0].body.model, 'claude-opus-5-5')
  })
})

test('CONEXUS_EVAL_PERSON_MODEL still overrides the subscription', async () => {
  await withAppData(async () => {
    assert.equal(personModel({ CONEXUS_EVAL_PERSON_MODEL: 'openai/gpt-6-sol' }), 'openai/gpt-6-sol')
    process.env.CONEXUS_EVAL_PERSON_MODEL = 'anthropic/claude-sonnet-5'
    assert.equal(personModel(), 'anthropic/claude-sonnet-5')
  })
})

test('login start keeps the verifier private and prints only the address; complete stores the account and drops the verifier', async () => {
  await withAppData(async (dir) => {
    const verifierFile = join(dir, 'verifier.json')
    const authorization = {
      start: async () => ({ url: 'https://claude.example/authorize?state=abc', verifier: 'fake-verifier' }),
      complete: async (code, verifier) => {
        assert.deepEqual([code, verifier], ['pasted-code', 'fake-verifier'])
        return { access: 'fake-access', refresh: 'fake-refresh', expires: Date.now() + 3_600_000 }
      },
    }
    assert.equal(await startLogin({ authorization, verifierFile }), 'https://claude.example/authorize?state=abc')
    assert.equal(statSync(verifierFile).mode & 0o777, 0o600)
    const { AuthStorage } = await import('@mastra/code-sdk/auth/storage')
    const storage = new AuthStorage(join(dir, 'auth.json'))
    await completeLogin('pasted-code', { authorization, verifierFile, storage })
    assert.equal(existsSync(verifierFile), false)
    assert.equal(new AuthStorage(join(dir, 'auth.json')).get('anthropic')?.type, 'oauth')
    await assert.rejects(completeLogin('again', { authorization, verifierFile, storage }), /run "login.mjs start" first/)
  })
})

test('hiddenRuleOutcomes records, per hidden rule, whether the Builder asked about it and whether it proposed it', async () => {
  const { hiddenRuleOutcomes, parseSheet } = await import('../../scripts/builder-eval/person.mjs')
  const sheet = parseSheet({
    projectName: 'Compras', persona: 'comprador',
    answers: [
      { id: 'status', topic: 'status', say: 'Tem status.', pick: ['Em aberto'], hidden: true },
      { id: 'autor', topic: 'autor', say: 'Só o autor edita.', pick: ['autor'], hidden: true },
      { id: 'visivel', topic: 'x', say: 'x', pick: ['x'] },
    ],
  })
  assert.deepEqual(hiddenRuleOutcomes(sheet, [{ ruleIds: ['autor'] }, { ruleIds: [] }], 'Cada nota começa Em aberto.'), [
    { id: 'status', asked: false, proposed: true },
    { id: 'autor', asked: true, proposed: false },
  ])
})
