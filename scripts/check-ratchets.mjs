import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { TEST_FILE } from './check-test-census.mjs'

// Five per-file counts that may only fall: `as` casts (not `as const`), functions over 80 lines,
// lines of a file over 500, tests whose every assertion is weak, and tests that read production
// source text. scripts/ratchets.json holds the counts. The check fails when a count rises and also
// when it falls without the file being lowered, so no slack builds up. `--write` only lowers.

export const FUNCTION_LINE_LIMIT = 80
export const FILE_LINE_LIMIT = 500
export const MEASURES = Object.freeze(['casts', 'longFunctions', 'longFiles', 'weakTests', 'sourceReads'])

const PRODUCTION_FILE = /^(apps\/[^/]+|packages\/[^/]+)\/src\/.*\.(ts|tsx|mts)$/
const GENERATED_FILE = /\.d\.mts$|\/generated\/|\.generated\./

const TEST_FUNCTIONS = new Set(['test', 'it'])
const COMPARISONS = new Set(['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual'])
const WEAK_METHODS = new Set(['ok', 'match', 'doesNotMatch', 'notEqual', 'notStrictEqual', 'notDeepEqual', 'notDeepStrictEqual', 'doesNotThrow'])

const READ_CALLS = new Set(['readFileSync', 'readFile', 'readdirSync', 'readdir', 'createReadStream'])
const PRODUCTION_TEXT = /(?:apps\/[\w.-]+\/src|packages\/[\w.-]+\/src|infra\/|infra$|\.github)/
// Text that is the product, or a committed artifact checked against its source, is read on purpose.
const LEGITIMATE_TEXT = /builder-skills\/|\/migrations\/|\.generated\.|\/generated\/|harness\/prompt|handler-kit\/sankhya\.ts|builder\/starter\/|compiler-template\//

const walk = (root, directory, keep) => listDirectory(root, directory).flatMap((entry) => {
  const path = `${directory}/${entry.name}`
  if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : walk(root, path, keep)
  return keep(path) ? [path] : []
})

const listDirectory = (root, directory) => {
  try {
    return readdirSync(join(root, directory), { withFileTypes: true })
  } catch {
    return []
  }
}

const productionFiles = (root) => ['apps', 'packages'].flatMap((group) => listDirectory(root, group).filter((entry) => entry.isDirectory()).flatMap((entry) => walk(root, `${group}/${entry.name}/src`, (path) => PRODUCTION_FILE.test(path) && !GENERATED_FILE.test(path))))

const testFiles = (root) => walk(root, 'tests', (path) => path.endsWith('.mjs'))

const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : file.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS)

const isConstAssertion = (node) => ts.isTypeReferenceNode(node.type) && node.type.typeName.getText() === 'const'

const FUNCTION_KINDS = [ts.isFunctionDeclaration, ts.isFunctionExpression, ts.isArrowFunction, ts.isMethodDeclaration, ts.isConstructorDeclaration]

export const measureProduction = (file, text) => {
  const source = parse(file, text)
  let casts = 0
  let longFunctions = 0
  const visit = (node) => {
    if ((ts.isAsExpression(node) && !isConstAssertion(node)) || ts.isTypeAssertionExpression(node)) casts += 1
    if (FUNCTION_KINDS.some((is) => is(node)) && node.body) {
      const first = source.getLineAndCharacterOfPosition(node.getStart(source)).line
      const last = source.getLineAndCharacterOfPosition(node.end).line
      if (last - first + 1 > FUNCTION_LINE_LIMIT) longFunctions += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  const lines = text.replace(/\n$/, '').split('\n').length
  return { casts, longFunctions, longFiles: lines > FILE_LINE_LIMIT ? lines : 0 }
}

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

// A test is weak-only when every assertion in it is assert.ok / truthiness, a bare includes/match on
// text, or a comparison whose expected value is not a literal. A test with no assertion at all counts
// the same. A Playwright waitFor counts as an assertion: it fails the test when the element never
// appears. One literal comparison, a throws or a helper named assert* makes a test strong.
const countWeakTests = (source) => {
  let weak = 0
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && TEST_FUNCTIONS.has(node.expression.text)) {
      const body = node.arguments.find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
      if (body) {
        let strong = false
        const collect = (child) => {
          if (ts.isCallExpression(child) && classifyAssertion(child) === 'strong') strong = true
          ts.forEachChild(child, collect)
        }
        collect(body)
        if (!strong) weak += 1
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return weak
}

// A test reads production source when the path it reads, or the path it hands to a function of its
// own that reads, names a file under production source, infra or .github. A path is followed through
// the variables that hold it. Only a test that runs the code (esbuild, an import) or writes a
// fixture is not a reader. It does not follow a path across files, so it is a floor.
const countSourceReads = (source) => {
  const initializers = new Map()
  const readers = new Set()
  const isRead = (node) => ts.isCallExpression(node) && READ_CALLS.has((ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression).getText(source))
  // A function reads what its caller hands it when a parameter reaches the path of a read in its body.
  const readsItsParameter = (fn) => {
    const parameters = new Set(fn.parameters.flatMap((parameter) => (ts.isIdentifier(parameter.name) ? [parameter.name.text] : [])))
    const reaches = (node) => {
      let found = false
      ts.forEachChild(node, (child) => {
        found ||= ts.isIdentifier(child) ? parameters.has(child.text) : reaches(child)
      })
      return found || (ts.isIdentifier(node) && parameters.has(node.text))
    }
    const search = (node) => {
      let found = isRead(node) && node.arguments[0] !== undefined && reaches(node.arguments[0])
      ts.forEachChild(node, (child) => {
        found ||= search(child)
      })
      return found
    }
    return search(fn.body ?? fn)
  }
  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      initializers.set(node.name.text, node.initializer)
      if ((ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) && readsItsParameter(node.initializer)) readers.add(node.name.text)
    }
    if (ts.isFunctionDeclaration(node) && node.name && readsItsParameter(node)) readers.add(node.name.text)
    ts.forEachChild(node, collect)
  }
  collect(source)
  const textsOf = (node, seen = new Set()) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) return [node.text]
    if (ts.isIdentifier(node) && initializers.has(node.text) && !seen.has(node.text) && !readers.has(node.text) && !ts.isFunctionLike(initializers.get(node.text))) return textsOf(initializers.get(node.text), new Set([...seen, node.text]))
    const texts = []
    ts.forEachChild(node, (child) => {
      texts.push(...textsOf(child, seen))
    })
    return texts
  }
  const namesProduction = (node) => textsOf(node).some((text) => PRODUCTION_TEXT.test(text) && !LEGITIMATE_TEXT.test(text))
  let reads = 0
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments[0]) {
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : ''
      if ((isRead(node) || readers.has(callee)) && namesProduction(node.arguments[0])) reads += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return reads
}

