import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const OWNERS = new Set(['apps/hub/src/http/access.ts', 'apps/hub/src/http/cookies.ts'])
const FIXTURES = 'scripts/fixtures/check-access-owner'
const CSRF_HEADER = ['x-conexus', 'csrf'].join('-')
const COOKIE_OPTION_KEYS = new Set(['path', 'secure', 'httpOnly', 'sameSite'])
const TEXT_SCANS = [
  { predicate: 'TEXT_DOCUMENT_COOKIE', needle: 'document.cookie', roots: ['apps/web/src'] },
  { predicate: 'TEXT_CSRF_HEADER', needle: CSRF_HEADER, roots: ['apps', 'packages', 'scripts', 'tests', 'contracts'] },
]
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist'])
const SKIPPED_PATHS = new Set([FIXTURES, 'apps/hub/public'])

export const PREDICATES = Object.freeze([
  'HEADER_READ',
  'DYNAMIC_HEADER_KEY',
  'RAW_HEADERS',
  'REQUEST_COOKIES',
  'COOKIE_WRITE',
  'HOST_COOKIE_LITERAL',
  'COOKIE_OPTIONS_OBJECT',
  'CREDENTIAL_IMPORT',
  'TEXT_DOCUMENT_COOKIE',
  'TEXT_CSRF_HEADER',
])

const posix = (path) => path.split(sep).join('/')

const isSensitiveHeader = (name) => name === 'origin' || name === 'cookie' || name.startsWith('sec-fetch-')

function sourceFilesOf(root) {
  const configPath = resolve(root, 'apps/hub/tsconfig.json')
  const sourceRoot = resolve(root, 'apps/hub/src')
  if (existsSync(configPath)) {
    const read = ts.readConfigFile(configPath, ts.sys.readFile)
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, resolve(root, 'apps/hub'))
    return { fileNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } }
  }
  const fileNames = []
  const walk = (directory) => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (path.endsWith('.ts')) fileNames.push(path)
    }
  }
  walk(sourceRoot)
  return { fileNames, options: { strict: true, target: ts.ScriptTarget.ES2022, noEmit: true, skipLibCheck: true, types: [] } }
}

const enclosingName = (node) => {
  for (let cursor = node.parent; cursor; cursor = cursor.parent) {
    if ((ts.isFunctionDeclaration(cursor) || ts.isClassDeclaration(cursor) || ts.isMethodDeclaration(cursor)) && cursor.name) return cursor.name.getText()
    if (ts.isVariableDeclaration(cursor) && ts.isIdentifier(cursor.name)) return cursor.name.text
    if (ts.isPropertyAssignment(cursor) && ts.isIdentifier(cursor.name)) return cursor.name.text
  }
  return '<module>'
}

