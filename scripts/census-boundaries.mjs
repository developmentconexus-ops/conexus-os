import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repo = resolve(fileURLToPath(new URL('../', import.meta.url)))
const recordPath = join(repo, 'contracts/technical/census-boundaries.json')

// The only files that may import pg: the data module and the two application database runners.
export const DATABASE_EDGE = Object.freeze([
  'apps/hub/src/platform/db.ts',
  'apps/hub/src/app-runner/worker.ts',
  'apps/hub/src/app-runner/supervisor.ts',
])
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

const isPgQuery = (symbol) => declaredIn(symbol, /node_modules\/(?:@types\/)?pg\//)
const isResponseJson = (symbol) => ['Response', 'Body'].includes(parentName(symbol) ?? '')

export const findings = (program, { root = repo, pgEdge = DATABASE_EDGE, responseEdge = RESPONSE_EDGE } = {}) => {
  const checker = program.getTypeChecker()
  const result = { pgQueryRows: [], pgImportFiles: [], webResponseJson: [] }
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || file.fileName.includes('/node_modules/')) continue
    const path = relative(root, file.fileName)
    const visit = (node) => {
      if (!pgEdge.includes(path) && referencesMember(checker, node, 'query', isPgQuery) && !resultIsDiscarded(node)) result.pgQueryRows.push(`${path}#${enclosingName(node)}`)
      if (!responseEdge.includes(path) && referencesMember(checker, node, 'json', isResponseJson)) result.webResponseJson.push(`${path}#${enclosingName(node)}`)
      if (ts.isImportDeclaration(node) && !pgEdge.includes(path) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'pg') result.pgImportFiles.push(path)
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

export const census = () => {
  const hub = findings(programOf('apps/hub/tsconfig.json'))
  const web = findings(programOf('apps/web/tsconfig.json'))
  return {
    pgQueryRows: hub.pgQueryRows,
    pgImportFiles: hub.pgImportFiles,
    webResponseJson: web.webResponseJson,
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const found = census()
  const counts = Object.fromEntries(Object.entries(found).map(([item, list]) => [item, list.length]))
  if (process.argv.includes('--write')) {
    writeFileSync(recordPath, `${JSON.stringify(counts, null, 2)}\n`)
    console.log(`census-boundaries: recorded ${JSON.stringify(counts)}`)
    process.exit(0)
  }
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  let failed = false
  for (const [item, count] of Object.entries(counts)) {
    const recorded = record[item]
    const verdict = recorded === undefined ? 'NOT RECORDED' : count > recorded ? 'UP' : count < recorded ? 'down' : 'ok'
    if (verdict === 'UP' || verdict === 'NOT RECORDED') failed = true
    console.log(`census-boundaries: ${item} ${count} (record ${recorded ?? 'none'}) ${verdict}`)
    if (process.argv.includes('--list') || verdict === 'UP') for (const entry of found[item]) console.log(`    ${entry}`)
  }
  if (failed) {
    console.error('census-boundaries: a count went up. Read the rows through a schema in platform/db.ts and call the Hub through app/http.ts, or record a lower number with --write when the change lowers it.')
    process.exit(1)
  }
}
