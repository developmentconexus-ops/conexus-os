import { refreshAnthropicToken } from '@mastra/code-sdk/auth/providers/anthropic'
import { refreshOpenAICodexToken } from '@mastra/code-sdk/auth/providers/openai-codex'
import type { ModelAccountId, ThinkingLevel, Result } from '@conexus/contract'
import { Failure, toFailure } from '../platform/failure.js'
import { toCodexTokens, type Credential } from './credential.js'
import type { HeldAccount, ModelAccountStore, OpenRun, Persisted, HoldError } from './store.js'

export type NativeCredentialAccess = Readonly<{
  held: HeldAccount
  thinkingLevel: ThinkingLevel | null
  refresh(): Promise<Result<Credential, HoldError>>
  persist(next: Credential): Promise<Persisted>
}>

type Persist = (held: HeldAccount, next: Credential) => Promise<Persisted>

async function rotate(credential: Extract<Credential, { kind: 'oauth' }>): Promise<Credential> {
  switch (credential.provider) {
    case 'anthropic': return { provider: 'anthropic', kind: 'oauth', value: await refreshAnthropicToken(credential.value.refresh) }
    case 'openai-codex': {
      const stored = credential.value
      return { provider: 'openai-codex', kind: 'oauth', value: toCodexTokens(await refreshOpenAICodexToken(stored.refresh, stored.accountId, stored.email ?? undefined)) }
    }
  }
}

async function renew(store: ModelAccountStore, persist: Persist, openRun: OpenRun, held: HeldAccount): Promise<Result<Credential, HoldError>> {
  const read = await store.reread(openRun, held)
  if (!read.ok) return read
  if (read.result.state === 'gone') return { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } }
  const current = read.result.held
  const credential = current.credential
  if (credential.kind !== 'oauth') return { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } }
  if (Date.now() < credential.value.expires) return { ok: true, result: credential }
  let next: Credential
  try { next = await rotate(credential) } catch (error) { throw toFailure(error) }
  const saved = await persist(current, next)
  return saved.state === 'stored' ? { ok: true, result: saved.held.credential } : { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } }
}

export function createCredentialRefresh(store: ModelAccountStore, persist: Persist) {
  const pending = new Map<ModelAccountId, Promise<Result<Credential, HoldError>>>()
  return Object.freeze({
    current: async (openRun: OpenRun, held: HeldAccount): Promise<Result<Credential, HoldError>> => {
      const credential = held.credential
      if (credential.kind !== 'oauth' || Date.now() < credential.value.expires) return { ok: true, result: credential }
      const read = await store.reread(openRun, held)
      if (!read.ok) return read
      if (read.result.state === 'gone') return { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } }
      const stored = read.result.held.credential
      if (stored.kind !== 'oauth') return { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } }
      if (Date.now() < stored.value.expires) return { ok: true, result: stored }
      const id = held.row.modelAccountId
      let work = pending.get(id)
      if (!work) {
        work = renew(store, persist, openRun, held).finally(() => pending.delete(id))
        pending.set(id, work)
      }
      const settled = await work
      const current = await store.reread(openRun, held)
      if (!current.ok) return current
      if (current.result.state === 'gone') return { ok: false, error: { code: 'BUILDER_MODEL_NOT_SELECTED' } }
      return settled.ok ? { ok: true, result: current.result.held.credential } : settled
    },
  })
}

export async function currentCredential(access: NativeCredentialAccess): Promise<Credential> {
  const current = await access.refresh()
  if (!current.ok) throw new Failure(current.error.code)
  return current.result
}
