import type { OperationId } from '../model.js'
import type { ConnectorDefinition } from '../operation.js'
import type { SankhyaSession } from './gateway.js'
import { sankhyaCredentialSchema } from './credential.js'
import type { SankhyaCredential } from './credential.js'
import { purchaseOrderRead } from './purchase-order.js'

export { sankhyaCredentialSchema } from './credential.js'
export type { SankhyaCredential } from './credential.js'

export const sankhyaDefinition: ConnectorDefinition<SankhyaCredential, SankhyaSession> = Object.freeze({
  id: 'sankhya',
  credential: sankhyaCredentialSchema,
  operations: Object.freeze([purchaseOrderRead]),
  events: Object.freeze([]),
  // Placeholder: task Q4.5 writes the Sankhya Skill in product language from the checked sources.
  builderSkill: 'Sankhya Skill pending (task Q4.5).',
})

export const SANKHYA_OPERATION_IDS: readonly OperationId[] = Object.freeze(sankhyaDefinition.operations.map((operation) => operation.id))
