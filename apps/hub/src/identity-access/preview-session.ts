import { z } from 'zod'
import type { ArtifactRevisionId } from '@conexus/contract'
import { digest, sql } from '../platform/db.js'
import type { RawToken } from '../platform/db.js'
import { Failure } from '../platform/failure.js'
import type { HostOutcome, HostRequest } from '../platform/host-outcome.js'
import { PREVIEW_HANDOFF_SECONDS, PREVIEW_SECONDS } from '../platform/lifetimes.js'
import { mintToken } from '../platform/opaque-token.js'
import { admitAccount, checkProject } from './admission.js'
import type { Admitted, Checked, ProjectScope } from './admission.js'
import { consumePreviewHandoff, readPreviewSession } from './authentication.js'
import type { HubSessionDigest } from './current-session.js'
import { callerOf, MaxAge } from './session-core.js'
import type { Redeemed, SessionCore, SessionDependencies, Step } from './session-core.js'

const Expiry = z.object({ expires_at: z.date() })

/** The Preview session: opened from a Hub session's launch, redeemed on its own host, checked on every request with its parent. */
export const createPreviewSessions = ({ database }: SessionDependencies, { ended, settle }: SessionCore) => {
  /** Mints the entry handoff of a Preview under the launch's own admission, so the launch cannot disagree with it. */
  const openPreview = async (proof: Admitted<ProjectScope<'project.read'>>, hubSession: HubSessionDigest, artifactRevisionId: ArtifactRevisionId): Promise<Readonly<{ entryGrant: RawToken; expiresAt: Date }>> => {
    const entryGrant = mintToken()
    const { expires_at: expiresAt } = await proof.tx.one(Expiry, sql`
      INSERT INTO iam.handoff (handoff_digest, kind, account_id, project_id, artifact_revision_id, parent_digest, minted_at, expires_at, session_expires_at)
      VALUES (${digest(entryGrant)}, 'PREVIEW', ${proof.scope.accountId}, ${proof.scope.projectId}, ${artifactRevisionId}, ${hubSession},
        now(), now() + make_interval(secs => ${PREVIEW_HANDOFF_SECONDS}), now() + make_interval(secs => ${PREVIEW_SECONDS}))
      RETURNING session_expires_at AS expires_at`, 'INTERNAL_UNEXPECTED')
    return { entryGrant, expiresAt }
  }

  const redeemPreview = (input: Readonly<{ handoff: RawToken; artifactRevisionId: ArtifactRevisionId }>): Promise<Redeemed | null> =>
    database.authenticate(async (gate) => {
      const handoff = await consumePreviewHandoff(gate, digest(input.handoff), input.artifactRevisionId)
      if (!handoff) return null
      const proof = await admitAccount(gate)
      const sessionToken = mintToken()
      const { max_age: maxAge } = await proof.tx.one(MaxAge, sql`
        INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, project_id, artifact_revision_id, parent_digest)
        VALUES (${digest(sessionToken)}, 'PREVIEW', ${proof.scope.accountId}, now(), ${handoff.session_expires_at}::timestamptz, ${handoff.project_id},
          ${handoff.artifact_revision_id}, ${handoff.parent_digest})
        RETURNING greatest(1, floor(extract(epoch FROM absolute_expires_at - now())))::int AS max_age`, 'INTERNAL_UNEXPECTED')
      return { sessionToken, maxAgeSeconds: maxAge }
    })

  /**
   * A Preview request: the session, its parent Hub session's standing and due check, and the Project's
   * membership, in one entry with the served reads. A Preview does not slide its parent. A refused
   * check ends the Preview only; an ended parent ends both.
   */
  const withPreviewRequest = <T>(presented: Readonly<{ artifactRevisionId: ArtifactRevisionId; token: RawToken }>, serve: (request: HostRequest<Checked<ProjectScope<'project.read'>>>) => Promise<T>): Promise<HostOutcome<T>> => {
    const key = digest(presented.token)
    return settle<T>('HUB', (recheckAllowed) => database.authenticate(async (gate): Promise<Step<T>> => {
      const row = await readPreviewSession(gate, key, presented.artifactRevisionId)
      if (!row) return { kind: 'absent' }
      if (row.liveness !== 'LIVE') return ended(gate, key, 'PREVIEW', 'ABSOLUTE_EXPIRED')
      if (row.parent_liveness !== 'LIVE') return ended(gate, row.parent_digest, 'HUB', row.parent_liveness)
      if (!row.parent_active) return ended(gate, row.parent_digest, 'HUB', 'ACCOUNT_INACTIVE')
      if (!row.parent_entry) return ended(gate, row.parent_digest, 'HUB', 'HUB_ENTRY_WITHDRAWN')
      if (recheckAllowed && row.parent_recheck_due) {
        return { kind: 'due', due: { digest: row.parent_digest, seen: row.parent_checked_at, sealedToken: row.parent_sealed_token, subject: row.subject } }
      }
      const checked = await checkProject(gate, row.project_id).catch((error: unknown) => {
        if (error instanceof Failure && error.id === 'PROJECT_NOT_FOUND') return null
        throw error
      })
      if (!checked) return ended(gate, key, 'PREVIEW', 'ACCESS_REFUSED')
      return { kind: 'done', value: await serve({ caller: callerOf(row), checked }) }
    }))
  }

  return Object.freeze({ openPreview, redeemPreview, withPreviewRequest })
}
