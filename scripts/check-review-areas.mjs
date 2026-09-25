// Checks docs/development/review/areas.json, the map the Factory reviewer reads to pick the review
// pages a pull request loads: every entry is well formed, every page exists and is listed, every
// glob still matches a tracked file, and every reviewed file (production code and the tests that
// prove it) belongs to an area that is not universal. A universal area (paths exactly ["**"]) applies to every pull request, so counting it
// would make the coverage check vacuous.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AREAS_FILE = 'docs/development/review/areas.json'
const PAGE_DIR = 'docs/development/review/'
const UNIVERSAL = '**'
// Tests are reviewed with the code they prove: a test-only change still loads its domain's page, whose
// proof rules judge that test.
const REVIEWED_DIRS = ['apps/', 'packages/', 'contracts/', 'infra/', 'scripts/', 'factory-skills/', '.github/workflows/', 'tests/']
const REVIEWED_ROOT_FILES = new Set(['package.json', 'package-lock.json', 'biome.json', 'tsconfig.base.json', '.nvmrc'])

export const isReviewed = path => REVIEWED_DIRS.some(dir => path.startsWith(dir)) || REVIEWED_ROOT_FILES.has(path)

// The portable grammar every matcher agrees on: an exact path, `dir/**` for everything under dir
// (dotfiles included), and `*` for any run of characters inside one segment. Node's
// path.matchesGlob skips dotfiles under `**`, so the reviewer and this check would disagree on
// `.gitignore`-style paths; this matcher is the definition instead.
export function compileGlob(glob) {
  if (glob === UNIVERSAL) return () => true
  if (/[?[\]{}!\\]/.test(glob)) return null
  const segments = glob.split('/')
  const recursive = segments.at(-1) === '**'
  const fixed = recursive ? segments.slice(0, -1) : segments
  if (!fixed.length || fixed.some(segment => segment === '' || segment === '.' || segment === '..' || segment.includes('**'))) return null
  const literal = text => text.replace(/[.+^$()|]/g, '\\$&')
  const pattern = new RegExp(`^${fixed.map(segment => segment.split('*').map(literal).join('[^/]*')).join('/')}${recursive ? '/.+' : ''}$`)
  return path => pattern.test(path)
}

export function parseAreas(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { areas: [], findings: [`${AREAS_FILE} is not valid JSON: ${error.message}`] }
  }
  if (!Array.isArray(raw)) return { areas: [], findings: [`${AREAS_FILE} must be a JSON array of areas`] }
  const findings = []
  const areas = []
  const seen = new Set()
  for (const [index, entry] of raw.entries()) {
    const at = `${AREAS_FILE} entry ${index}`
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      findings.push(`${at} is not an object`)
      continue
    }
    const { area, paths, page } = entry
    const problems = []
    if (typeof area !== 'string') problems.push('"area" must be a string')
    else if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(area)) problems.push(`area "${area}" is not kebab-case`)
    else if (seen.has(area)) problems.push(`area "${area}" is listed twice`)
    if (!Array.isArray(paths) || !paths.length || !paths.every(glob => typeof glob === 'string')) {
      problems.push('"paths" must be a non-empty array of strings')
    } else {
      for (const glob of paths) if (!compileGlob(glob)) problems.push(`glob "${glob}" is outside the portable grammar (exact path, dir/**, * inside one segment)`)
      if (paths.includes(UNIVERSAL) && paths.length > 1) problems.push(`"${UNIVERSAL}" must be the only glob of a universal area`)
    }
    if (typeof page !== 'string') problems.push('"page" must be a string')
    for (const problem of problems) findings.push(`${at}: ${problem}`)
    if (typeof area === 'string') seen.add(area)
    if (!problems.length) areas.push({ area, paths, page, universal: paths[0] === UNIVERSAL, matchers: paths.map(compileGlob) })
  }
  return { areas, findings }
}

export function checkAreas(areas, { files, pageExists }) {
  const findings = []
  for (const { area, page } of areas) {
    const expected = `${PAGE_DIR}${area}.md`
    if (page !== expected) findings.push(`area ${area}: page must be ${expected}, not ${page}`)
    else if (!pageExists(page)) findings.push(`area ${area}: page ${page} does not exist`)
  }
  const listed = new Set(areas.map(({ page }) => page))
  for (const file of files) {
    if (file.startsWith(PAGE_DIR) && file.endsWith('.md') && !listed.has(file)) findings.push(`${file} is not the page of any area`)
  }
  for (const { area, paths, matchers, universal } of areas) {
    if (universal) continue
    for (const [index, glob] of paths.entries()) {
      if (!files.some(matchers[index])) findings.push(`area ${area}: glob "${glob}" matches no tracked file`)
    }
  }
  const covering = areas.filter(({ universal }) => !universal).flatMap(({ matchers }) => matchers)
  for (const file of files) {
    if (isReviewed(file) && !covering.some(matches => matches(file))) findings.push(`${file} maps to no review area (a universal area does not count)`)
  }
  return findings
}

export function checkRepository(root) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(path => path && existsSync(join(root, path)))
  const unique = [...new Set(files)].sort()
  const areasPath = join(root, AREAS_FILE)
  if (!existsSync(areasPath)) return { areas: [], files: 0, findings: [`${AREAS_FILE} does not exist`] }
  const { areas, findings } = parseAreas(readFileSync(areasPath, 'utf8'))
  if (findings.length) return { areas, files: 0, findings }
  return {
    areas,
    files: unique.filter(isReviewed).length,
    findings: checkAreas(areas, { files: unique, pageExists: page => existsSync(join(root, page)) }),
  }
}

