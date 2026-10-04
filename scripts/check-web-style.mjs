import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'
import ts from 'typescript'

// The trees whose CSS and TSX paint the product: the web app, the sign-in theme and the brand
// package they both import.
const SCANNED_ROOTS = ['apps/web/src', 'apps/keycloak-theme/src', 'packages/brand/src']
const REQUIRED_ROOT = 'apps/web/src'
const EXTENSIONS = /\.(?:css|ts|tsx)$/

// C-031: a hand class with a Conexus prefix must have a CSS rule, so a class typo or a deleted
// rule fails CI instead of reaching review (the #370 trap). Structure blocks and brand tokens are
// out of scope for this check; it is about hand classes next to a screen.
const CLASS_CSS_ROOTS = ['apps/web/src', 'packages/brand/src']
// The brand package paints the mark and wordmark, so its TSX counts as a use of its own classes.
const CLASS_TSX_ROOTS = ['apps/web/src', 'packages/brand/src']
const CONEXUS_PREFIX = /^(?:cx|cxs|builder)-[\w-]+$/
const CLASS_DEFINITION = /\.((?:cx|cxs|builder)-[\w-]+)/g
// Any other class a screen writes is the design system's own: a slot or utility that
// @mastra/playground-ui ships in its CSS, a class this app's CSS defines, or a utility the app's own
// Tailwind build (apps/web/src/styles.css, with the Mastra theme) generates a rule for.
const TAILWIND_ENTRY = 'apps/web/src/styles.css'
const VENDOR_CSS_ROOT = 'node_modules/@mastra/playground-ui/dist'
const CLASSNAME_ATTR = /className\s*=\s*(["'{])/g
const CLASS_MAP = /\bconst [A-Z][A-Z_]*_CLASS(?:ES)? = \{/g
const STRING_LITERAL = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g

const lineOf = (text, index) => text.slice(0, index).split('\n').length

const filesUnder = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = resolve(directory, entry.name)
  if (entry.isDirectory()) return filesUnder(path)
  return entry.isFile() && EXTENSIONS.test(entry.name) ? [path] : []
})

// A JSX className value is a quoted string, or a `{...}` expression that may itself nest braces
// (a ternary, an object). Depth-counting past nested quotes is enough to find its true end; there
// is no need for a full JS parser to read the literal classes out of it.
const braceExpression = (text, openIndex) => {
  let depth = 0
  let quote = null
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index]
    if (quote) {
      if (character === '\\') { index += 1; continue }
      if (character === quote) quote = null
      continue
    }
    if (character === "'" || character === '"' || character === '`') quote = character
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return text.slice(openIndex, index + 1)
    }
  }
  return text.slice(openIndex)
}

const classNameTokens = text => {
  const staticTokens = []
  const dynamicTokens = []
  for (const match of text.matchAll(CLASSNAME_ATTR)) {
    const quote = match[1]
    const start = match.index + match[0].length - 1
    let value
    if (quote === '{') value = braceExpression(text, start)
    else {
      const close = text.indexOf(quote, start + 1)
      value = close === -1 ? text.slice(start) : text.slice(start, close + 1)
    }
    const line = lineOf(text, match.index)
    for (const literal of value.matchAll(STRING_LITERAL)) {
      const content = literal[1] ?? literal[2] ?? literal[3] ?? ''
      for (const token of content.split(/\s+/).filter(Boolean)) {
        if (token.includes('${')) {
          if (/^(?:cx|cxs|builder)-/.test(token)) dynamicTokens.push({ line, token })
        } else if (CONEXUS_PREFIX.test(token)) staticTokens.push({ line, token })
      }
    }
  }
  // A literal class map, `const SIDE_CLASS = { add: 'cx-dt-add' }`, names its classes outside a className.
  // Its classes are checked and counted as used like a className's.
  for (const map of text.matchAll(CLASS_MAP)) {
    const body = braceExpression(text, map.index + map[0].length - 1)
    for (const literal of body.matchAll(STRING_LITERAL)) {
      const content = literal[1] ?? literal[2] ?? ''
      for (const token of content.split(/\s+/)) {
        if (CONEXUS_PREFIX.test(token)) staticTokens.push({ line: lineOf(text, map.index), token })
      }
    }
  }
  return { staticTokens, dynamicTokens }
}

// Contract: the classes measured are the ones a className renders as literals: a string, a string in
// braces, the static parts of a template literal, and the two result branches of a ternary when they
// are literals. A condition, a comparison, a call, an array or the holes of a template are not read.
const foreignClassTokens = (path, text) => {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []
  const add = (node, content, { open = false, close = false } = {}) => {
    const tokens = content.split(/\s+/)
    tokens.forEach((token, index) => {
      const partial = (open && index === 0 && !/^\s/.test(content)) || (close && index === tokens.length - 1 && !/\s$/.test(content))
      if (token && !partial && !/^(?:cx|cxs|builder)-/.test(token)) found.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, token })
    })
  }
  const collect = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text)
    else if (ts.isTemplateExpression(node)) {
      add(node.head, node.head.text, { close: true })
      for (const span of node.templateSpans) add(span.literal, span.literal.text, { open: true, close: !ts.isTemplateTail(span.literal) })
    } else if (ts.isConditionalExpression(node)) {
      collect(node.whenTrue)
      collect(node.whenFalse)
    } else if (ts.isJsxExpression(node) && node.expression) collect(node.expression)
    else if (ts.isParenthesizedExpression(node)) collect(node.expression)
  }
  const visit = node => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'className' && node.initializer) collect(node.initializer)
    else ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

