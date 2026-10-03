import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// A pull request that changes a path of an area marked "gate": "aprovo" in areas.json needs the label
// needs:aprovo. The areas come from the base branch, so a pull request cannot remove its own gate.

export const LABEL = 'needs:aprovo'
const AREAS = 'docs/development/review/areas.json'

// The grammar of review-checklist.md: an exact path, `dir/**`, and `*` inside one path segment.
const globToRegExp = (glob) => new RegExp(`^${glob.split('**').map((part) => part.split('*').map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')}$`)

const gatedAreaOf = (areas, file) => areas.find(({ gate, paths }) => gate === 'aprovo' && paths.some((glob) => globToRegExp(glob).test(file)))

export const ungatedPaths = ({ areas, changedFiles, labels }) => labels.includes(LABEL) ? [] : changedFiles.filter((file) => gatedAreaOf(areas, file))

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const base = process.argv[process.argv.indexOf('--base') + 1]
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
  const areas = JSON.parse(git('show', `${base}:${AREAS}`))
  const changedFiles = git('diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`).split('\0').filter(Boolean)
  const { pull_request: event } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const blocked = ungatedPaths({ areas, changedFiles, labels: event.labels.map(({ name }) => name) })
  for (const file of blocked) process.stderr.write(`${file} is in the gated area ${gatedAreaOf(areas, file).area}\n`)
  if (blocked.length) process.stderr.write(`Add the label ${LABEL}. See docs/development/delivery.md#ask-for-aprovo-on-three-kinds-of-change.\n`)
  process.exit(blocked.length ? 1 : 0)
}
