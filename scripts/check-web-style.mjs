import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const scanTree = root => {
  const files = SCANNED_ROOTS
    .map(directory => resolve(root, directory))
    .filter(directory => existsSync(directory))
    .flatMap(filesUnder)
    .map(file => relative(root, file).replaceAll('\\', '/'))
    .sort()
  const violations = files.flatMap(path => styleViolations(path, readFileSync(resolve(root, path), 'utf8')))
  return { files, violations }
}

const main = () => {
  const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url))
  if (!existsSync(resolve(root, REQUIRED_ROOT))) {
    console.error(`no files scanned: ${REQUIRED_ROOT} does not exist under ${root}`)
    return 1
  }
  const { files, violations } = scanTree(root)
  if (violations.length) {
    for (const { path, line, message } of violations) console.error(`${path}:${line}: ${message}`)
    return 1
  }
  console.log(`Web style check passed (files=${files.length}).`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
