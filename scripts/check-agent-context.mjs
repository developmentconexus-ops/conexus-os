// Checks the documents agents read before working: every `npm run X` they cite exists, every
// relative link resolves, every codebase principle names a check that exists or the review that owns it, the trunk they name is `main`, only the root AGENTS.md tells a reader to
// run `npm run verify`, and each file stays under its size cap. It also checks the tree: no merge-conflict
// marker, no unsafe workflow trigger, and the package stays the private conexus-os.
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TRUNK = 'main'
const PRINCIPLES = 'docs/development/codebase-principles.md'

const ROOT_FILES = new Set(['README.md', 'CONTRIBUTING.md', 'docs/index.md', 'docs/roadmap.md', '.github/pull_request_template.md'])
// The Mastra skill is the upstream skill as published; its commands address a Mastra project, not this one.
const VENDORED = ['.agents/skills/mastra/']

export function inScope(path) {
  if (VENDORED.some(prefix => path.startsWith(prefix))) return false
  return ROOT_FILES.has(path) || /(^|\/)AGENTS\.md$/.test(path)
    || (/^(\.agents\/skills|docs\/development)\//.test(path) && path.endsWith('.md'))
}

const LINES = { unit: 'lines', measure: text => text.replace(/\n$/, '').split('\n').length }
const CHARACTERS = { unit: 'characters', measure: text => text.length }
const NEVER_ITEMS = { unit: 'never-list items', measure: text => text.split('\n').filter(line => line.startsWith('- **Never ')).length }

// Mastra caps a package AGENTS.md at 500 tokens (tokenx estimateTokenCount). tokenx 2.1.0 on Mastra's and
// our AGENTS.md files measured 0.237 to 0.270 tokens per character, so 1800 characters stays under 500.
const NESTED_AGENTS_CHARACTERS = 1800

// First match wins.
export const SIZE_CAPS = Object.freeze([
  { match: path => path === 'AGENTS.md', ...LINES, max: 60 },
  { match: path => path.endsWith('/AGENTS.md'), ...CHARACTERS, max: NESTED_AGENTS_CHARACTERS, note: 'about 500 tokens' },
  { match: path => path.endsWith('/SKILL.md'), ...LINES, max: 90 },
  { match: path => path === 'docs/development/delivery.md', ...LINES, max: 150 },
  { match: path => path === '.agents/skills/conexus-development/references/shapes.md', ...NEVER_ITEMS, max: 15 },
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

  const cap = SIZE_CAPS.find(rule => rule.match(path))
  const size = cap?.measure(text)
  if (cap && size > cap.max) {
    report(0, `${size} ${cap.unit} exceeds the cap of ${cap.max}${cap.note ? ` (${cap.note})` : ''}`)
  }

  if (path === PRINCIPLES) for (const finding of checkEnforcement(text, root)) report(finding.number, finding.message)

  for (const { line, number, fenced } of linesOf(text)) {
    for (const [, cited] of line.matchAll(/\bnpm run ([\w:.-]+)/g)) {
      const name = cited.replace(/[.:,-]+$/, '')
      if (!Object.hasOwn(scripts, name)) report(number, `npm run ${name} is not a script in package.json`)
    }
    if (path !== 'AGENTS.md' && /\bnpm run verify(?![\w:-])/.test(line) && !/\b(do not|don't|never|not)\b/i.test(line)) {
      report(number, 'only the root AGENTS.md may tell a reader to run npm run verify')
    }
    for (const [, trunk] of line.matchAll(/\b(?:trunk(?:\s+is|:)|pull requests?\s+(?:against|into))\s+`([^`]+)`/gi)) {
      if (trunk !== TRUNK) report(number, `names \`${trunk}\` as the trunk; the trunk is \`${TRUNK}\``)
    }
    if (fenced) continue
    for (const [, target] of line.matchAll(/(?<!!)\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
      const problem = brokenLink(path, target, text, root)
      if (problem) report(number, problem)
    }
  }
  return findings
}

// Each numbered principle carries an `Enforced by:` line. Each backticked name on it is a file that
// exists, or `biome:<rule>` for a rule configured in biome.json. A principle with only review names
// the review checklist.
export function checkEnforcement(text, root) {
  const findings = []
  const biome = existsSync(join(root, 'biome.json')) ? readFileSync(join(root, 'biome.json'), 'utf8') : ''
  const rows = linesOf(text)
  const starts = rows.filter(({ line }) => /^\d+\.\s/.test(line))
  starts.forEach((start, index) => {
    const end = starts[index + 1]?.number ?? Infinity
    const enforced = rows.find(({ number, line }) => number > start.number && number < end && /^\s+Enforced by:/.test(line))
    if (!enforced) {
      findings.push({ number: start.number, message: 'principle has no `Enforced by:` line' })
      return
    }
    const names = [...enforced.line.matchAll(/`([^`]+)`/g)].map(([, name]) => name)
    if (names.length === 0) findings.push({ number: enforced.number, message: '`Enforced by:` names no check; name a file, `biome:<rule>`, or the review checklist' })
    for (const name of names) {
      const exists = name.startsWith('biome:') ? biome.includes(`"${name.slice('biome:'.length)}"`) : existsSync(join(root, name))
      if (!exists) findings.push({ number: enforced.number, message: `\`Enforced by:\` names \`${name}\`, which does not exist` })
    }
  })
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

// What a merge or an edit can leave in any file: a conflict marker, a workflow that runs fork code
// with write access, a package that is no longer the private conexus-os.
export function checkTree(root, tracked) {
  const findings = []
  const report = (where, message) => findings.push({ where, message })
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (pkg.name !== 'conexus-os' || pkg.private !== true) report('package.json', 'package identity must remain private conexus-os')
  for (const path of tracked) {
    const absolute = join(root, path)
    if (!lstatSync(absolute).isFile()) continue
    const bytes = readFileSync(absolute)
    if (bytes.includes(0)) continue
    const text = bytes.toString('utf8')
    if (/^(?:<{7} |>{7} )/m.test(text)) report(path, 'unresolved merge-conflict marker')
    if (path.startsWith('.github/workflows/')) {
      if (text.includes('pull_request_target')) report(path, 'unsafe pull_request_target trigger')
      if (/^\s*contents:\s*write\s*$/m.test(text)) report(path, 'workflow has contents: write permission')
    }
  }
  return findings
}

export function checkRepository(root) {
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}
  const tracked = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(path => path && existsSync(join(root, path))))].sort()
  const files = tracked.filter(inScope)
  const findings = [
    ...files.flatMap(path => checkFile(path, readFileSync(join(root, path), 'utf8'), { root, scripts })),
    ...checkTree(root, tracked),
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
