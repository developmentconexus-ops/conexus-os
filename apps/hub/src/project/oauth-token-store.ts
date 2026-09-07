import { chmodSync, closeSync, existsSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { refreshAuthorizationToken } from './anthropic-oauth.js'

export type OAuthTokenStore = Readonly<{
  validate(): void
  getAccessToken(): Promise<string>
}>

export const createOAuthTokenStore = (
  filePath: string,
  refresh: typeof refreshAuthorizationToken = refreshAuthorizationToken,
  now: () => number = () => Date.now(),
): OAuthTokenStore => {
  const directory = dirname(filePath)
  const read = (): Readonly<{ access: string; refresh: string; expiresAt: number }> => {
    if (!existsSync(filePath)) throw new Error('ANTHROPIC_OAUTH_LOGIN_REQUIRED')
    const directoryStat = lstatSync(directory)
    const stat = lstatSync(filePath)
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || (directoryStat.mode & 0o077) !== 0 ||
      !stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && (stat.uid !== process.getuid() || directoryStat.uid !== process.getuid()))) {
      throw new Error('ANTHROPIC_OAUTH_CUSTODY_INVALID')
    }
    let value: unknown
    try { value = JSON.parse(readFileSync(filePath, 'utf8')) } catch { throw new Error('ANTHROPIC_OAUTH_TOKEN_FILE_INVALID') }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ANTHROPIC_OAUTH_TOKEN_FILE_INVALID')
    const token = value as Record<string, unknown>
    if (typeof token.access !== 'string' || token.access.length < 1 || typeof token.refresh !== 'string' ||
      token.refresh.length < 1 || !Number.isFinite(token.expiresAt)) {
      throw new Error('ANTHROPIC_OAUTH_TOKEN_FILE_INVALID')
    }
    return { access: token.access, refresh: token.refresh, expiresAt: Number(token.expiresAt) }
  }
  const write = (tokens: Readonly<{ access: string; refresh: string; expiresAt: number }>): void => {
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
    let descriptor: number | undefined
    try {
      descriptor = openSync(temporary, 'wx', 0o600)
      writeFileSync(descriptor, `${JSON.stringify(tokens)}\n`, 'utf8')
      closeSync(descriptor)
      descriptor = undefined
      chmodSync(temporary, 0o600)
      renameSync(temporary, filePath)
      chmodSync(filePath, 0o600)
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
      if (existsSync(temporary)) unlinkSync(temporary)
    }
  }
  let refreshing: Promise<string> | undefined
  return Object.freeze({
    validate: () => { read() },
    getAccessToken: async () => {
      const current = read()
      if (now() < current.expiresAt) return current.access
      refreshing ??= refresh(current.refresh)
        .then((next) => { write(next); return next.access })
        .finally(() => { refreshing = undefined })
      return refreshing
    },
  })
}
