import type { ConnectorDefinition } from '../operation.js'
import type { SankhyaSession } from './gateway.js'
import { sankhyaCredentialSchema } from './credential.js'
import type { SankhyaCredential } from './credential.js'
import { purchaseOrderRead } from './purchase-order.js'
import { SANKHYA_BUILDER_SKILL } from './skill.js'

/** @public Tests import this at runtime from the built module. */
export { sankhyaCredentialSchema } from './credential.js'
export type { SankhyaCredential } from './credential.js'

export const sankhyaDefinition: ConnectorDefinition<SankhyaCredential, SankhyaSession> = Object.freeze({
  id: 'sankhya',
  credential: sankhyaCredentialSchema,
  operations: Object.freeze([purchaseOrderRead]),
  events: Object.freeze([]),
  builderSkill: SANKHYA_BUILDER_SKILL,
  secretFields: Object.freeze([...Object.keys(sankhyaCredentialSchema.shape), 'access_token']),
})
