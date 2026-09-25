BEGIN;

-- A new invitation can appear between the grant lock and the claim's DELETE statement.
-- Lock every open grant for this account, even when no invitation was visible at the lock's
-- snapshot, so a concurrent revoke cannot pass the claim before its insert settles. The grants are
-- locked in grant_id order, the same order 0027 uses, so concurrent claims never deadlock on them.
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
  FROM iam.application_grant AS access_grant
  WHERE access_grant.account_id = p_account_id AND access_grant.revoked_at IS NULL
  ORDER BY access_grant.grant_id
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
