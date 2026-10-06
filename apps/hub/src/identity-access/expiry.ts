import { sql } from '../platform/db.js'
import type { Database, Sql } from '../platform/db.js'
import type { Job } from '../platform/jobs.js'
import { logLine } from '../platform/logger.js'
import { admitSystem } from './admission.js'

const REAP_EVERY_MS = 5 * 60_000
/** Rows one rule takes in one pass; a backlog drains over later passes. */
const REAP_LIMIT = 500

/**
 * When an identity row is gone, one rule per table. A session's Previews and handoffs go with it by
 * cascade. An invitation nobody claimed shows as expired for 30 days, so the person can invite again.
 */
const EXPIRY_RULES = [
  { table: 'handoff', remove: (limit: number): Sql => sql`
    DELETE FROM iam.handoff WHERE handoff_digest IN (
      SELECT handoff_digest FROM iam.handoff WHERE expires_at <= now()
      ORDER BY expires_at, handoff_digest LIMIT ${limit} FOR UPDATE SKIP LOCKED)` },
  { table: 'host_session', remove: (limit: number): Sql => sql`
    DELETE FROM iam.host_session WHERE token_digest IN (
      SELECT token_digest FROM iam.host_session WHERE absolute_expires_at <= now() OR idle_expires_at <= now()
      ORDER BY absolute_expires_at, token_digest LIMIT ${limit} FOR UPDATE SKIP LOCKED)` },
  { table: 'oidc_transaction', remove: (limit: number): Sql => sql`
    DELETE FROM iam.oidc_transaction WHERE state_digest IN (
      SELECT state_digest FROM iam.oidc_transaction WHERE expires_at <= now()
      ORDER BY expires_at, state_digest LIMIT ${limit} FOR UPDATE SKIP LOCKED)` },
  { table: 'workspace_invitation', remove: (limit: number): Sql => sql`
    DELETE FROM iam.workspace_invitation WHERE invitation_id IN (
      SELECT invitation_id FROM iam.workspace_invitation WHERE expires_at <= now() - interval '30 days'
      ORDER BY expires_at, invitation_id LIMIT ${limit} FOR UPDATE SKIP LOCKED)` },
  { table: 'application_invitation', remove: (limit: number): Sql => sql`
    DELETE FROM iam.application_invitation WHERE invitation_id IN (
      SELECT invitation_id FROM iam.application_invitation WHERE expires_at <= now() - interval '30 days'
      ORDER BY expires_at, invitation_id LIMIT ${limit} FOR UPDATE SKIP LOCKED)` },
] as const

type Reaped = Readonly<{ table: (typeof EXPIRY_RULES)[number]['table']; removed: number }>

/**
 * One pass: at most one batch per rule, in one entry, then one IAM_REAPED line per rule with its count.
 * @public Tests call it through the built Hub.
 */
export const reapExpired = async (database: Database, limit: number = REAP_LIMIT): Promise<readonly Reaped[]> => {
  const counts = await database.system('iam-reaper', async (gate) => {
    const { tx } = await admitSystem(gate, 'iam-reaper')
    const reaped: Reaped[] = []
    for (const rule of EXPIRY_RULES) reaped.push({ table: rule.table, removed: await tx.run(rule.remove(limit)) })
    return reaped
  })
  for (const { table, removed } of counts) logLine('IAM_REAPED', { table, removed })
  return counts
}

export const iamReaperJob = (database: Database): Job => ({
  name: 'iam-reaper',
  everyMs: REAP_EVERY_MS,
  run: async () => { await reapExpired(database) },
})
