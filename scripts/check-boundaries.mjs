import { readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { joinTemplate, normalizeSql, writeProblems } from './sql-write-lint.mjs'

const repo = resolve(fileURLToPath(new URL('../', import.meta.url)))

// The only files that may import pg: the data module and the two application database runners.
export const DATABASE_EDGE = Object.freeze([
  'apps/hub/src/platform/db.ts',
  'apps/hub/src/app-runner/worker.ts',
  'apps/hub/src/app-runner/supervisor.ts',
])
// The only modules that may write an authority table with the named verbs (MERGE counts as every verb).
// One rule per table and verb list. A table `schema.*` names every table of the schema, and a module
// ending in `/` names every file under that folder: only identity access writes a table of schema iam.
export const AUTHORITY_TABLE_WRITERS = Object.freeze([
  Object.freeze({ table: 'iam.*', verbs: Object.freeze(['INSERT', 'UPDATE', 'DELETE']), modules: Object.freeze(['apps/hub/src/identity-access/']) }),
  Object.freeze({ table: 'project.project_deletion', verbs: Object.freeze(['INSERT', 'UPDATE', 'DELETE']), modules: Object.freeze(['apps/hub/src/project/deletion.ts']) }),
  Object.freeze({ table: 'project.project', verbs: Object.freeze(['DELETE']), modules: Object.freeze(['apps/hub/src/project/deletion.ts']) }),
  Object.freeze({ table: 'platform.operation_receipt', verbs: Object.freeze(['DELETE']), modules: Object.freeze(['apps/hub/src/project/deletion.ts', 'apps/hub/src/platform/receipt.ts']) }),
])
// The only module that may reach the transaction behind a gate.
export const GATE_OPENER = Object.freeze({ declaration: /apps\/hub\/src\/platform\/db\.ts$/, readers: Object.freeze(['apps/hub/src/identity-access/admission.ts', 'apps/hub/src/identity-access/authentication.ts']) })
export const RESPONSE_EDGE = Object.freeze(['apps/web/src/app/http.ts'])

const declaredIn = (symbol, pattern) => (symbol?.declarations ?? []).some((declaration) => pattern.test(declaration.getSourceFile().fileName))
const parentName = (symbol) => (symbol?.declarations ?? []).map((declaration) => declaration.parent?.name?.getText()).find(Boolean)

const enclosingName = (node) => {
  for (let current = node.parent; current; current = current.parent) {
    if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name) return current.name.getText()
    if (ts.isVariableDeclaration(current) && current.initializer && (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))) return current.name.getText()
  }
  return '<module>'
}

const moduleVariable = (node) => {
  for (let current = node.parent; current; current = current.parent) if (ts.isVariableDeclaration(current)) return current.name.getText()
  return '<module>'
}

const referencesMember = (checker, node, member, belongs) => {
  if (ts.isPropertyAccessExpression(node) && node.name.text === member) return belongs(checker.getSymbolAtLocation(node.name))
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === member) return belongs(checker.getSymbolAtLocation(node.argumentExpression))
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent) && !node.dotDotDotToken) {
    const key = (node.propertyName ?? node.name).getText()
    if (key !== member) return false
    return belongs(checker.getTypeAtLocation(node.parent).getProperty(member))
  }
  return false
}

const resultIsDiscarded = (node) => {
  const call = node.parent
  if (!ts.isCallExpression(call) || call.expression !== node) return false
  let value = call
  while (ts.isAwaitExpression(value.parent) || ts.isParenthesizedExpression(value.parent)) value = value.parent
  return ts.isExpressionStatement(value.parent)
}

const templateParts = (template) => (ts.isNoSubstitutionTemplateLiteral(template) ? [template.text] : [template.head.text, ...template.templateSpans.map((span) => span.literal.text)])

