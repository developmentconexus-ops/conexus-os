import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { refreshAuthorizationToken } from './anthropic-oauth.mjs'

export const DEFAULT_OAUTH_TOKEN_PATH = resolve(homedir(), '.config', 'conexus', 'credentials', 'anthropic-oauth.json')

function assertOwner(stat) {
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new Error('ANTHROPIC_OAUTH_OWNER_INVALID')
  }
}

function assertExternalRegularOwnerOnly(filePath) {
  const stat = lstatSync(filePath)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('ANTHROPIC_OAUTH_CUSTODY_INVALID')
  if ((stat.mode & 0o077) !== 0) throw new Error('ANTHROPIC_OAUTH_PERMISSIONS_INVALID')
  assertOwner(stat)
}

function assertOwnerOnlyDirectory(directory) {
  const stat = lstatSync(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('ANTHROPIC_OAUTH_CUSTODY_INVALID')
  if ((stat.mode & 0o077) !== 0) throw new Error('ANTHROPIC_OAUTH_PERMISSIONS_INVALID')
  assertOwner(stat)
}

export function createOAuthTokenStore({
  filePath = DEFAULT_OAUTH_TOKEN_PATH,
  refresh = refreshAuthorizationToken,
  now = () => Date.now(),
} = {}) {
  const absolutePath = resolve(filePath)
  const directory = dirname(absolutePath)
  const refreshLock = `${absolutePath}.refresh-lock`
  let refreshing

  function read() {
    if (!existsSync(absolutePath)) return undefined
    assertOwnerOnlyDirectory(directory)
    assertExternalRegularOwnerOnly(absolutePath)
    try {
      const value = JSON.parse(readFileSync(absolutePath, 'utf8'))
      if (!value.access || !value.refresh || !Number.isFinite(value.expiresAt)) throw new Error()
      return value
    } catch (error) {
      if (error?.message?.startsWith('ANTHROPIC_OAUTH_')) throw error
      throw new Error('ANTHROPIC_OAUTH_TOKEN_FILE_INVALID')
    }
  }

  function write(tokens) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    assertOwnerOnlyDirectory(directory)
    const temporary = `${absolutePath}.${process.pid}.${Date.now()}.tmp`
    let descriptor
    try {
      descriptor = openSync(temporary, 'wx', 0o600)
      writeFileSync(descriptor, `${JSON.stringify(tokens)}\n`, 'utf8')
      closeSync(descriptor)
      descriptor = undefined
      chmodSync(temporary, 0o600)
      renameSync(temporary, absolutePath)
      chmodSync(absolutePath, 0o600)
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
      if (existsSync(temporary)) unlinkSync(temporary)
    }
  }

  async function withRefreshLock(operation) {
    const deadline = Date.now() + 10000
    for (;;) {
      try {
        mkdirSync(refreshLock, { mode: 0o700 })
        assertOwnerOnlyDirectory(refreshLock)
        break
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
        if (Date.now() >= deadline) throw new Error('ANTHROPIC_OAUTH_REFRESH_LOCK_TIMEOUT')
        await new Promise(resolvePromise => setTimeout(resolvePromise, 25))
      }
    }
    try {
      return await operation()
    } finally {
      rmdirSync(refreshLock)
    }
  }

  async function getAccessToken() {
    const tokens = read()
    if (!tokens) throw new Error('ANTHROPIC_OAUTH_LOGIN_REQUIRED')
    if (now() < tokens.expiresAt) return tokens.access
    refreshing ??= withRefreshLock(async () => {
      const current = read()
      if (!current) throw new Error('ANTHROPIC_OAUTH_LOGIN_REQUIRED')
      if (now() < current.expiresAt) return current.access
      const next = await refresh(current.refresh)
      write(next)
      return next.access
    })
      .finally(() => { refreshing = undefined })
    return refreshing
  }

  return Object.freeze({ filePath: absolutePath, read, write, getAccessToken })
}
