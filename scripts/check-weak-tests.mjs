import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// A test is weak-only when every assertion in it is assert.ok / truthiness, a bare includes/match on
// text, or a comparison whose expected value is not a literal. A test with no assertion at all is
// reported the same way. A Playwright waitFor counts as an assertion: it fails the test when the
// element never appears. A test that mixes in one literal comparison, a throws or a helper named
// assert* is not weak-only. The count may only fall: it is compared with the ratchet kept in
// scripts/weak-tests-ratchet.json.

const repositoryRoot = resolve(import.meta.dirname, '..')
const RATCHET_PATH = resolve(import.meta.dirname, 'weak-tests-ratchet.json')
const TEST_FUNCTIONS = new Set(['test', 'it'])
const COMPARISONS = new Set(['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual'])
const WEAK_METHODS = new Set(['ok', 'match', 'doesNotMatch', 'notEqual', 'notStrictEqual', 'notDeepEqual', 'notDeepStrictEqual', 'doesNotThrow'])

const isLiteral = (node) => {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return isLiteral(node.expression)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node) || ts.isRegularExpressionLiteral(node)) return true
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) return true
  if (ts.isIdentifier(node) && node.text === 'undefined') return true
  if (ts.isPrefixUnaryExpression(node)) return isLiteral(node.operand)
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(isLiteral)
  if (ts.isObjectLiteralExpression(node)) return node.properties.every((property) => ts.isPropertyAssignment(property) && isLiteral(property.initializer))
  return false
}

// 'strong', 'weak', or null when the call is not an assertion.
const classifyAssertion = (call) => {
  const callee = call.expression
  let root = callee
  while (ts.isPropertyAccessExpression(root) || ts.isCallExpression(root)) root = root.expression
  if (ts.isIdentifier(root) && root.text === 'expect') return call.expression === root ? 'strong' : null
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'waitFor') return 'strong'
  if (ts.isIdentifier(callee) && callee.text === 'assert') return 'weak'
  if (ts.isIdentifier(callee) && /^assert[A-Z]/.test(callee.text)) return 'strong'
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== 'assert') return null
  const method = callee.name.text
  if (WEAK_METHODS.has(method)) return 'weak'
  if (COMPARISONS.has(method)) return call.arguments[1] !== undefined && isLiteral(call.arguments[1]) ? 'strong' : 'weak'
  return 'strong'
}

export const findWeakTests = (source, file) => {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const found = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && TEST_FUNCTIONS.has(node.expression.text)) {
      const body = node.arguments.find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
      if (body) {
        const kinds = []
        const collect = (child) => {
          if (ts.isCallExpression(child)) {
            const kind = classifyAssertion(child)
            if (kind) kinds.push(kind)
          }
          ts.forEachChild(child, collect)
        }
        collect(body)
        if (!kinds.includes('strong')) {
          const name = node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) || ts.isTemplateExpression(node.arguments[0]) ? node.arguments[0].getText(sourceFile).slice(1, -1) : '(unnamed)'
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          found.push({ file, line: line + 1, name, reason: kinds.length === 0 ? 'no assertion' : 'weak-only' })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

const listTests = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listTests(path)
  return entry.name.endsWith('.test.mjs') ? [path] : []
})

const scanRepository = (root) => listTests(resolve(root, 'tests')).sort().flatMap((path) => {
  const file = relative(root, path)
  return findWeakTests(readFileSync(path, 'utf8'), file)
})

export const checkRatchet = (count, max) => (count > max ? { ok: false, message: `${count} weak-only tests exceed the ratchet of ${max}; strengthen the new ones` } : { ok: true, message: `${count} weak-only tests, ratchet ${max}${count < max ? '; lower the ratchet to the new count' : ''}` })

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const weak = scanRepository(repositoryRoot)
  for (const { file, line, name, reason } of weak) process.stdout.write(`${file}:${line} ${reason}: ${name}\n`)
  const { max } = JSON.parse(readFileSync(RATCHET_PATH, 'utf8'))
  const result = checkRatchet(weak.length, max)
  process.stdout.write(`${result.message}\n`)
  process.exit(result.ok ? 0 : 1)
}
