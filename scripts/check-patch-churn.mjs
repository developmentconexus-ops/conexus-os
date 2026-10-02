import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// When fixes keep landing on one file, the design there is wrong and the next fix should be a
// redesign. A fix pull request that touches a file with HOT_THRESHOLD or more fix commits on the base
// branch in the last WINDOW_DAYS fails, unless it carries the label premise-checked.

export const HOT_THRESHOLD = 3
export const WINDOW_DAYS = 30
export const ESCAPE_LABEL = 'premise-checked'
const REPORT_LIMIT = 10

const EXCLUDED_FILES = new Set([
  'package-lock.json',
  'contracts/technical/hub-catalog-snapshot.json',
  'scripts/weak-tests-ratchet.json',
])
const EXCLUDED_PATTERN = /(^|\/)(package-lock\.json|generated\/.*)$|\.generated\.[a-z]+$/

export const isExcluded = (file) => EXCLUDED_FILES.has(file) || EXCLUDED_PATTERN.test(file)

export const isFixSubject = (subject) => /^fix(\(|:)/.test(subject)

// `git log --format=%x01%s --name-only` output: each commit starts with \x01 and its subject, then its files.
export const parseLog = (output) => output.split('\x01').filter((chunk) => chunk.trim() !== '').map((chunk) => {
  const [subject, ...files] = chunk.split('\n').filter((line) => line !== '')
  return { subject, files }
})

export const findHotFiles = ({ commits, changedFiles, threshold = HOT_THRESHOLD }) => {
  const fixesByFile = new Map()
  for (const { subject, files } of commits.filter((commit) => isFixSubject(commit.subject))) {
    for (const file of files) fixesByFile.set(file, [...(fixesByFile.get(file) ?? []), subject])
  }
  return changedFiles
    .filter((file) => !isExcluded(file) && (fixesByFile.get(file)?.length ?? 0) >= threshold)
    .map((file) => ({ file, count: fixesByFile.get(file).length, subjects: fixesByFile.get(file) }))
}

// The guard runs only for a pull request whose title starts with fix, and the label turns it off.
export const checkPatchChurn = ({ title, labels, commits, changedFiles }) => {
  if (!/^fix/.test(title)) return { ok: true, hot: [], message: 'not a fix pull request, no patch churn check' }
  if (labels.includes(ESCAPE_LABEL)) return { ok: true, hot: [], message: `the label ${ESCAPE_LABEL} is set, no patch churn check` }
  const hot = findHotFiles({ commits, changedFiles })
  if (hot.length === 0) return { ok: true, hot, message: 'no file of this fix has repeated fixes' }
  return { ok: false, hot, message: failureMessage(hot) }
}

export const failureMessage = (hot) => [
  ...hot.flatMap(({ file, count, subjects }) => [`${file}: ${count} fix commits in the last ${WINDOW_DAYS} days`, ...subjects.map((subject) => `  ${subject}`)]),
  `Before another fix here, check the premise (principle: attack the premise). If a redesign was considered, add the label \`${ESCAPE_LABEL}\` to the PR.`,
].join('\n')

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

const readBaseHistory = (base) => parseLog(git('log', base, `--since=${WINDOW_DAYS}.days`, '--format=%x01%s', '--name-only'))

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const baseIndex = process.argv.indexOf('--base')
  const base = baseIndex > 0 ? process.argv[baseIndex + 1] : 'origin/main'
  const report = process.argv.includes('--report')
  let commits
  try {
    commits = readBaseHistory(base)
  } catch {
    if (!report) throw new Error(`cannot read the history of ${base}`)
    process.stdout.write(`${base} is not available here, no hot file report\n`)
    process.exit(0)
  }
  const event = !report && process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request : undefined
  if (!event) {
    const hot = findHotFiles({ commits, changedFiles: [...new Set(commits.flatMap(({ files }) => files))] })
    process.stdout.write(hot.length === 0 ? `no file has ${HOT_THRESHOLD} or more fix commits on ${base} in ${WINDOW_DAYS} days\n` : `hot files on ${base}, report only (top ${REPORT_LIMIT}):\n${hot.toSorted((a, b) => b.count - a.count).slice(0, REPORT_LIMIT).map(({ file, count }) => `  ${count} ${file}`).join('\n')}\n`)
    process.exit(0)
  }
  const changedFiles = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean)
  const result = checkPatchChurn({ title: event.title, labels: event.labels.map(({ name }) => name), commits, changedFiles })
  process.stdout.write(`${result.message}\n`)
  process.exit(result.ok ? 0 : 1)
}
