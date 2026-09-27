import { TestExporter } from '@mastra/observability'
import { hubModuleUrl } from './hub-build.mjs'

const { createConnectorObservability } = await import(hubModuleUrl('connectors/record.js'))
const { sankhyaDefinition } = await import(hubModuleUrl('connectors/sankhya/definition.js'))

export const connectorRecord = ({ store = new TestExporter({ logMetricsOnFlush: false }), log } = {}) => {
  const lines = []
  const observability = createConnectorObservability({ store, log: log ?? ((line) => lines.push(line)), secretFields: sankhyaDefinition.secretFields })
  // Past a deadline, a request's span ends after its call has already returned.
  const settled = async () => {
    for (let waited = 0; store.getIncompleteSpans?.().length > 0; waited += 10) {
      if (waited > 2000) throw new Error('a span never ended')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    await observability.flush()
  }
  const facts = async () => {
    await settled()
    return store.getCompletedSpans().map((span) => ({ name: span.name, root: span.isRootSpan, error: Boolean(span.errorInfo), ...span.metadata }))
  }
  return { observability, exporter: store, lines, facts, settled }
}
