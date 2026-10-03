import { getHeapStatistics } from 'node:v8'

const MEGABYTE = 1024 * 1024

/** The --max-old-space-size (MB) V8 applies, or null when none is set. */
const oldSpaceCapBytes = (execArgv: readonly string[], nodeOptions: string | undefined): number | null => {
  // The command line wins over NODE_OPTIONS and the last flag wins within each (spec 0007, probe P6).
  const flags = [...(nodeOptions?.split(/\s+/) ?? []), ...execArgv]
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
