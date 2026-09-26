// Converges the repository's GitHub labels on .github/labels.yml through `gh`.
// Dry run by default. `--apply` writes, then re-reads GitHub and fails unless nothing is left to do.
// Labels that the file does not declare are reported and never changed.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
export const LABELS_FILE = resolve(repositoryRoot, '.github/labels.yml')

// GitHub rejects a label description longer than 100 characters.
const MAX_DESCRIPTION = 100

export function parseLabels(text) {
  const labels = []
  text.split('\n').forEach((raw, index) => {
    const line = raw.trimEnd()
    if (line.trim() === '' || line.trimStart().startsWith('#')) return
    const where = `labels.yml:${index + 1}`
    const match = /^(- | {2})(name|color|description): "([^"]*)"$/.exec(line)
    if (!match) throw new Error(`${where}: expected '- name: "…"' or '  color|description: "…"', got: ${line}`)
    const [, lead, key, value] = match
    if (lead === '- ') {
      if (key !== 'name') throw new Error(`${where}: an entry starts with name`)
      labels.push({ name: value })
      return
    }
    const entry = labels.at(-1)
    if (!entry || key === 'name' || key in entry) throw new Error(`${where}: unexpected ${key}`)
    entry[key] = value
  })
  const seen = new Set()
  for (const label of labels) {
    if (!/^[0-9a-f]{6}$/.test(label.color ?? '')) throw new Error(`label ${label.name}: color must be six lowercase hex digits`)
    if (label.description === undefined) throw new Error(`label ${label.name}: description is missing`)
    if (label.description.length > MAX_DESCRIPTION) throw new Error(`label ${label.name}: description exceeds ${MAX_DESCRIPTION} characters`)
    const key = label.name.toLowerCase()
    if (seen.has(key)) throw new Error(`label ${label.name}: declared twice`)
    seen.add(key)
  }
  return labels
}

// GitHub label names are case-insensitive, so a declared name matches an existing label in any case.
export function planLabels(declared, current) {
  const existingByKey = new Map(current.map(label => [label.name.toLowerCase(), label]))
  const actions = []
  for (const label of declared) {
    const existing = existingByKey.get(label.name.toLowerCase())
    if (!existing) {
      actions.push({ kind: 'create', label })
    } else if (existing.name !== label.name || existing.color.toLowerCase() !== label.color
      || (existing.description ?? '') !== label.description) {
      actions.push({ kind: 'update', from: existing.name, label })
    }
  }
  const declaredKeys = new Set(declared.map(label => label.name.toLowerCase()))
  const unmanaged = current.filter(label => !declaredKeys.has(label.name.toLowerCase())).map(label => label.name)
  return { actions, unchanged: declared.length - actions.length, unmanaged }
}

function ghArguments(action, repo) {
  const { name, color, description } = action.label
  const target = repo ? ['--repo', repo] : []
  return action.kind === 'create'
    ? ['label', 'create', name, '--color', color, '--description', description, ...target]
    : ['label', 'edit', action.from, '--name', name, '--color', color, '--description', description, ...target]
}

const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

function readCurrent(repo) {
  return JSON.parse(gh(['label', 'list', '--limit', '1000', '--json', 'name,color,description',
    ...(repo ? ['--repo', repo] : [])]))
}

function describe(action) {
  const { name, color, description } = action.label
  const rename = action.kind === 'update' && action.from !== name ? ` (was ${action.from})` : ''
  return `${action.kind} ${name}${rename}: #${color} "${description}"`
}

function main(argv) {
  const apply = argv.includes('--apply')
  const repoIndex = argv.indexOf('--repo')
  const repo = repoIndex === -1 ? undefined : argv[repoIndex + 1]
  const declared = parseLabels(readFileSync(LABELS_FILE, 'utf8'))
  const plan = planLabels(declared, readCurrent(repo))
  for (const action of plan.actions) console.log(describe(action))
  console.log(`${plan.actions.filter(a => a.kind === 'create').length} to create, `
    + `${plan.actions.filter(a => a.kind === 'update').length} to update, ${plan.unchanged} unchanged.`)
  if (plan.unmanaged.length) console.log(`Not managed by labels.yml, left alone: ${plan.unmanaged.join(', ')}`)
  if (!apply) {
    if (plan.actions.length) console.log('Dry run. Run with --apply to write these changes to GitHub.')
    return
  }
  for (const action of plan.actions) gh(ghArguments(action, repo))
  const remaining = planLabels(declared, readCurrent(repo)).actions
  if (remaining.length) {
    console.error(`Labels did not converge. Still pending:\n${remaining.map(describe).join('\n')}`)
    process.exitCode = 1
    return
  }
  console.log('Labels converged: a second run has nothing to do.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2))
