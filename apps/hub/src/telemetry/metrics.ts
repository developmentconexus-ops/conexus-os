import { metrics } from '@opentelemetry/api'
import { heapUsedRatio } from './heap-watch.js'

export const registerProcessMetrics = (): void => {
  const meter = metrics.getMeter('conexus-process')
  meter.createObservableGauge('conexus.process.heap.used_ratio').addCallback((result) => result.observe(heapUsedRatio()))
  meter.createObservableGauge('process.memory.usage', { unit: 'By' }).addCallback((result) => result.observe(process.memoryUsage().rss))
}