function scanProgram(root) {
  const { fileNames, options } = sourceFilesOf(root)
  const program = ts.createProgram(fileNames, options)
  const checker = program.getTypeChecker()
  const violations = []
  const productionRoot = `${posix(resolve(root, 'apps/hub/src'))}/`

  const literalKeys = (expression) => {
    if (ts.isStringLiteralLike(expression)) return [expression.text.toLowerCase()]
    const type = checker.getTypeAtLocation(expression)
    const members = type.isUnion() ? type.types : [type]
    if (members.every((member) => member.isStringLiteral())) return members.map((member) => member.value.toLowerCase())
    return null
  }

  const isHeaderIndex = (type) => {
    const index = checker.getIndexInfoOfType(type, ts.IndexKind.String)
    if (!index) return false
    const members = index.type.isUnion() ? index.type.types : [index.type]
    const kinds = new Set(members.map((member) => checker.typeToString(member)))
    return kinds.has('string[]') && [...kinds].every((kind) => kind === 'string' || kind === 'string[]' || kind === 'undefined')
  }

  const isHeadersObject = (expression) => {
    if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'headers') return true
    const type = checker.getNonNullableType(checker.getTypeAtLocation(expression))
    return checker.typeToString(type).includes('IncomingHttpHeaders') || isHeaderIndex(type)
  }

  const isRequestLike = (expression) => checker.getTypeAtLocation(expression).getProperty('headers') !== undefined

  for (const source of program.getSourceFiles()) {
    const path = posix(source.fileName)
    if (!path.startsWith(productionRoot) || source.isDeclarationFile) continue
    const file = posix(relative(root, source.fileName))
    if (OWNERS.has(file) || file.includes('/tests/')) continue
    const report = (predicate, node, detail) => violations.push({ predicate, file, symbol: `${enclosingName(node)}: ${detail}` })

    const deletesHeader = (node) => ts.isDeleteExpression(node.parent)

    const readOfKeys = (keyNode, node) => {
      const keys = literalKeys(keyNode)
      if (!keys) {
        if (!deletesHeader(node)) report('DYNAMIC_HEADER_KEY', node, `headers[${keyNode.getText()}]`)
        return
      }
      for (const key of keys) if (isSensitiveHeader(key)) report('HEADER_READ', node, `headers[${key}]`)
    }

    const visit = (node) => {
      if (ts.isPropertyAccessExpression(node)) {
        const name = node.name.text
        if (name === 'rawHeaders') report('RAW_HEADERS', node, 'rawHeaders')
        else if (name === 'headers' && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'raw') report('RAW_HEADERS', node, 'raw.headers')
        else if (name === 'cookies' && isRequestLike(node.expression)) report('REQUEST_COOKIES', node, 'request.cookies')
        else if (name === 'setCookie' || name === 'clearCookie') report('COOKIE_WRITE', node, name)
        else if (isSensitiveHeader(name) && isHeadersObject(node.expression)) report('HEADER_READ', node, `headers.${name}`)
      } else if (ts.isElementAccessExpression(node) && isHeadersObject(node.expression)) {
        readOfKeys(node.argumentExpression, node)
      } else if (ts.isObjectBindingPattern(node) && node.parent && ts.isVariableDeclaration(node.parent) && node.parent.initializer && isHeadersObject(node.parent.initializer)) {
        for (const element of node.elements) {
          const key = element.propertyName ?? element.name
          if (ts.isComputedPropertyName(key)) readOfKeys(key.expression, element)
          else if (isSensitiveHeader((ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : '').toLowerCase())) report('HEADER_READ', element, `headers[${key.text}]`)
        }
      } else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) {
        const text = node.text
        if (text.startsWith('__Host-')) report('HOST_COOKIE_LITERAL', node, text)
        else if (text.toLowerCase() === 'set-cookie') report('COOKIE_WRITE', node, 'set-cookie')
      } else if (ts.isObjectLiteralExpression(node)) {
        const present = new Set(node.properties.flatMap((property) => (property.name && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) && COOKIE_OPTION_KEYS.has(property.name.text) ? [property.name.text] : [])))
        if (present.size >= 2) report('COOKIE_OPTIONS_OBJECT', node, [...present].sort().join(','))
      } else if (ts.isImportSpecifier(node) && (node.propertyName ?? node.name).text === 'readCredentialCookie') {
        report('CREDENTIAL_IMPORT', node, 'readCredentialCookie')
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return violations
}

function scanText(root) {
  const violations = []
  for (const { predicate, needle, roots } of TEXT_SCANS) {
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name)
        const file = posix(relative(root, path))
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRECTORIES.has(entry.name) && !SKIPPED_PATHS.has(file)) walk(path)
        } else if (entry.isFile() && statSync(path).size < 4_000_000) {
          const buffer = readFileSync(path)
          if (buffer.includes(0)) continue
          for (const line of buffer.toString('utf8').split('\n')) {
            if (line.includes(needle)) violations.push({ predicate, file, symbol: line.trim().slice(0, 120) })
          }
        }
      }
    }
    for (const base of roots) if (existsSync(resolve(root, base))) walk(resolve(root, base))
  }
  return violations
}

export const findAccessViolations = (root) => {
  const key = (item) => `${item.predicate}\0${item.file}\0${item.symbol}`
  return [...scanProgram(root), ...scanText(root)].sort((a, b) => key(a).localeCompare(key(b)))
}

const countsOf = (violations) => Object.fromEntries(PREDICATES.map((predicate) => [predicate, violations.filter((item) => item.predicate === predicate).length]))

const main = () => {
  const violations = findAccessViolations(resolve(fileURLToPath(new URL('../', import.meta.url))))
  const counts = countsOf(violations)
  for (const predicate of PREDICATES) console.log(`check-access-owner: ${predicate} ${counts[predicate]}`)
  for (const item of violations) console.error(`check-access-owner: ${item.predicate} in ${item.file} (${item.symbol})`)
  return violations.length === 0 ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main()
