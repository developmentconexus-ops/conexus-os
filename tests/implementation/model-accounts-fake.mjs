export const fakeModelAccounts = () => {
  const rows = new Map()
  const key = (owner, provider) => `${owner}:${provider}`
  let nextId = 1
  const revoked = new Set()
  const shared = (provider) => [...rows.values()].find((row) => row.provider === provider && row.sharing === 'everyone') ?? null
  const rowOf = (accountId, provider) => rows.get(key(accountId, provider)) ?? shared(provider)
  const byId = (id) => [...rows.values()].find((row) => row.id === id) ?? null
  const held = (row, run) => ({
    modelAccountId: row.id,
    credential: { provider: row.provider, kind: row.kind },
    secret: row.secret,
    run,
    read: async () => {
      const current = byId(row.id)
      return current && current.kind === row.kind && !revoked.has(run.builderRunId) ? held(current, run) : null
    },
    persist: async (secret) => {
      const current = byId(row.id)
      if (!current || current.kind !== row.kind) return false
      current.secret = secret
      return true
    },
  })
  const write = async ({ accountId, credential: { provider, kind }, secret }) => {
    const existing = rows.get(key(accountId, provider))
    rows.set(key(accountId, provider), { id: existing?.id ?? `row-${nextId++}`, owner: accountId, provider, kind, secret, sharing: existing?.sharing ?? 'just_me' })
  }
  const standingOf = (accountId, provider) => {
    const own = rows.get(key(accountId, provider))
    return { own: own ? { state: 'connected', kind: own.kind } : { state: 'absent' }, shared: shared(provider) !== null }
  }
  const modelAccounts = {
    standing: async (accountId) => ({
      anthropic: standingOf(accountId, 'anthropic'),
      'openai-codex': standingOf(accountId, 'openai-codex'),
      'google-ai-pro': standingOf(accountId, 'google-ai-pro'),
    }),
    write,
    connect: async (input) => { await write(input); return { ok: true } },
    readDefault: async () => null,
    usable: async (accountId, provider) => rowOf(accountId, provider) !== null,
    select: async (run, provider) => {
      const row = rowOf(run.accountId, provider)
      return row ? held(row, { builderRunId: run.builderRunId, accountId: run.accountId }) : null
    },
  }
  const seed = (accountId, provider, kind, secret) => write({ accountId, credential: { provider, kind }, secret })
  const rewrite = (id, secret) => { byId(id).secret = secret }
  const revoke = (builderRunId) => { revoked.add(builderRunId) }
  return { modelAccounts, rows, seed, rewrite, revoke, share: (owner, provider) => { rows.get(key(owner, provider)).sharing = 'everyone' } }
}

export const oneAccount = ({ modelAccountId, provider, kind, secret }) => ({
  usable: async () => true,
  select: async (run) => ({ modelAccountId, credential: { provider, kind }, secret, run, read: async () => null, persist: async () => false }),
})

export const noAccounts = { usable: async () => false, select: async () => null }
