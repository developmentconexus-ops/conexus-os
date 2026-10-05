import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'
import { RequestContext } from '@mastra/core/request-context'
import { hubModuleUrl } from '../implementation/hub-build.mjs'

const root = resolve(import.meta.dirname, '../..')

// The Builder's guidance teaches a method, so its examples must not come from a request we already
// fixed, and must not come from a request we keep held out to measure the method on new ground. A
// case word in an example steers the model toward that case and makes our own evals easy to pass for
// the wrong reason. This list is the only place these words may live; the Builder never reads it.
// A term ending in `*` is a stem and matches any continuation. Any other term matches whole words.
// When a held out request is used to change guidance it is burned: move its words to the fixed list.
const FIXED_CASES = [
  // The quote request.
  'CUSTO', 'TGFCUS', 'TGFPRO', 'preço promocional', 'TOP 14', '144118', 'markup',
  // The purchase order request.
  'pedido de compra', '22790',
  // The sales dashboard request.
  'vendas por mês',
]
const HELD_OUT = ['inadimpl*', 'títulos vencidos', 'TGFFIN', 'parou de comprar', 'saldo bancário', 'TGFMBC', 'caixa']
const DENYLIST = [...FIXED_CASES, ...HELD_OUT]

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pattern = (term) => {
  const stem = term.endsWith('*')
  const body = escapeRegExp(stem ? term.slice(0, -1) : term)
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}${stem ? '' : '(?![\\p{L}\\p{N}_])'}`, 'iu')
}

const filesUnder = (directory, keep = () => true) =>
  readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return filesUnder(path, keep)
    return entry.isFile() && keep(path) ? [path] : []
  })

const TEXT_EXTENSION = /\.(md|tsx?|mjs|json|css|html)$/
// Every text the Builder reads: the Sankhya guide helper, the Builder prompt, the skills with their
// reference examples, the starter AGENTS.md and the starter template's example files. The wording
// built into the Hub (the connector brief and the tool descriptions) is read from the compiled Hub's
// own exports, by hubTexts below.
const BUILDER_TEXTS = [
  'apps/hub/src/builder/handler-kit/sankhya.ts',
  'apps/hub/src/builder/starter/AGENTS.md',
  ...filesUnder('apps/hub/src/builder/harness/prompt'),
  ...filesUnder('builder-skills', (path) => TEXT_EXTENSION.test(path)),
  ...filesUnder('apps/hub/starter-template/files/app/src', (path) => TEXT_EXTENSION.test(path) && !path.includes('/components/ui/')),
]

const hubTexts = async () => {
  const { createCheckTool, createRunOperationTool, createSubmitPlanTool, createAskUserTool } = await import(hubModuleUrl('builder/harness/tools.js'))
  const { createConnectorBrief } = await import(hubModuleUrl('connectors/builder-brief.js'))
  const { openBuilderRun, createConnectorFetchTools } = await import(hubModuleUrl('connectors/builder-tool.js'))
  const observability = { startSpan: () => ({ end() {}, error() {} }) }
  const briefWith = (listBindings) => createConnectorBrief({ store: { listBindings }, observability })
  const briefs = []
  const fetchDescriptions = []
  for (const listBindings of [async () => [{ name: 'erp', connectorId: 'sankhya' }], async () => [], async () => { throw new Error('down') }]) {
    const run = await openBuilderRun({ brief: briefWith(listBindings), projectId: '00000000-0000-4000-8000-000000000001', accountId: '55555555-5555-4555-8555-555555555555', builderRunId: '00000000-0000-4000-8000-000000000002' })
    briefs.push(run.brief)
    const requestContext = new RequestContext()
    run.bind(requestContext)
    fetchDescriptions.push(createConnectorFetchTools({})({ requestContext }).connector_fetch.description)
    run.end()
  }
  return {
    'the Hub tool descriptions': [createCheckTool(async () => ({})), createRunOperationTool(async () => ({})), createSubmitPlanTool('/checkout'), createAskUserTool()].map((tool) => tool.description).join('\n'),
    'the connector briefs': briefs.join('\n'),
    'the connector_fetch description': fetchDescriptions[0],
  }
}

const leaksIn = (name, text) => DENYLIST.filter((term) => pattern(term).test(text)).map((term) => `${name} contains "${term}"`)

const findLeaks = (files) => files.flatMap((file) => leaksIn(file, readFileSync(resolve(root, file), 'utf8')))

test('the list of Builder texts covers the guide, the prompt, the skills, the starter and the tool descriptions', () => {
  for (const expected of [
    'builder-skills/conexus-sankhya/SKILL.md',
    'builder-skills/conexus-plan-new/SKILL.md',
    'builder-skills/conexus-plan-change/SKILL.md',
    'builder-skills/conexus-build/SKILL.md',
    'apps/hub/src/builder/handler-kit/sankhya.ts',
    'apps/hub/src/builder/harness/prompt/builder.md',
    'builder-skills/conexus-server/SKILL.md',
    'builder-skills/conexus-app/references/shell.tsx',
    'apps/hub/src/builder/starter/AGENTS.md',
    'apps/hub/starter-template/files/app/src/routes/home.tsx',
  ]) assert.ok(BUILDER_TEXTS.includes(expected), expected)
  for (const file of BUILDER_TEXTS) assert.ok(statSync(resolve(root, file)).size > 0, relative(root, file))
})

test('no text the Builder reads holds a word from a fixed case or a held out request', () => {
  assert.deepEqual(findLeaks(BUILDER_TEXTS), [])
})

test('no wording the Hub gives the Builder holds a word from a fixed case or a held out request', async () => {
  const texts = await hubTexts()
  for (const [name, text] of Object.entries(texts)) assert.ok(text.length > 100, `${name} is empty`)
  assert.deepEqual(Object.entries(texts).flatMap(([name, text]) => leaksIn(name, text)), [])
})

test('the matcher bites: case words are found whole or as a stem, and ordinary words are not', () => {
  const hits = (text) => DENYLIST.filter((term) => pattern(term).test(text))
  assert.deepEqual(hits("LIKE '%CUSTO%'"), ['CUSTO'])
  assert.deepEqual(hits('Markup de 1.45'), ['markup'])
  assert.deepEqual(hits('clientes inadimplentes'), ['inadimpl*'])
  assert.deepEqual(hits('customer, customizar'), [])
  assert.deepEqual(hits('Fluxo de Caixa'), ['caixa'])
})
