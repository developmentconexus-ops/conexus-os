BEGIN;

-- An invitation nobody accepted in time shows as expired for 30 days (the reaper then removes it), with a
-- way to invite the same person again. The state is decided here, by the database clock, never in the
-- browser. Member, grant and application rows carry none.

DROP FUNCTION iam.list_workspace_roster(p_actor uuid, p_workspace_id uuid);
CREATE FUNCTION iam.list_workspace_roster(p_actor uuid, p_workspace_id uuid) RETURNS TABLE(kind text, account_id uuid, invitation_id uuid, display_name text, email text, role iam.workspace_role, since timestamp with time zone, expires_at timestamp with time zone, state text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT 'member'::text, member_account.account_id, NULL::uuid, member_account.display_name,
         member_account.email, membership.role, membership.created_at, NULL::timestamptz, NULL::text
  FROM iam.workspace_membership AS membership
  JOIN iam.account AS member_account ON member_account.account_id = membership.account_id
  WHERE membership.workspace_id = p_workspace_id
    AND p_workspace_id IN (SELECT visible.workspace_id FROM iam.visible_workspaces(p_actor) AS visible)
  UNION ALL
  SELECT 'invitation'::text, NULL::uuid, invitation.invitation_id, NULL::text,
         invitation.email, invitation.role, invitation.created_at, invitation.expires_at,
         CASE WHEN invitation.expires_at > clock_timestamp() THEN 'PENDING' ELSE 'EXPIRED' END
  FROM iam.workspace_invitation AS invitation
  WHERE invitation.workspace_id = p_workspace_id
    AND p_workspace_id IN (SELECT visible.workspace_id FROM iam.visible_workspaces(p_actor) AS visible);
$$;
ALTER FUNCTION iam.list_workspace_roster(p_actor uuid, p_workspace_id uuid) OWNER TO iam_owner;
REVOKE ALL ON FUNCTION iam.list_workspace_roster(p_actor uuid, p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.list_workspace_roster(p_actor uuid, p_workspace_id uuid) TO hub_iam_runtime;

DROP FUNCTION iam.list_application_access(p_actor uuid, p_project_id uuid);
CREATE FUNCTION iam.list_application_access(p_actor uuid, p_project_id uuid) RETURNS TABLE(kind text, entry_id uuid, account_id uuid, display_name text, email text, since timestamp with time zone, expires_at timestamp with time zone, slug text, state text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM iam.admit_application_owner(p_actor, p_project_id);
  RETURN QUERY
  SELECT 'application'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, application.created_at, NULL::timestamptz, application.slug, NULL::text
  FROM iam.application AS application
  WHERE application.project_id = p_project_id
  UNION ALL
  SELECT 'grant'::text, access_grant.grant_id, grantee.account_id, grantee.display_name, grantee.email, access_grant.granted_at, NULL::timestamptz, NULL::text, NULL::text
  FROM iam.application_grant AS access_grant
  JOIN iam.account AS grantee ON grantee.account_id = access_grant.account_id
  WHERE access_grant.project_id = p_project_id AND access_grant.revoked_at IS NULL
  UNION ALL
  SELECT 'invitation'::text, invitation.invitation_id, NULL::uuid, NULL::text, invitation.email, invitation.created_at, invitation.expires_at, NULL::text,
         CASE WHEN invitation.expires_at > clock_timestamp() THEN 'PENDING' ELSE 'EXPIRED' END
  FROM iam.application_invitation AS invitation
  WHERE invitation.project_id = p_project_id;
END;
$$;
ALTER FUNCTION iam.list_application_access(p_actor uuid, p_project_id uuid) OWNER TO iam_owner;
REVOKE ALL ON FUNCTION iam.list_application_access(p_actor uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.list_application_access(p_actor uuid, p_project_id uuid) TO hub_iam_runtime;

-- Inviting the same person again moves the invited date, as granting application access already does,
-- so `since` names the latest invitation in both lists.
CREATE OR REPLACE FUNCTION iam.invite_workspace_member(p_actor uuid, p_workspace_id uuid, p_invitation_id uuid, p_email text, p_role iam.workspace_role, p_expires_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  settled_invitation_id uuid;
BEGIN
  PERFORM iam.admit_workspace(p_actor, p_workspace_id, 'members.manage');
  INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, expires_at)
  VALUES (p_invitation_id, p_workspace_id, lower(btrim(p_email)), p_role, p_actor, p_expires_at)
  ON CONFLICT (workspace_id, email) DO UPDATE
    SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at, created_at = clock_timestamp()
  RETURNING iam.workspace_invitation.invitation_id INTO settled_invitation_id;
  RETURN settled_invitation_id;
END;
$$;

COMMIT;
