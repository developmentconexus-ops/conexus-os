import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_FILES = new Set(['README.md', 'CONTRIBUTING.md', 'docs/index.md', 'docs/roadmap.md', '.github/pull_request_template.md'])
// The Mastra skill is the upstream skill as published; its commands address a Mastra project, not this one.
const VENDORED = ['.agents/skills/mastra/']

// Each guide is the one owner of its subject, for links and command checks.
export const GUIDES = Object.freeze({
  C: { path: 'docs/development/codebase-principles.md' },
  A: { path: 'docs/reference/architecture.md' },
  L: { path: 'docs/development/delivery.md' },
  D: { path: 'docs/reference/database.md' },
  H: { path: 'docs/product/wire-contract.md' },
  S: { path: 'docs/reference/security-and-authority.md' },
  P: { path: 'docs/product/contract.md' },
  V: { path: 'DESIGN.md' },
  T: { path: 'docs/development/testing.md' },
})
const GUIDE_PATHS = new Set(Object.values(GUIDES).map(guide => guide.path))

export function inScope(path) {
  if (VENDORED.some(prefix => path.startsWith(prefix))) return false
  return ROOT_FILES.has(path) || GUIDE_PATHS.has(path) || /(^|\/)AGENTS\.md$/.test(path)
    || (/^(\.agents\/skills|docs\/development)\//.test(path) && path.endsWith('.md'))
}

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

// Every review area names the guides that judge its paths.
export const AREAS = 'docs/development/review/areas.json'
export function checkAreas(text) {
  return JSON.parse(text).flatMap(({ area, guides }) => {
    if (!Array.isArray(guides) || guides.length === 0) return [{ where: AREAS, message: `area ${area} names no guide` }]
    return guides.filter(id => !Object.hasOwn(GUIDES, id)).map(id => ({ where: AREAS, message: `area ${area} names ${id}, which is not a guide` }))
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
    ...checkAreas(readFileSync(join(root, AREAS), 'utf8')),
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
