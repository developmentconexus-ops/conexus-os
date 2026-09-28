import { SpanType } from '@mastra/core/observability'
import type { ObservabilityInstance } from '@mastra/core/observability'
import { z } from 'zod'
import { BROKER_ERROR_CODES } from './errors.js'
import { operationBinding } from './broker.js'
import type { RegisteredConnector } from './broker.js'
import type { Operation } from './operation.js'
import { endSpan } from './record.js'
import { isMintedScope } from './scope.js'
import type { ConsumerScope } from './scope.js'
import type { BrokerStore } from './store.js'
import type { BoundConnection } from './model.js'

// biome-ignore lint/suspicious/noExplicitAny: the registry holds every Connector's own credential and session types
type AnyOperation = Operation<any, any, any>

const CLOSED_CODES = BROKER_ERROR_CODES.join(', ')

const operationSection = (operation: AnyOperation): string => [
  `### ${operation.id}`,
  operation.summary,
  `Input JSON Schema:\n${JSON.stringify(z.toJSONSchema(operation.input))}`,
  `Output JSON Schema:\n${JSON.stringify(z.toJSONSchema(operation.output))}`,
  [
    'Handler example:',
    '```js',
    `const read = await connectors.call('${operation.id}', /* input matching the input schema above */)`,
    'if (!read.ok) {',
    `  // read.code is one of: ${CLOSED_CODES}`,
    '} else {',
    '  const { value } = read // matches the output schema above',
    '}',
    '```',
  ].join('\n'),
].join('\n\n')

/** @public Tests import this at runtime from the built module. */
export const CONNECTOR_BRIEF_UNAVAILABLE = 'The Connections bound to this Project could not be read for this run. '
  + 'Do not call connector_fetch or connectors.call in this run. If the request needs data from an external system, change no '
  + 'files: tell the person that it is unavailable right now and that they can ask again later, and stop.'

const TO_BIND = 'change no files: reply naming the system, tell the person to bind a Conexão for it to this Project in '
  + 'Integrações, and stop.'

/** @public Tests import this at runtime from the built module. */
export const CONNECTOR_BRIEF_UNBOUND = `This Project has no Connection bound to it, so it reads no external system. When a request needs data from one, ${TO_BIND}`

const bindingSection = (bindings: readonly BoundConnection[]): string => [
  'Connections bound to this Project, each named by the Project-local name a request passes as `connection`: '
    + `${bindings.map((binding) => `\`${binding.name}\` (integrator ${binding.connectorId})`).join(', ')}.`,
  'Before you write code that depends on one of them, read it with the connector_fetch tool, in its integrator\'s native '
    + 'request format below, and build on the field names and values it returns. When a read answers RESPONSE_TOO_LARGE, '
    + 'narrow it before you read again: ask for fewer fields, filter it further, or read one page at a time. CALL_LIMIT means '
    + 'this run\'s reads are spent. When a read is refused with another code, tell the person which code it answered, and '
    + `build nothing on data you did not read. When a request needs a system none of these Connections reaches, ${TO_BIND}`,
].join(' ')

export type ConnectorBrief = (scope: ConsumerScope) => Promise<string>

/** Always a text: what this Project reads from external systems, from its own bindings (P11), and what to do when a request needs one it does not read. */
export const createConnectorBrief = ({
  connectors,
  store,
  observability,
}: Readonly<{
  connectors: readonly RegisteredConnector[]
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
  const bound = connectors.filter(({ definition }) => bindings.some((binding) => binding.connectorId === definition.id))
  const reached = bound.filter(({ definition }) => definition.operations.length > 0 && operationBinding(bindings, definition.id))
  return [
    bindingSection(bindings),
    ...(reached.length === 0 ? [] : [
      'Connector operations granted to this Project, for the application\'s server handlers. Call them only through '
        + "connectors.call(operationId, input) from a server handler; no operation beyond this run's own "
        + 'instructions exists for this Project.',
      ...reached.flatMap(({ definition }) => definition.operations.map(operationSection)),
    ]),
    ...new Set(bound.map(({ definition }) => definition.builderSkill).filter(Boolean)),
  ].join('\n\n')
}
