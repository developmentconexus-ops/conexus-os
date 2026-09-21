BEGIN;

-- Model authentication, credentials and selection belong to Mastra and the Factory (C-022), and the
-- Builder no longer reads a Conexus model connection (0008). This removes the model_connection
-- schema, the one iam function only it called, the connection.share action only it passed, and the
-- two roles that existed for it. Each object is dropped by name rather than by CASCADE, so an object
-- nobody knew about fails this migration instead of disappearing with it.
DROP FUNCTION model_connection.admit_for_project(p_account_id uuid, p_project_id uuid, p_provider_id text);
DROP FUNCTION model_connection.advance_generation(p_connection_id uuid, p_expected_generation bigint, p_next_generation bigint);
DROP FUNCTION model_connection.complete_authorization(p_authorization_id uuid);
DROP FUNCTION model_connection.consume_authorization(p_account_id uuid, p_state_digest bytea);
DROP FUNCTION model_connection.fail_authorization(p_authorization_id uuid);
DROP FUNCTION model_connection.list_connections(p_account_id uuid);
DROP FUNCTION model_connection.publish_connection(p_account_id uuid, p_connection_id uuid, p_provider_id text, p_credential_kind text, p_label text, p_generation bigint);
DROP FUNCTION model_connection.read_connection_credential(p_connection_id uuid);
DROP FUNCTION model_connection.read_current_generation(p_connection_id uuid);
DROP FUNCTION model_connection.revoke_connection(p_account_id uuid, p_connection_id uuid);
DROP FUNCTION model_connection.select_connection(p_account_id uuid, p_connection_id uuid);
DROP FUNCTION model_connection.share_connection(p_owner_account_id uuid, p_connection_id uuid, p_workspace_id uuid);
DROP FUNCTION model_connection.start_authorization(p_authorization_id uuid, p_account_id uuid, p_state_digest bytea, p_pkce_verifier text, p_expires_at timestamp with time zone);
DROP FUNCTION model_connection.unshare_connection(p_actor_account_id uuid, p_connection_id uuid, p_workspace_id uuid);

DROP TABLE model_connection.preference;
DROP TABLE model_connection.workspace_share;
DROP TABLE model_connection.connection;
DROP TABLE model_connection."authorization";

DROP SCHEMA model_connection;

DROP FUNCTION iam.account_is_active(p_account_id uuid);

REVOKE ALL ON FUNCTION iam.visible_projects(p_account_id uuid) FROM model_connection_owner;
REVOKE ALL ON FUNCTION iam.visible_workspaces(p_account_id uuid) FROM model_connection_owner;
REVOKE SELECT ON TABLE project.project FROM model_connection_owner;
REVOKE USAGE ON SCHEMA iam FROM model_connection_owner;
REVOKE USAGE ON SCHEMA project FROM model_connection_owner;
REVOKE USAGE ON SCHEMA iam FROM hub_model_connection;

CREATE TYPE iam.action_new AS ENUM (
    'workspace.read',
    'members.manage',
    'project.create',
    'project.build'
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

-- Roles are cluster-global. Another install on the same cluster that has not reached this migration
-- still holds grants to these roles, and dropping them would fail every install at once, so a role
-- another database still depends on is left for that database's own run of this migration.
DO $$ BEGIN
  DROP ROLE IF EXISTS hub_model_connection;
EXCEPTION WHEN dependent_objects_still_exist THEN NULL;
END $$;
DO $$ BEGIN
  DROP ROLE IF EXISTS model_connection_owner;
EXCEPTION WHEN dependent_objects_still_exist THEN NULL;
END $$;

COMMIT;
