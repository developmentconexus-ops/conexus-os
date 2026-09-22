BEGIN;

-- A new Project is created bound to its repository, in one transaction, so no Project exists
-- without its repository and no binding exists without its Project. The Hub can no longer create
-- a Project any other way.
GRANT ALL ON FUNCTION builder.bind_factory_project(p_project_id uuid, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text) TO project_owner;

CREATE FUNCTION project.create_project_with_repository(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_project_revision text, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM project.create_project_with_source(p_account_id, p_workspace_id, p_key_digest, p_request_digest, p_project_id, p_name, 'NEW', p_head_revision, p_project_revision);
  IF builder.bind_factory_project(p_project_id, p_factory_project_id, p_project_repository_id, p_repository_id, p_head_revision) IS NOT TRUE THEN
    RAISE EXCEPTION 'FACTORY_BINDING_REFUSED' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

ALTER FUNCTION project.create_project_with_repository(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_project_revision text, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text) OWNER TO project_owner;

REVOKE ALL ON FUNCTION project.create_project_with_repository(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_project_revision text, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text) FROM PUBLIC;
GRANT ALL ON FUNCTION project.create_project_with_repository(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_project_revision text, p_factory_project_id text, p_project_repository_id text, p_repository_id text, p_head_revision text) TO hub_project_command;

REVOKE ALL ON FUNCTION project.create_project_with_source(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_name text, p_source_mode text, p_source_revision text, p_project_revision text) FROM hub_project_command;

-- An abandoned attempt was claimed so its host source could be cleaned and its key reused. A
-- reserved attempt now names a repository that may already exist, and only a retry with the same
-- key reaches it again, so a reservation stays until that retry settles it.
DROP FUNCTION project.claim_abandoned_create_project_attempt(p_expired_before timestamp with time zone, p_limit integer);
DROP FUNCTION project.claim_abandoned_create_project_attempt(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_expired_before timestamp with time zone);

COMMIT;
