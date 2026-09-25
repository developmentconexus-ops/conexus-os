BEGIN;

-- iam.claim_application_invitations's NOT EXISTS guard against a revoke takes its own snapshot, so a
-- revoke that already updated the grant row but has not committed is invisible to it: the claim
-- proceeds, the revoke commits after, and the account keeps an open grant the revoke already ended.
-- Locking the account's open grant for every project this claim could open, before touching an
-- invitation, forces the claim to wait behind an in-flight revoke on that same row and then re-read it
-- once the revoke settles, in the same order the revoke itself locks: the grant row, then the
-- invitation row.
CREATE OR REPLACE FUNCTION iam.claim_application_invitations(p_account_id uuid, p_verified_email text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  claimed_count integer;
BEGIN
  IF p_verified_email IS NULL THEN
    RETURN 0;
  END IF;
  PERFORM 1
  FROM iam.application_invitation AS invitation
  JOIN iam.application_grant AS access_grant
    ON access_grant.project_id = invitation.project_id AND access_grant.account_id = p_account_id
      AND access_grant.revoked_at IS NULL
  WHERE invitation.email = lower(btrim(p_verified_email)) AND invitation.expires_at > clock_timestamp()
  FOR UPDATE OF access_grant;
  WITH claimed AS (
    DELETE FROM iam.application_invitation AS invitation
    WHERE invitation.email = lower(btrim(p_verified_email))
      AND invitation.expires_at > clock_timestamp()
    RETURNING invitation.project_id, invitation.invited_by, invitation.created_at
  ), granted AS (
    INSERT INTO iam.application_grant (project_id, account_id, granted_by)
    SELECT claimed.project_id, p_account_id, claimed.invited_by FROM claimed
    WHERE NOT EXISTS (
      SELECT 1 FROM iam.application_grant AS revoked
      WHERE revoked.project_id = claimed.project_id AND revoked.account_id = p_account_id
        AND revoked.revoked_at >= claimed.created_at)
    ON CONFLICT (project_id, account_id) WHERE revoked_at IS NULL DO NOTHING
    RETURNING iam.application_grant.grant_id
  )
  SELECT count(*) FROM claimed INTO claimed_count;
  RETURN claimed_count;
END;
$$;

COMMIT;
