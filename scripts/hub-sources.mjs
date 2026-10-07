import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(fileURLToPath(new URL('../', import.meta.url)))

export const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')

export const hubSources = () => execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'apps/hub/src'], { cwd: repo, encoding: 'utf8' })
  .split('\0').filter((path) => path.endsWith('.ts') && !path.endsWith('.generated.ts') && existsSync(join(repo, path)))
  .map((path) => ({ path, owner: path.split('/').slice(0, 4).join('/'), text: stripComments(readFileSync(join(repo, path), 'utf8')) }))
