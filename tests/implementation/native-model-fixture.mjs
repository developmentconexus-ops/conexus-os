import { hubModuleUrl } from './hub-build.mjs'
const { nativeModel } = await import(hubModuleUrl('model-account/providers.js'))
const { parseCredential, encodeCredential } = await import(hubModuleUrl('model-account/credential.js'))

function nativeAccess(credential, { thinkingLevel = null, current = async () => credential, persist = async () => ({ ok: true, result: { state: 'superseded' } }) } = {}) {
  return { held: { row: { modelAccountId: '30000000-0000-4000-8000-000000000001', slot: { scope: 'personal', ownerAccountId: '10000000-0000-4000-8000-000000000001' }, connectedAt: new Date(0), refusedAt: null }, credential, sealed: 'synthetic-custody-handle' },
    thinkingLevel, refresh: async () => ({ ok: true, result: await current() }), persist }
}

export function providerModel({ credential, modelId, thinkingLevel = null, current, google = { url: null, track: () => {} } }) {
  const parsed = parseCredential(credential, encodeCredential(credential))
  return nativeModel({ access: nativeAccess(parsed, { thinkingLevel, ...current ? { current } : {} }), modelId, google })
}
