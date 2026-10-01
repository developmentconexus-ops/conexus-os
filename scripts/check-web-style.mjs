import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// The trees whose CSS and TSX paint the product: the web app, the sign-in theme and the brand
// package they both import.
const SCANNED_ROOTS = ['apps/web/src', 'apps/keycloak-theme/src', 'packages/brand/src']
const REQUIRED_ROOT = 'apps/web/src'
// The palette is defined once. Every other file reaches a color through var(--cx-*).
const TOKEN_FILES = new Set(['packages/brand/src/tokens.css'])
const EXTENSIONS = /\.(?:css|ts|tsx)$/

const ALLOWED_FAMILIES = new Set(['bricolage grotesque', 'hanken grotesk', 'jetbrains mono', 'system-ui', 'ui-monospace', 'monospace'])
const FONT_TOKEN = /^var\(--cx-font-(?:display|body|mono)\)$/
const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer'])

const HEX = /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g
const CSS_FONT = /(?<![\w-])(font-family|font)\s*:\s*([^;}\n]+)/g
const SCRIPT_FONT = /(?<![\w-])(font-family|fontFamily|font)\s*:\s*(['"`])([^'"`\n]*)\2/g
// In the font shorthand the family list is whatever follows the size and optional line height.
const SHORTHAND_FAMILY = /(?:^|\s)(?:\d*\.?\d+(?:px|rem|em|%|pt|vw|vh|ch|ex|lh)|(?:xx?-)?(?:small|large)|medium|smaller|larger|var\([^)]*\))(?:\s*\/\s*\S+)?\s+(\S.*)$/

// C-031: a hand class with a Conexus prefix must have a CSS rule, so a class typo or a deleted
// rule fails CI instead of reaching review (the #370 trap). Structure blocks and brand tokens are
// out of scope for this check; it is about hand classes next to a screen.
const CLASS_CSS_ROOTS = ['apps/web/src', 'packages/brand/src']
const CLASS_TSX_ROOT = 'apps/web/src'
const CONEXUS_PREFIX = /^(?:cx|cxs|builder)-[\w-]+$/
const CLASS_DEFINITION = /\.((?:cx|cxs|builder)-[\w-]+)/g
const CLASSNAME_ATTR = /className\s*=\s*(["'{])/g
const STRING_LITERAL = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g

// A class built from a template literal, such as `cx-dt-${side}`, has no literal name here to look
// up. Each entry is verified by hand against the CSS and names the file that builds it, so a
// reviewer can re-check it without re-deriving the resolved names.
const DYNAMIC_CLASSES = [
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal ${...} text is the source token to match, not an interpolation
  { file: 'apps/web/src/features/builder/construir/lens-diff.tsx', token: 'cx-dt-${side}', resolves: ['cx-dt-add', 'cx-dt-del'] },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal ${...} text is the source token to match, not an interpolation
  { file: 'apps/web/src/features/settings/components/states.tsx', token: 'cxs-chip-${tone}', resolves: ['cxs-chip-positive', 'cxs-chip-warning', 'cxs-chip-neutral'] },
]

// A hover hint is the design system Tooltip, never the browser's native `title` bubble (HQ decision
// 2026-09-29). A `title` is a hint on an intrinsic element or on a dotted component such as
// DropdownMenu.Trigger, which forward it to the DOM. A `title` on a plain component (Status,
// PageHeader) is a heading prop, and an iframe's `title` is its accessible name, so both stay.
const NATIVE_HINT_MESSAGE = "native title hint; use the design system Tooltip (import { Tooltip, TooltipContent, TooltipTrigger } from '@mastra/playground-ui/components/Tooltip') and keep the aria-label on an icon-only control"
const isNativeHintHost = tag => (/^[a-z]/.test(tag) && tag !== 'iframe') || tag.includes('.')

// The Hub's CSRF cookie is read in one place, apps/web/src/app/http.ts (hubFetch). The
// generated clients are written by their generator, not by hand, and stay out of this check.
const CSRF_COOKIE = '__Host-conexus_csrf'
const CSRF_READER = 'apps/web/src/app/http.ts'
const csrfViolations = (path, text) => {
  if (!/\.tsx?$/.test(path) || !path.startsWith(`${CLASS_TSX_ROOT}/`) || path === CSRF_READER || path.startsWith(`${CLASS_TSX_ROOT}/generated/`)) return []
  const index = text.indexOf(CSRF_COOKIE)
  return index === -1 ? [] : [{ path, line: lineOf(text, index), message: `reads the CSRF cookie by hand; call hubFetch from ${CSRF_READER}` }]
}

const nativeHintViolations = (path, text) => {
  if (!path.endsWith('.tsx') || !path.startsWith(`${CLASS_TSX_ROOT}/`)) return []
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const violations = []
  const visit = node => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'title') {
      const element = node.parent.parent
      const tag = ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element) ? element.tagName.getText(source) : ''
      if (isNativeHintHost(tag)) violations.push({ path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, message: `<${tag} title=...>: ${NATIVE_HINT_MESSAGE}` })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

const splitTopLevel = list => {
  const parts = []
  let depth = 0
  let current = ''
  for (const character of list) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += character
  }
  return [...parts, current].map(part => part.trim()).filter(Boolean)
}

const familiesOf = (property, value) => {
  const list = value.trim().replace(/\s*!important$/, '')
  if (property !== 'font') return splitTopLevel(list)
  const shorthand = list.match(SHORTHAND_FAMILY)
  return shorthand ? splitTopLevel(shorthand[1]) : []
}

const permittedFamily = family => {
  const bare = family.replace(/^["']|["']$/g, '').trim()
  return ALLOWED_FAMILIES.has(bare.toLowerCase()) || FONT_TOKEN.test(bare) || CSS_WIDE_KEYWORDS.has(bare.toLowerCase())
}

const styleViolations = (path, text) => {
  const violations = []
  if (!TOKEN_FILES.has(path)) {
    for (const match of text.matchAll(HEX)) {
      violations.push({ path, line: lineOf(text, match.index), message: `raw hex color ${match[0]}; use a var(--cx-*) token from packages/brand/src/tokens.css` })
    }
  }
  const declarations = path.endsWith('.css')
    ? [...text.matchAll(CSS_FONT)].map(match => ({ index: match.index, property: match[1], value: match[2] }))
    : [...text.matchAll(SCRIPT_FONT)].map(match => ({ index: match.index, property: match[1] === 'fontFamily' ? 'font-family' : match[1], value: match[3] }))
  for (const { index, property, value } of declarations) {
    for (const family of familiesOf(property, value).filter(entry => !permittedFamily(entry))) {
      violations.push({ path, line: lineOf(text, index), message: `font family ${family} is not a brand font; use var(--cx-font-display|body|mono)` })
    }
  }
  return violations
}

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
  return { staticTokens, dynamicTokens }
}

const classCheck = (files, contentOf) => {
  const defined = new Map()
  for (const path of files.filter(candidate => candidate.endsWith('.css') && CLASS_CSS_ROOTS.some(root => candidate.startsWith(`${root}/`)))) {
    const text = contentOf(path)
    for (const match of text.matchAll(CLASS_DEFINITION)) {
      if (!defined.has(match[1])) defined.set(match[1], { path, line: lineOf(text, match.index) })
    }
  }
  const used = new Set()
  const violations = []
  for (const path of files.filter(candidate => candidate.endsWith('.tsx') && candidate.startsWith(`${CLASS_TSX_ROOT}/`))) {
    const { staticTokens, dynamicTokens } = classNameTokens(contentOf(path))
    for (const { line, token } of staticTokens) {
      used.add(token)
      if (!defined.has(token)) violations.push({ path, line, message: `class "${token}" has no CSS rule under apps/web/src or packages/brand/src` })
    }
    for (const { line, token } of dynamicTokens) {
      const allowed = DYNAMIC_CLASSES.find(entry => entry.file === path && entry.token === token)
      if (!allowed) {
        violations.push({ path, line, message: `class "${token}" is built dynamically; add it to DYNAMIC_CLASSES in scripts/check-web-style.mjs` })
        continue
      }
      for (const resolved of allowed.resolves) {
        used.add(resolved)
        if (!defined.has(resolved)) violations.push({ path, line, message: `class "${resolved}", resolved from the dynamic "${token}", has no CSS rule under apps/web/src or packages/brand/src` })
      }
    }
  }
  const unused = [...defined]
    .filter(([name]) => !used.has(name))
    .map(([name, { path, line }]) => ({ path, line, message: `class "${name}" is defined in CSS but no apps/web/src/**/*.tsx uses it` }))
  return { violations, unused }
}

const scanTree = root => {
  const files = SCANNED_ROOTS
    .map(directory => resolve(root, directory))
    .filter(directory => existsSync(directory))
    .flatMap(filesUnder)
    .map(file => relative(root, file).replaceAll('\\', '/'))
    .sort()
  const contents = new Map(files.map(path => [path, readFileSync(resolve(root, path), 'utf8')]))
  const contentOf = path => contents.get(path)
  const violations = files.flatMap(path => styleViolations(path, contentOf(path)))
  const hintViolations = files.flatMap(path => nativeHintViolations(path, contentOf(path)))
  const csrfReads = files.flatMap(path => csrfViolations(path, contentOf(path)))
  const classResult = classCheck(files, contentOf)
  return { files, violations: [...violations, ...hintViolations, ...csrfReads, ...classResult.violations], unused: classResult.unused }
}

const main = () => {
  const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url))
  if (!existsSync(resolve(root, REQUIRED_ROOT))) {
    console.error(`no files scanned: ${REQUIRED_ROOT} does not exist under ${root}`)
    return 1
  }
  const { files, violations, unused } = scanTree(root)
  if (violations.length) {
    for (const { path, line, message } of violations) console.error(`${path}:${line}: ${message}`)
    return 1
  }
  // A defined-but-unused Conexus class is debt, not a break: main carries some already, mostly
  // classes a screen reaches through a dynamic template. It warns instead of failing CI.
  if (unused.length) {
    console.warn(`${unused.length} Conexus class(es) defined in CSS with no apps/web/src/**/*.tsx use:`)
    for (const { path, line, message } of unused) console.warn(`${path}:${line}: ${message}`)
  }
  console.log(`Web style check passed (files=${files.length}).`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
