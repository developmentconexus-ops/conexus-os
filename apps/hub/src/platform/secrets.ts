import { readFileSync, statSync } from 'node:fs'

export const readSecretFile = (path: string): string => {
  const stat = statSync(path)
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('SECRET_FILE_PERMISSIONS')
  const value = readFileSync(path, 'utf8').trim()
  if (!value) throw new Error('EMPTY_SECRET_FILE')
  return value
}
