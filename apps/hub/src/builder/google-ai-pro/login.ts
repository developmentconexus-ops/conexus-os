import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { encodeKey, type GoogleAiProKey, isAuthFileName } from './credential.js'
import type { CliproxyPool, LoginInstance } from './pool.js'

type LoginState = 'waiting' | 'succeeded' | 'failed' | 'expired'
export type LoginProblem = 'model-login-busy' | 'model-login-unavailable' | 'model-login-callback-refused'

export class GoogleAiProLoginError extends Error {
  constructor(readonly problem: LoginProblem, readonly expiresAt?: number) {
    super(problem)
  }
}

type Caller = Readonly<{ accountId: string }>
type Attempt<C extends Caller> = {
  readonly loginId: string
  readonly caller: C
  readonly state: string
  readonly instance: LoginInstance
  readonly timer: ReturnType<typeof setTimeout>
  readonly expiresAt: number
  outcome: LoginState
  settling: Promise<LoginState> | undefined
}

export type GoogleAiProLogin<C extends Caller> = Readonly<{
  start(caller: C): Promise<Readonly<{ loginId: string; url: string }>>
  complete(caller: C, loginId: string, callbackUrl: string): Promise<LoginState>
  status(caller: C, loginId: string): Promise<LoginState>
}>

// Google redirects to localhost:51121/oauth-callback. When that lands on the Hub's machine,
// CLIProxyAPI's forwarder there redirects again to its own /antigravity/callback. A browser can fail
// at either hop, so the address a person pastes has one of the two forms; the state is the guard.
const CALLBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1'])
const CALLBACK_PATHS = new Set(['/oauth-callback', '/antigravity/callback'])
const STATE = /^[\w-]{8,128}$/

const management = async (instance: LoginInstance, path: string, body?: unknown): Promise<Readonly<Record<string, unknown>>> => {
  const answer = await fetch(`${instance.url}/v0/management${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-management-key': instance.managementKey, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  })
  const parsed: unknown = await answer.json().catch(() => null)
  return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
}

/**
 * One sign-in at a time for the whole installation, because Google redirects to a fixed port. The
 * sign-in runs in a throwaway CLIProxyAPI whose auth dir starts empty; the record it writes becomes
 * the person's Factory credential, and the instance is then discarded.
 */
export const createGoogleAiProLogin = <C extends Caller>({ pool, writeCredential, seedMemory, timeoutMs = 5 * 60_000 }: Readonly<{
  pool: Pick<CliproxyPool, 'startLogin'>
  writeCredential(caller: C, key: GoogleAiProKey): Promise<void>
  seedMemory(caller: C): Promise<void>
  timeoutMs?: number
}>): GoogleAiProLogin<C> => {
  let current: Attempt<C> | undefined
  let starting = false

  const finish = async (attempt: Attempt<C>, outcome: LoginState): Promise<LoginState> => {
    if (attempt.outcome === 'waiting') attempt.outcome = outcome
    clearTimeout(attempt.timer)
    await attempt.instance.close().catch(() => undefined)
    return attempt.outcome
  }

  const own = (caller: C, loginId: string): Attempt<C> | undefined =>
    current?.loginId === loginId && current.caller.accountId === caller.accountId ? current : undefined

  const readRecord = async (attempt: Attempt<C>): Promise<GoogleAiProKey | null> => {
    const fileName = (await readdir(attempt.instance.authDir)).find(isAuthFileName)
    return fileName ? encodeKey({ fileName, bytes: new Uint8Array(await readFile(join(attempt.instance.authDir, fileName))) }) : null
  }

  const settle = async (attempt: Attempt<C>): Promise<LoginState> => {
    let key = await readRecord(attempt)
    if (!key) {
      const answer = await management(attempt.instance, `/get-auth-status?state=${encodeURIComponent(attempt.state)}`)
      if (answer.status !== 'error') return 'waiting'
      // The status can turn to an error once the session is gone; the file decides.
      key = await readRecord(attempt)
      if (!key) return finish(attempt, 'failed')
    }
    await writeCredential(attempt.caller, key)
    await seedMemory(attempt.caller).catch(() => undefined)
    return finish(attempt, 'succeeded')
  }

  const status = async (caller: C, loginId: string): Promise<LoginState> => {
    const attempt = own(caller, loginId)
    if (!attempt) return 'expired'
    if (attempt.outcome !== 'waiting') return attempt.outcome
    attempt.settling ??= settle(attempt).finally(() => { attempt.settling = undefined })
    return attempt.settling
  }

  const start = async (caller: C): Promise<Readonly<{ loginId: string; url: string }>> => {
    if (starting) throw new GoogleAiProLoginError('model-login-busy')
    if (current?.outcome === 'waiting') {
      if (current.caller.accountId !== caller.accountId) throw new GoogleAiProLoginError('model-login-busy', current.expiresAt)
      await finish(current, 'expired')
    }
    starting = true
    try {
      const instance = await pool.startLogin().catch(() => { throw new GoogleAiProLoginError('model-login-unavailable') })
      const answer = await management(instance, '/antigravity-auth-url?is_webui=true').catch(() => ({} as Record<string, unknown>))
      const { url, state } = answer
      if (answer.status !== 'ok' || typeof url !== 'string' || !url.startsWith('https://accounts.google.com/') ||
        typeof state !== 'string' || !STATE.test(state)) {
        await instance.close().catch(() => undefined)
        throw new GoogleAiProLoginError('model-login-unavailable')
      }
      const attempt: Attempt<C> = {
        loginId: randomUUID(),
        caller,
        state,
        instance,
        timer: setTimeout(() => { void finish(attempt, 'expired') }, timeoutMs),
        expiresAt: Date.now() + timeoutMs,
        outcome: 'waiting',
        settling: undefined,
      }
      attempt.timer.unref()
      current = attempt
      return Object.freeze({ loginId: attempt.loginId, url })
    } finally {
      starting = false
    }
  }

  const complete = async (caller: C, loginId: string, callbackUrl: string): Promise<LoginState> => {
    const attempt = own(caller, loginId)
    if (!attempt) return 'expired'
    if (attempt.outcome !== 'waiting') return attempt.outcome
    let callback: URL
    try {
      callback = new URL(callbackUrl.trim())
    } catch {
      throw new GoogleAiProLoginError('model-login-callback-refused')
    }
    if (callback.protocol !== 'http:' || !CALLBACK_HOSTNAMES.has(callback.hostname) || !CALLBACK_PATHS.has(callback.pathname) ||
      callback.searchParams.get('state') !== attempt.state ||
      !(callback.searchParams.get('code') || callback.searchParams.get('error'))) throw new GoogleAiProLoginError('model-login-callback-refused')
    const answer = await management(attempt.instance, '/oauth-callback', { provider: 'antigravity', redirect_url: callback.href })
    if (answer.status !== 'ok') return finish(attempt, 'failed')
    return status(caller, loginId)
  }

  return Object.freeze({ start, complete, status })
}