// The approved rules on origin/main judge a pull request, per review-checklist.md. Both env vars unset is the plain
// whole-tree check this script always ran; both set adds the pull-request check below; one alone is
// a broken CI wiring, caught here instead of silently reverting to the whole-tree check.
const RULES_REF = 'origin/main'
const PR_BASE_SHA_ENV = 'CONEXUS_PR_BASE_SHA'
const PR_HEAD_SHA_ENV = 'CONEXUS_PR_HEAD_SHA'

export function prMode(env) {
  const base = env[PR_BASE_SHA_ENV]
  const head = env[PR_HEAD_SHA_ENV]
  if (base && head) return { kind: 'pull-request', base, head }
  if (!base && !head) return { kind: 'whole-tree' }
  const [presentName, missingName] = base ? [PR_BASE_SHA_ENV, PR_HEAD_SHA_ENV] : [PR_HEAD_SHA_ENV, PR_BASE_SHA_ENV]
  return { kind: 'error', message: `${missingName} is not set (${presentName} is)` }
}

function changedReviewedFiles(root, mergeBase, head) {
  return execFileSync('git', ['diff', '--name-only', '--diff-filter=AMR', mergeBase, head], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter(isReviewed).sort()
}

// null when areas.json does not exist at that ref: a base that predates the file, or a rewritten
// history. git show's own message already distinguishes a missing path from a bad ref; either way
// there is no base map, so this check treats them the same.
function areasTextAtRef(root, ref) {
  try {
    return execFileSync('git', ['show', `${ref}:${AREAS_FILE}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

// The one function that classifies: for each pull-request-changed reviewed path, whether the
// base map covers it with an area other than the universal one. `null` base areas (no areas.json at
// the base) makes every path new. A path a non-universal base area already covers is judged by that
// map today and needs no exception; a path only the universal area or nothing covers is genuinely
// new, allowed, but flagged so the reviewer loads the head's page for it instead.
export function classifyPrPaths(paths, baseAreas) {
  const covering = baseAreas === null ? [] : baseAreas.filter(({ universal }) => !universal).flatMap(({ matchers }) => matchers)
  return paths.map(path => ({ path, isNewArea: !covering.some(matches => matches(path)) }))
}

// The pages the reviewer loads for these paths from the approved map: every area that matches a
// changed path, the universal one included, each page once, in the map's order.
export function pagesToLoad(paths, areas) {
  return areas.filter(({ matchers }) => paths.some(path => matchers.some(matches => matches(path)))).map(({ page }) => page)
}

function headPagesFor(path, headAreas) {
  return headAreas.filter(({ matchers }) => matchers.some(matches => matches(path))).map(({ page }) => page).join(', ')
}

// Runs only once the whole-tree check above found the head's own map internally consistent: a head
// map with its own findings has nothing reliable to report a new path's page from.
function reportPullRequest(root, { base, head }, headAreas) {
  const mergeBase = execFileSync('git', ['merge-base', base, head], { cwd: root, encoding: 'utf8' }).trim()
  const changed = changedReviewedFiles(root, mergeBase, head)
  if (!changed.length) return
  // The diff starts at the merge base, so it holds only this pull request's changes. The map is the
  // approved one on origin/main, as review-checklist.md says. A stacked pull request's base is
  // another open pull request, which may change the rules itself.
  if (spawnSync('git', ['rev-parse', '--verify', '--quiet', `${RULES_REF}^{commit}`], { cwd: root }).status !== 0) {
    console.error(`error ${RULES_REF} is not in this clone; fetch it so the approved review map can be read`)
    process.exitCode = 1
    return
  }
  const baseText = areasTextAtRef(root, RULES_REF)
  if (baseText === null) console.log(`${AREAS_FILE} does not exist on ${RULES_REF}; every changed reviewed path is a new area path.`)
  const baseAreas = baseText === null ? null : parseAreas(baseText).areas
  if (baseAreas !== null) console.log(`review pages from ${RULES_REF}: ${pagesToLoad(changed, baseAreas).join(', ')}`)
  for (const { path, isNewArea } of classifyPrPaths(changed, baseAreas)) {
    if (!isNewArea) continue
    const pages = headPagesFor(path, headAreas)
    console.log(`new area path: ${path} -> ${pages}`)
    console.log(`::notice file=${path}::new area path: the approved map on ${RULES_REF} has no area for it; judged by ${pages} from the head.`)
  }
}

const repositoryRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = process.argv[2] ? resolve(process.argv[2]) : repositoryRoot
  const mode = prMode(process.env)
  if (mode.kind === 'error') {
    console.error(`error ${mode.message}`)
    process.exitCode = 1
  } else {
    const { areas, files, findings } = checkRepository(root)
    for (const finding of findings) console.error(`error ${finding}`)
    if (findings.length) process.exitCode = 1
    else console.log(`Review area checks passed (areas=${areas.length}, reviewed files=${files}).`)
    if (mode.kind === 'pull-request' && !findings.length) reportPullRequest(root, mode, areas)
  }
}
