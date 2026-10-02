import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// A ratchet, not a contract: contracts/technical/wire-ratchet.json lists every Builder route that
// is not in the generated operation table and every problem type the web compares by hand. The
// list must match the code exactly. A new entry fails (a swap included), and so does an entry the
// code no longer has, so a pull request that closes a gap deletes its line.
//
// The routes are read with the TypeScript compiler, not with patterns over lines. Anything the
// reader cannot resolve to a string stops the check instead of being skipped.
const root = process.env.CONEXUS_WIRE_RATCHET_ROOT ?? '.'
const ratchetFile = 'contracts/technical/wire-ratchet.json'
const VERBS = new Set(['get', 'post', 'put', 'delete', 'patch'])
const ROUTE_HELPERS = new Set(['sessionRoute', 'mastraRoute'])

const sources = (directory, extensions) => fs.readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)) && !/\.test\./.test(entry.name))
  .map((entry) => {
    const file = path.join(entry.parentPath, entry.name)
    return { file: path.relative(root, file).split(path.sep).join('/'), text: fs.readFileSync(file, 'utf8') }
  })

const shape = (file, node, what) => new Error(`${file}: cannot read ${what} \`${node.getText()}\`; the ratchet does not understand its shape`)

const builderRoutes = ({ file, text }) => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declared = new Map()
  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (declared.has(node.name.text)) declared.set(node.name.text, null)
      else declared.set(node.name.text, node.initializer)
    }
    ts.forEachChild(node, collect)
  }
  collect(source)

  // A string literal, a template, or a local const holding one. An imported name inside a template
  // stays as ${name}, so the key still says which provider the path is built from.
  const resolving = new Set()
  const text_ = (node) => {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return text_(node.expression)
    if (ts.isStringLiteralLike(node)) return node.text
    if (ts.isTemplateExpression(node)) {
      return node.head.text + node.templateSpans.map((span) => {
        if (!ts.isIdentifier(span.expression)) throw shape(file, span.expression, 'a template part')
        const value = declared.get(span.expression.text)
        return `${value ? text_(value) : `\${${span.expression.text}}`}${span.literal.text}`
      }).join('')
    }
    if (ts.isIdentifier(node)) {
      const value = declared.get(node.text)
      if (!value || resolving.has(node.text)) throw shape(file, node, 'a path')
      resolving.add(node.text)
      try { return text_(value) } finally { resolving.delete(node.text) }
    }
    throw shape(file, node, 'a path')
  }

  const mastraRoute = (call) => {
    const helper = call.expression.text
    const [method, suffix] = call.arguments
    if (!method || !ts.isStringLiteralLike(method) || call.arguments.length > 2) throw shape(file, call, 'a route call')
    const tail = suffix === undefined ? '' : text_(suffix)
    return `mastra ${method.text} ${helper === 'sessionRoute' ? `${text_(ts.factory.createIdentifier('SESSION_BASE'))}${tail}` : tail}`
  }
  const isRouteCall = (node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ROUTE_HELPERS.has(node.expression.text)

  const routes = []
  const browserSets = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'app' && VERBS.has(node.expression.name.text)) {
      if (node.arguments.length === 0) throw shape(file, node, 'a registration')
      routes.push(`${file} ${node.expression.name.text.toUpperCase()} ${text_(node.arguments[0])}`)
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'BROWSER_ROUTES') browserSets.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)

  for (const set of browserSets) {
    const init = set.initializer
    const list = init && ts.isNewExpression(init) && init.expression.getText() === 'Set' ? init.arguments?.[0] : undefined
    if (!list || !ts.isArrayLiteralExpression(list)) throw shape(file, set, 'BROWSER_ROUTES')
    for (const element of list.elements) {
      const call = ts.isIdentifier(element) ? declared.get(element.text) : element
      if (!call || !isRouteCall(call)) throw shape(file, element, 'a BROWSER_ROUTES entry')
      routes.push(mastraRoute(call))
    }
  }
  return { routes, browserSets: browserSets.length }
}

const read = sources('apps/hub/src/builder', ['.ts']).map(builderRoutes)
if (read.reduce((sum, { browserSets }) => sum + browserSets, 0) !== 1) throw new Error('BROWSER_ROUTES must be declared once under apps/hub/src/builder; the ratchet does not understand its shape')

const problemTypes = sources('apps/web/src', ['.ts', '.tsx']).flatMap(({ text }) => text.match(/urn:conexus:problem:[a-z0-9-]+/g) ?? [])
const measured = {
  builderRoutes: [...new Set(read.flatMap(({ routes }) => routes))].sort(),
  problemTypes: [...new Set(problemTypes)].sort(),
}

const recorded = JSON.parse(fs.readFileSync(path.join(root, ratchetFile), 'utf8'))
const failures = Object.entries(measured).flatMap(([list, now]) => {
  const was = recorded[list]
  if (!Array.isArray(was)) return [`${ratchetFile} has no list ${list}`]
  return [
    ...now.filter((entry) => !was.includes(entry)).map((entry) => `${list}: new gap ${entry}; put it on the generated contract instead of adding it to ${ratchetFile}`),
    ...was.filter((entry) => !now.includes(entry)).map((entry) => `${list}: ${entry} is no longer in the code; delete its line from ${ratchetFile}`),
  ]
})
if (failures.length > 0) throw new Error(failures.join('\n'))
console.log(`Wire ratchet OK: ${measured.builderRoutes.length} Builder routes off the table, ${measured.problemTypes.length} problem types compared by hand`)
