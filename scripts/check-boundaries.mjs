import { readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { loadModule, parseSync, SqlError } from 'libpg-query'
import { HUB_OWNERS } from './check-import-law.mjs'
import { joinTemplate, normalizeSql, writeProblems } from './sql-write-lint.mjs'

await loadModule()

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
  Object.freeze({ table: 'platform.operation_receipt', verbs: Object.freeze(['DELETE']), modules: Object.freeze(['apps/hub/src/platform/receipt.ts']) }),
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

const SQL_DECLARATION = /apps\/hub\/src\/platform\/db\.ts$/
// Admission reads preserve cross-owner authorization; Registry pointers and retention await their named waves.
export const SQL_DEPENDENCIES = Object.freeze([
  'apps/hub/src/identity-access/admission.ts#missingProject -> project.project_deletion',
  'apps/hub/src/identity-access/admission.ts#notInDeletion -> project.project_deletion',
  'apps/hub/src/identity-access/admission.ts#projectSubject -> project.project_deletion',
  'apps/hub/src/identity-access/admission.ts#projectSubject -> project.project',
  'apps/hub/src/identity-access/admission.ts#liveProject -> project.project',
  'apps/hub/src/identity-access/admission.ts#admitInstallationAdministrator -> workspace.workspace',
  'apps/hub/src/identity-access/admission.ts#applicationAccess -> project.project',
  'apps/hub/src/identity-access/admission.ts#projectAccess -> project.project',
  'apps/hub/src/identity-access/admission.ts#lockedRun -> builder.builder_run',
  'apps/hub/src/identity-access/admission.ts#admitRun -> builder.builder_run',
  'apps/hub/src/identity-access/admission.ts#admitRun -> project.project',
  'apps/hub/src/identity-access/authentication.ts#shareProject -> project.project',
  'apps/hub/src/identity-access/authentication.ts#shareProjectOfSlug -> project.project',
  'apps/hub/src/identity-access/application-access.ts#ensureApplication -> project.project',
  'apps/hub/src/registry/retain.ts#retain -> builder.builder_run',
  'apps/hub/src/registry/served.ts#pointerStatement -> builder.project_working_state',
])
const SCHEMA_OWNERS = Object.freeze({ iam: 'identity-access', reg: 'registry', model: 'model-account', connector: 'connectors', project: 'project', builder: 'builder', workspace: 'workspace', platform: 'platform' })
function hubOwner(path) {
  if (!path.startsWith('apps/hub/src/')) return null
  const folder = path.split('/')[3]
  return folder === 'platform' || Object.hasOwn(HUB_OWNERS, folder) ? folder : undefined
}
function isSqlTag(checker, tag, declaration) {
  let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(tag) ? tag.name : tag)
  if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
  return (symbol?.name === 'sql' && declaredIn(symbol, declaration)) || checker.getTypeAtLocation(tag).getCallSignatures().some((signature) => {
    const source = signature.getDeclaration()?.getSourceFile().fileName
    return source && declaration.test(source) && signature.getReturnType().getProperties().some((property) => property.name.startsWith('__@sqlBrand') && declaredIn(property, declaration))
  })
}
function sqlText(checker, template, declaration) {
  if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text
  let text = template.head.text
  for (const [index, span] of template.templateSpans.entries()) {
    const marker = `boundary_hole_${index}`
    const fragment = checker.getTypeAtLocation(span.expression).getProperties().some((property) => property.name.startsWith('__@sqlBrand') && declaredIn(property, declaration))
    let replacement = marker
    if (fragment) {
      const before = normalizeSql(text)
      if (/\b(?:from|join|update|into)(?: only)?\s*$|\b[a-z_][\w]*\.$/.test(before)) replacement = marker
      else if (/^\s*\./.test(span.literal.text)) replacement = 'boundary_alias'
      else if (/\b(?:where|and|or|on|not|when)\s*$/.test(before)) replacement = 'true'
      else if (/^(?:\s*AS\b|\s*,)/i.test(span.literal.text) || /(?:\b(?:select|returning)|,)\s*$/.test(before)) replacement = '1'
      else replacement = ' '
    }
    text += replacement + span.literal.text
  }
  return text
}

