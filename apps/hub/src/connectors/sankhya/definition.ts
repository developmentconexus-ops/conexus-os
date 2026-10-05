import { SankhyaCredential } from '../../../../../packages/contract/dist/index.js'
import type { ConnectorDefinition } from '../integrator.js'
import { sankhyaNativeProtocol } from './gateway.js'

export const sankhyaDefinition: ConnectorDefinition<SankhyaCredential> = Object.freeze({
  id: 'sankhya',
  credential: SankhyaCredential,
  secretFields: Object.freeze([...Object.keys(SankhyaCredential.shape), 'access_token']),
  native: sankhyaNativeProtocol,
})
