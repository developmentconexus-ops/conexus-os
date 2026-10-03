#!/usr/bin/env node
// Splits a change's added and deleted lines by kind, so a large pull request shows where its size comes from.
// Usage: node scripts/diff-shape.mjs <repo dir> <base>...<head>
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const KINDS = [
  ['tests', (path) => path.startsWith('tests/') || /\.test\.[cm]?[jt]sx?$/.test(path)],
  ['sql', (path) => path.endsWith('.sql')],
  ['generated', (path) => path.includes('.generated.') || path.startsWith('contracts/')],
  ['docs', (path) => path.endsWith('.md') || path.startsWith('docs/')],
  ['product', () => true],
]

export function shape(numstat) {
  const totals = Object.fromEntries(KINDS.map(([kind]) => [kind, { added: 0, deleted: 0 }]))
  for (const line of numstat.split('\n')) {
    const [added, deleted, path] = line.split('\t')
    if (!path || added === '-') continue
    const [kind] = KINDS.find(([, matches]) => matches(path))
    totals[kind].added += Number(added)
    totals[kind].deleted += Number(deleted)
  }
  return totals
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [repo, range] = process.argv.slice(2)
  if (!repo || !range) throw new Error('usage: node scripts/diff-shape.mjs <repo dir> <base>...<head>')
  const totals = shape(execFileSync('git', ['-C', repo, 'diff', '--numstat', '--no-renames', range], { encoding: 'utf8' }))
  console.log('| Kind | Added | Deleted |\n| --- | --- | --- |')
  for (const [kind, { added, deleted }] of Object.entries(totals)) if (added || deleted) console.log(`| ${kind} | +${added} | -${deleted} |`)
}
