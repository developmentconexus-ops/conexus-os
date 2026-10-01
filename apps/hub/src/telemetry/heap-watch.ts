import { getHeapStatistics } from 'node:v8'

const HIGH = 0.8
const LOW = 0.7
const INTERVAL_MS = 15_000

const MEGABYTE = 1024 * 1024

/** @public Tests import this at runtime from the built module. The last --max-old-space-size (MB) in the arguments, or null when none is set. */
export const oldSpaceCapBytes = (execArgv: readonly string[], nodeOptions: string | undefined): number | null => {
  const flags = [...execArgv, ...(nodeOptions?.split(/\s+/) ?? [])]
  let megabytes: number | null = null
  for (const flag of flags) {
    const match = /^--max[-_]old[-_]space[-_]size=(\d+)$/.exec(flag)
    if (match) megabytes = Number(match[1])
  }
  return megabytes === null ? null : megabytes * MEGABYTE
}

// V8 dies when used heap reaches the old-space cap, which is below heap_size_limit (the cap plus the
// young generation), so the ratio divides by the cap. Read once at start.
const denominator = oldSpaceCapBytes(process.execArgv, process.env.NODE_OPTIONS) ?? getHeapStatistics().heap_size_limit

export const heapUsedRatio = (): number => getHeapStatistics().used_heap_size / denominator

/** @public Tests import this at runtime from the built module. Fires once after two samples in a row above 0.8, and again only after the ratio fell below 0.7. */
export const createHeapWatch = (onHigh: (ratio: number) => void): ((ratio: number) => void) => {
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