// Every class name a stylesheet's selectors name, read by a CSS parser: names come back unescaped
// (`.\32 xl\:flex` is `2xl:flex`), and nesting, @media, @layer and :is()/:not() are followed.
const classNamesIn = css => {
  const names = new Set()
  const walk = components => {
    for (const component of components) {
      if (component.type === 'class') names.add(component.name)
      // Any list a pseudo-class carries (:is, :not, :has, `of` in :nth-child) is a selector or a list of them.
      for (const inner of Object.values(component)) {
        if (Array.isArray(inner) && inner.length > 0 && (Array.isArray(inner[0]) || inner[0]?.type !== undefined)) (Array.isArray(inner[0]) ? inner : [inner]).forEach(walk)
      }
    }
  }
  transform({ filename: 'classes.css', code: Buffer.from(css), errorRecovery: true, visitor: { Selector: walk } })
  return names
}

const vendorClasses = root => {
  const names = new Set()
  const directory = resolve(root, VENDOR_CSS_ROOT)
  if (!existsSync(directory)) return names
  for (const file of readdirSync(directory, { recursive: true }).filter(entry => entry.endsWith('.css'))) {
    for (const name of classNamesIn(readFileSync(resolve(directory, file), 'utf8'))) names.add(name)
  }
  return names
}

// Whether the app's Tailwind build writes a rule for a utility, from its own entry stylesheet. Null
// when the tree has no entry, so only the CSS the tree carries counts.
const tailwindRule = async root => {
  if (!existsSync(resolve(root, TAILWIND_ENTRY))) return null
  const { compile } = await import('@tailwindcss/node')
  const base = dirname(resolve(root, TAILWIND_ENTRY))
  const compiler = await compile(readFileSync(resolve(root, TAILWIND_ENTRY), 'utf8'), { base, onDependency() {} })
  return token => classNamesIn(compiler.build([token])).has(token)
}

// The Mastra theme maps Mastra's own color variables onto the brand: each must be set to a --cx-* token.
const MASTRA_THEME = 'apps/web/src/mastra-theme.css'
const MASTRA_REPOINTED = [...[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(step => `--brand-green-${step}`), '--accent1', '--positive1', '--notice-success', '--badge-green', '--color-emerald-400']
const repointViolations = (files, contentOf) => {
  if (!files.includes(MASTRA_THEME)) return []
  const text = contentOf(MASTRA_THEME)
  return MASTRA_REPOINTED
    .filter(name => !new RegExp(`${name}:\\s*[^;]*--cx-`).test(text))
    .map(name => ({ path: MASTRA_THEME, line: 1, message: `${name} is not re-pointed to a --cx-* token` }))
}

const classCheck = (files, contentOf, vendor, generates) => {
  const defined = new Set()
  for (const path of files.filter(candidate => candidate.endsWith('.css') && CLASS_CSS_ROOTS.some(root => candidate.startsWith(`${root}/`)))) {
    const text = contentOf(path)
    for (const match of text.matchAll(CLASS_DEFINITION)) {
      defined.add(match[1])
    }
  }
  const own = new Set()
  for (const path of files.filter(candidate => candidate.endsWith('.css') && CLASS_CSS_ROOTS.some(root => candidate.startsWith(`${root}/`)))) {
    for (const name of classNamesIn(contentOf(path))) own.add(name)
  }
  const violations = []
  for (const path of files.filter(candidate => candidate.endsWith('.tsx') && CLASS_TSX_ROOTS.some(root => candidate.startsWith(`${root}/`)))) {
    for (const { line, token } of foreignClassTokens(path, contentOf(path))) {
      if (!own.has(token) && !vendor.has(token) && !generates?.(token)) violations.push({ path, line, message: `class "${token}" has no rule: not in this app's CSS, in ${VENDOR_CSS_ROOT} or from the Tailwind build; use a cx- class` })
    }
    const { staticTokens, dynamicTokens } = classNameTokens(contentOf(path))
    for (const { line, token } of staticTokens) {
      if (!defined.has(token)) violations.push({ path, line, message: `class "${token}" has no CSS rule under apps/web/src or packages/brand/src` })
    }
    for (const { line, token } of dynamicTokens) {
      violations.push({ path, line, message: `class "${token}" is built dynamically; map each value to a literal class name` })
    }
  }
  return violations
}

const scanTree = (root, generates) => {
  const files = SCANNED_ROOTS
    .map(directory => resolve(root, directory))
    .filter(directory => existsSync(directory))
    .flatMap(filesUnder)
    .map(file => relative(root, file).replaceAll('\\', '/'))
    .sort()
  const contents = new Map(files.map(path => [path, readFileSync(resolve(root, path), 'utf8')]))
  const contentOf = path => contents.get(path)
  return { files, violations: [...repointViolations(files, contentOf), ...classCheck(files, contentOf, vendorClasses(root), generates)] }
}

const main = async () => {
  const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url))
  if (!existsSync(resolve(root, REQUIRED_ROOT))) {
    console.error(`no files scanned: ${REQUIRED_ROOT} does not exist under ${root}`)
    return 1
  }
  const { files, violations } = scanTree(root, await tailwindRule(root))
  if (violations.length) {
    for (const { path, line, message } of violations) console.error(`${path}:${line}: ${message}`)
    return 1
  }
  console.log(`Web style check passed (files=${files.length}).`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main()
