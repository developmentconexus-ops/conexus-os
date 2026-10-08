import { readFileSync, statSync } from 'node:fs'
import { Failure } from './failure.js'

export function readSecretFile(path: string): string {
  try {
    const stat = statSync(path)
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Failure('CONFIG_INVALID', { details: { name: 'SECRET_FILE_PERMISSIONS' } })
    const value = readFileSync(path, 'utf8').trim()
    if (!value) throw new Failure('CONFIG_INVALID', { details: { name: 'EMPTY_SECRET_FILE' } })
    return value
  } catch (cause) {
    if (cause instanceof Failure) throw cause
    throw new Failure('CONFIG_INVALID', { cause, details: { name: 'SECRET_FILE_UNREADABLE' } })
  }
}
