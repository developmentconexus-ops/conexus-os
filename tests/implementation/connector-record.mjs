import { TestExporter } from '@mastra/observability'
import { hubModuleUrl } from './hub-build.mjs'

const { createConnectorObservability } = await import(hubModuleUrl('connectors/record.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))

export const connectorRecord = ({ store = new TestExporter({ logMetricsOnFlush: false }), log } = {}) => {
  const lines = []
  const observability = createConnectorObservability({ store, log: log ?? ((line) => lines.push(line)), secretFields: sankhyaDefinition.secretFields })
  const facts = async () => {
    await observability.flush()
    return store.getCompletedSpans().map((span) => ({ name: span.name, root: span.isRootSpan, error: Boolean(span.errorInfo), ...span.metadata }))
  }
  return { observability, exporter: store, lines, facts }
}
