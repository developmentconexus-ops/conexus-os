import { openGate } from './gate-db.js'
import { openGate as renamed, other } from './gate-db.js'
import * as db from './gate-db.js'

export const named = () => openGate(1)
export const aliased = () => renamed(1)
export const namespaced = () => db.openGate(1)
// biome-ignore lint/complexity/useLiteralKeys: the bracket form is the case under test
// biome-ignore lint/performance/noDynamicNamespaceImportAccess: the bracket form is the case under test
export const bracket = () => db['openGate'](1)
export const dynamic = async () => (await import('./gate-db.js')).openGate(1)
export const destructuredRenamed = async () => {
  const { openGate: opened } = await import('./gate-db.js')
  return opened(1)
}
export const destructuredShorthand = async () => {
  const { openGate: _unused } = await import('./gate-db.js')
  return _unused
}
export const unrelated = () => other(1) + (({ openGate: 2 }).openGate)
