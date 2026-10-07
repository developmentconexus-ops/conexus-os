import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { joinTemplate, normalizeSql, writeProblems } from './sql-write-lint.mjs'

const repo = resolve(fileURLToPath(new URL('../', import.meta.url)))
const recordPath = join(repo, 'contracts/technical/census-boundaries.json')

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
  const result = { pgQueryRows: [], pgImportFiles: [], webResponseJson: [], sqlWrites: [], authorityTableWrites: [], gateReferences: [], rawPersonReads: [] }
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || file.fileName.includes('/node_modules/')) continue
    const path = relative(root, file.fileName)
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'read'
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'database') {
        const callback = node.arguments[1]
        if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
          const parameter = callback.parameters[0]?.name
          if (parameter && ts.isIdentifier(parameter)) {
            const scan = (child) => {
              if (ts.isPropertyAccessExpression(child) && ['rows', 'one', 'maybe', 'accountId'].includes(child.name.text)
                && ts.isIdentifier(child.expression) && child.expression.text === parameter.text) result.rawPersonReads.push(`${path}#${parameter.text}.${child.name.text}`)
              ts.forEachChild(child, scan)
            }
            scan(callback.body)
          }
        }
      }
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

// The register's key and tenant columns for the native runtime grants, which the write lint reads.
const registeredTablesOf = () => {
  const register = JSON.parse(readFileSync(join(repo, 'contracts/technical/hub-catalog-census.json'), 'utf8')).register.tables
  return Object.fromEntries(register.map((row) => [row.table, row.keyColumns ?? []]))
}

export const census = () => {
  const hub = findings(programOf('apps/hub/tsconfig.json'), { splitTables: registeredTablesOf() })
  const web = findings(programOf('apps/web/tsconfig.json'))
  const obsolete = /\b(?:hub_reader|hub_command|iam_rls|hub_builder_ingress)\b|rls\.|conexus\.(?:account_id|job)\b|\b(?:set_config|current_setting)\s*\(/i
  const obsoleteRuntimeSymbols = hubSourceFiles().flatMap(({ path, source }) => obsolete.test(source) ? [path] : [])
  return {
    pgQueryRows: hub.pgQueryRows,
    pgImportFiles: hub.pgImportFiles,
    webResponseJson: web.webResponseJson,
    sqlWrites: hub.sqlWrites,
    authorityTableWrites: hub.authorityTableWrites,
    gateReferences: hub.gateReferences,
    rawPersonReads: hub.rawPersonReads,
    obsoleteRuntimeSymbols,
  }
}

const hubSourceFiles = () => programOf('apps/hub/tsconfig.json').getSourceFiles()
  .filter((file) => !file.isDeclarationFile && !file.fileName.includes('/node_modules/') && file.fileName.startsWith(join(repo, 'apps/hub/src')))
  .map((file) => ({ path: relative(repo, file.fileName), source: file.text }))

// Items that must stay empty: a record can never hold one, so --write cannot raise them.
export const HARD_ZERO = Object.freeze(['gateReferences', 'authorityTableWrites', 'sqlWrites', 'rawPersonReads', 'obsoleteRuntimeSymbols'])
export const hardZeroBroken = (found) => HARD_ZERO.filter((item) => (found[item] ?? []).length > 0)

const tally = (entries) => entries.reduce((counts, entry) => counts.set(entry, (counts.get(entry) ?? 0) + 1), new Map())

// Entries found that the record does not hold, and entries the record holds that were not found. Each
// is a multiset: the same function twice is two entries, so a swap of one finding for another is both.
export const compareToRecord = (found, recorded) => {
  const have = tally(found)
  const want = tally(recorded)
  const added = [...have].flatMap(([entry, count]) => Array.from({ length: Math.max(0, count - (want.get(entry) ?? 0)) }, () => entry))
  const removed = [...want].flatMap(([entry, count]) => Array.from({ length: Math.max(0, count - (have.get(entry) ?? 0)) }, () => entry))
  return { added: added.sort(), removed: removed.sort() }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const found = census()
  const broken = hardZeroBroken(found)
  if (broken.length > 0) {
    for (const item of broken) for (const entry of found[item]) console.error(`census-boundaries: ${item} must be empty, found: ${entry}`)
    console.error('census-boundaries: gateReferences, authorityTableWrites and sqlWrites are hard zero; the record cannot hold one and --write does not record them.')
    process.exit(1)
  }
  if (process.argv.includes('--write')) {
    writeFileSync(recordPath, `${JSON.stringify(Object.fromEntries(Object.entries(found).map(([item, list]) => [item, [...list].sort()])), null, 2)}\n`)
    console.log(`census-boundaries: recorded ${Object.entries(found).map(([item, list]) => `${item} ${list.length}`).join(', ')}`)
    process.exit(0)
  }
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  let failed = false
  for (const [item, list] of Object.entries(found)) {
    const recorded = record[item]
    if (recorded === undefined) {
      failed = true
      console.log(`census-boundaries: ${item} ${list.length} (not recorded) NOT RECORDED`)
      continue
    }
    const { added, removed } = compareToRecord(list, recorded)
    const verdict = added.length > 0 ? 'UP' : removed.length > 0 ? 'down' : 'ok'
    if (added.length > 0) failed = true
    console.log(`census-boundaries: ${item} ${list.length} (record ${recorded.length}) ${verdict}`)
    for (const entry of added) console.log(`    new: ${entry}`)
    if (process.argv.includes('--list')) for (const entry of removed) console.log(`    gone: ${entry}`)
  }
  if (failed) {
    console.error('census-boundaries: a finding is not in the record. Only the modules named in AUTHORITY_TABLE_WRITERS write an authority table, and only admission.ts and authentication.ts reach openGate. Read rows through a schema in platform/db.ts and call the Hub through app/http.ts, or record the lower set with --write when the change removes findings.')
    process.exit(1)
  }
}
