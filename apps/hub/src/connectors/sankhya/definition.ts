import type { ConnectorDefinition } from '../integrator.js'
import { sankhyaNativeProtocol } from './gateway.js'
import { sankhyaCredentialSchema } from './credential.js'
import type { SankhyaCredential } from './credential.js'

/** @public Tests import this at runtime from the built module. */
export { sankhyaCredentialSchema } from './credential.js'
export type { SankhyaCredential } from './credential.js'

export const sankhyaDefinition: ConnectorDefinition<SankhyaCredential> = Object.freeze({
  id: 'sankhya',
  credential: sankhyaCredentialSchema,
  events: Object.freeze([]),
  secretFields: Object.freeze([...Object.keys(sankhyaCredentialSchema.shape), 'access_token']),
  native: sankhyaNativeProtocol,
})
