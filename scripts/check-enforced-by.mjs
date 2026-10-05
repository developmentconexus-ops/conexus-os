import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(fileURLToPath(new URL('../', import.meta.url)))
const principlesPath = 'docs/development/codebase-principles.md'
const SEARCHED = /^(apps|packages|scripts|contracts|tests)\//

const trackedSources = (root) => execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter((path) => SEARCHED.test(path) || path === 'biome.json' || path === 'package.json')

// A name an "Enforced by" line gives must exist: a script or file path, a package.json script, a Biome rule, or a symbol
// (a census item, a table, a constant) that some tracked source mentions.
export const unresolved = (text, root = repo) => {
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts
  const biome = readFileSync(join(root, 'biome.json'), 'utf8')
  let corpus
  const mentioned = (symbol) => {
    corpus ??= trackedSources(root).filter((path) => existsSync(join(root, path))).map((path) => readFileSync(join(root, path), 'utf8')).join('\n')
    return new RegExp(`(?<![\\w])${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`).test(corpus)
  }
  const missing = []
  for (const line of text.split('\n').filter((candidate) => /^\s*Enforced by:/.test(candidate))) {
    for (const [, raw] of line.matchAll(/`([^`]+)`/g)) {
      const token = raw.replace(/^npm run /, '')
      if (token.startsWith('biome:')) {
        if (!biome.includes(`"${token.slice('biome:'.length)}"`)) missing.push(`${raw}: no such Biome rule in biome.json`)
      } else if (/\//.test(token) && /\.[a-z]+$/.test(token)) {
        if (!existsSync(join(root, token))) missing.push(`${raw}: no such file`)
      } else if (/^[a-z][a-z0-9-]*(:[a-z0-9-]+)+$/.test(token)) {
        if (!(token in scripts)) missing.push(`${raw}: no such npm script`)
      } else if (/^[A-Za-z_][\w.]*$/.test(token) && !mentioned(token)) missing.push(`${raw}: no such symbol in apps, packages, scripts, contracts or tests`)
    }
  }
  return missing
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const missing = unresolved(readFileSync(join(repo, principlesPath), 'utf8'))
  for (const entry of missing) console.error(`check-enforced-by: ${principlesPath}: ${entry}`)
  if (missing.length > 0) process.exit(1)
  console.log('check-enforced-by: every "Enforced by" name exists')
}
