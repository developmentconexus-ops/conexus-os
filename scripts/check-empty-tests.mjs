// Fails a test whose body contains no assertion at all. Syntactic only: it looks for the shape of an
// assertion anywhere in the body, even inside a function the test never calls, and it never judges
// whether an assertion is strong. That stays review.
// A test is a `test(...)`/`it(...)` call or a `<context>.test(...)` subtest. An assertion is a call
// of `assert`, `assert.*`, an `assert*` helper or `expect`, an `assert*` function passed as an
// argument, or a Playwright wait on a condition (`waitFor*`, except the unconditional
// `waitForTimeout`). A test whose only content is subtests is judged through them.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'

const TEST_FILE = /\.(?:test|spec)\.mjs$/

const root = resolve(process.argv[2] ?? '.')
const walk = (directory) => readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
  const path = `${directory}/${entry.name}`
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(path)
  return TEST_FILE.test(entry.name) ? [path] : []
})

const rootName = (node) => {
  let current = node
  while (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) current = current.expression
  return ts.isIdentifier(current) ? current.text : ''
}
const isAssertName = (name) => name === 'assert' || name === 'expect' || /^assert[A-Z]/.test(name)
const isAssertion = (node) => {
  if (!ts.isCallExpression(node)) return false
  if (isAssertName(rootName(node.expression))) return true
  if (ts.isPropertyAccessExpression(node.expression) && /^waitFor(?!Timeout$)/.test(node.expression.name.text)) return true
  return node.arguments.some((argument) => ts.isIdentifier(argument) && /^assert[A-Z]/.test(argument.text))
}
const isTestCall = (node) => {
  if (!ts.isCallExpression(node)) return false
  const callee = node.expression
  if (ts.isIdentifier(callee)) return callee.text === 'test' || callee.text === 'it'
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'test' && ts.isIdentifier(callee.expression)
}

const empty = []
for (const file of walk('tests')) {
  const source = ts.createSourceFile(file, readFileSync(join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const visit = (node) => {
    if (isTestCall(node)) {
      const body = node.arguments.find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
      if (body) {
        let asserts = false
        let subtests = false
        const look = (child) => {
          if (child !== node && isTestCall(child)) subtests = true
          else if (isAssertion(child)) asserts = true
          ts.forEachChild(child, look)
        }
        ts.forEachChild(body, look)
        if (!asserts && !subtests) empty.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

if (empty.length > 0) {
  process.stderr.write(`tests that assert nothing; assert the observable result:\n${empty.map((place) => `  ${place}`).join('\n')}\n`)
  process.exit(1)
}
process.stdout.write('every test asserts something\n')
