BEGIN;

DO $$ BEGIN
  CREATE ROLE hub_s3_read LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON SCHEMA iam, project, workspace FROM PUBLIC;
GRANT USAGE ON SCHEMA iam, project TO hub_s3_read;

SET LOCAL ROLE iam_owner;

CREATE FUNCTION iam.list_workspace_readable_project_ids(
  p_account_id uuid,
  p_workspace_id uuid
) RETURNS TABLE(project_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT project_grant.project_id
  FROM iam.account_project_grant AS project_grant
  JOIN project.project AS stored_project
    ON stored_project.project_id = project_grant.project_id
  JOIN iam.workspace_membership AS membership
    ON membership.account_id = project_grant.account_id
    AND membership.workspace_id = stored_project.workspace_id
  WHERE membership.account_id = p_account_id
    AND stored_project.workspace_id = p_workspace_id
    AND project_grant.can_read;
$$;

CREATE FUNCTION iam.admit_project_read(
  p_account_id uuid,
  p_project_id uuid
) RETURNS TABLE(project_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT project_grant.project_id
  FROM iam.account_project_grant AS project_grant
  JOIN project.project AS stored_project
    ON stored_project.project_id = project_grant.project_id
  JOIN iam.workspace_membership AS membership
    ON membership.account_id = project_grant.account_id
    AND membership.workspace_id = stored_project.workspace_id
  WHERE membership.account_id = p_account_id
    AND project_grant.project_id = p_project_id
    AND project_grant.can_read;
$$;

REVOKE EXECUTE ON FUNCTION iam.list_workspace_readable_project_ids(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.admit_project_read(uuid, uuid) FROM PUBLIC;

RESET ROLE;
SET LOCAL ROLE project_owner;

CREATE FUNCTION project.list_project_summaries(
  p_workspace_id uuid,
  p_project_ids uuid[]
) RETURNS TABLE(project_id uuid, workspace_id uuid, name text, archived boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT stored_project.project_id, stored_project.workspace_id,
    stored_project.name, stored_project.archived
  FROM project.project AS stored_project
  WHERE stored_project.workspace_id = p_workspace_id
    AND stored_project.project_id = ANY(p_project_ids)
  ORDER BY stored_project.name, stored_project.project_id;
$$;

CREATE FUNCTION project.get_project_representation(
  p_project_id uuid,
  p_admitted_project_ids uuid[]
) RETURNS TABLE(
  project_id uuid,
  workspace_id uuid,
  name text,
  project_revision text,
  archived boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT stored_project.project_id, stored_project.workspace_id,
    stored_project.name, stored_project.project_revision, stored_project.archived
  FROM project.project AS stored_project
  WHERE stored_project.project_id = p_project_id
    AND stored_project.project_id = ANY(p_admitted_project_ids);
$$;

REVOKE EXECUTE ON FUNCTION project.list_project_summaries(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.get_project_representation(uuid, uuid[]) FROM PUBLIC;

RESET ROLE;

GRANT EXECUTE ON FUNCTION iam.list_workspace_readable_project_ids(uuid, uuid) TO hub_s3_read;
GRANT EXECUTE ON FUNCTION iam.admit_project_read(uuid, uuid) TO hub_s3_read;
GRANT EXECUTE ON FUNCTION project.list_project_summaries(uuid, uuid[]) TO hub_s3_read;
GRANT EXECUTE ON FUNCTION project.get_project_representation(uuid, uuid[]) TO hub_s3_read;

REVOKE ALL ON ALL TABLES IN SCHEMA iam FROM hub_s3_read;
REVOKE ALL ON ALL TABLES IN SCHEMA project FROM hub_s3_read;
REVOKE ALL ON ALL TABLES IN SCHEMA workspace FROM hub_s3_read;

DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_s3_read', current_database());
END $$;

COMMIT;
