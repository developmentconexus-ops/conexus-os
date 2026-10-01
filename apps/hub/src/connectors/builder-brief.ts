import { SpanType } from '@mastra/core/observability'
import type { ObservabilityInstance } from '@mastra/core/observability'
import { endSpan } from './record.js'
import { isMintedScope } from './scope.js'
import type { ConsumerScope } from './scope.js'
import type { BrokerStore } from './store.js'
import type { BoundConnection } from './model.js'

/** @public Tests import this at runtime from the built module. */
export const CONNECTOR_BRIEF_UNAVAILABLE = 'The Conexões bound to this Project could not be read in this run. Do not call `connector_fetch` or `connectors.fetch`; '
  + 'when the request needs data from an external system, change no files, tell the person it is unavailable right now and that they can ask again later, and stop.'

/** @public Tests import this at runtime from the built module. */
export const CONNECTOR_BRIEF_UNBOUND = 'No Conexão is bound to this Project, so it reads no external system. When a request needs data from one, '
  + 'change no files: name the system, tell the person a Conexão for it can be added in Integrações, and stop.'

const RUNTIME_CASES = 'When a read is refused: RESPONSE_TOO_LARGE, narrow it (fewer fields, a tighter filter, one page at a time) and read again; '
  + 'CALL_LIMIT, this run\'s reads are spent; PROVIDER_ERROR with a vendorStatus, the system refused your request, so fix it; any other code, '
  + 'tell the person in plain words what failed, without the code unless they ask, and build nothing on data you did not read. '
  + 'When a request needs a system none of these Conexões reaches, change no files: name the system, tell the person a Conexão for it can be added in Integrações, and stop.'

const bindingLine = (binding: BoundConnection): string => `- \`${binding.name}\`: ${binding.connectorId} (skill \`conexus-${binding.connectorId}\`)`

export type ConnectorBrief = (scope: ConsumerScope) => Promise<string>

/** Always a text: the Project's bound Conexões with the skill that teaches each, from its own bindings (P11), and what to do when a read is refused or a request needs one it does not read. */
export const createConnectorBrief = ({
  store,
  observability,
}: Readonly<{
  store: Pick<BrokerStore, 'listBindings'>
  observability: ObservabilityInstance
}>): ConnectorBrief => async (scope) => {
  if (!isMintedScope(scope)) return CONNECTOR_BRIEF_UNAVAILABLE
  let bindings: readonly BoundConnection[]
  try {
    bindings = await store.listBindings({ projectId: scope.projectId, environment: scope.environment })
  } catch {
    endSpan(observability.startSpan({ type: SpanType.GENERIC, name: 'connector.brief', metadata: { projectId: scope.projectId } }), 'STORE_UNAVAILABLE')
    return CONNECTOR_BRIEF_UNAVAILABLE
  }
  if (bindings.length === 0) return CONNECTOR_BRIEF_UNBOUND
  return [...bindings.map(bindingLine), RUNTIME_CASES].join('\n')
}
