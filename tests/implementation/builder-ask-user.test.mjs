import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { createAskUserTool, ASK_USER_TOOL } = await import(hubModuleUrl('builder/harness/tools.js'))

const question = (n, extra = {}) => ({ question: `Pergunta ${n}?`, ...extra })

test('the tool is registered as ask_user and says what to ask, how to batch and how to recommend', () => {
  const tool = createAskUserTool()
  assert.equal(ASK_USER_TOOL, 'ask_user')
  assert.equal(tool.id, 'ask_user')
  for (const part of ['1 to 4 questions', 'the person alone can decide', 'first option', '(recomendado)', 'multiSelect', 'write their own answer']) assert.equal(tool.description.includes(part), true, part)
})

test('the input takes 1 to 4 questions with optional header, options and multiSelect, and refuses the rest', () => {
  const { inputSchema } = createAskUserTool()
  const full = { questions: [question(1, { header: 'Cor', options: [{ label: 'Azul (recomendado)', description: 'Marca' }, { label: 'Verde' }], multiSelect: true }), question(2)] }
  assert.deepEqual(inputSchema.safeParse(full).data, full)
  assert.equal(inputSchema.safeParse({ questions: [question(1), question(2), question(3), question(4)] }).success, true)
  const refused = [
    { questions: [] },
    { questions: [1, 2, 3, 4, 5].map((n) => question(n)) },
    { questions: [{ question: '' }] },
    { questions: [question(1, { options: [{ label: '' }] })] },
    { question: 'Qual cor?' },
  ]
  assert.deepEqual(refused.filter((input) => inputSchema.safeParse(input).success), [])
})

test('a header longer than the 12 characters the description asks for is accepted, so a UI hint never costs the model a retry', () => {
  const { inputSchema } = createAskUserTool()
  const input = { questions: [question(1, { header: 'Próximo passo' })] }
  assert.equal(inputSchema.safeParse(input).success, true)
  assert.equal(createAskUserTool().description.includes('up to 12 characters'), true)
})

test('a first call suspends with the questions, and the resumed call returns one line per answer', async () => {
  const tool = createAskUserTool()
  const questions = [question(1, { options: [{ label: 'A' }, { label: 'B' }] }), question(2, { options: [{ label: 'C' }, { label: 'D' }], multiSelect: true }), question(3)]
  const suspended = []
  assert.equal(await tool.execute({ questions }, { agent: { suspend: async (payload) => { suspended.push(payload) } } }), undefined)
  assert.deepEqual(suspended, [{ questions }])
  const resumed = await tool.execute({ questions }, { agent: { resumeData: ['A', ['C', 'D'], 'Do meu jeito'] } })
  assert.deepEqual(resumed, { content: 'User answered:\nPergunta 1?: A\nPergunta 2?: C, D\nPergunta 3?: Do meu jeito', isError: false })
  assert.equal(tool.resumeSchema.safeParse(['A', ['C', 'D'], 'x']).success, true)
  assert.equal(tool.resumeSchema.safeParse('A').success, false)
})

test('multiSelect without options is an error result, and outside a run the questions come back as text', async () => {
  const tool = createAskUserTool()
  assert.deepEqual(await tool.execute({ questions: [question(1, { multiSelect: true })] }, { agent: { suspend: async () => {} } }), { content: 'Failed to ask user: multiSelect requires options (Pergunta 1?).', isError: true })
  assert.deepEqual(await tool.execute({ questions: [question(1, { options: [{ label: 'A' }] }), question(2)] }, {}), { content: '[Question for user]: Pergunta 1?\nOptions: A\n[Question for user]: Pergunta 2?', isError: false })
})
