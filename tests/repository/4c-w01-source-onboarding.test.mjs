import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolve } from 'node:path'

const root = resolve(new URL('../../', import.meta.url).pathname)
const read = p => readFileSync(resolve(root, p), 'utf8')

function operationSection(text, id, nextId) {
  const start = text.indexOf(`x-conexus-4a-id: ${id}`)
  if (start < 0) throw new Error(`missing ${id} in Project wire`)
  const end = nextId ? text.indexOf(`x-conexus-4a-id: ${nextId}`, start) : text.length
  return text.slice(start, end < 0 ? text.length : end)
}

test('W-01 can establish truthful greenfield/brownfield Project source authority before inception', () => {
  const product = read('docs/product/contract.md')
  const wire = read('contracts/api/product/project-paths.yaml')
  const inventory = read('docs/evidence/4c/candidate-screen-surface-inventory.md')
  const ledger = read('docs/product/operation-ledger.md')

  if (!product.includes('→ Create/Import Project')) throw new Error('test precondition lost: Journey B no longer requires Create/Import Project')
  if (!inventory.includes('Project create / source-bootstrap flow')) throw new Error('test precondition lost: W-01 source-bootstrap surface is no longer carried')
  if (!ledger.includes('sourceBootstrap.mode = NEW | EXISTING_GIT')) throw new Error('accepted 4C-F02 source-bootstrap semantics missing from Product authority')

  const create = operationSection(wire, 'PRJ-03', 'PRJ-05')
  const inception = operationSection(wire, 'PRJ-07', 'PRJ-08')

  if (!/required:\s*\[[^\]]*sourceBootstrap[^\]]*\]/.test(create)) {
    throw new Error('PRJ-03 must require sourceBootstrap at Project birth')
  }
  if (!create.includes("$ref: '#/components/schemas/ProjectSourceBootstrap'")) {
    throw new Error('PRJ-03 must use the closed ProjectSourceBootstrap schema')
  }

  const sourceSchemaStart = wire.indexOf('    ProjectSourceBootstrap:')
  const sourceSchemaEnd = wire.indexOf('\n    ApprovedBaseline:', sourceSchemaStart)
  if (sourceSchemaStart < 0 || sourceSchemaEnd < 0) throw new Error('unable to isolate ProjectSourceBootstrap schema')
  const source = wire.slice(sourceSchemaStart, sourceSchemaEnd)
  for (const mode of ['NEW', 'EXISTING_GIT']) {
    if (!source.includes(`const: ${mode}`)) throw new Error(`ProjectSourceBootstrap must admit ${mode}`)
  }
  if (!source.includes('repositoryLocator:')) throw new Error('EXISTING_GIT must carry the bounded repositoryLocator')

  const propertyNames = new Set([...source.matchAll(/^\s{12}([A-Za-z][A-Za-z0-9_-]*):\s*$/gm)].map(match => match[1]))
  for (const forbidden of ['credential', 'credentials', 'password', 'token', 'secret', 'branch', 'ref']) {
    if (propertyNames.has(forbidden)) throw new Error(`ProjectSourceBootstrap must not expose ${forbidden}`)
  }

  for (const forbidden of ['repositoryUrl:', 'repositoryLocator:', 'sourceId:', 'sql:', 'connectionId:']) {
    if (inception.includes(forbidden)) throw new Error(`PRJ-07 must not regain source-selection authority through ${forbidden}`)
  }
  if (!/required:\s*\[intent\]/.test(inception)) throw new Error('PRJ-07 must remain an intent-driven investigation over already-admitted source authority')
})
