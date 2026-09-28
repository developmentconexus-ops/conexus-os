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

// What the Builder learns about the connector operations a Project may call. It applies the broker's
// own rule (operationBinding), so it never lists an operation the broker would refuse. A Project that
// reaches none sees nothing; otherwise it sees exactly those operations, their contracts, one handler
// snippet, and each reached Definition's own Skill. This never reaches the network and never opens a
// credential: it only reads the Project's bindings and the in-memory registry the broker is built from.

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

// A run whose bindings could not be read still runs: the Builder is told that connector data is out of
// reach this run, so it neither invents an operation nor silently builds without one. The broker
// reads the bindings again on every call, so this notice grants nothing and hides nothing.
/** @public Tests import this at runtime from the built module. */
export const CONNECTOR_BRIEF_UNAVAILABLE = 'The connector operations this Project may call could not be read for this run. '
  + 'Do not call connectors.call in this run. If the request needs data from a connected system, tell the person '
  + 'that it is unavailable right now and that they can ask again later.'

export type ConnectorBrief = (scope: ConsumerScope) => Promise<string>

export const createConnectorBrief = ({
  connectors,
  store,
  observability,
}: Readonly<{
  connectors: readonly RegisteredConnector[]
  store: Pick<BrokerStore, 'listBindings'>
  observability: ObservabilityInstance
}>): ConnectorBrief => async (scope) => {
  if (!isMintedScope(scope)) return ''
  let bindings: Awaited<ReturnType<typeof store.listBindings>>
  try {
    bindings = await store.listBindings({ projectId: scope.projectId, environment: scope.environment })
  } catch {
    endSpan(observability.startSpan({ type: SpanType.GENERIC, name: 'connector.brief', metadata: { projectId: scope.projectId } }), 'STORE_UNAVAILABLE')
    return CONNECTOR_BRIEF_UNAVAILABLE
  }
  const reached = connectors.filter(({ definition }) => definition.operations.length > 0 && operationBinding(bindings, definition.id))
  if (reached.length === 0) return ''
  return [
    'Connector operations granted to this Project. Call them only through '
      + "connectors.call(operationId, input) from a server handler; no operation beyond this run's own "
      + 'instructions exists for this Project.',
    ...reached.flatMap(({ definition }) => definition.operations.map(operationSection)),
    ...new Set(reached.map(({ definition }) => definition.builderSkill)),
  ].join('\n\n')
}
