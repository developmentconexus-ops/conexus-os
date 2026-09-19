BEGIN;

SET LOCAL ROLE iam_owner;

CREATE TYPE iam.workspace_role AS ENUM ('owner', 'member');

CREATE TYPE iam.action AS ENUM (
  'workspace.read',
  'members.manage',
  'project.create',
  'project.read',
  'project.change',
  'project.build',
  'connection.share'
);

-- Every membership row that exists today was written by the Workspace creator path, so the
-- backfill value is 'owner'. The standing default drops to 'member' rather than away, because
-- 052 switches no caller: a writer that still omits the column has to fail closed, and taking
-- the default off entirely would refuse writers that 053 has not migrated yet.
ALTER TABLE iam.workspace_membership ADD COLUMN role iam.workspace_role NOT NULL DEFAULT 'owner';
ALTER TABLE iam.workspace_membership ALTER COLUMN role SET DEFAULT 'member';
CREATE INDEX workspace_membership_by_workspace ON iam.workspace_membership (workspace_id, role);

CREATE TABLE iam.workspace_invitation (
  invitation_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+$'),
  role iam.workspace_role NOT NULL,
  invited_by uuid NOT NULL REFERENCES iam.account(account_id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  UNIQUE (workspace_id, email)
);

ALTER TABLE iam.bootstrap_context ADD COLUMN verified_email text;

CREATE FUNCTION iam.role_allows(p_role iam.workspace_role, p_action iam.action)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN true
    WHEN 'member' THEN p_action <> 'members.manage'
  END;
$$;

CREATE FUNCTION iam.admit_workspace(p_account_id uuid, p_workspace_id uuid, p_action iam.action)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM iam.account AS admitted_account
  JOIN iam.workspace_membership AS membership
    ON membership.account_id = admitted_account.account_id
  WHERE admitted_account.account_id = p_account_id
    AND admitted_account.active
    AND membership.workspace_id = p_workspace_id
    AND iam.role_allows(membership.role, p_action)
  FOR SHARE OF admitted_account, membership;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  owning_workspace_id uuid;
BEGIN
  SELECT stored_project.workspace_id INTO owning_workspace_id
  FROM project.project AS stored_project
  WHERE stored_project.project_id = p_project_id;
  IF owning_workspace_id IS NULL THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;
  PERFORM iam.admit_workspace(p_account_id, owning_workspace_id, p_action);
  RETURN owning_workspace_id;
END;
$$;

CREATE FUNCTION iam.visible_workspaces(p_account_id uuid)
RETURNS TABLE(workspace_id uuid, role iam.workspace_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT membership.workspace_id, membership.role
  FROM iam.workspace_membership AS membership
  JOIN iam.account AS admitted_account
    ON admitted_account.account_id = membership.account_id AND admitted_account.active
  WHERE membership.account_id = p_account_id;
$$;

CREATE FUNCTION iam.visible_projects(p_account_id uuid)
RETURNS TABLE(project_id uuid, workspace_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT stored_project.project_id, stored_project.workspace_id
  FROM project.project AS stored_project
  JOIN iam.visible_workspaces(p_account_id) AS visible
    ON visible.workspace_id = stored_project.workspace_id;
$$;

CREATE FUNCTION iam.list_workspace_roster(p_actor uuid, p_workspace_id uuid)
RETURNS TABLE(
  kind text,
  account_id uuid,
  invitation_id uuid,
  display_name text,
  email text,
  role iam.workspace_role,
  since timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT 'member'::text, member_account.account_id, NULL::uuid, member_account.display_name,
         member_account.email, membership.role, membership.created_at, NULL::timestamptz
  FROM iam.workspace_membership AS membership
  JOIN iam.account AS member_account ON member_account.account_id = membership.account_id
  WHERE membership.workspace_id = p_workspace_id
    AND p_workspace_id IN (SELECT visible.workspace_id FROM iam.visible_workspaces(p_actor) AS visible)
  UNION ALL
  SELECT 'invitation'::text, NULL::uuid, invitation.invitation_id, NULL::text,
         invitation.email, invitation.role, invitation.created_at, invitation.expires_at
  FROM iam.workspace_invitation AS invitation
  WHERE invitation.workspace_id = p_workspace_id
    AND p_workspace_id IN (SELECT visible.workspace_id FROM iam.visible_workspaces(p_actor) AS visible);
$$;

CREATE FUNCTION iam.invite_workspace_member(
  p_actor uuid,
  p_workspace_id uuid,
  p_invitation_id uuid,
  p_email text,
  p_role iam.workspace_role,
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  settled_invitation_id uuid;
BEGIN
  PERFORM iam.admit_workspace(p_actor, p_workspace_id, 'members.manage');
  INSERT INTO iam.workspace_invitation (invitation_id, workspace_id, email, role, invited_by, expires_at)
  VALUES (p_invitation_id, p_workspace_id, lower(btrim(p_email)), p_role, p_actor, p_expires_at)
  ON CONFLICT (workspace_id, email) DO UPDATE
    SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at
  RETURNING iam.workspace_invitation.invitation_id INTO settled_invitation_id;
  RETURN settled_invitation_id;
END;
$$;

CREATE FUNCTION iam.cancel_workspace_invitation(p_actor uuid, p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  invited_workspace_id uuid;
BEGIN
  SELECT invitation.workspace_id INTO invited_workspace_id
  FROM iam.workspace_invitation AS invitation
  WHERE invitation.invitation_id = p_invitation_id;
  IF invited_workspace_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM iam.admit_workspace(p_actor, invited_workspace_id, 'members.manage');
  DELETE FROM iam.workspace_invitation AS invitation
  WHERE invitation.invitation_id = p_invitation_id;
END;
$$;

CREATE FUNCTION iam.set_workspace_member_role(
  p_actor uuid,
  p_workspace_id uuid,
  p_member uuid,
  p_role iam.workspace_role
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM iam.workspace_membership AS owner_membership
  WHERE owner_membership.workspace_id = p_workspace_id AND owner_membership.role = 'owner'
  ORDER BY owner_membership.account_id
  FOR UPDATE;

  PERFORM iam.admit_workspace(p_actor, p_workspace_id, 'members.manage');

  IF p_role <> 'owner'
    AND EXISTS (
      SELECT 1 FROM iam.workspace_membership AS target_membership
      WHERE target_membership.workspace_id = p_workspace_id
        AND target_membership.account_id = p_member
        AND target_membership.role = 'owner')
    AND NOT EXISTS (
      SELECT 1 FROM iam.workspace_membership AS other_owner
      WHERE other_owner.workspace_id = p_workspace_id
        AND other_owner.role = 'owner'
        AND other_owner.account_id <> p_member)
  THEN
    RAISE EXCEPTION 'LAST_OWNER' USING ERRCODE = '42501';
  END IF;

  UPDATE iam.workspace_membership AS membership
  SET role = p_role
  WHERE membership.workspace_id = p_workspace_id AND membership.account_id = p_member;
END;
$$;

CREATE FUNCTION iam.remove_workspace_member(p_actor uuid, p_workspace_id uuid, p_member uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM iam.workspace_membership AS owner_membership
  WHERE owner_membership.workspace_id = p_workspace_id AND owner_membership.role = 'owner'
  ORDER BY owner_membership.account_id
  FOR UPDATE;

  IF p_actor = p_member THEN
    PERFORM iam.admit_workspace(p_actor, p_workspace_id, 'workspace.read');
  ELSE
    PERFORM iam.admit_workspace(p_actor, p_workspace_id, 'members.manage');
  END IF;

  IF EXISTS (
      SELECT 1 FROM iam.workspace_membership AS target_membership
      WHERE target_membership.workspace_id = p_workspace_id
        AND target_membership.account_id = p_member
        AND target_membership.role = 'owner')
    AND NOT EXISTS (
      SELECT 1 FROM iam.workspace_membership AS other_owner
      WHERE other_owner.workspace_id = p_workspace_id
        AND other_owner.role = 'owner'
        AND other_owner.account_id <> p_member)
  THEN
    RAISE EXCEPTION 'LAST_OWNER' USING ERRCODE = '42501';
  END IF;

  DELETE FROM iam.workspace_membership AS membership
  WHERE membership.workspace_id = p_workspace_id AND membership.account_id = p_member;
END;
$$;

CREATE FUNCTION iam.claim_invitations(p_account_id uuid, p_verified_email text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  claimed_count integer;
BEGIN
  IF p_verified_email IS NULL THEN
    RETURN 0;
  END IF;
  WITH claimed AS (
    DELETE FROM iam.workspace_invitation AS invitation
    WHERE invitation.email = lower(btrim(p_verified_email))
      AND invitation.expires_at > clock_timestamp()
    RETURNING invitation.workspace_id, invitation.role
  ), admitted AS (
    INSERT INTO iam.workspace_membership (account_id, workspace_id, can_create_project, role)
    SELECT p_account_id, claimed.workspace_id, true, claimed.role FROM claimed
    ON CONFLICT (account_id, workspace_id) DO NOTHING
    RETURNING iam.workspace_membership.workspace_id
  )
  SELECT count(*) FROM claimed INTO claimed_count;
  RETURN claimed_count;
END;
$$;

CREATE OR REPLACE FUNCTION iam.establish_workspace_creator_access(p_account_id uuid, p_workspace_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO iam.workspace_membership (account_id, workspace_id, can_create_project, role)
  VALUES (p_account_id, p_workspace_id, true, 'owner');
$$;

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(format('%s/%s', ungranted.account_id, ungranted.project_id), ', '
                    ORDER BY ungranted.account_id, ungranted.project_id)
  INTO offending
  FROM (
    SELECT project_grant.account_id, project_grant.project_id
    FROM iam.account_project_grant AS project_grant
    JOIN project.project AS stored_project ON stored_project.project_id = project_grant.project_id
    WHERE NOT EXISTS (
      SELECT 1 FROM iam.workspace_membership AS membership
      WHERE membership.account_id = project_grant.account_id
        AND membership.workspace_id = stored_project.workspace_id)
    UNION
    SELECT builder_grant.account_id, builder_grant.project_id
    FROM iam.project_builder_grant AS builder_grant
    JOIN project.project AS stored_project ON stored_project.project_id = builder_grant.project_id
    WHERE NOT EXISTS (
      SELECT 1 FROM iam.workspace_membership AS membership
      WHERE membership.account_id = builder_grant.account_id
        AND membership.workspace_id = stored_project.workspace_id)
  ) AS ungranted;
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_052_GRANT_WITHOUT_MEMBERSHIP_REFUSED: %', offending;
  END IF;
END $$;

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(format('%s=%s', crowded.workspace_id, crowded.membership_count), ', '
                    ORDER BY crowded.workspace_id)
  INTO offending
  FROM (
    SELECT membership.workspace_id, count(*) AS membership_count
    FROM iam.workspace_membership AS membership
    GROUP BY membership.workspace_id
    HAVING count(*) > 1
  ) AS crowded;
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_052_WORKSPACE_MULTIPLE_MEMBERSHIPS_REFUSED: %', offending;
  END IF;
END $$;

REVOKE ALL ON iam.workspace_invitation FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.role_allows(iam.workspace_role, iam.action) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.admit_workspace(uuid, uuid, iam.action) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.admit_project(uuid, uuid, iam.action) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.visible_workspaces(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.visible_projects(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.list_workspace_roster(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.invite_workspace_member(uuid, uuid, uuid, text, iam.workspace_role, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.cancel_workspace_invitation(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.set_workspace_member_role(uuid, uuid, uuid, iam.workspace_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.remove_workspace_member(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.claim_invitations(uuid, text) FROM PUBLIC;

RESET ROLE;

GRANT EXECUTE ON FUNCTION iam.admit_workspace(uuid, uuid, iam.action),
  iam.admit_project(uuid, uuid, iam.action),
  iam.visible_workspaces(uuid),
  iam.visible_projects(uuid)
  TO project_owner, builder_owner, claude_connection_owner;

GRANT EXECUTE ON FUNCTION iam.list_workspace_roster(uuid, uuid),
  iam.invite_workspace_member(uuid, uuid, uuid, text, iam.workspace_role, timestamptz),
  iam.cancel_workspace_invitation(uuid, uuid),
  iam.set_workspace_member_role(uuid, uuid, uuid, iam.workspace_role),
  iam.remove_workspace_member(uuid, uuid, uuid),
  iam.claim_invitations(uuid, text)
  TO hub_iam_runtime;

COMMIT;
