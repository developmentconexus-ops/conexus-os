import { hubModuleUrl } from './hub-build.mjs'
import { OWNER, setupBuilder } from './builder-fixture.mjs'
import { ID } from './project-fixture.mjs'
const { createModelAccountModule } = await import(hubModuleUrl('model-account/module.js'))
const { createModelAccountStore } = await import(hubModuleUrl('model-account/store.js'))
const { admitAccount, admitRun, admitSystem } = await import(hubModuleUrl('identity-access/admission.js'))
const { createSecretEnvelope } = await import(hubModuleUrl('platform/secrets.js'))

export async function setupModelAccounts(t, prefix, { googleAiPro = null } = {}) {
  const fixture = await setupBuilder(t, prefix)
  const envelope = createSecretEnvelope('31'.repeat(32))
  const store = createModelAccountStore(envelope)
  const models = await createModelAccountModule({ data: fixture.database, envelope, defaultThinkingLevel: 'medium', googleAiPro })
  fixture.onCleanup(() => models.close())
  const openRun = (builderRunId, accountId = ID.owner) => (work) =>
    fixture.database.transaction(accountId, async (gate) => work(await admitRun(gate, builderRunId, { ownerId: OWNER })))
  return { ...fixture, envelope, store, models, openRun,
    connect: (credential, accountId = ID.owner, displayName = 'Synthetic person') => fixture.database.transaction(accountId, async (gate) =>
      store.connect({ proof: await admitAccount(gate), credential, displayName })),
    persist: (held, credential) => fixture.database.system('model-account', async (gate) => store.persist(await admitSystem(gate, 'model-account'), held, credential)),
    hold: (builderRunId, provider, accountId = ID.owner) => openRun(builderRunId, accountId)((proof) => store.hold(proof, provider)),
  }
}
