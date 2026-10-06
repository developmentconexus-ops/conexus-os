import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Failure } from '../../platform/failure.js'
import { encodeKey, type GoogleAiProKey, isAuthFileName } from './credential.js'
import type { CliproxyPool, LoginInstance } from './pool.js'
import { ModelLoginId, type AccountId } from '@conexus/contract'
import type { ConnectResult } from '../model-account/accounts.js'

type LoginState = 'waiting' | 'succeeded' | 'failed' | 'expired'

type Caller = Readonly<{ accountId: AccountId }>
type Attempt<C extends Caller> = {
  readonly loginId: ModelLoginId
  readonly caller: C
  readonly state: string
  readonly instance: LoginInstance
  readonly timer: ReturnType<typeof setTimeout>
  readonly expiresAt: number
  outcome: LoginState
  settling: Promise<LoginState> | undefined
}

export type GoogleAiProLogin<C extends Caller> = Readonly<{
  start(caller: C): Promise<Readonly<{ loginId: ModelLoginId; url: string }>>
  complete(caller: C, loginId: ModelLoginId, callbackUrl: string): Promise<LoginState>
  status(caller: C, loginId: ModelLoginId): Promise<LoginState>
}>

// Google redirects to localhost:51121/oauth-callback. When that lands on the Hub's machine,
// CLIProxyAPI's forwarder there redirects again to its own /antigravity/callback. A browser can fail
// at either hop, so the address a person pastes has one of the two forms; the state is the guard.
const CALLBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1'])
const CALLBACK_PATHS = new Set(['/oauth-callback', '/antigravity/callback'])
const STATE = /^[\w-]{8,128}$/

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const management = async (instance: LoginInstance, path: string, body?: unknown): Promise<Readonly<Record<string, unknown>>> => {
  const answer = await fetch(`${instance.url}/v0/management${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-management-key': instance.managementKey, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  })
  const parsed: unknown = await answer.json().catch(() => null)
  return isRecord(parsed) ? parsed : {}
}

/**
 * One sign-in at a time for the whole installation, because Google redirects to a fixed port. The
 * sign-in runs in a throwaway CLIProxyAPI whose auth dir starts empty; the record it writes becomes
 * the person's model account, and the instance is then discarded.
 */
export const createGoogleAiProLogin = <C extends Caller>({ pool, connect, timeoutMs = 5 * 60_000 }: Readonly<{
  pool: Pick<CliproxyPool, 'startLogin'>
  connect(caller: C, key: GoogleAiProKey): Promise<ConnectResult>
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

  const own = (caller: C, loginId: ModelLoginId): Attempt<C> | undefined =>
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
    return finish(attempt, (await connect(attempt.caller, key)).ok ? 'succeeded' : 'failed')
  }

  const status = async (caller: C, loginId: ModelLoginId): Promise<LoginState> => {
    const attempt = own(caller, loginId)
    if (!attempt) return 'expired'
    if (attempt.outcome !== 'waiting') return attempt.outcome
    attempt.settling ??= settle(attempt).finally(() => { attempt.settling = undefined })
    return attempt.settling
  }

  const start = async (caller: C): Promise<Readonly<{ loginId: ModelLoginId; url: string }>> => {
    if (starting) throw new Failure('MODEL_LOGIN_BUSY')
    if (current?.outcome === 'waiting') {
      if (current.caller.accountId !== caller.accountId) throw new Failure('MODEL_LOGIN_BUSY')
      await finish(current, 'expired')
    }
    starting = true
    try {
      const instance = await pool.startLogin().catch(() => { throw new Failure('MODEL_LOGIN_UNAVAILABLE') })
      const answer = await management(instance, '/antigravity-auth-url?is_webui=true').catch((): Readonly<Record<string, unknown>> => ({}))
      const { url, state } = answer
      if (answer.status !== 'ok' || typeof url !== 'string' || !url.startsWith('https://accounts.google.com/') ||
        typeof state !== 'string' || !STATE.test(state)) {
        await instance.close().catch(() => undefined)
        throw new Failure('MODEL_LOGIN_UNAVAILABLE')
      }
      const attempt: Attempt<C> = {
        loginId: ModelLoginId.parse(randomUUID()),
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

  const complete = async (caller: C, loginId: ModelLoginId, callbackUrl: string): Promise<LoginState> => {
    const attempt = own(caller, loginId)
    if (!attempt) return 'expired'
    if (attempt.outcome !== 'waiting') return attempt.outcome
    let callback: URL
    try {
      callback = new URL(callbackUrl.trim())
    } catch {
      throw new Failure('MODEL_LOGIN_CALLBACK_REFUSED')
    }
    if (callback.protocol !== 'http:' || !CALLBACK_HOSTNAMES.has(callback.hostname) || !CALLBACK_PATHS.has(callback.pathname) ||
      callback.searchParams.get('state') !== attempt.state ||
      !(callback.searchParams.get('code') || callback.searchParams.get('error'))) throw new Failure('MODEL_LOGIN_CALLBACK_REFUSED')
    const answer = await management(attempt.instance, '/oauth-callback', { provider: 'antigravity', redirect_url: callback.href })
    if (answer.status !== 'ok') return finish(attempt, 'failed')
    return status(caller, loginId)
  }

  return Object.freeze({ start, complete, status })
}
