import { TestExporter } from '@mastra/observability'
import { hubModuleUrl } from './hub-build.mjs'

const { createConnectorObservability } = await import(hubModuleUrl('connectors/record.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))

/**
 * The Hub's Connector record with its production filters. Only the store is a test exporter, unless a
 * store is given. `facts` flushes, then answers each completed span as its name, whether it is the
 * root, whether it recorded an error, and its metadata.
 */
export const connectorRecord = ({ store = new TestExporter({ logMetricsOnFlush: false }), log } = {}) => {
  const lines = []
  const observability = createConnectorObservability({ store, log: log ?? ((line) => lines.push(line)), secretFields: sankhyaDefinition.secretFields })
  const facts = async () => {
    await observability.flush()
    return store.getCompletedSpans().map((span) => ({ name: span.name, root: span.isRootSpan, error: Boolean(span.errorInfo), ...span.metadata }))
  }
  return { observability, exporter: store, lines, facts }
}
