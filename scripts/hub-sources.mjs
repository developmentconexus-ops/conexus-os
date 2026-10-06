import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(fileURLToPath(new URL('../', import.meta.url)))
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')

export const hubSources = () => execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'apps/hub/src'], { cwd: repo, encoding: 'utf8' })
  .split('\0').filter((path) => path.endsWith('.ts') && !path.endsWith('.generated.ts') && existsSync(join(repo, path)))
  .map((path) => ({ path, owner: path.split('/').slice(0, 4).join('/'), text: stripComments(readFileSync(join(repo, path), 'utf8')) }))

const SQL_TAG_IMPORT = /import\s*(?:type\s*)?\{[^}]*\bsql\b[^}]*\}\s*from\s*'[^']*platform\/db\.js'/
const mentions = (table) => new RegExp(`(?<![\\w.])${escapeRegExp(table)}(?![\\w.])`, 'i')

// The TypeScript files that name a table without importing the sql tag: they reach it through a raw pool, outside the data module's roles.
export const unportedReaders = (sources, tables) => new Map(tables.map((table) => [table,
  sources.filter((source) => mentions(table).test(source.text) && !SQL_TAG_IMPORT.test(source.text)).map((source) => source.path)]))
