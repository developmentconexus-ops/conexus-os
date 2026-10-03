import { heapUsedRatio } from '../platform/heap.js'

const HIGH = 0.8
const LOW = 0.7
const INTERVAL_MS = 15_000

/** Fires once after two samples in a row above 0.8, and again only after the ratio fell below 0.7. */
const createHeapWatch = (onHigh: (ratio: number) => void): ((ratio: number) => void) => {
  let streak = 0
  let latched = false
  return (ratio) => {
    if (ratio < LOW) {
      latched = false
      streak = 0
    } else if (ratio > HIGH) {
      streak += 1
      if (streak >= 2 && !latched) {
        latched = true
        onHigh(ratio)
      }
    } else {
      streak = 0
    }
  }
}

/** Runs with or without the SDK: the warning needs no backend. The logger is passed in so pino loads after the SDK's hooks. */
export const startHeapWatch = (warn: (fields: Readonly<{ event: string; ratio: number; rss: number }>, message: string) => void): void => {
  const sample = createHeapWatch((ratio) => {
    warn({ event: 'PROCESS_HEAP_HIGH', ratio: Number(ratio.toFixed(3)), rss: process.memoryUsage().rss }, 'PROCESS_HEAP_HIGH')
  })
  setInterval(() => sample(heapUsedRatio()), INTERVAL_MS).unref()
}
