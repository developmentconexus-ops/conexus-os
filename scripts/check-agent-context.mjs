// Checks the documents agents read before working: every `npm run X` they cite exists, every
// relative link resolves, the trunk they name is `main`, only the root AGENTS.md tells a reader to
// run `npm run verify`, and each file stays under its line cap.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TRUNK = 'main'

const ROOT_FILES = new Set(['README.md', 'CONTRIBUTING.md', 'docs/index.md', 'docs/roadmap.md', '.github/pull_request_template.md'])
// The Mastra skill is the upstream skill as published; its commands address a Mastra project, not this one.
const VENDORED = ['.agents/skills/mastra/']

export function inScope(path) {
  if (VENDORED.some(prefix => path.startsWith(prefix))) return false
  return ROOT_FILES.has(path) || /(^|\/)AGENTS\.md$/.test(path)
    || (/^(\.agents\/skills|docs\/development)\//.test(path) && path.endsWith('.md'))
}

// First match wins. A `warn` cap reports without failing until the named step rewrites the file.
export const LINE_CAPS = Object.freeze([
  { match: path => path === 'AGENTS.md', max: 60, severity: 'warn', until: 'M6 rewrites the root AGENTS.md' },
  { match: path => path.endsWith('/AGENTS.md'), max: 30, severity: 'error' },
  { match: path => path.endsWith('/SKILL.md'), max: 90, severity: 'error' },
  { match: path => path === 'docs/development/delivery.md', max: 150, severity: 'error' },
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

const lineCount = text => text.replace(/\n$/, '').split('\n').length

export function checkFile(path, text, { root, scripts }) {
  const findings = []
  const report = (severity, number, message) => findings.push({ severity, where: number ? `${path}:${number}` : path, message })

  const cap = LINE_CAPS.find(rule => rule.match(path))
  const lines = lineCount(text)
  if (cap && lines > cap.max) {
    report(cap.severity, 0, `${lines} lines exceeds the cap of ${cap.max}${cap.until ? ` (enforced once ${cap.until})` : ''}`)
  }

  for (const { line, number, fenced } of linesOf(text)) {
    for (const [, cited] of line.matchAll(/\bnpm run ([\w:.-]+)/g)) {
      const name = cited.replace(/[.:,-]+$/, '')
      if (!Object.hasOwn(scripts, name)) report('error', number, `npm run ${name} is not a script in package.json`)
    }
    if (path !== 'AGENTS.md' && /\bnpm run verify(?![\w:-])/.test(line) && !/\b(do not|don't|never|not)\b/i.test(line)) {
      report('error', number, 'only the root AGENTS.md may tell a reader to run npm run verify')
    }
    for (const [, trunk] of line.matchAll(/\b(?:trunk(?:\s+is|:)|pull requests?\s+(?:against|into))\s+`([^`]+)`/gi)) {
      if (trunk !== TRUNK) report('error', number, `names \`${trunk}\` as the trunk; the trunk is \`${TRUNK}\``)
    }
    if (fenced) continue
    for (const [, target] of line.matchAll(/(?<!!)\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
      const problem = brokenLink(path, target, text, root)
      if (problem) report('error', number, problem)
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

export function checkRepository(root) {
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(path => path && inScope(path) && existsSync(join(root, path)))
  const findings = [...new Set(files)].sort()
    .flatMap(path => checkFile(path, readFileSync(join(root, path), 'utf8'), { root, scripts }))
  return { files: files.length, findings }
}

const repositoryRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = process.argv[2] ? resolve(process.argv[2]) : repositoryRoot
  const { files, findings } = checkRepository(root)
  const errors = findings.filter(finding => finding.severity === 'error')
  const warnings = findings.filter(finding => finding.severity === 'warn')
  for (const finding of warnings) console.log(`warning ${finding.where}: ${finding.message}`)
  for (const finding of errors) console.error(`error ${finding.where}: ${finding.message}`)
  if (errors.length) process.exitCode = 1
  else console.log(`Agent context checks passed (files=${files}, warnings=${warnings.length}).`)
}
