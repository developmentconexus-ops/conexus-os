BEGIN;

-- 0030's get_project read the tombstone with unqualified column names, and project_id is also a
-- column of the function's result. For an installation administrator asking after a Project that
-- does not exist, PostgreSQL stopped with "column reference project_id is ambiguous", so the Hub
-- answered an internal error instead of the not found row. The body is 0030's with the tombstone
-- query qualified; owner and grants stay as they are.
CREATE OR REPLACE FUNCTION project.get_project(p_account_id uuid, p_project_id uuid) RETURNS TABLE(project_id uuid, workspace_id uuid, name text, project_revision text, archived boolean, deleting boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  live project.project%ROWTYPE;
  tomb project.project_deletion%ROWTYPE;
BEGIN
  SELECT stored_project.* INTO live
  FROM project.project AS stored_project
  JOIN iam.visible_projects(p_account_id) AS visible
    ON visible.project_id = stored_project.project_id
  WHERE stored_project.project_id = p_project_id;

  IF FOUND THEN
    RETURN QUERY SELECT live.project_id, live.workspace_id, live.name, live.project_revision, live.archived,
      EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = p_project_id AND deletion.completed_at IS NULL);
    RETURN;
  END IF;

  IF iam.is_installation_administrator(p_account_id) THEN
    SELECT stored_deletion.* INTO tomb
    FROM project.project_deletion AS stored_deletion
    WHERE stored_deletion.project_id = p_project_id AND stored_deletion.completed_at IS NULL;
    IF FOUND THEN
      RETURN QUERY SELECT tomb.project_id, tomb.workspace_id, tomb.name, ''::text, false, true;
    END IF;
  END IF;
END;
$$;

COMMIT;
