import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

function operationSection(text, id, nextId) {
  const start = text.indexOf(`x-conexus-4a-id: ${id}`)
  if (start < 0) throw new Error(`missing ${id}`)
  const end = nextId ? text.indexOf(`x-conexus-4a-id: ${nextId}`, start) : text.length
  return text.slice(start, end < 0 ? text.length : end)
}

test('W-01 inception has caller-expressible business intent without turning source selection into PRJ-07 authority', () => {
  const product = read('docs/product/contract.md')
  const wire = read('contracts/api/product/project-paths.yaml')
  const ledger = read('docs/product/operation-ledger.md')

  if (!product.includes('inspect objective/users/constraints/source systems/real data where relevant')) {
    throw new Error('test precondition lost: Journey B no longer requires objective/users/constraints inspection')
  }

  const inception = operationSection(wire, 'PRJ-07', 'PRJ-08')
  const body = inception.match(/requestBody:[\s\S]*?(?=\n\s{6}responses:)/)?.[0] ?? ''
  const hasIntent = /\b(intent|objective|inceptionContext)\s*:/.test(body)
  const hasDedicatedContextOp = /\| `PRJ-[0-9]+` \| (?:Submit|Set|Establish)[^|]*(?:Inception|Project)Context/i.test(ledger)

  if (!hasIntent && !hasDedicatedContextOp) {
    throw new Error('W-01 cannot express greenfield/brownfield inception intent: Journey B requires objective/users/constraints, but current Product wire has no caller-expressible inception context before candidate Baseline derivation')
  }

  if (/repositoryUrl|sourceUrl|connectionId|sourceId|sql/i.test(body)) {
    throw new Error('PRJ-07 inception context must not become caller-selected source/network authority')
  }
})
