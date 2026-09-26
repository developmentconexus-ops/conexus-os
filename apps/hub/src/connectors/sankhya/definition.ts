import type { OperationId } from '../model.js'
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
})

export const SANKHYA_OPERATION_IDS: readonly OperationId[] = Object.freeze(sankhyaDefinition.operations.map((operation) => operation.id))
