import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_FILES = new Set(['README.md', 'CONTRIBUTING.md', 'docs/index.md', 'docs/roadmap.md', '.github/pull_request_template.md'])
// The Mastra skill is the upstream skill as published; its commands address a Mastra project, not this one.
const VENDORED = ['.agents/skills/mastra/']

// Each guide is the one owner of its subject, with a byte cap on the whole file.
export const GUIDES = Object.freeze({
  C: { path: 'docs/development/codebase-principles.md', kib: 8 },
  A: { path: 'docs/reference/architecture.md', kib: 8 },
  L: { path: 'docs/development/delivery.md', kib: 10 },
  D: { path: 'docs/reference/database.md', kib: 8 },
  H: { path: 'docs/product/wire-contract.md', kib: 8 },
  S: { path: 'docs/reference/security-and-authority.md', kib: 12 },
  P: { path: 'docs/product/contract.md', kib: 12 },
  T: { path: 'docs/development/testing.md', kib: 6 },
})
const GUIDE_PATHS = new Set(Object.values(GUIDES).map(guide => guide.path))

export function inScope(path) {
  if (VENDORED.some(prefix => path.startsWith(prefix))) return false
  return ROOT_FILES.has(path) || GUIDE_PATHS.has(path) || /(^|\/)AGENTS\.md$/.test(path)
    || (/^(\.agents\/skills|docs\/development)\//.test(path) && path.endsWith('.md'))
}

const LINES = { unit: 'lines', measure: text => text.replace(/\n$/, '').split('\n').length }
const CHARACTERS = { unit: 'characters', measure: text => text.length }
const BYTES = { unit: 'bytes', measure: text => Buffer.byteLength(text) }
const NEVER_ITEMS = { unit: 'never-list items', measure: text => text.split('\n').filter(line => line.startsWith('- **Never ')).length }

// Mastra caps a package AGENTS.md at 500 tokens (tokenx estimateTokenCount). tokenx 2.1.0 on Mastra's and
// our AGENTS.md files measured 0.237 to 0.270 tokens per character, so 1800 characters stays under 500.
const NESTED_AGENTS_CHARACTERS = 1800

// Every matching cap applies.
export const SIZE_CAPS = Object.freeze([
  ...Object.values(GUIDES).map(({ path, kib }) => ({ match: candidate => candidate === path, ...BYTES, max: kib * 1024 })),
  { match: path => path === 'AGENTS.md', ...LINES, max: 60 },
  { match: path => path.endsWith('/AGENTS.md'), ...CHARACTERS, max: NESTED_AGENTS_CHARACTERS, note: 'about 500 tokens' },
  { match: path => path.endsWith('/SKILL.md'), ...LINES, max: 90 },
  { match: path => path === GUIDES.L.path, ...LINES, max: 150 },
  { match: path => path === GUIDES.C.path, ...NEVER_ITEMS, max: 15 },
])

// GitHub's heading anchor: lowercase, punctuation dropped, each whitespace character a hyphen.
export function anchorOf(heading) {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

function anchorsIn(text) {
  const counts = new Map()
  const anchors = new Set()
  for (const { line, fenced } of linesOf(text)) {
    const heading = !fenced && /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (!heading) continue
    const base = anchorOf(heading[1])
    const seen = counts.get(base) ?? 0
    counts.set(base, seen + 1)
    anchors.add(seen ? `${base}-${seen}` : base)
  }
  return anchors
}

function linesOf(text) {
  let fenced = false
  return text.split('\n').map((raw, index) => {
    const line = raw.replace(/\r$/, '')
    const fence = /^\s*(```|~~~)/.test(line)
    if (fence) fenced = !fenced
    return { line, number: index + 1, fenced: fenced || fence }
  })
}

export function checkFile(path, text, { root, scripts }) {
  const findings = []
  const report = (number, message) => findings.push({ where: number ? `${path}:${number}` : path, message })

  for (const cap of SIZE_CAPS.filter(rule => rule.match(path))) {
    const size = cap.measure(text)
    if (size > cap.max) report(0, `${size} ${cap.unit} exceeds the cap of ${cap.max}${cap.note ? ` (${cap.note})` : ''}`)
  }

  for (const { line, number, fenced } of linesOf(text)) {
    for (const [, cited] of line.matchAll(/\bnpm run ([\w:.-]+)/g)) {
      const name = cited.replace(/[.:,-]+$/, '')
      if (!Object.hasOwn(scripts, name)) report(number, `npm run ${name} is not a script in package.json`)
    }
    if (fenced) continue
    for (const [, target] of line.matchAll(/(?<!!)\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
      const problem = brokenLink(path, target, text, root)
      if (problem) report(number, problem)
    }
  }
  return findings
}

function brokenLink(path, target, text, root) {
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) return null
  const [rawFile, anchor] = target.split('#')
  const file = decodeURIComponent(rawFile)
  const resolved = file === '' ? path
    : file.startsWith('/') ? file.slice(1) : posix.normalize(posix.join(posix.dirname(path), file))
  const absolute = resolve(root, resolved)
  if (!existsSync(absolute)) return `broken link: ${target} (no file at ${resolved})`
  if (!anchor || !resolved.endsWith('.md') || statSync(absolute).isDirectory()) return null
  const anchors = anchorsIn(file === '' ? text : readFileSync(absolute, 'utf8'))
  return anchors.has(decodeURIComponent(anchor).toLowerCase()) ? null : `broken link: ${target} (no heading #${anchor} in ${resolved})`
}

export function checkWorkflows(tracked, root) {
  return tracked.filter(path => path.startsWith('.github/workflows/') && lstatSync(join(root, path)).isFile()).flatMap(path => {
    const text = readFileSync(join(root, path), 'utf8')
    return [
      ...(text.includes('pull_request_target') ? [{ where: path, message: 'unsafe pull_request_target trigger' }] : []),
      ...(/^\s*contents:\s*write\s*$/m.test(text) ? [{ where: path, message: 'workflow has contents: write permission' }] : []),
    ]
  })
}

export function checkRepository(root) {
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}
  const tracked = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(path => path && existsSync(join(root, path))))].sort()
  const files = tracked.filter(inScope)
  const findings = [
    ...files.flatMap(path => checkFile(path, readFileSync(join(root, path), 'utf8'), { root, scripts })),
    ...checkWorkflows(tracked, root),
  ]
  return { files: files.length, findings }
}

const repositoryRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = process.argv[2] ? resolve(process.argv[2]) : repositoryRoot
  const { files, findings } = checkRepository(root)
  for (const finding of findings) console.error(`error ${finding.where}: ${finding.message}`)
  if (findings.length) process.exitCode = 1
  else console.log(`Agent context checks passed (files=${files}).`)
}
