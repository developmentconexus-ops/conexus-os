BEGIN;

-- iam.action carried two values, project.read and project.change, that no function ever passed:
-- Project reads are gated by containment through iam.visible_projects, not by an action. Postgres
-- cannot drop an enum value in place, so this rebuilds the type under a temporary name, repoints
-- every function typed on it, drops the old type, and renames the new one into its place.
CREATE TYPE iam.action_new AS ENUM (
    'workspace.read',
    'members.manage',
    'project.create',
    'project.build',
    'connection.share'
);

ALTER TYPE iam.action_new OWNER TO iam_owner;

DROP FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action);
DROP FUNCTION iam.admit_workspace(p_account_id uuid, p_workspace_id uuid, p_action iam.action);
DROP FUNCTION iam.role_allows(p_role iam.workspace_role, p_action iam.action);

DROP TYPE iam.action;

ALTER TYPE iam.action_new RENAME TO action;

CREATE FUNCTION iam.role_allows(p_role iam.workspace_role, p_action iam.action) RETURNS boolean
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN true
    WHEN 'member' THEN p_action <> 'members.manage'
  END;
$$;

ALTER FUNCTION iam.role_allows(p_role iam.workspace_role, p_action iam.action) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.role_allows(p_role iam.workspace_role, p_action iam.action) FROM PUBLIC;

CREATE FUNCTION iam.admit_workspace(p_account_id uuid, p_workspace_id uuid, p_action iam.action) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
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

ALTER FUNCTION iam.admit_workspace(p_account_id uuid, p_workspace_id uuid, p_action iam.action) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.admit_workspace(p_account_id uuid, p_workspace_id uuid, p_action iam.action) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.admit_workspace(p_account_id uuid, p_workspace_id uuid, p_action iam.action) TO project_owner;
GRANT ALL ON FUNCTION iam.admit_workspace(p_account_id uuid, p_workspace_id uuid, p_action iam.action) TO builder_owner;
GRANT ALL ON FUNCTION iam.admit_workspace(p_account_id uuid, p_workspace_id uuid, p_action iam.action) TO model_connection_owner;

CREATE FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  owning_workspace_id uuid;
BEGIN
  PERFORM 1
  FROM iam.account AS locked_account
  WHERE locked_account.account_id = p_account_id
  FOR SHARE;

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

ALTER FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action) TO project_owner;
GRANT ALL ON FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action) TO builder_owner;
GRANT ALL ON FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action) TO model_connection_owner;

COMMIT;
