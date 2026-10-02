import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Only Markdown that no test or product code reads as input: documentation under docs/, the agent
// skills under .agents/, and the Markdown files at the repository root. Markdown elsewhere is
// product: the Builder prompt, the starter's AGENTS.md and the builder-skills are files the Hub loads
// and tests assert on, and .github/ holds the pull request template. Anything else, including a
// non-Markdown file under docs/ (evidence scripts, images, JSON), runs the full verification.
const DOCS_ONLY_PATTERNS = Object.freeze([
  /^docs\/.+\.md$/,
  /^\.agents\/.+\.md$/,
  /^[^/]+\.md$/,
])

export function isDocsOnly(paths) {
  return paths.length > 0 && paths.every(path => DOCS_ONLY_PATTERNS.some(pattern => pattern.test(path)))
}

// Three dots: the diff from the merge base of `base` and HEAD to HEAD. No rename detection, so a file
// moved out of a code directory lists its old path too.
function changedPaths(base, git = execFileSync) {
  const output = git('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`], { encoding: 'utf8' })
  return output.split('\0').filter(Boolean)
}

// Any doubt runs everything: no base (a push to main), a git failure, or an empty diff.
export function docsOnlyChange(base, git = execFileSync) {
  if (!base) return false
  try {
    return isDocsOnly(changedPaths(base, git))
  } catch {
    return false
  }
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const index = argv.indexOf('--base')
  const base = index === -1 ? '' : (argv[index + 1] ?? '')
  const docsOnly = docsOnlyChange(base)
  console.log(`docs_only=${docsOnly}`)
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