// Fragments are checked at their declaration as well as in the statement that composes them.
function sqlRelations(text) {
  if (!text.trim()) return []
  let tree
  for (const candidate of [text, `SELECT 1 WHERE ${text}`, `SELECT 1 ${text}`, `SELECT 1 FROM (VALUES (1)) AS boundary_seed ${text}`]) {
    try { tree = parseSync(candidate); break } catch (error) { if (!(error instanceof SqlError)) throw error }
  }
  if (!tree) return /\b(?:from|join|update|into)\b/.test(normalizeSql(text)) ? [{ table: 'unparsed SQL relation', write: false }] : []
  const relations = []
  const visit = (value, inherited = new Set(), write = false, relationFunction = false) => {
    if (!value || typeof value !== 'object') return
    if (relationFunction && value.FuncCall?.funcname?.some((name) => name.String?.sval?.includes('boundary_hole_'))) relations.push({ table: 'boundary_hole_function', write: false })
    const ctes = new Set(inherited)
    for (const entry of value.withClause?.ctes ?? []) ctes.add(entry.CommonTableExpr.ctename)
    if (typeof value.relname === 'string') {
      const { schemaname, relname } = value
      if (!write && !schemaname && ctes.has(relname)) return
      relations.push({ table: schemaname ? `${schemaname}.${relname}` : relname, write })
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'lockedRels') continue
      if (Array.isArray(child)) child.forEach((item) => { visit(item, ctes, false, relationFunction) }); else visit(child, ctes, key === 'relation', relationFunction || key === 'RangeFunction')
    }
  }
  visit(tree)
  return relations
}

export function staleSqlDependencies(dependencies, matched) {
  return dependencies.filter((entry) => !matched.has(entry)).map((entry) => `stale SQL dependency: ${entry}`)
}

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

export const findings = (program, { root = repo, pgEdge = DATABASE_EDGE, responseEdge = RESPONSE_EDGE, authorityWriters = AUTHORITY_TABLE_WRITERS, splitTables = {}, gate = GATE_OPENER, sqlTables = null, sqlOwner = hubOwner, sqlTagDeclaration = SQL_DECLARATION, sqlDependencies = [], matchedSqlDependencies = new Set() } = {}) => {
  const checker = program.getTypeChecker()
  const result = { pgQueryRows: [], pgImportFiles: [], webResponseJson: [], sqlWrites: [], authorityTableWrites: [], gateReferences: [], rawPersonReads: [], sqlOwners: [] }
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
      if (ts.isTaggedTemplateExpression(node) && ((ts.isIdentifier(node.tag) && node.tag.text === 'sql') || isSqlTag(checker, node.tag, sqlTagDeclaration))) {
        const text = joinTemplate(templateParts(node.template))
        const owner = enclosingName(node) === '<module>' ? moduleVariable(node) : enclosingName(node)
        for (const problem of writeProblems(text, splitTables)) result.sqlWrites.push(`${path}#${owner}: ${problem}`)
        for (const write of writesOutside(text, path, authorityWriters)) result.authorityTableWrites.push(`${path}#${owner}: writes ${write}`)
      }
      if (sqlTables && sqlOwner(path) !== null && ts.isTaggedTemplateExpression(node) && isSqlTag(checker, node.tag, sqlTagDeclaration)) {
        const owner = sqlOwner(path)
        const operation = enclosingName(node) === '<module>' ? moduleVariable(node) : enclosingName(node)
        for (const { table, write } of sqlRelations(sqlText(checker, node.template, sqlTagDeclaration))) {
          const location = `${path}#${operation}`
          const dependency = `${location} -> ${table}`
          if (table.includes('boundary_hole_')) result.sqlOwners.push(`${location}: dynamic SQL relation`)
          else if (!owner) result.sqlOwners.push(`${location}: unknown SQL owner`)
          else if (!Object.hasOwn(sqlTables, table) || !SCHEMA_OWNERS[table.split('.')[0]]) result.sqlOwners.push(`${location}: unregistered SQL relation ${table}`)
          else if (SCHEMA_OWNERS[table.split('.')[0]] !== owner) {
            if (!write && sqlDependencies.includes(dependency)) matchedSqlDependencies.add(dependency)
            else result.sqlOwners.push(`${location}: foreign SQL relation ${table}`)
          }
        }
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
  const tables = registeredTablesOf()
  const matchedSqlDependencies = new Set()
  const hub = findings(programOf('apps/hub/tsconfig.json'), { splitTables: tables, sqlTables: tables, sqlDependencies: SQL_DEPENDENCIES, matchedSqlDependencies })
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
    sqlOwners: [...hub.sqlOwners, ...staleSqlDependencies(SQL_DEPENDENCIES, matchedSqlDependencies)],
    obsoleteRuntimeSymbols,
  }
}

const hubSourceFiles = () => programOf('apps/hub/tsconfig.json').getSourceFiles()
  .filter((file) => !file.isDeclarationFile && !file.fileName.includes('/node_modules/') && file.fileName.startsWith(join(repo, 'apps/hub/src')))
  .map((file) => ({ path: relative(repo, file.fileName), source: file.text }))

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
