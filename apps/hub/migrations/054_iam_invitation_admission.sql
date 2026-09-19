BEGIN;

SET LOCAL ROLE iam_owner;

-- The callback must decide eligibility before it mints anything, and 052 revoked every
-- direct privilege on iam.workspace_invitation. This answers the one question the callback
-- asks and discloses nothing else: no Workspace, no role, no inviter, no count.
CREATE FUNCTION iam.email_has_open_invitation(p_verified_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM iam.workspace_invitation AS invitation
    WHERE p_verified_email IS NOT NULL
      AND invitation.email = lower(btrim(p_verified_email))
      AND invitation.expires_at > clock_timestamp());
$$;

REVOKE EXECUTE ON FUNCTION iam.email_has_open_invitation(text) FROM PUBLIC;

-- The last caller of iam.list_workspace_memberships now joins iam.visible_workspaces, which
-- answers the same question and also excludes an inactive account. Nothing else names it.
DO $$
BEGIN
  IF to_regprocedure('iam.list_workspace_memberships(uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_054_MEMBERSHIP_READ_ALREADY_ABSENT';
  END IF;
END $$;

DROP FUNCTION iam.list_workspace_memberships(uuid);

RESET ROLE;

GRANT EXECUTE ON FUNCTION iam.email_has_open_invitation(text) TO hub_iam_runtime;

COMMIT;
