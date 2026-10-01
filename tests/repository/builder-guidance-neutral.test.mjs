import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'

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
// Every text the Builder reads: the Sankhya guide and the brief around it, the tool descriptions, the
// Builder prompt, the skills with their reference examples, the starter AGENTS.md and the
// starter template's example files.
const BUILDER_TEXTS = [
  'apps/hub/src/connectors/builder-brief.ts',
  'apps/hub/src/connectors/builder-tool.ts',
  'apps/hub/src/builder/harness/tools.ts',
  'apps/hub/src/builder/handler-kit/sankhya.ts',
  'apps/hub/src/builder/starter/AGENTS.md',
  ...filesUnder('apps/hub/src/builder/harness/prompt'),
  ...filesUnder('builder-skills', (path) => TEXT_EXTENSION.test(path)),
  ...filesUnder('apps/hub/starter-template/files/app/src', (path) => TEXT_EXTENSION.test(path) && !path.includes('/components/ui/')),
]

const findLeaks = (files) =>
  files.flatMap((file) => {
    const text = readFileSync(resolve(root, file), 'utf8')
    return DENYLIST.filter((term) => pattern(term).test(text)).map((term) => `${file} contains "${term}"`)
  })

test('the list of Builder texts covers the guide, the prompt, the skills, the starter and the tool descriptions', () => {
  for (const expected of [
    'builder-skills/conexus-sankhya/SKILL.md',
    'builder-skills/conexus-plan/SKILL.md',
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

test('the matcher bites: case words are found whole or as a stem, and ordinary words are not', () => {
  const hits = (text) => DENYLIST.filter((term) => pattern(term).test(text))
  assert.deepEqual(hits("LIKE '%CUSTO%'"), ['CUSTO'])
  assert.deepEqual(hits('Markup de 1.45'), ['markup'])
  assert.deepEqual(hits('clientes inadimplentes'), ['inadimpl*'])
  assert.deepEqual(hits('customer, customizar'), [])
  assert.deepEqual(hits('Fluxo de Caixa'), ['caixa'])
})
