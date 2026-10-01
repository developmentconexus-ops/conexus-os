import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

// Gate G0 read from the source itself: the Sankhya adapter's files hold exactly one service name,
// the allow-listed read, and no write-capable service name in any form.
const directory = resolve(import.meta.dirname, '../../apps/hub/src/connectors/sankhya')
const files = readdirSync(directory).filter((name) => name.endsWith('.ts')).map((name) => join(directory, name))

const stringLiterals = (path) => {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const found = []
  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) found.push(node.text)
    else if (ts.isTemplateExpression(node)) found.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text))
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

// A Sankhya service name is '<Provider>.<method>', the provider ending in SP or ServiceProvider.
const SERVICE_NAME = /\b[A-Za-z]+(?:SP|ServiceProvider)\.[A-Za-z]+\b/g

test('G0: the service-name literals across the Sankhya adapter are exactly the two allow-listed reads', () => {
  assert.ok(files.length >= 4, files.join(','))
  const names = new Set(files.flatMap((path) => stringLiterals(path).flatMap((text) => text.match(SERVICE_NAME) ?? [])))
  assert.deepEqual([...names], ['CRUDServiceProvider.loadRecords', 'DbExplorerSP.executeQuery'])
})

test('G0: no known write service name appears anywhere in the Sankhya adapter source', () => {
  const writes = ['CRUDServiceProvider.saveRecord', 'DatasetSP.save', 'CACSP.incluirNota', 'CACSP.IncluirNota', 'SelecaoDocumentoSP.faturar', 'removeRecord', 'cancelar', 'saveRecord', 'incluirNota', 'faturar', 'DatasetSP']
  for (const path of files) {
    const text = readFileSync(path, 'utf8')
    for (const name of writes) assert.equal(text.toLowerCase().includes(name.toLowerCase()), false, `${name} in ${path}`)
  }
})

test('G0: the gateway carries the wire vocabulary, and the Skill only the read it teaches (C-030), never the authentication path', () => {
  const terms = ['CRUDServiceProvider', 'service.sbr', '/authenticate']
  const wire = Object.fromEntries(files.map((path) => [basename(path), terms.filter((term) => stringLiterals(path).some((text) => text.includes(term)))]))
  assert.deepEqual(wire, {
    'credential.ts': [], 'definition.ts': [], 'gateway.ts': terms, 'purchase-order.ts': [], 'read-only-sql.ts': [], 'skill.ts': ['CRUDServiceProvider', 'service.sbr'],
  })
})
