import { z } from 'zod'
import type { Job } from '../platform/jobs.js'
import { logLine } from '../platform/logger.js'
import type { PostgresPool } from '../platform/db.js'

const REAP_EVERY_MS = 5 * 60_000
/** Root rows one rule takes in one call; a backlog drains over later passes. */
const REAP_LIMIT = 500

// The database function owns the list of relations and each rule's deadline; the Hub only reports what it did.
const reaped = z.array(z.object({
  relation: z.string(),
  action: z.enum(['DELETED', 'ENDED']),
  removed: z.number().int().nonnegative(),
}))

/** The one way an expired identity row goes: `iam.reap_expired`, once per pass. */
export const iamReaperJob = (pool: PostgresPool): Job => ({
  name: 'iam-reaper',
  everyMs: REAP_EVERY_MS,
  run: async () => {
    const result = await pool.query('SELECT relation, action, removed FROM iam.reap_expired($1, $2)', [new Date(), REAP_LIMIT])
    for (const { relation, action, removed } of reaped.parse(result.rows)) {
      if (removed > 0) logLine('IAM_EXPIRED_REAPED', { relation, action, removed })
    }
  },
})