const isPgQuery = (symbol) => declaredIn(symbol, /node_modules\/(?:@types\/)?pg\//)
const isResponseJson = (symbol) => ['Response', 'Body'].includes(parentName(symbol) ?? '')

const VERBS = Object.freeze({ 'insert into': 'INSERT', update: 'UPDATE', 'delete from': 'DELETE', 'merge into': 'MERGE' })

// The writes of a template that break a rule: one entry per table and verb written outside the rule's modules.
const tablePattern = (table) => (table.endsWith('.*') ? `${table.slice(0, -2)}\\.[a-z_][a-z0-9_]*` : table.replace('.', '\\.'))
const ownedBy = (modules, path) => modules.some((module) => (module.endsWith('/') ? path.startsWith(module) : path === module))
const writesOutside = (text, path, rules) => {
  const normalized = normalizeSql(text)
  return rules.flatMap((rule) => [...normalized.matchAll(new RegExp(`\\b(insert into|update|delete from|merge into) (?:only )?(${tablePattern(rule.table)})\\b`, 'g'))]
    .map((found) => ({ verb: VERBS[found[1]], table: found[2] }))
    .filter(({ verb }) => (verb === 'MERGE' || rule.verbs.includes(verb)) && !ownedBy(rule.modules, path))
    .map(({ verb, table }) => `${verb} ${table}`))
}

// The symbol openGate is declared once, in the data module. Every Identifier or member name that resolves to it,
// through an import alias, a namespace, a destructuring or a dynamic import, is a reference.
const isGateReference = (checker, node, declaration) => {
  if (!ts.isIdentifier(node) && !ts.isStringLiteralLike(node)) return false
  const element = ts.isBindingElement(node.parent) && ts.isObjectBindingPattern(node.parent.parent) && (node.parent.propertyName ?? node.parent.name) === node ? node.parent : undefined
  let symbol = element ? checker.getTypeAtLocation(element.parent).getProperty('openGate') : checker.getSymbolAtLocation(node)
  if (!symbol || (element && node.text !== 'openGate')) return false
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
  return symbol.name === 'openGate' && declaredIn(symbol, declaration)
}

export const findings = (program, { root = repo, pgEdge = DATABASE_EDGE, responseEdge = RESPONSE_EDGE, authorityWriters = AUTHORITY_TABLE_WRITERS, splitTables = {}, gate = GATE_OPENER } = {}) => {
  const checker = program.getTypeChecker()
  const result = { pgQueryRows: [], pgImportFiles: [], webResponseJson: [], sqlWrites: [], authorityTableWrites: [], gateReferences: [] }
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || file.fileName.includes('/node_modules/')) continue
    const path = relative(root, file.fileName)
    const visit = (node) => {
      if (!pgEdge.includes(path) && referencesMember(checker, node, 'query', isPgQuery) && !resultIsDiscarded(node)) result.pgQueryRows.push(`${path}#${enclosingName(node)}`)
      if (!responseEdge.includes(path) && referencesMember(checker, node, 'json', isResponseJson)) result.webResponseJson.push(`${path}#${enclosingName(node)}`)
      if (ts.isImportDeclaration(node) && !pgEdge.includes(path) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'pg') result.pgImportFiles.push(path)
      if (!gate.readers.includes(path) && !gate.declaration.test(file.fileName) && isGateReference(checker, node, gate.declaration)) result.gateReferences.push(`${path}#${enclosingName(node) === '<module>' ? moduleVariable(node) : enclosingName(node)}`)
      if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === 'sql') {
        const text = joinTemplate(templateParts(node.template))
        const owner = enclosingName(node) === '<module>' ? moduleVariable(node) : enclosingName(node)
        for (const problem of writeProblems(text, splitTables)) result.sqlWrites.push(`${path}#${owner}: ${problem}`)
        for (const write of writesOutside(text, path, authorityWriters)) result.authorityTableWrites.push(`${path}#${owner}: writes ${write}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  return result
}

const programOf = (tsconfig) => {
  const configPath = join(repo, tsconfig)
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, join(repo, tsconfig, '..'))
  return ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } })
}

// The register's key and tenant columns of each split table, which the write lint reads.
const splitTablesOf = () => {
  const register = JSON.parse(readFileSync(join(repo, 'contracts/technical/hub-catalog-census.json'), 'utf8')).register.split
  return Object.fromEntries(register.map((row) => [row.table, row.keyColumns ?? []]))
}

export const census = () => {
  const hub = findings(programOf('apps/hub/tsconfig.json'), { splitTables: splitTablesOf() })
  const web = findings(programOf('apps/web/tsconfig.json'))
  return {
    pgQueryRows: hub.pgQueryRows,
    pgImportFiles: hub.pgImportFiles,
    webResponseJson: web.webResponseJson,
    sqlWrites: hub.sqlWrites,
    authorityTableWrites: hub.authorityTableWrites,
    gateReferences: hub.gateReferences,
  }
}

// Failure decoding is an HTTP boundary too: readFailure parses Problem before exposing a code.
export const BOUNDARY_EXCEPTIONS = Object.freeze({
  webResponseJson: Object.freeze(['apps/web/src/app/failure.ts#readFailure']),
})

export function violations(found, exceptions = BOUNDARY_EXCEPTIONS) {
  return Object.entries(found).flatMap(([rule, entries]) => entries
    .filter(entry => !(exceptions[rule] ?? []).includes(entry))
    .map(entry => `${rule}: ${entry}`))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const refused = violations(census())
  for (const entry of refused) console.error(`boundary prohibition: ${entry}`)
  process.exitCode = refused.length ? 1 : 0
}
