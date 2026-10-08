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

export function qualificationFor(paths) {
  if (isDocsOnly(paths)) return { docs_only: true, full_live: false, backup: false, template: false, style: false }
  if (paths.some(path => /^(?:docs\/|\.agents\/|\.github\/|package(?:-lock)?\.json$|biome\.json$|tsconfig\.base\.json$|\.nvmrc$)/.test(path))) return fullQualification()
  const known = /^(?:apps\/(?:hub|web|keycloak-theme)\/|packages\/|contracts\/|infra\/|scripts\/|tests\/|builder-skills\/)/
  if (!paths.length || paths.some(path => !known.test(path))) return fullQualification()
  if (paths.some(path => path.startsWith('apps/hub/') && !/^apps\/hub\/(?:src\/(?:builder|identity-access|hosting|platform|http|app-runner|project|workspace|registry|connectors|telemetry)\/|src\/(?:server|hub)\.ts$|migrations\/|compiler-template\/|tsconfig\.json$|AGENTS\.md$)/.test(path))) return fullQualification()
  return {
    docs_only: false,
    full_live: paths.some(path => /^(?:apps\/(?:web\/|keycloak-theme\/|hub\/(?:src\/(?:builder|identity-access|hosting|platform|http|app-runner)\/|src\/(?:server|hub)\.ts$|migrations\/|compiler-template\/|tsconfig\.json$|AGENTS\.md$))|packages\/|contracts\/|scripts\/|tests\/|infra\/|builder-skills\/)/.test(path)),
    backup: paths.some(path => /^(?:infra\/|apps\/hub\/migrations\/|packages\/|contracts\/|scripts\/|tests\/|\.github\/|package)/.test(path)),
    template: paths.some(path => /^(?:apps\/hub\/(?:src\/builder\/|compiler-template\/)|builder-skills\/|scripts\/|tests\/|packages\/|contracts\/|\.github\/|package)/.test(path)),
    style: paths.some(path => /^(?:apps\/web\/|packages\/brand\/|apps\/keycloak-theme\/|scripts\/|tests\/|\.github\/|package|biome)/.test(path)),
  }
}

export function fullQualification() {
  return { docs_only: false, full_live: true, backup: true, template: true, style: true }
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
  let scope = fullQualification()
  if (base) {
    try { scope = qualificationFor(changedPaths(base)) } catch { /* A failed diff requires complete qualification. */ }
  }
  const output = `${Object.entries(scope).map(([key, value]) => `${key}=${value}`).join('\n')}\n`
  process.stdout.write(output)
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, output)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
