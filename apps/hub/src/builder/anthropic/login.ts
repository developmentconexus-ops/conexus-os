import { randomUUID } from 'node:crypto'
import { completeAnthropicLogin, startAnthropicLogin } from '@mastra/code-sdk/auth/providers/anthropic'
import type { ClaudeTokens } from './credential.js'
import { ModelLoginId, type AccountId } from '../../../../../packages/contract/dist/index.js'
import type { ConnectResult } from '../model-account/accounts.js'

export type ClaudeLoginState = 'succeeded' | 'failed' | 'expired'

/** Anthropic's authorization endpoints; tests script them. */
export type ClaudeAuthorization = Readonly<{
  start(): Promise<Readonly<{ url: string; verifier: string }>>
  complete(pasted: string, verifier: string): Promise<ClaudeTokens>
}>

type Caller = Readonly<{ accountId: AccountId }>
type Attempt<C extends Caller> = {
  readonly caller: C
  readonly verifier: string
  readonly deadlineAt: number
  settling: Promise<ClaudeLoginState> | undefined
}

// The Factory's paste-code window for the same flow.
const PASTE_CODE_TTL_MS = 10 * 60_000

const realAuthorization: ClaudeAuthorization = Object.freeze({
  start: () => startAnthropicLogin(),
  complete: (pasted, verifier) => completeAnthropicLogin(pasted, verifier),
})

/**
 * A Claude subscription sign-in by pasted code: the person authorizes on claude.ai in their own
 * browser, Anthropic's page shows a code, and the person pastes it back, so nothing has to reach
 * the Hub on a callback. The PKCE verifier stays in the Hub. Each sign-in belongs to the person who
 * started it; a person has at most one at a time. A refused code keeps the sign-in open, so a
 * mistyped paste can be tried again before the deadline.
 */
export const createClaudeLogin = <C extends Caller>({ connect, authorization = realAuthorization, now = Date.now }: Readonly<{
  connect(caller: C, tokens: ClaudeTokens): Promise<ConnectResult>
  authorization?: ClaudeAuthorization
  now?: () => number
}>) => {
  const attempts = new Map<ModelLoginId, Attempt<C>>()

  const sweep = (): void => {
    for (const [loginId, attempt] of attempts) if (now() >= attempt.deadlineAt) attempts.delete(loginId)
  }

  const settle = async (loginId: ModelLoginId, attempt: Attempt<C>, pasted: string): Promise<ClaudeLoginState> => {
    const tokens = await authorization.complete(pasted, attempt.verifier).catch(() => null)
    if (!tokens) return 'failed'
    const connected = await connect(attempt.caller, tokens)
    attempts.delete(loginId)
    return connected.ok ? 'succeeded' : 'failed'
  }

  return Object.freeze({
    start: async (caller: C): Promise<Readonly<{ loginId: ModelLoginId; url: string; expiresAt: number }>> => {
      sweep()
      for (const [loginId, attempt] of attempts) if (attempt.caller.accountId === caller.accountId) attempts.delete(loginId)
      const { url, verifier } = await authorization.start()
      const loginId = ModelLoginId.parse(randomUUID())
      const deadlineAt = now() + PASTE_CODE_TTL_MS
      attempts.set(loginId, { caller, verifier, deadlineAt, settling: undefined })
      return Object.freeze({ loginId, url, expiresAt: deadlineAt })
    },
    complete: async (caller: C, loginId: ModelLoginId, pasted: string): Promise<ClaudeLoginState> => {
      sweep()
      const attempt = attempts.get(loginId)
      if (!attempt || attempt.caller.accountId !== caller.accountId) return 'expired'
      attempt.settling ??= settle(loginId, attempt, pasted).finally(() => { attempt.settling = undefined })
      return attempt.settling
    },
  })
}
