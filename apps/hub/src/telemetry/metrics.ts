import { metrics } from '@opentelemetry/api'
import { heapUsedRatio } from '../platform/heap.js'

export const registerProcessMetrics = (): void => {
  const meter = metrics.getMeter('conexus-process')
  meter.createObservableGauge('conexus.process.heap.used_ratio', { description: 'Used heap divided by the old-space cap (--max-old-space-size), or by v8 heap_size_limit when no flag is set' }).addCallback((result) => result.observe(heapUsedRatio()))
  meter.createObservableGauge('process.memory.usage', { unit: 'By' }).addCallback((result) => result.observe(process.memoryUsage().rss))
}
