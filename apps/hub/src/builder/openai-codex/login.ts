import { randomUUID } from 'node:crypto'
import { pollCodexDeviceLogin, startCodexDeviceLogin, type CodexDeviceLoginPending, type CodexDevicePollResult } from '@mastra/code-sdk/auth/providers/openai-codex'
import { toCodexTokens, type CodexTokens } from './credential.js'
import type { AccountId } from '../../../../../packages/contract/dist/index.js'

export type LoginState = 'waiting' | 'succeeded' | 'failed' | 'expired'

/** OpenAI's device-code endpoints; tests script them. */
export type CodexDevice = Readonly<{
  start(): Promise<CodexDeviceLoginPending>
  poll(pending: CodexDeviceLoginPending): Promise<CodexDevicePollResult>
}>

export type CodexLoginHandoff = Readonly<{ loginId: string; url: string; userCode: string; intervalMs: number; expiresAt: number }>

type Caller = Readonly<{ accountId: AccountId }>
type Attempt<C extends Caller> = {
  readonly caller: C
  readonly pending: CodexDeviceLoginPending
  outcome: LoginState
  polling: Promise<LoginState> | undefined
}

const realDevice: CodexDevice = Object.freeze({ start: () => startCodexDeviceLogin(), poll: (pending) => pollCodexDeviceLogin(pending) })

/**
 * A ChatGPT sign-in by device code: the person opens OpenAI's page in their own browser and types
 * the code, so nothing has to reach the Hub on a localhost callback. Each sign-in belongs to the
 * person who started it and ends at OpenAI's deadline; a person has at most one at a time.
 */
export const createCodexLogin = <C extends Caller>({ writeCredential, device = realDevice, now = Date.now }: Readonly<{
  writeCredential(caller: C, tokens: CodexTokens): Promise<void>
  device?: CodexDevice
  now?: () => number
}>) => {
  const attempts = new Map<string, Attempt<C>>()

  const sweep = (): void => {
    for (const [loginId, attempt] of attempts) if (now() >= attempt.pending.deadlineAt) attempts.delete(loginId)
  }

  const settle = async (attempt: Attempt<C>): Promise<LoginState> => {
    const answer = await device.poll(attempt.pending).catch(() => null)
    if (!answer || answer.status === 'pending') return 'waiting'
    if (answer.status === 'failed') return 'failed'
    return Promise.resolve().then(() => writeCredential(attempt.caller, toCodexTokens(answer.credentials))).then(() => 'succeeded' as const, () => 'failed' as const)
  }

  return Object.freeze({
    start: async (caller: C): Promise<CodexLoginHandoff> => {
      sweep()
      for (const [loginId, attempt] of attempts) if (attempt.caller.accountId === caller.accountId) attempts.delete(loginId)
      const pending = await device.start()
      const loginId = randomUUID()
      attempts.set(loginId, { caller, pending, outcome: 'waiting', polling: undefined })
      return Object.freeze({ loginId, url: pending.url, userCode: pending.userCode, intervalMs: pending.intervalMs, expiresAt: pending.deadlineAt })
    },
    poll: async (caller: C, loginId: string): Promise<LoginState> => {
      sweep()
      const attempt = attempts.get(loginId)
      if (!attempt || attempt.caller.accountId !== caller.accountId) return 'expired'
      if (attempt.outcome !== 'waiting') return attempt.outcome
      attempt.polling ??= settle(attempt).then(
        (state) => { attempt.outcome = state; return state },
      ).finally(() => { attempt.polling = undefined })
      return attempt.polling
    },
  })
}
