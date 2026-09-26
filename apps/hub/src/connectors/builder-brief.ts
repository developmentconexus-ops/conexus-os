import { z } from 'zod'
import { BROKER_ERROR_CODES } from './errors.js'
import type { AuditSink, RegisteredConnector } from './broker.js'
import type { Operation } from './operation.js'
import { isMintedScope } from './scope.js'
import type { ConsumerScope } from './scope.js'
import type { BrokerStore } from './store.js'

// What the Builder learns about a Project's granted connector operations. A Project with no open
// grant sees nothing; a Project with a grant sees exactly the operations it may call, their contracts,
// one handler snippet, and the granted Definition's own Skill, once per connector. This never reaches
// the network and never opens a credential: it only reads the granted capability ids and the in-memory
// operation registry the broker itself is built from.

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

// A run whose grants could not be read still runs: the Builder is told that connector data is out of
// reach this run, so it neither invents an operation nor silently builds without one. The broker
// checks the grant again on every call, so this notice grants nothing and hides nothing.
export const CONNECTOR_BRIEF_UNAVAILABLE = 'The connector operations this Project may call could not be read for this run. '
  + 'Do not call connectors.call in this run. If the request needs data from a connected system, tell the person '
  + 'that it is unavailable right now and that they can ask again later.'

/** Builds the per-run brief for one Project's scope. Never throws: an unreadable store answers
 * CONNECTOR_BRIEF_UNAVAILABLE and audits one line that names no store detail. */
export type ConnectorBrief = (scope: ConsumerScope) => Promise<string>

export const createConnectorBrief = ({
  connectors,
  store,
  audit,
}: Readonly<{
  connectors: readonly RegisteredConnector[]
  store: Pick<BrokerStore, 'listGrantedCapabilities'>
  audit: AuditSink
}>): ConnectorBrief => {
  const operations = new Map<string, Readonly<{ operation: AnyOperation; connectorId: string; skill: string }>>()
  for (const connector of connectors) {
    for (const operation of connector.definition.operations) {
      operations.set(operation.id, Object.freeze({ operation, connectorId: connector.definition.id, skill: connector.definition.builderSkill }))
    }
  }
  return async (scope) => {
    if (!isMintedScope(scope)) return ''
    let capabilities: Awaited<ReturnType<typeof store.listGrantedCapabilities>>
    try {
      capabilities = await store.listGrantedCapabilities({ projectId: scope.projectId, environment: scope.environment })
    } catch {
      try { audit(`${JSON.stringify({ event: 'connector.brief', result: 'STORE_UNAVAILABLE' })}\n`) } catch { /* an audit sink failure never fails the run */ }
      return CONNECTOR_BRIEF_UNAVAILABLE
    }
    const entries = capabilities.flatMap((capability) => {
      const entry = capability.capabilityKind === 'operation' ? operations.get(capability.capabilityId) : undefined
      return entry ? [entry] : []
    })
    if (entries.length === 0) return ''
    const skills = new Map<string, string>()
    const sections = entries.map(({ operation, connectorId, skill }) => {
      skills.set(connectorId, skill)
      return operationSection(operation)
    })
    return [
      'Connector operations granted to this Project. Call them only through '
        + "connectors.call(operationId, input) from a server handler; no operation beyond this run's own "
        + 'instructions exists for this Project.',
      ...sections,
      ...[...skills.values()],
    ].join('\n\n')
  }
}
