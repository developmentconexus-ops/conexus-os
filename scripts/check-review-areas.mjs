// Checks docs/development/review/areas.json, the map the Factory reviewer reads to pick the review
// pages a pull request loads: every entry is well formed, every page exists and is listed, every
// glob still matches a tracked file, and every production file belongs to an area that is not
// universal. A universal area (paths exactly ["**"]) applies to every pull request, so counting it
// would make the coverage check vacuous.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AREAS_FILE = 'docs/development/review/areas.json'
const PAGE_DIR = 'docs/development/review/'
const UNIVERSAL = '**'
const PRODUCTION_DIRS = ['apps/', 'packages/', 'contracts/', 'infra/', 'scripts/', 'factory-skills/', '.github/workflows/']
const PRODUCTION_ROOT_FILES = new Set(['package.json', 'package-lock.json', 'biome.json', 'tsconfig.base.json', '.nvmrc'])

export const isProduction = path => PRODUCTION_DIRS.some(dir => path.startsWith(dir)) || PRODUCTION_ROOT_FILES.has(path)

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
    if (isProduction(file) && !covering.some(matches => matches(file))) findings.push(`${file} maps to no review area (a universal area does not count)`)
  }
  return findings
}

export function checkRepository(root) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(path => path && existsSync(join(root, path)))
  const unique = [...new Set(files)].sort()
  const areasPath = join(root, AREAS_FILE)
  if (!existsSync(areasPath)) return { areas: 0, files: 0, findings: [`${AREAS_FILE} does not exist`] }
  const { areas, findings } = parseAreas(readFileSync(areasPath, 'utf8'))
  if (findings.length) return { areas: areas.length, files: 0, findings }
  return {
    areas: areas.length,
    files: unique.filter(isProduction).length,
    findings: checkAreas(areas, { files: unique, pageExists: page => existsSync(join(root, page)) }),
  }
}

const repositoryRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = process.argv[2] ? resolve(process.argv[2]) : repositoryRoot
  const { areas, files, findings } = checkRepository(root)
  for (const finding of findings) console.error(`error ${finding}`)
  if (findings.length) process.exitCode = 1
  else console.log(`Review area checks passed (areas=${areas}, production files=${files}).`)
}