export const measureTest = (file, text) => {
  const source = parse(file, text)
  return TEST_FILE.test(file) ? { weakTests: countWeakTests(source), sourceReads: countSourceReads(source) } : { weakTests: 0, sourceReads: 0 }
}

export const measureRepository = (root) => {
  const measured = Object.fromEntries(MEASURES.map((measure) => [measure, {}]))
  const record = (measure, file, count) => {
    if (count > 0) measured[measure][file] = count
  }
  for (const file of productionFiles(root)) {
    const counts = measureProduction(file, readFileSync(join(root, file), 'utf8'))
    for (const measure of ['casts', 'longFunctions', 'longFiles']) record(measure, file, counts[measure])
  }
  for (const file of testFiles(root)) {
    const counts = measureTest(file, readFileSync(join(root, file), 'utf8'))
    for (const measure of ['weakTests', 'sourceReads']) record(measure, file, counts[measure])
  }
  return measured
}

const sorted = (counts) => Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

// Rose: the count is above the file's recorded count. Fell: below it, so the file must be lowered.
export const compareRatchets = (recorded, measured) => {
  const rose = []
  const fell = []
  for (const measure of MEASURES) {
    const before = recorded[measure] ?? {}
    const now = measured[measure]
    for (const file of new Set([...Object.keys(before), ...Object.keys(now)])) {
      const was = before[file] ?? 0
      const is = now[file] ?? 0
      if (is > was) rose.push({ measure, file, was, is })
      else if (is < was) fell.push({ measure, file, was, is })
    }
  }
  return { rose, fell }
}

export const lowered = (measured) => Object.fromEntries(MEASURES.map((measure) => [measure, sorted(measured[measure])]))

const describe = ({ measure, file, was, is }) => `  ${measure} ${file}: ${was} -> ${is}`

const main = () => {
  const args = process.argv.slice(2)
  const rootIndex = args.indexOf('--root')
  const root = resolve(rootIndex === -1 ? resolve(import.meta.dirname, '..') : args[rootIndex + 1])
  const path = join(root, 'scripts', 'ratchets.json')
  const measured = measureRepository(root)
  const { rose, fell } = compareRatchets(JSON.parse(readFileSync(path, 'utf8')), measured)
  if (rose.length > 0) {
    process.stderr.write(`ratchets rose; fix the code, never raise the file:\n${rose.map(describe).join('\n')}\n`)
    process.exit(1)
  }
  if (args.includes('--write')) {
    writeFileSync(path, `${JSON.stringify(lowered(measured), null, 2)}\n`)
    process.stdout.write(`ratchets lowered in ${relative(root, path)}: ${fell.length} entries\n`)
    return
  }
  if (fell.length > 0) {
    process.stderr.write(`ratchets fell; run \`node scripts/check-ratchets.mjs --write\` and commit scripts/ratchets.json:\n${fell.map(describe).join('\n')}\n`)
    process.exit(1)
  }
  const totals = MEASURES.map((measure) => `${measure} ${Object.values(measured[measure]).reduce((sum, count) => sum + count, 0)}`)
  process.stdout.write(`ratchets hold: ${totals.join(', ')}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
